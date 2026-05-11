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
]);

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
        if (isPublicRoute(req)) {
          return;
        }
        const { userId } = await auth();
        if (userId) {
          return;
        }
        if (req.nextUrl.pathname.startsWith("/api/")) {
          return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        return redirectUnauthenticatedToLanding(req);
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
