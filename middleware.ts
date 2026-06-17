import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";

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
 * Clerk Billing plan that the whole authenticated app sits behind. Trialing
 * users report as subscribed via `has({ plan })`, so the trial wall lifts for
 * the 7-day trial and re-engages when it lapses. Set
 * `FINTRK_BILLING_ENFORCED=false` to disable the paywall locally.
 */
const PRO_PLAN = "fintrk_pro";
const BILLING_ENFORCED = process.env.FINTRK_BILLING_ENFORCED !== "false";

/** Routes that must stay reachable without a signed-in Clerk session. */
const isPublicRoute = createRouteMatcher([
  "/",
  "/unauth1(.*)",
  "/auth(.*)",
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
function middlewareWithoutClerk(req: NextRequest) {
  const demo = handleDemoApi(req);
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
        const demo = handleDemoApi(req);
        if (demo) return demo;
        if (isPublicRoute(req)) {
          return;
        }
        const isApi = req.nextUrl.pathname.startsWith("/api/");
        const { userId, has } = await auth();
        if (!userId) {
          if (isApi) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
          }
          return redirectUnauthenticatedToLanding(req);
        }

        // Trial wall: the authenticated app is FinTRK Pro only. `has` reports
        // trialing users as subscribed, so the 7-day trial passes here.
        if (BILLING_ENFORCED && !isPaywallExempt(req)) {
          const isPro = typeof has === "function" && has({ plan: PRO_PLAN });
          if (!isPro) {
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
