import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";
import { isBillingExemptUserId } from "@/lib/billing-exempt";
import { hasPlanSessionClaim, isProFromSessionClaims } from "@/lib/entitlement";

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
  "/contact",
  "/privacy",
  "/terms",
  "/api/webhooks/(.*)",
  "/api/demo/(.*)",
  /** Handlers verify `CRON_SECRET` themselves. */
  "/api/cron/(.*)",
  /** Alternate FX enrich path; handler verifies `CRON_SECRET` (same as cron). */
  "/api/enrich/(.*)",
  /** Optional auth; used by landing / in-app forms. */
  "/api/feedback",
  "/api/contact",
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
  /** Checkout / portal must work for lapsed or never-subscribed users. */
  "/api/billing(.*)",
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
 *
 * Only apply when there is no Clerk session. Signed-in users must never get
 * silent write success (or auth bypass) from a forgeable header.
 */
async function handleDemoApi(
  req: NextRequest,
  userId: string | null | undefined,
): Promise<NextResponse | undefined> {
  if (req.headers.get("x-fintrk-demo") !== "1") return undefined;
  if (!req.nextUrl.pathname.startsWith("/api/")) return undefined;
  if (userId) return undefined;
  if (req.method === "GET" || req.method === "HEAD") {
    return NextResponse.next();
  }
  return NextResponse.json({ ok: true, demo: true }, { status: 200 });
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
  // No Clerk: treat as unauthenticated for demo-header handling.
  const demo = await handleDemoApi(req, null);
  if (demo) return demo;
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
        const { userId, sessionClaims } = await auth();

        const demo = await handleDemoApi(req, userId);
        if (demo) return demo;

        if (isPublicRoute(req)) {
          return;
        }
        const isApi = req.nextUrl.pathname.startsWith("/api/");
        if (!userId) {
          if (isApi) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
          }
          return redirectUnauthenticatedToLanding(req);
        }

        // Single-account operator bypass (Clerk user id only — not forgeable).
        if (isBillingExemptUserId(userId)) {
          const res = NextResponse.next();
          res.headers.set("x-fintrk-path", req.nextUrl.pathname);
          return res;
        }

        // Trial wall: the authenticated app is FinTRK Pro only. Plan comes from
        // the session-token claim (`metadata`/`publicMetadata`). Trialing users
        // pass. If the claim isn't configured yet we defer to the server layer
        // (dashboard layout + hasProAccess) rather than risk blocking payers.
        if (BILLING_ENFORCED && !isPaywallExempt(req)) {
          const claims = sessionClaims as Record<string, unknown> | null | undefined;
          if (hasPlanSessionClaim(claims) && !isProFromSessionClaims(claims)) {
            if (isApi) {
              return NextResponse.json(
                { error: "FinTRK Pro required.", code: "UPGRADE_REQUIRED" },
                { status: 402 }
              );
            }
            return redirectToPaywall(req);
          }
        }

        const res = NextResponse.next();
        res.headers.set("x-fintrk-path", req.nextUrl.pathname);
        return res;
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
