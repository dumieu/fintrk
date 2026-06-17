import "server-only";

/**
 * Central constants + helpers for the FinTRK MCP server and its
 * self-contained OAuth 2.1 authorization server. Kept dependency-free so
 * it can be imported by route handlers, discovery endpoints, and the
 * token layer alike.
 */

/** Path of the Streamable HTTP MCP endpoint. */
export const MCP_PATH = "/api/mcp";

/** OAuth endpoint paths. */
export const OAUTH_AUTHORIZE_PATH = "/api/mcp/oauth/authorize";
export const OAUTH_TOKEN_PATH = "/api/mcp/oauth/token";
export const OAUTH_REGISTER_PATH = "/api/mcp/oauth/register";

/** Single read scope plus offline access (refresh tokens). */
export const SCOPE_READ = "fintrk.read";
export const SCOPE_OFFLINE = "offline_access";
export const SUPPORTED_SCOPES = [SCOPE_READ, SCOPE_OFFLINE] as const;
export const DEFAULT_SCOPE = `${SCOPE_READ} ${SCOPE_OFFLINE}`;

/** Lifetimes. */
export const AUTH_CODE_TTL_MS = 5 * 60 * 1000; // 5 minutes
export const ACCESS_TOKEN_TTL_S = 60 * 60; // 1 hour
export const ACCESS_TOKEN_TTL_MS = ACCESS_TOKEN_TTL_S * 1000;
export const REFRESH_TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

export const SERVER_NAME = "FinTRK";
export const SERVER_TITLE = "FinTRK Finance";
export const SERVER_VERSION = "1.1.0";

/** MCP protocol versions we understand; we echo the client's if supported. */
export const SUPPORTED_PROTOCOL_VERSIONS = [
  "2025-11-25",
  "2025-06-18",
  "2025-03-26",
  "2024-11-05",
] as const;
export const DEFAULT_PROTOCOL_VERSION = "2025-06-18";

/**
 * Resolve the public origin for the current request. Mirrors the Oura
 * integration: trust the proxied host so discovery documents advertise
 * exactly the origin the client used (works on localhost and fintrk.io).
 */
export function getBaseUrl(req: Request): string {
  const h = req.headers;
  const host =
    h.get("x-forwarded-host") ??
    h.get("host") ??
    (process.env.NEXT_PUBLIC_APP_URL
      ? new URL(process.env.NEXT_PUBLIC_APP_URL).host
      : "fintrk.io");
  const isLocal =
    host.startsWith("localhost") ||
    host.startsWith("127.0.0.1") ||
    host.endsWith(".local");
  const proto = h.get("x-forwarded-proto") ?? (isLocal ? "http" : "https");
  return `${proto}://${host}`;
}

export function mcpEndpoint(req: Request): string {
  return `${getBaseUrl(req)}${MCP_PATH}`;
}

/** RFC 9728 Protected Resource Metadata for the MCP endpoint. */
export function protectedResourceMetadata(req: Request) {
  const base = getBaseUrl(req);
  return {
    resource: `${base}${MCP_PATH}`,
    authorization_servers: [base],
    scopes_supported: [...SUPPORTED_SCOPES],
    bearer_methods_supported: ["header"],
    resource_name: SERVER_TITLE,
    resource_documentation: `${base}/dashboard/connect-ai`,
  };
}

/** RFC 8414 Authorization Server Metadata for the self-contained AS. */
export function authorizationServerMetadata(req: Request) {
  const base = getBaseUrl(req);
  return {
    issuer: base,
    authorization_endpoint: `${base}${OAUTH_AUTHORIZE_PATH}`,
    token_endpoint: `${base}${OAUTH_TOKEN_PATH}`,
    registration_endpoint: `${base}${OAUTH_REGISTER_PATH}`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256", "plain"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: [...SUPPORTED_SCOPES],
    service_documentation: `${base}/dashboard/connect-ai`,
    // Client ID Metadata Documents (MCP 2025-11-25). Lets clients (Claude,
    // ChatGPT) use their own https metadata URL as the client_id with no
    // registration step. We accept the URL value without fetching it.
    client_id_metadata_document_supported: true,
  };
}

/** A CIMD client_id is an https URL the client controls (no DCR record). */
export function isCimdClientId(clientId: string): boolean {
  return /^https:\/\//i.test(clientId);
}

/** CORS headers for cross-origin MCP/OAuth clients (Bearer-auth, not cookies). */
export function corsHeaders(extra?: Record<string, string>): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "Authorization, Content-Type, mcp-protocol-version, mcp-session-id",
    "Access-Control-Expose-Headers": "WWW-Authenticate, mcp-session-id",
    "Access-Control-Max-Age": "86400",
    ...extra,
  };
}
