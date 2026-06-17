import { NextResponse, type NextRequest } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { xrefAttribute } from "@/lib/xref";

export const dynamic = "force-dynamic";

/**
 * Reads the `xref` referral cookie (set by middleware from `?xref=`), attributes
 * the signed-in user to that seller link in the xref engine - forwarding their
 * account identity (email + name) so the seller can recognise the signup - then
 * clears the cookie once recorded. Best-effort; never blocks the user.
 */
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ ok: false, reason: "signed_out" }, { status: 200 });

  const code = req.cookies.get("xref")?.value;
  if (!code) return NextResponse.json({ ok: true, captured: false });

  const user = await currentUser();
  const result = await xrefAttribute(code, userId, {
    email: user?.emailAddresses?.[0]?.emailAddress ?? null,
    firstName: user?.firstName ?? null,
    lastName: user?.lastName ?? null,
  });

  if (!result.ok && !result.skipped) {
    console.warn("[xref] capture attribution did not record:", result);
  }

  const res = NextResponse.json({ ok: true, captured: true, recorded: result.ok });
  if (result.ok || result.reason === "no_base") {
    res.cookies.set("xref", "", { maxAge: 0, path: "/" });
  }
  return res;
}
