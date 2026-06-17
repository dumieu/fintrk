"use client";

/**
 * DemoApiBridge - makes the real authenticated dashboard pages work, verbatim,
 * inside the public /demo experience.
 *
 * It patches window.fetch for the lifetime of the /demo subtree:
 *
 *   • Reads  (GET/HEAD) to /api/*  → adds `x-fintrk-demo: 1`. The server pins
 *     the identity to the synthetic "demo" user and returns its data through
 *     the EXACT same code path the real app uses (perfect fidelity).
 *
 *   • Writes (POST/PUT/PATCH/DELETE) to /api/*  → never hit the network. We
 *     return a synthetic success response that echoes the request body, so the
 *     UI's optimistic updates apply live. Nothing is ever persisted, so a
 *     refresh restores the original dataset.
 *
 * The patch is installed during render (useState initializer) so it is active
 * before any child component's effects fire.
 */

import { type ReactNode } from "react";

const DEMO_HEADER = "x-fintrk-demo";
const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

type FetchInput = Parameters<typeof fetch>[0];
type FetchInit = Parameters<typeof fetch>[1];

function urlOf(input: FetchInput): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  if (input instanceof Request) return input.url;
  return String(input);
}

function methodOf(input: FetchInput, init?: FetchInit): string {
  if (init?.method) return init.method.toUpperCase();
  if (input instanceof Request) return input.method.toUpperCase();
  return "GET";
}

function isApi(url: string): boolean {
  try {
    const path = url.startsWith("http")
      ? new URL(url).pathname
      : url.split("?")[0] ?? url;
    return path.startsWith("/api/");
  } catch {
    return url.includes("/api/");
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

async function readBody(input: FetchInput, init?: FetchInit): Promise<Record<string, unknown>> {
  try {
    let raw: string | null = null;
    if (init?.body && typeof init.body === "string") raw = init.body;
    else if (input instanceof Request) raw = await input.clone().text();
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

let installed = false;

function install(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  const original = window.fetch.bind(window);

  const patched: typeof fetch = async (input, init) => {
    const url = urlOf(input as FetchInput);
    if (!isApi(url)) return original(input, init);

    const method = methodOf(input as FetchInput, init);

    // Writes: swallow, return optimistic success that echoes the request body.
    if (WRITE_METHODS.has(method)) {
      const body = await readBody(input as FetchInput, init);
      return jsonResponse({ ok: true, success: true, demo: true, deleted: 0, saved: 0, ...body });
    }

    // Reads: tag as demo so the server serves the demo user's data.
    const headers = new Headers(
      init?.headers ?? (input instanceof Request ? input.headers : undefined),
    );
    headers.set(DEMO_HEADER, "1");

    if (input instanceof Request) {
      return original(new Request(input, { headers }));
    }
    return original(input, { ...init, headers });
  };

  window.fetch = patched;
}

// Install at module load on the client. Because this module is imported by the
// /demo layout, the patch is in place before any page component's effects run -
// even a page that fetches exactly once on mount (e.g. Accounts) is covered.
// The patch intentionally lives for the whole /demo session and is never
// restored; a full navigation away from /demo loads a fresh page anyway.
if (typeof window !== "undefined") {
  install();
}

export function DemoApiBridge({ children }: { children: ReactNode }) {
  install();
  return <>{children}</>;
}
