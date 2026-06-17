import { auth } from "@clerk/nextjs/server";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

const NO_STORE = { "Cache-Control": "no-store" } as const;

const RETRY_DELAYS_MS = [100, 250, 500];

/**
 * The public, no-auth demo (/demo) serves data for the synthetic "demo" user.
 * Its client adds the `x-fintrk-demo: 1` header to read requests. Because the
 * userId here is hard-pinned to the literal string "demo", this branch can
 * NEVER return another user's identity, and middleware swallows demo write
 * requests, so nothing the demo does is ever persisted.
 */
export const DEMO_USER_ID = "demo";

async function isDemoRequest(): Promise<boolean> {
  try {
    const h = await headers();
    return h.get("x-fintrk-demo") === "1";
  } catch {
    return false;
  }
}

/**
 * Clerk's auth() can transiently return userId: null when the JWT is being
 * rotated, on serverless cold starts, or for brand-new users whose session
 * cookie hasn't fully propagated. This wrapper retries with short backoff
 * (~850ms total) before giving up.
 */
export async function resilientAuth() {
  if (await isDemoRequest()) {
    return { userId: DEMO_USER_ID } as unknown as Awaited<ReturnType<typeof auth>>;
  }

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
