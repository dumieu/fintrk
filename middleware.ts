import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";

const authorizedParties =
  process.env.NODE_ENV === "development"
    ? [
        "https://fintrk.io",
        "https://www.fintrk.io",
        "http://localhost:3000",
      ]
    : ["https://fintrk.io", "https://www.fintrk.io"];

const CLERK_KEYS_PRESENT = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

function middlewareHandler(req: NextRequest) {
  if (req.nextUrl.pathname.startsWith("/api/webhooks/")) {
    return NextResponse.next();
  }
  return NextResponse.next();
}

export default CLERK_KEYS_PRESENT
  ? clerkMiddleware(
      async (_auth, req) => {
        if (req.nextUrl.pathname.startsWith("/api/webhooks/")) {
          return;
        }
      },
      { authorizedParties }
    )
  : middlewareHandler;

export const config = {
  matcher: [
    "/((?!_next|\\.well-known|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
