import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";
import { xrefClick } from "@/lib/xref";
import { hasPlanClaim, isProMetadata } from "@/lib/entitlement";

const authorizedParties =
  process.env.NODE_ENV === "development"
    ? [
        "https://fintrk.io",
        "https://www.fintrk.io",
        "https://local.fintrk.io:3004",
        "http://localhost:3000",
        "http://localhost:3001",
        "http://localhost:3004",
      ]
    : ["https://fintrk.io", "https://www.fintrk.io"];

const CLERK_KEYS_PRESENT = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

/**
 * The whole authenticated app sits behind FinTRK Pro (billed via Stripe). Plan
 * state is written to the Clerk user by the Stripe webhook and surfaced to the
 * edge via the session-token claim (Clerk Dashboard -> Sessions -> customize
 * session token: add `"metadata": "{{user.public_metadata}}"`). Trialing users
 * count as Pro. Set `FINTRK_BILLING_ENFORCED=false` to disable locally.
 */
const BILLING_ENFORCED = process.env.FINTRK_BILLING_ENFORCED !== "false";

/** Routes that must stay reachable without a signed-in Clerk session. */
const isPublicRoute = createRouteMatcher([
  "/",
  "/unauth1(.*)",
  "/auth(.*)",
  "/sign-out",
  "/demo(.*)",
  "/api/webhooks/(.*)",
  "/api/demo/(.*)",
  /** Handlers verify `CRON_SECRET` themselves. */
  "/api/cron/(.*)",
  /** MCP server + OAuth: external GenAI clients authenticate via Bearer tokens. */
  "/api/mcp(.*)",
]);

/**
 * Signed-in routes that stay reachable WITHOUT an active Pro subscription, so a
 * lapsed/never-subscribed user can still pay, get help, or read the FAQ. The
 * paywall page itself must be exempt or the redirect would loop.
 */
const isPaywallExempt = createRouteMatcher([
  "/dashboard/upgrade(.*)",
  "/dashboard/contact",
  "/dashboard/faq",
  /** Referral attribution must record even before/without an active plan. */
  "/api/xref/capture",
]);

function redirectToPaywall(req: NextRequest) {
  const url = req.nextUrl.clone();
  url.pathname = "/dashboard/upgrade";
  url.search = "";
  return NextResponse.redirect(url);
}

/**
 * The public /demo experience reuses the real authenticated pages, which call
 * the real /api/* routes. Those requests carry `x-fintrk-demo: 1`. We let demo
 * READS through (the route handlers pin the user to the synthetic "demo" id, so
 * no real data can ever be reached) and SWALLOW any write at the edge so the
 * shared demo dataset is never mutated. The demo client already no-ops writes;
 * this is a defense-in-depth safety net.
 */
function handleDemoApi(req: NextRequest): NextResponse | undefined {
  if (req.headers.get("x-fintrk-demo") !== "1") return undefined;
  if (!req.nextUrl.pathname.startsWith("/api/")) return undefined;
  if (req.method === "GET" || req.method === "HEAD") {
    return NextResponse.next();
  }
  return NextResponse.json({ ok: true, demo: true }, { status: 200 });
}

/**
 * xTRK Referral attribution: capture `?xref=<code>` from a BDR referral link
 * into a first-touch cookie (1 year) that the signup flow reads to attribute
 * the new user to a seller. Runs before auth so it works on the public landing
 * (the referral link points at https://fintrk.io/?xref=CODE).
 */
async function captureXref(req: NextRequest): Promise<NextResponse | undefined> {
  const url = req.nextUrl;
  const xref = url.searchParams.get("xref");
  if (!xref) return undefined;
  url.searchParams.delete("xref");
  // Branded links (https://fintrk.io/?xref=) bypass the legacy click-logging
  // redirect, so report the landing to xref here (best-effort, short timeout).
  await xrefClick(xref, {
    ip:
      (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() ||
      req.headers.get("x-real-ip"),
    ua: req.headers.get("user-agent"),
    referrer: req.headers.get("referer"),
    country: req.headers.get("x-vercel-ip-country"),
  });
  const response = NextResponse.redirect(url);
  response.cookies.set("xref", xref, {
    maxAge: 365 * 24 * 60 * 60,
    path: "/",
    httpOnly: false,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  return response;
}

function redirectUnauthenticatedToLanding(req: NextRequest) {
  const url = req.nextUrl.clone();
  url.pathname = "/unauth1";
  url.search = "";
  return NextResponse.redirect(url);
}

/**
 * When Clerk env is missing (local misconfig), still block /dashboard and APIs
 * so visitors never see the authenticated shell.
 */
async function middlewareWithoutClerk(req: NextRequest) {
  const demo = handleDemoApi(req);
  if (demo) return demo;
  const xref = await captureXref(req);
  if (xref) return xref;
  if (isPublicRoute(req)) {
    return NextResponse.next();
  }
  if (req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return redirectUnauthenticatedToLanding(req);
}

export default CLERK_KEYS_PRESENT
  ? clerkMiddleware(
      async (auth, req) => {
        const demo = handleDemoApi(req);
        if (demo) return demo;
        const xref = await captureXref(req);
        if (xref) return xref;
        if (isPublicRoute(req)) {
          return;
        }
        const isApi = req.nextUrl.pathname.startsWith("/api/");
        const { userId, sessionClaims } = await auth();
        if (!userId) {
          if (isApi) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
          }
          return redirectUnauthenticatedToLanding(req);
        }

        // Trial wall: the authenticated app is FinTRK Pro only. Plan comes from
        // the session-token claim (`metadata`/`publicMetadata`). Trialing users
        // pass. If the claim isn't configured yet we defer to the server layer
        // (dashboard layout + hasProAccess) rather than risk blocking payers.
        if (BILLING_ENFORCED && !isPaywallExempt(req)) {
          const claim =
            (sessionClaims as Record<string, unknown> | null | undefined)?.metadata ??
            (sessionClaims as Record<string, unknown> | null | undefined)?.publicMetadata;
          if (hasPlanClaim(claim) && !isProMetadata(claim)) {
            if (isApi) {
              return NextResponse.json(
                { error: "FinTRK Pro required.", code: "UPGRADE_REQUIRED" },
                { status: 402 }
              );
            }
            return redirectToPaywall(req);
          }
        }
        return;
      },
      { authorizedParties }
    )
  : middlewareWithoutClerk;

export const config = {
  matcher: [
    "/((?!_next|\\.well-known|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
