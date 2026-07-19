import { NextRequest, NextResponse } from "next/server";
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublicRoute = createRouteMatcher(["/login(.*)"]);
const isApiRoute = createRouteMatcher(["/api/(.*)"]);

const authorizedParties =
  process.env.NODE_ENV === "development"
    ? [
        "https://admin.fintrk.io",
        "https://local.admin.fintrk.io:3005",
        "http://localhost:3005",
      ]
    : ["https://admin.fintrk.io"];

const CLERK_KEYS_PRESENT = Boolean(
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim() &&
    process.env.CLERK_SECRET_KEY?.trim(),
);

function denyMisconfiguredAuth(req: NextRequest) {
  if (isApiRoute(req)) {
    return new NextResponse(JSON.stringify({ error: "auth_not_configured" }), {
      status: 503,
      headers: { "content-type": "application/json" },
    });
  }
  return new NextResponse("Admin auth is not configured", { status: 503 });
}

export default CLERK_KEYS_PRESENT
  ? clerkMiddleware(
      async (auth, req) => {
        if (isPublicRoute(req)) return;
        const { userId } = await auth();
        if (userId) return;
        if (isApiRoute(req)) {
          return new NextResponse(JSON.stringify({ error: "unauthorized" }), {
            status: 401,
            headers: { "content-type": "application/json" },
          });
        }
        const url = new URL("/login", req.url);
        return NextResponse.redirect(url);
      },
      { authorizedParties },
    )
  : process.env.NODE_ENV === "production"
    ? function denyAll(req: NextRequest) {
        return denyMisconfiguredAuth(req);
      }
    : function passthrough() {
        return NextResponse.next();
      };

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
