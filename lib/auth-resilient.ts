import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const NO_STORE = { "Cache-Control": "no-store" } as const;

const RETRY_DELAYS_MS = [100, 250, 500];

/**
 * Clerk's auth() can transiently return userId: null when the JWT is being
 * rotated, on serverless cold starts, or for brand-new users whose session
 * cookie hasn't fully propagated. This wrapper retries with short backoff
 * (~850ms total) before giving up.
 */
export async function resilientAuth() {
  const first = await auth();
  if (first.userId) return first;

  for (const delay of RETRY_DELAYS_MS) {
    await new Promise((r) => setTimeout(r, delay));
    const retry = await auth();
    if (retry.userId) return retry;
  }

  console.warn(
    JSON.stringify({
      _type: "auth_transient_failure",
      msg: `auth() returned null userId after ${RETRY_DELAYS_MS.length} retries (~${RETRY_DELAYS_MS.reduce((a, b) => a + b, 0)}ms)`,
      ts: new Date().toISOString(),
    })
  );

  return await auth();
}

/**
 * 401 JSON response with no-store. The code field lets the client distinguish
 * between a genuinely expired session and a transient auth propagation delay.
 */
export function unauthorizedResponse() {
  return NextResponse.json(
    {
      error: "We couldn't verify your session. Please refresh the page.",
      code: "AUTH_FAILED",
    },
    { status: 401, headers: NO_STORE }
  );
}
