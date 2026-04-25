import { NextResponse } from "next/server";

/**
 * One-time cache buster for /demo.  Visiting this URL tells the browser to
 * drop ALL of its cached assets for this origin (HTTP cache, Cache API),
 * then redirects back to /demo so it re-fetches every chunk fresh.
 *
 * Useful in dev mode after a chunk URL has been previously served with
 * `Cache-Control: immutable` and is now stuck in the browser cache.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  // Honour the original Host header so we redirect back to local.fintrk.io
  // (or whatever host the user browsed to) instead of localhost.
  const proto = req.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  const host = req.headers.get("host") ?? url.host;
  const target = new URL(`${proto}://${host}/demo`);
  const res = NextResponse.redirect(target, { status: 303 });
  res.headers.set("Clear-Site-Data", '"cache"');
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  return res;
}
