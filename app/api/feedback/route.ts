import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { z } from "zod";

import { db } from "@/lib/db";
import { feedbackSubmissions } from "@/lib/db/schema";
import { logAppError } from "@/lib/error-log";
import { checkRateLimit, clientIpFrom, getRateLimitHeaders } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const APP_NAME = "FinTRK";

const feedbackSchema = z.object({
  sentiment: z.enum(["loving_it", "tough_time"], {
    message: "Please select how you're feeling about FinTRK",
  }),
  message: z
    .string()
    .trim()
    .min(1, "Message is required")
    .max(5000, "Message must be 5,000 characters or fewer"),
  ideaRedesignScreen: z.string().max(2000).optional().default(""),
  ideaOtherTools: z.string().max(2000).optional().default(""),
  ideaSpreadsheetTracking: z.string().max(2000).optional().default(""),
  ideaFirstFeature: z.string().max(2000).optional().default(""),
  ideaFriendDescription: z.string().max(2000).optional().default(""),
  ideaMissMost: z.string().max(2000).optional().default(""),
});

function displayNameFromClerk(user: {
  firstName?: string | null;
  lastName?: string | null;
  fullName?: string | null;
}): string {
  const full = user.fullName?.trim();
  if (full) return full;
  const parts = [user.firstName, user.lastName].filter(Boolean) as string[];
  return parts.join(" ").trim();
}

export async function POST(request: Request) {
  try {
    const rl = checkRateLimit(`${clientIpFrom(request)}:feedback`, "api-feedback");
    if (!rl.allowed) {
      return NextResponse.json(
        { success: false, error: "Too many requests. Please try again later." },
        { status: 429, headers: getRateLimitHeaders(rl.remaining, rl.resetAt) },
      );
    }

    const session = await auth();
    const userId = session.userId ?? null;
    if (!userId) {
      return NextResponse.json(
        { success: false, error: "Please sign in to submit feedback." },
        { status: 401 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const data = feedbackSchema.parse(body);

    const clerkUser = await currentUser();
    const email =
      clerkUser?.primaryEmailAddress?.emailAddress?.trim() ||
      clerkUser?.emailAddresses?.[0]?.emailAddress?.trim() ||
      "";
    if (!email) {
      return NextResponse.json(
        { success: false, error: "Your account does not have an email address." },
        { status: 400 },
      );
    }

    const name = clerkUser ? displayNameFromClerk(clerkUser) : "";

    await db.insert(feedbackSubmissions).values({
      clerkUserId: userId,
      name: name || null,
      email,
      appName: APP_NAME,
      sentiment: data.sentiment,
      message: data.message,
      ideaRedesignScreen: data.ideaRedesignScreen || null,
      ideaOtherTools: data.ideaOtherTools || null,
      ideaSpreadsheetTracking: data.ideaSpreadsheetTracking || null,
      ideaFirstFeature: data.ideaFirstFeature || null,
      ideaFriendDescription: data.ideaFriendDescription || null,
      ideaMissMost: data.ideaMissMost || null,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, errors: error.flatten().fieldErrors },
        { status: 400 },
      );
    }

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
