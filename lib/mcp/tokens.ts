import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { and, eq, lt } from "drizzle-orm";
import { db, rawSql } from "@/lib/db";
import {
  mcpAuthCodesTable,
  mcpClientsTable,
  mcpTokensTable,
} from "@/lib/db/schema";
import {
  ACCESS_TOKEN_TTL_MS,
  AUTH_CODE_TTL_MS,
  REFRESH_TOKEN_TTL_MS,
} from "@/lib/mcp/config";

/* ── primitives ─────────────────────────────────────────────────────── */

function randomToken(prefix: string): string {
  return `${prefix}${randomBytes(32).toString("base64url")}`;
}

/** Deterministic lookup hash (raw tokens are never stored). */
export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

function constantTimeEqualHex(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a, "hex");
    const bb = Buffer.from(b, "hex");
    if (ba.length !== bb.length) return false;
    return timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

/** Verify a PKCE S256 (or plain) code_verifier against the stored challenge. */
export function verifyPkce(
  verifier: string,
  challenge: string | null,
  method: string | null,
): boolean {
  if (!challenge) return true; // no PKCE was used at authorize time
  if (!verifier) return false;
  if (method === "plain") return verifier === challenge;
  const computed = createHash("sha256").update(verifier).digest("base64url");
  return computed === challenge;
}

/* ── one-time table bootstrap (always-on, mirrors phi_audit_buffer) ──── */

let _tablesReady = false;

export async function ensureMcpTables(): Promise<void> {
  if (_tablesReady) return;
  await rawSql`
    CREATE TABLE IF NOT EXISTS mcp_clients (
      id_client INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      client_id VARCHAR(255) NOT NULL UNIQUE,
      client_secret_hash VARCHAR(64),
      client_name VARCHAR(255),
      redirect_uris TEXT NOT NULL,
      grant_types TEXT,
      token_endpoint_auth_method VARCHAR(64),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await rawSql`
    CREATE TABLE IF NOT EXISTS mcp_auth_codes (
      id_code INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      code_hash VARCHAR(64) NOT NULL UNIQUE,
      client_id VARCHAR(255) NOT NULL,
      clerk_user_id VARCHAR(255) NOT NULL,
      redirect_uri TEXT NOT NULL,
      code_challenge VARCHAR(255),
      code_challenge_method VARCHAR(16),
      scope TEXT,
      resource TEXT,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await rawSql`
    CREATE TABLE IF NOT EXISTS mcp_tokens (
      id_token INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      token_hash VARCHAR(64) NOT NULL UNIQUE,
      refresh_hash VARCHAR(64) UNIQUE,
      kind VARCHAR(16) NOT NULL,
      client_id VARCHAR(255),
      clerk_user_id VARCHAR(255) NOT NULL,
      scope TEXT,
      label VARCHAR(255),
      token_last4 VARCHAR(8),
      expires_at TIMESTAMPTZ,
      revoked BOOLEAN NOT NULL DEFAULT FALSE,
      last_used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await rawSql`CREATE INDEX IF NOT EXISTS mcp_tokens_user_idx ON mcp_tokens (clerk_user_id)`;
  await rawSql`CREATE INDEX IF NOT EXISTS mcp_tokens_client_idx ON mcp_tokens (client_id)`;
  _tablesReady = true;
}

/* ── dynamic client registration (RFC 7591) ─────────────────────────── */

export interface RegisteredClient {
  clientId: string;
  clientName: string | null;
  redirectUris: string[];
  grantTypes: string[];
  tokenEndpointAuthMethod: string;
}

export async function registerClient(input: {
  clientName?: string | null;
  redirectUris: string[];
  grantTypes?: string[];
  tokenEndpointAuthMethod?: string;
}): Promise<RegisteredClient> {
  await ensureMcpTables();
  const clientId = `ftk_client_${randomBytes(16).toString("hex")}`;
  const grantTypes = input.grantTypes?.length
    ? input.grantTypes
    : ["authorization_code", "refresh_token"];
  const authMethod = input.tokenEndpointAuthMethod ?? "none";
  await db.insert(mcpClientsTable).values({
    clientId,
    clientName: input.clientName ?? null,
    redirectUris: JSON.stringify(input.redirectUris),
    grantTypes: JSON.stringify(grantTypes),
    tokenEndpointAuthMethod: authMethod,
  });
  return {
    clientId,
    clientName: input.clientName ?? null,
    redirectUris: input.redirectUris,
    grantTypes,
    tokenEndpointAuthMethod: authMethod,
  };
}

export async function getClient(clientId: string): Promise<RegisteredClient | null> {
  await ensureMcpTables();
  const [row] = await db
    .select()
    .from(mcpClientsTable)
    .where(eq(mcpClientsTable.clientId, clientId))
    .limit(1);
  if (!row) return null;
  let redirectUris: string[] = [];
  let grantTypes: string[] = [];
  try { redirectUris = JSON.parse(row.redirectUris) as string[]; } catch { /* ignore */ }
  try { grantTypes = row.grantTypes ? (JSON.parse(row.grantTypes) as string[]) : []; } catch { /* ignore */ }
  return {
    clientId: row.clientId,
    clientName: row.clientName,
    redirectUris,
    grantTypes,
    tokenEndpointAuthMethod: row.tokenEndpointAuthMethod ?? "none",
  };
}

/* ── authorization codes ────────────────────────────────────────────── */

export async function createAuthCode(input: {
  clientId: string;
  clerkUserId: string;
  redirectUri: string;
  codeChallenge: string | null;
  codeChallengeMethod: string | null;
  scope: string;
  resource: string | null;
}): Promise<string> {
  await ensureMcpTables();
  const code = randomToken("ftk_ac_");
  await db.insert(mcpAuthCodesTable).values({
    codeHash: hashToken(code),
    clientId: input.clientId,
    clerkUserId: input.clerkUserId,
    redirectUri: input.redirectUri,
    codeChallenge: input.codeChallenge,
    codeChallengeMethod: input.codeChallengeMethod,
    scope: input.scope,
    resource: input.resource,
    expiresAt: new Date(Date.now() + AUTH_CODE_TTL_MS),
  });
  return code;
}

export interface ConsumedAuthCode {
  clientId: string;
  clerkUserId: string;
  redirectUri: string;
  codeChallenge: string | null;
  codeChallengeMethod: string | null;
  scope: string;
}

/** Atomically validate + delete an auth code (single-use). */
export async function consumeAuthCode(code: string): Promise<ConsumedAuthCode | null> {
  await ensureMcpTables();
  const codeHash = hashToken(code);
  const [row] = await db
    .delete(mcpAuthCodesTable)
    .where(eq(mcpAuthCodesTable.codeHash, codeHash))
    .returning();
  if (!row) return null;
  if (row.expiresAt.getTime() < Date.now()) return null;
  return {
    clientId: row.clientId,
    clerkUserId: row.clerkUserId,
    redirectUri: row.redirectUri,
    codeChallenge: row.codeChallenge,
    codeChallengeMethod: row.codeChallengeMethod,
    scope: row.scope ?? "",
  };
}

/* ── access + refresh tokens ─────────────────────────────────────────── */

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  scope: string;
}

export async function issueTokenPair(input: {
  clientId: string;
  clerkUserId: string;
  scope: string;
}): Promise<IssuedTokens> {
  await ensureMcpTables();
  const accessToken = randomToken("ftk_at_");
  const refreshToken = randomToken("ftk_rt_");
  await db.insert(mcpTokensTable).values({
    tokenHash: hashToken(accessToken),
    refreshHash: hashToken(refreshToken),
    kind: "access",
    clientId: input.clientId,
    clerkUserId: input.clerkUserId,
    scope: input.scope,
    expiresAt: new Date(Date.now() + ACCESS_TOKEN_TTL_MS),
  });
  return {
    accessToken,
    refreshToken,
    expiresIn: Math.floor(ACCESS_TOKEN_TTL_MS / 1000),
    scope: input.scope,
  };
}

/** Rotate a refresh token: validate, mint a fresh pair, update the row in place. */
export async function rotateRefreshToken(input: {
  refreshToken: string;
  clientId: string;
}): Promise<IssuedTokens | null> {
  await ensureMcpTables();
  const refreshHash = hashToken(input.refreshToken);
  const [row] = await db
    .select()
    .from(mcpTokensTable)
    .where(
      and(
        eq(mcpTokensTable.refreshHash, refreshHash),
        eq(mcpTokensTable.kind, "access"),
        eq(mcpTokensTable.revoked, false),
      ),
    )
    .limit(1);
  if (!row) return null;
  if (row.clientId && !constantTimeEqualHex(hashToken(row.clientId), hashToken(input.clientId))) {
    return null;
  }
  // Refresh tokens valid for REFRESH_TOKEN_TTL_MS from issuance of the row.
  if (row.createdAt.getTime() + REFRESH_TOKEN_TTL_MS < Date.now()) {
    await db.update(mcpTokensTable).set({ revoked: true }).where(eq(mcpTokensTable.id_token, row.id_token));
    return null;
  }
  const accessToken = randomToken("ftk_at_");
  const refreshToken = randomToken("ftk_rt_");
  await db
    .update(mcpTokensTable)
    .set({
      tokenHash: hashToken(accessToken),
      refreshHash: hashToken(refreshToken),
      expiresAt: new Date(Date.now() + ACCESS_TOKEN_TTL_MS),
      lastUsedAt: new Date(),
    })
    .where(eq(mcpTokensTable.id_token, row.id_token));
  return {
    accessToken,
    refreshToken,
    expiresIn: Math.floor(ACCESS_TOKEN_TTL_MS / 1000),
    scope: row.scope ?? "",
  };
}

export interface ResolvedToken {
  clerkUserId: string;
  scope: string;
  kind: string;
  clientId: string | null;
}

/** Validate a Bearer token (access token or PAT) and return its owner. */
export async function resolveBearerToken(raw: string): Promise<ResolvedToken | null> {
  await ensureMcpTables();
  const tokenHash = hashToken(raw);
  const [row] = await db
    .select()
    .from(mcpTokensTable)
    .where(and(eq(mcpTokensTable.tokenHash, tokenHash), eq(mcpTokensTable.revoked, false)))
    .limit(1);
  if (!row) return null;
  if (row.expiresAt && row.expiresAt.getTime() < Date.now()) return null;
  // Best-effort usage stamp; never block on it.
  db.update(mcpTokensTable)
    .set({ lastUsedAt: new Date() })
    .where(eq(mcpTokensTable.id_token, row.id_token))
    .catch(() => {});
  return {
    clerkUserId: row.clerkUserId,
    scope: row.scope ?? "",
    kind: row.kind,
    clientId: row.clientId,
  };
}

/* ── personal access tokens (dashboard-issued) ──────────────────────── */

export interface PatSummary {
  id: number;
  label: string | null;
  last4: string | null;
  createdAt: string;
  lastUsedAt: string | null;
}

export async function createPat(input: {
  clerkUserId: string;
  label: string;
  scope: string;
}): Promise<{ token: string; summary: PatSummary }> {
  await ensureMcpTables();
  const token = randomToken("ftk_pat_");
  const last4 = token.slice(-4);
  const [row] = await db
    .insert(mcpTokensTable)
    .values({
      tokenHash: hashToken(token),
      kind: "pat",
      clerkUserId: input.clerkUserId,
      scope: input.scope,
      label: input.label,
      tokenLast4: last4,
    })
    .returning();
  return {
    token,
    summary: {
      id: row.id_token,
      label: row.label,
      last4: row.tokenLast4,
      createdAt: row.createdAt.toISOString(),
      lastUsedAt: null,
    },
  };
}

export async function listPats(clerkUserId: string): Promise<PatSummary[]> {
  await ensureMcpTables();
  const rows = await db
    .select()
    .from(mcpTokensTable)
    .where(
      and(
        eq(mcpTokensTable.clerkUserId, clerkUserId),
        eq(mcpTokensTable.kind, "pat"),
        eq(mcpTokensTable.revoked, false),
      ),
    );
  return rows
    .map((r) => ({
      id: r.id_token,
      label: r.label,
      last4: r.tokenLast4,
      createdAt: r.createdAt.toISOString(),
      lastUsedAt: r.lastUsedAt ? r.lastUsedAt.toISOString() : null,
    }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function revokePat(clerkUserId: string, id: number): Promise<boolean> {
  await ensureMcpTables();
  const result = await db
    .update(mcpTokensTable)
    .set({ revoked: true })
    .where(
      and(
        eq(mcpTokensTable.id_token, id),
        eq(mcpTokensTable.clerkUserId, clerkUserId),
        eq(mcpTokensTable.kind, "pat"),
      ),
    )
    .returning({ id: mcpTokensTable.id_token });
  return result.length > 0;
}

/** Revoke every access token + PAT for a user (used by "disconnect all"). */
export async function revokeAllForUser(clerkUserId: string): Promise<number> {
  await ensureMcpTables();
  const result = await db
    .update(mcpTokensTable)
    .set({ revoked: true })
    .where(and(eq(mcpTokensTable.clerkUserId, clerkUserId), eq(mcpTokensTable.revoked, false)))
    .returning({ id: mcpTokensTable.id_token });
  return result.length;
}

/** Opportunistic cleanup of expired auth codes. */
export async function purgeExpiredCodes(): Promise<void> {
  try {
    await ensureMcpTables();
    await db.delete(mcpAuthCodesTable).where(lt(mcpAuthCodesTable.expiresAt, new Date()));
  } catch {
    // best-effort
  }
}
