import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import { db } from "@/lib/db";
import { contactSubmissions } from "@/lib/db/schema";
import { logAppError } from "@/lib/error-log";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      fullName?: unknown;
      email?: unknown;
      country?: unknown;
      message?: unknown;
    };

    const fullName =
      typeof body.fullName === "string" ? body.fullName.trim().slice(0, 255) : "";
    const email =
      typeof body.email === "string" ? body.email.trim().slice(0, 255) : "";
    const country =
      typeof body.country === "string" ? body.country.trim().slice(0, 255) : "";
    const message =
      typeof body.message === "string"
        ? body.message.trim().slice(0, 5000)
        : "";

    if (!fullName) {
      return NextResponse.json(
        { success: false, error: "Full name is required." },
        { status: 400 },
      );
    }
    if (!email || !email.includes("@")) {
      return NextResponse.json(
        { success: false, error: "Valid email is required." },
        { status: 400 },
      );
    }
    if (!message) {
      return NextResponse.json(
        { success: false, error: "Message is required." },
        { status: 400 },
      );
    }

    let userId: string | null = null;
    try {
      const session = await auth();
      userId = session.userId ?? null;
    } catch {
      userId = null;
    }

    await db.insert(contactSubmissions).values({
      clerkUserId: userId,
      fullName,
      email,
      country: country || "",
      message,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logAppError({
      context: "api/contact",
      error,
      request,
      severity: "error",
    });
    return NextResponse.json(
      { success: false, error: "Something went wrong. Please try again." },
      { status: 500 },
    );
  }
}
