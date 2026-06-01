import { NextRequest, NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import {
  DEFAULT_SCOPE,
  OAUTH_AUTHORIZE_PATH,
  SUPPORTED_SCOPES,
  getBaseUrl,
  isCimdClientId,
} from "@/lib/mcp/config";
import { createAuthCode, getClient } from "@/lib/mcp/tokens";
import { logServerError } from "@/lib/safe-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface AuthParams {
  responseType: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string | null;
  codeChallengeMethod: string | null;
  state: string | null;
  scope: string;
  resource: string | null;
}

function readParams(src: URLSearchParams): AuthParams {
  const requested = (src.get("scope") ?? "").split(/\s+/).filter(Boolean);
  const scope =
    requested.filter((s) => (SUPPORTED_SCOPES as readonly string[]).includes(s)).join(" ") ||
    DEFAULT_SCOPE;
  return {
    responseType: src.get("response_type") ?? "",
    clientId: src.get("client_id") ?? "",
    redirectUri: src.get("redirect_uri") ?? "",
    codeChallenge: src.get("code_challenge"),
    codeChallengeMethod: src.get("code_challenge_method"),
    state: src.get("state"),
    scope,
    resource: src.get("resource"),
  };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// The global CSP sets `form-action 'self'`, which browsers also enforce on the
// redirect TARGET of a form submission. A server 302 from the consent POST to
// the AI client's (cross-origin) callback is therefore silently blocked. We
// instead complete the hop with a top-level client-side navigation, which is
// not governed by `form-action`. Inline script is permitted by the CSP
// (`script-src` includes 'unsafe-inline'); meta-refresh + link are fallbacks.
function redirectToClient(targetUrl: string): NextResponse {
  const safeHref = escapeHtml(targetUrl);
  const jsUrl = JSON.stringify(targetUrl).replace(/</g, "\\u003c");
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="0;url=${safeHref}"><title>Connecting…</title></head>
<body style="margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:radial-gradient(120% 120% at 50% 0%,#0a1628 0%,#060d14 60%);color:#fff;min-height:100vh;display:flex;align-items:center;justify-content:center">
<p style="color:#b3aebd;font-size:14px">Connecting you back to your AI… <a style="color:#6ee7b7" href="${safeHref}">Continue</a></p>
<script>location.replace(${jsUrl});</script></body></html>`;
  return new NextResponse(html, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function errorRedirect(redirectUri: string, error: string, state: string | null) {
  const u = new URL(redirectUri);
  u.searchParams.set("error", error);
  if (state) u.searchParams.set("state", state);
  return redirectToClient(u.toString());
}

function htmlError(message: string, status = 400): NextResponse {
  return new NextResponse(
    `<!doctype html><meta charset="utf-8"><title>FinTRK</title><body style="font-family:system-ui;background:#060d14;color:#fff;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0"><div style="max-width:420px;padding:32px;text-align:center"><h1 style="font-size:18px">Connection error</h1><p style="color:#b3aebd">${escapeHtml(
      message,
    )}</p></div></body>`,
    { status, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

function isAllowedRedirect(uri: string): boolean {
  try {
    const u = new URL(uri);
    const isLocal =
      u.hostname === "localhost" ||
      u.hostname === "127.0.0.1" ||
      u.hostname.endsWith(".local");
    // Accept https everywhere, http only for local dev, plus native custom schemes.
    return u.protocol === "https:" || (isLocal && u.protocol === "http:") || !["http:", "https:"].includes(u.protocol);
  } catch {
    return false;
  }
}

async function validate(params: AuthParams) {
  if (!params.clientId || !params.redirectUri) {
    return { ok: false as const, html: htmlError("Missing client_id or redirect_uri.") };
  }

  // CIMD (Client ID Metadata Document): the client_id is an https URL the
  // client controls. No registration record exists; accept the provided
  // redirect_uri without a pre-registered allow-list.
  if (isCimdClientId(params.clientId)) {
    if (!isAllowedRedirect(params.redirectUri)) {
      return { ok: false as const, html: htmlError("Invalid redirect address for this application.") };
    }
    let clientName = "An AI assistant";
    try {
      clientName = new URL(params.clientId).hostname;
    } catch {
      /* keep default */
    }
    return {
      ok: true as const,
      client: {
        clientId: params.clientId,
        clientName,
        redirectUris: [params.redirectUri],
        grantTypes: ["authorization_code", "refresh_token"],
        tokenEndpointAuthMethod: "none",
      },
    };
  }

  const client = await getClient(params.clientId);
  if (!client) {
    return { ok: false as const, html: htmlError("Unknown application. Please reconnect from your AI tool.") };
  }
  if (!client.redirectUris.includes(params.redirectUri)) {
    return { ok: false as const, html: htmlError("This redirect address is not registered for the application.") };
  }
  return { ok: true as const, client };
}

const CONSENT_SCOPE_ROWS = [
  { icon: "&#128179;", label: "Accounts", desc: "Your linked bank, card, and investment accounts" },
  { icon: "&#128200;", label: "Transactions", desc: "Every line of spending and income you track" },
  { icon: "&#128176;", label: "Cashflow", desc: "Monthly income, expenses, and savings gap" },
  { icon: "&#127978;", label: "Categories & merchants", desc: "Where your money goes, by category and merchant" },
  { icon: "&#128100;", label: "Financial profile", desc: "Currency preference and account settings" },
];

function renderConsent(params: AuthParams, clientName: string, userLabel: string): NextResponse {
  const hidden = (name: string, value: string | null) =>
    value == null ? "" : `<input type="hidden" name="${name}" value="${escapeHtml(value)}">`;
  const rows = CONSENT_SCOPE_ROWS.map(
    (r) =>
      `<li style="display:flex;gap:12px;align-items:flex-start;padding:10px 0;border-bottom:1px solid rgba(255,255,255,.06)"><span style="font-size:18px;line-height:1.3">${r.icon}</span><span><span style="display:block;color:#fff;font-weight:600;font-size:14px">${r.label}</span><span style="display:block;color:#9a93a8;font-size:12px;margin-top:2px">${r.desc}</span></span></li>`,
  ).join("");

  const app = escapeHtml(clientName || "An AI assistant");
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Connect ${app} to FinTRK</title></head>
<body style="margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:radial-gradient(120% 120% at 50% 0%,#0a1628 0%,#060d14 60%);color:#fff;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box">
<div style="width:100%;max-width:440px;background:rgba(10,22,40,.85);border:1px solid rgba(11,193,141,.35);border-radius:24px;padding:28px;backdrop-filter:blur(12px)">
  <div style="display:flex;align-items:center;gap:10px;margin-bottom:18px">
    <div style="width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,#0BC18D,#2CA2FF);display:flex;align-items:center;justify-content:center;font-weight:800;color:#060d14">F</div>
    <div style="font-weight:700;font-size:15px;letter-spacing:.3px">FinTRK</div>
  </div>
  <h1 style="font-size:20px;line-height:1.3;margin:0 0 8px">Allow <span style="color:#6ee7b7">${app}</span> to read your financial data?</h1>
  <p style="color:#9a93a8;font-size:13px;margin:0 0 18px">Signed in as <strong style="color:#cfc8db">${escapeHtml(userLabel)}</strong>. ${app} will get <strong style="color:#cfc8db">read-only</strong> access to:</p>
  <ul style="list-style:none;padding:0;margin:0 0 8px">${rows}</ul>
  <p style="color:#7f7890;font-size:11px;margin:14px 0 20px">It can never change or delete your data, and you can revoke access anytime from Connect your AI in FinTRK.</p>
  <form method="POST" action="${OAUTH_AUTHORIZE_PATH}">
    ${hidden("response_type", params.responseType)}
    ${hidden("client_id", params.clientId)}
    ${hidden("redirect_uri", params.redirectUri)}
    ${hidden("code_challenge", params.codeChallenge)}
    ${hidden("code_challenge_method", params.codeChallengeMethod)}
    ${hidden("state", params.state)}
    ${hidden("scope", params.scope)}
    ${hidden("resource", params.resource)}
    <button type="submit" name="consent" value="allow" style="width:100%;padding:14px;border:0;border-radius:14px;background:linear-gradient(135deg,#0BC18D,#2CA2FF);color:#060d14;font-weight:800;font-size:15px;cursor:pointer">Allow access</button>
    <button type="submit" name="consent" value="deny" style="width:100%;padding:12px;margin-top:10px;border:1px solid rgba(255,255,255,.14);border-radius:14px;background:transparent;color:#cfc8db;font-weight:600;font-size:14px;cursor:pointer">Cancel</button>
  </form>
</div></body></html>`;
  return new NextResponse(html, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export async function GET(req: NextRequest) {
  const params = readParams(req.nextUrl.searchParams);
  const check = await validate(params);
  if (!check.ok) return check.html;

  if (params.responseType !== "code") {
    return errorRedirect(params.redirectUri, "unsupported_response_type", params.state);
  }

  const { userId } = await auth();
  if (!userId) {
    // Send the user through Clerk sign-in, then back to this exact authorize URL.
    const base = getBaseUrl(req);
    const returnTo = `${base}${OAUTH_AUTHORIZE_PATH}${req.nextUrl.search}`;
    const signIn = new URL("/auth", base);
    signIn.searchParams.set("redirect_url", returnTo);
    return NextResponse.redirect(signIn.toString(), { status: 302 });
  }

  let userLabel = "your FinTRK account";
  try {
    const u = await currentUser();
    userLabel =
      u?.primaryEmailAddress?.emailAddress ||
      [u?.firstName, u?.lastName].filter(Boolean).join(" ") ||
      userLabel;
  } catch {
    /* non-fatal */
  }

  return renderConsent(params, check.client.clientName ?? "", userLabel);
}

export async function POST(req: NextRequest) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return htmlError("Invalid request.");
  }
  const sp = new URLSearchParams();
  for (const [k, v] of form.entries()) {
    if (typeof v === "string") sp.set(k, v);
  }
  const params = readParams(sp);
  const consent = sp.get("consent");

  const check = await validate(params);
  if (!check.ok) return check.html;

  if (consent !== "allow") {
    return errorRedirect(params.redirectUri, "access_denied", params.state);
  }

  const { userId } = await auth();
  if (!userId) {
    // Session expired between render and submit — bounce back to GET to re-auth.
    const base = getBaseUrl(req);
    const returnTo = new URL(`${base}${OAUTH_AUTHORIZE_PATH}`);
    for (const [k, v] of sp.entries()) {
      if (k !== "consent") returnTo.searchParams.set(k, v);
    }
    const signIn = new URL("/auth", base);
    signIn.searchParams.set("redirect_url", returnTo.toString());
    return NextResponse.redirect(signIn.toString(), { status: 302 });
  }

  try {
    const code = await createAuthCode({
      clientId: params.clientId,
      clerkUserId: userId,
      redirectUri: params.redirectUri,
      codeChallenge: params.codeChallenge,
      codeChallengeMethod: params.codeChallengeMethod,
      scope: params.scope,
      resource: params.resource,
    });
    const dest = new URL(params.redirectUri);
    dest.searchParams.set("code", code);
    if (params.state) dest.searchParams.set("state", params.state);
    return redirectToClient(dest.toString());
  } catch (error) {
    logServerError("POST /api/mcp/oauth/authorize", error);
    return errorRedirect(params.redirectUri, "server_error", params.state);
  }
}
