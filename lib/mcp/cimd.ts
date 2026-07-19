import "server-only";

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

import { isAllowedOAuthRedirect } from "@/lib/mcp/config";

/**
 * Client ID Metadata Documents (CIMD / MCP 2025-11-25).
 * Fetch https client_id URLs and require redirect_uri to match the document.
 */

const FETCH_TIMEOUT_MS = 5_000;
const MAX_BODY_BYTES = 64 * 1024;
const CACHE_TTL_MS = 5 * 60 * 1000;
/** Same-origin HTTPS redirects only (e.g. trailing-slash normalization). */
const MAX_REDIRECTS = 2;

export interface CimdDocument {
  clientId: string;
  clientName: string;
  redirectUris: string[];
}

export type CimdResolveResult =
  | { ok: true; doc: CimdDocument }
  | { ok: false; reason: string };

interface CacheEntry {
  expiresAt: number;
  result: CimdResolveResult;
}

const cache = new Map<string, CacheEntry>();

function isBlockedIpv4(host: string): boolean {
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!ipv4) return false;
  const parts = ipv4.slice(1).map(Number);
  if (parts.some((n) => n > 255)) return true;
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a === 192 && b === 0 && parts[2] === 0) return true;
  if (a >= 224) return true; // multicast / reserved
  return false;
}

function isBlockedIpv6(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "::1" || h === "::" || h === "0:0:0:0:0:0:0:1") return true;
  if (h.startsWith("fc") || h.startsWith("fd")) return true; // ULA
  if (h.startsWith("fe80")) return true; // link-local
  if (h.startsWith("ff")) return true; // multicast
  const mapped = h.match(/:ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (mapped?.[1] && isBlockedIpv4(mapped[1])) return true;
  return false;
}

function isBlockedHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (
    host === "localhost" ||
    host === "metadata.google.internal" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    return true;
  }

  const bare = host.replace(/^\[|\]$/g, "");
  const kind = isIP(bare);
  if (kind === 4) return isBlockedIpv4(bare);
  if (kind === 6) return isBlockedIpv6(bare);
  return false;
}

/**
 * Resolve DNS and reject private / metadata answers to shrink DNS-rebinding
 * windows before each fetch hop. Does not pin the TCP connect to those IPs
 * (Node fetch limitation); re-check on every redirect hop.
 */
async function assertPublicHostname(hostname: string): Promise<boolean> {
  if (isBlockedHostname(hostname)) return false;
  const bare = hostname.replace(/^\[|\]$/g, "");
  if (isIP(bare)) return !isBlockedHostname(bare);

  let records: { address: string; family: number }[];
  try {
    records = await lookup(bare, { all: true, verbatim: true });
  } catch {
    return false;
  }
  if (!records.length) return false;
  for (const rec of records) {
    if (isBlockedHostname(rec.address)) return false;
  }
  return true;
}

/** True when client_id is an https URL with a path (CIMD identity). */
export function isCimdClientId(clientId: string): boolean {
  try {
    const u = new URL(clientId);
    return u.protocol === "https:" && u.pathname.length > 1 && !u.username && !u.password;
  } catch {
    return false;
  }
}

function parseDocument(clientId: string, body: unknown): CimdResolveResult {
  if (!body || typeof body !== "object") {
    return { ok: false, reason: "Client metadata must be JSON." };
  }
  const doc = body as Record<string, unknown>;
  if (typeof doc.client_id !== "string" || doc.client_id !== clientId) {
    return { ok: false, reason: "Client metadata client_id does not match." };
  }
  if (typeof doc.client_name !== "string" || !doc.client_name.trim()) {
    return { ok: false, reason: "Client metadata is missing client_name." };
  }
  if (!Array.isArray(doc.redirect_uris) || doc.redirect_uris.length === 0) {
    return { ok: false, reason: "Client metadata is missing redirect_uris." };
  }
  const redirectUris = doc.redirect_uris.filter((u): u is string => typeof u === "string");
  if (redirectUris.length !== doc.redirect_uris.length) {
    return { ok: false, reason: "Client metadata redirect_uris must be strings." };
  }
  for (const uri of redirectUris) {
    if (!isAllowedOAuthRedirect(uri)) {
      return { ok: false, reason: "Client metadata lists an invalid redirect_uri." };
    }
  }
  return {
    ok: true,
    doc: {
      clientId,
      clientName: doc.client_name.trim(),
      redirectUris,
    },
  };
}

function sameDocumentIdentity(a: URL, b: URL): boolean {
  if (a.origin !== b.origin) return false;
  if (a.search !== b.search || a.hash !== b.hash) return false;
  return a.pathname.replace(/\/$/, "") === b.pathname.replace(/\/$/, "");
}

async function fetchCimdDocument(startUrl: URL): Promise<
  | { ok: true; buf: Buffer; finalUrl: URL; cacheControl: string }
  | { ok: false; reason: string }
> {
  let current = startUrl;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (current.protocol !== "https:") {
      return { ok: false, reason: "Client metadata host is not allowed." };
    }
    if (!(await assertPublicHostname(current.hostname))) {
      return { ok: false, reason: "Client metadata host is not allowed." };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    let res: Response;
    try {
      res = await fetch(current.toString(), {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          "User-Agent": "FinTRK-MCP-OAuth/1.1",
        },
        cache: "no-store",
      });
    } catch {
      return { ok: false, reason: "Could not fetch client metadata." };
    } finally {
      clearTimeout(timer);
    }

    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc || hop === MAX_REDIRECTS) {
        return { ok: false, reason: "Client metadata URL redirected unexpectedly." };
      }
      let next: URL;
      try {
        next = new URL(loc, current);
      } catch {
        return { ok: false, reason: "Client metadata URL redirected unexpectedly." };
      }
      // Same-origin HTTPS only; path may differ by trailing slash only.
      if (
        next.protocol !== "https:" ||
        next.origin !== startUrl.origin ||
        !sameDocumentIdentity(startUrl, next)
      ) {
        return { ok: false, reason: "Client metadata URL redirected unexpectedly." };
      }
      current = next;
      continue;
    }

    if (!res.ok) {
      return { ok: false, reason: "Could not fetch client metadata." };
    }

    // Final URL must still match the client_id identity (trailing slash OK).
    if (!sameDocumentIdentity(startUrl, current)) {
      return { ok: false, reason: "Client metadata URL redirected unexpectedly." };
    }

    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength > MAX_BODY_BYTES) {
      return { ok: false, reason: "Client metadata document is too large." };
    }

    return {
      ok: true,
      buf,
      finalUrl: current,
      cacheControl: res.headers.get("cache-control") ?? "",
    };
  }

  return { ok: false, reason: "Client metadata URL redirected unexpectedly." };
}

/**
 * Fetch and validate a CIMD document. Does not check redirect_uri membership;
 * callers compare against `doc.redirectUris`.
 */
export async function resolveCimdClient(clientId: string): Promise<CimdResolveResult> {
  if (!isCimdClientId(clientId)) {
    return { ok: false, reason: "client_id is not a valid HTTPS metadata URL." };
  }

  const cached = cache.get(clientId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.result;
  }

  let url: URL;
  try {
    url = new URL(clientId);
  } catch {
    return { ok: false, reason: "Invalid client_id URL." };
  }

  if (!(await assertPublicHostname(url.hostname))) {
    return { ok: false, reason: "Client metadata host is not allowed." };
  }

  const fetched = await fetchCimdDocument(url);
  if (!fetched.ok) return fetched;

  let json: unknown;
  try {
    json = JSON.parse(fetched.buf.toString("utf8"));
  } catch {
    return { ok: false, reason: "Client metadata must be JSON." };
  }

  const result = parseDocument(clientId, json);
  const maxAgeMatch = /max-age=(\d+)/i.exec(fetched.cacheControl);
  const ttl = maxAgeMatch
    ? Math.min(CACHE_TTL_MS, Number(maxAgeMatch[1]) * 1000)
    : CACHE_TTL_MS;
  cache.set(clientId, { expiresAt: Date.now() + Math.max(30_000, ttl), result });
  return result;
}

/** Resolve CIMD and require `redirectUri` to be an exact allowlist member. */
export async function resolveCimdForAuthorize(
  clientId: string,
  redirectUri: string,
): Promise<CimdResolveResult> {
  if (!isAllowedOAuthRedirect(redirectUri)) {
    return { ok: false, reason: "Invalid redirect address for this application." };
  }
  const resolved = await resolveCimdClient(clientId);
  if (!resolved.ok) return resolved;
  if (!resolved.doc.redirectUris.includes(redirectUri)) {
    return {
      ok: false,
      reason: "This redirect address is not listed in the client metadata.",
    };
  }
  return resolved;
}
