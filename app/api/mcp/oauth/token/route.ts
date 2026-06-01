import { NextRequest, NextResponse } from "next/server";
import { corsHeaders } from "@/lib/mcp/config";
import {
  consumeAuthCode,
  issueTokenPair,
  purgeExpiredCodes,
  rotateRefreshToken,
  verifyPkce,
} from "@/lib/mcp/tokens";
import { logServerError } from "@/lib/safe-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

function tokenError(error: string, description?: string, status = 400) {
  return NextResponse.json(
    { error, ...(description ? { error_description: description } : {}) },
    { status, headers: corsHeaders({ "Cache-Control": "no-store" }) },
  );
}

async function readParams(req: NextRequest): Promise<URLSearchParams> {
  const ctype = req.headers.get("content-type") ?? "";
  if (ctype.includes("application/json")) {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(body)) {
      if (typeof v === "string") sp.set(k, v);
    }
    return sp;
  }
  try {
    const form = await req.formData();
    const sp = new URLSearchParams();
    for (const [k, v] of form.entries()) {
      if (typeof v === "string") sp.set(k, v);
    }
    return sp;
  } catch {
    return new URLSearchParams(await req.text().catch(() => ""));
  }
}

export async function POST(req: NextRequest) {
  const params = await readParams(req);
  const grantType = params.get("grant_type");
  purgeExpiredCodes();

  try {
    if (grantType === "authorization_code") {
      const code = params.get("code");
      const clientId = params.get("client_id");
      const redirectUri = params.get("redirect_uri");
      const codeVerifier = params.get("code_verifier") ?? "";
      if (!code || !clientId) {
        return tokenError("invalid_request", "Missing code or client_id");
      }
      const consumed = await consumeAuthCode(code);
      if (!consumed) return tokenError("invalid_grant", "Authorization code is invalid or expired");
      if (consumed.clientId !== clientId) {
        return tokenError("invalid_grant", "client_id mismatch");
      }
      if (redirectUri && consumed.redirectUri !== redirectUri) {
        return tokenError("invalid_grant", "redirect_uri mismatch");
      }
      if (!verifyPkce(codeVerifier, consumed.codeChallenge, consumed.codeChallengeMethod)) {
        return tokenError("invalid_grant", "PKCE verification failed");
      }
      const tokens = await issueTokenPair({
        clientId,
        clerkUserId: consumed.clerkUserId,
        scope: consumed.scope,
      });
      return NextResponse.json(
        {
          access_token: tokens.accessToken,
          token_type: "Bearer",
          expires_in: tokens.expiresIn,
          refresh_token: tokens.refreshToken,
          scope: tokens.scope,
        },
        { headers: corsHeaders({ "Cache-Control": "no-store" }) },
      );
    }

    if (grantType === "refresh_token") {
      const refreshToken = params.get("refresh_token");
      const clientId = params.get("client_id");
      if (!refreshToken || !clientId) {
        return tokenError("invalid_request", "Missing refresh_token or client_id");
      }
      const tokens = await rotateRefreshToken({ refreshToken, clientId });
      if (!tokens) return tokenError("invalid_grant", "Refresh token is invalid or expired");
      return NextResponse.json(
        {
          access_token: tokens.accessToken,
          token_type: "Bearer",
          expires_in: tokens.expiresIn,
          refresh_token: tokens.refreshToken,
          scope: tokens.scope,
        },
        { headers: corsHeaders({ "Cache-Control": "no-store" }) },
      );
    }

    return tokenError("unsupported_grant_type", `Unsupported grant_type: ${grantType ?? "(none)"}`);
  } catch (error) {
    logServerError("POST /api/mcp/oauth/token", error);
    return tokenError("server_error", "Token issuance failed", 500);
  }
}
