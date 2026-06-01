import { NextRequest, NextResponse } from "next/server";
import { corsHeaders, getBaseUrl, MCP_PATH } from "@/lib/mcp/config";
import { resolveBearerToken } from "@/lib/mcp/tokens";
import { handleRpc } from "@/lib/mcp/server";
import { extractRequestMeta } from "@/lib/mcp/request-meta";
import { logServerError } from "@/lib/safe-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function bearerFrom(req: NextRequest): string | null {
  const header = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  return m ? m[1].trim() : null;
}

function unauthorized(req: NextRequest, error?: string): NextResponse {
  const resourceMetadata = `${getBaseUrl(req)}/.well-known/oauth-protected-resource`;
  const parts = [`resource_metadata="${resourceMetadata}"`];
  if (error) parts.push(`error="${error}"`);
  return NextResponse.json(
    {
      jsonrpc: "2.0",
      id: null,
      error: { code: -32001, message: "Authentication required" },
    },
    {
      status: 401,
      headers: corsHeaders({
        "WWW-Authenticate": `Bearer ${parts.join(", ")}`,
        "Cache-Control": "no-store",
      }),
    },
  );
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function GET(req: NextRequest) {
  const token = bearerFrom(req);
  if (!token) return unauthorized(req);
  const resolved = await resolveBearerToken(token);
  if (!resolved) return unauthorized(req, "invalid_token");
  // No server-initiated SSE stream is offered; clients use POST.
  return NextResponse.json(
    { jsonrpc: "2.0", id: null, error: { code: -32000, message: "Use POST for MCP requests" } },
    { status: 405, headers: corsHeaders({ Allow: "POST, OPTIONS" }) },
  );
}

export async function POST(req: NextRequest) {
  const token = bearerFrom(req);
  if (!token) return unauthorized(req);

  const resolved = await resolveBearerToken(token);
  if (!resolved) return unauthorized(req, "invalid_token");

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } },
      { status: 400, headers: corsHeaders() },
    );
  }

  try {
    const meta = extractRequestMeta(req);
    const result = await handleRpc(body, {
      userId: resolved.clerkUserId,
      meta,
    });

    const protocolVersion = req.headers.get("mcp-protocol-version") ?? undefined;
    const headers = corsHeaders({
      "Cache-Control": "no-store",
      ...(protocolVersion ? { "MCP-Protocol-Version": protocolVersion } : {}),
    });

    // Notifications / responseless batches → 202 Accepted, no body.
    if (result === null) {
      return new NextResponse(null, { status: 202, headers });
    }
    return NextResponse.json(result, { status: 200, headers });
  } catch (error) {
    logServerError(`POST ${MCP_PATH}`, error);
    return NextResponse.json(
      { jsonrpc: "2.0", id: null, error: { code: -32603, message: "Internal error" } },
      { status: 500, headers: corsHeaders() },
    );
  }
}
