import { NextRequest, NextResponse } from "next/server";
import { corsHeaders } from "@/lib/mcp/config";
import { registerClient } from "@/lib/mcp/tokens";
import { logServerError } from "@/lib/safe-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

/**
 * OAuth 2.0 Dynamic Client Registration (RFC 7591). MCP hosts
 * (Claude, ChatGPT, Perplexity, …) POST their metadata and receive a
 * client_id with no human in the loop.
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { error: "invalid_client_metadata", error_description: "Body must be JSON" },
      { status: 400, headers: corsHeaders() },
    );
  }

  const redirectUris = Array.isArray(body.redirect_uris)
    ? body.redirect_uris.filter((u): u is string => typeof u === "string")
    : [];

  if (redirectUris.length === 0) {
    return NextResponse.json(
      {
        error: "invalid_redirect_uri",
        error_description: "At least one redirect_uri is required",
      },
      { status: 400, headers: corsHeaders() },
    );
  }

  // Enforce https (or localhost for dev tooling) redirect URIs.
  for (const uri of redirectUris) {
    try {
      const u = new URL(uri);
      const isLocal =
        u.hostname === "localhost" ||
        u.hostname === "127.0.0.1" ||
        u.hostname.endsWith(".local");
      if (u.protocol !== "https:" && !isLocal && u.protocol !== "http:") {
        // allow custom scheme callbacks used by native apps (e.g. cursor://)
        if (!u.protocol.endsWith(":")) throw new Error("bad");
      }
    } catch {
      return NextResponse.json(
        { error: "invalid_redirect_uri", error_description: `Invalid redirect_uri: ${uri}` },
        { status: 400, headers: corsHeaders() },
      );
    }
  }

  try {
    const grantTypes = Array.isArray(body.grant_types)
      ? body.grant_types.filter((g): g is string => typeof g === "string")
      : undefined;

    const client = await registerClient({
      clientName: typeof body.client_name === "string" ? body.client_name : null,
      redirectUris,
      grantTypes,
      tokenEndpointAuthMethod:
        typeof body.token_endpoint_auth_method === "string"
          ? body.token_endpoint_auth_method
          : "none",
    });

    return NextResponse.json(
      {
        client_id: client.clientId,
        client_id_issued_at: Math.floor(Date.now() / 1000),
        client_name: client.clientName ?? undefined,
        redirect_uris: client.redirectUris,
        grant_types: client.grantTypes,
        response_types: ["code"],
        token_endpoint_auth_method: client.tokenEndpointAuthMethod,
      },
      { status: 201, headers: corsHeaders() },
    );
  } catch (error) {
    logServerError("POST /api/mcp/oauth/register", error);
    return NextResponse.json(
      { error: "server_error", error_description: "Registration failed" },
      { status: 500, headers: corsHeaders() },
    );
  }
}
