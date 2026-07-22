import { NextRequest, NextResponse } from "next/server";

/**
 * Legacy FinTRK Admin process (port 3005 / admin.fintrk.io).
 * All traffic permanently redirects to xTRK Admin → /admin/fintrk.
 */
const DEST_ORIGIN =
  process.env.FINTRK_ADMIN_MOVED_TO?.replace(/\/$/, "") ||
  (process.env.NODE_ENV === "development"
    ? "https://local.admin.xtrk.ai:3002"
    : "https://admin.xtrk.ai");

export default function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const search = req.nextUrl.search;

  if (path.startsWith("/api/")) {
    return NextResponse.redirect(
      `${DEST_ORIGIN}/api/admin/fintrk${path.slice("/api".length)}${search}`,
      308,
    );
  }

  const page = path === "/" || path === "" ? "/overview" : path;
  return NextResponse.redirect(`${DEST_ORIGIN}/admin/fintrk${page}${search}`, 308);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
