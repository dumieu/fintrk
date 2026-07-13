import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import { db } from "@/lib/db";
import { feedbackSubmissions } from "@/lib/db/schema";
import { logAppError } from "@/lib/error-log";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      email?: unknown;
      sentiment?: unknown;
      message?: unknown;
    };

    const email =
      typeof body.email === "string" ? body.email.trim().slice(0, 255) : "";
    const sentiment =
      body.sentiment === "loving_it" || body.sentiment === "tough_time"
        ? body.sentiment
        : null;
    const message =
      typeof body.message === "string"
        ? body.message.trim().slice(0, 5000)
        : "";

    if (!email || !email.includes("@")) {
      return NextResponse.json(
        { success: false, error: "Valid email is required." },
        { status: 400 },
      );
    }
    if (!sentiment) {
      return NextResponse.json(
        { success: false, error: "Please select a sentiment." },
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

    await db.insert(feedbackSubmissions).values({
      clerkUserId: userId,
      email,
      sentiment,
      message: message || null,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logAppError({
      context: "api/feedback",
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
