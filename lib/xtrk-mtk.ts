import { NextRequest, NextResponse } from "next/server";

export const XTRK_MTK_COOKIE = "xtrk_mtk";
const MAX_AGE = 30 * 24 * 60 * 60;

export function captureMtkRedirect(req: NextRequest): NextResponse | null {
  const url = req.nextUrl.clone();
  const mtk = url.searchParams.get("mtk");
  if (!mtk) return null;
  url.searchParams.delete("mtk");
  const response = NextResponse.redirect(url);
  response.cookies.set(XTRK_MTK_COOKIE, mtk, {
    maxAge: MAX_AGE,
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  return response;
}

export async function reportXtrkConversion(input: {
  type: "signup" | "paid";
  appKey: string;
  email: string;
  clerkUserId?: string | null;
  mtk?: string | null;
  meta?: Record<string, unknown> | null;
}): Promise<void> {
  const email = input.email.trim().toLowerCase();
  if (!email || !email.includes("@")) return;
  const base = (
    process.env.MKTGTRK_TRACKING_BASE_URL ||
    process.env.XTRK_CONVERT_URL ||
    "https://admin.xtrk.ai"
  ).replace(/\/+$/, "");
  const secret = process.env.XTRK_CONVERT_SECRET || process.env.TRACKING_MTK_SECRET || "";
  try {
    await fetch(`${base}/api/t/convert`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(secret ? { "x-xtrk-convert-secret": secret } : {}),
      },
      body: JSON.stringify({
        type: input.type,
        appKey: input.appKey,
        email,
        clerkUserId: input.clerkUserId,
        mtk: input.mtk,
        meta: input.meta ?? null,
      }),
    });
  } catch {
    /* marketing ingest is best-effort */
  }
}
