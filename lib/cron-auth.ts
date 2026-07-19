import { timingSafeEqual } from "crypto";
import type { NextRequest } from "next/server";

function safeEqualString(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/**
 * Fail-closed Bearer check for `/api/cron/*` and `/api/enrich/*`.
 * Trims secret and Authorization header so whitespace drift cannot open or
 * falsely deny production crons. Uses timing-safe compare.
 */
export function authorizeCron(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    // Local only: unset secret. Production must always set CRON_SECRET.
    return process.env.NODE_ENV !== "production";
  }
  const header = request.headers.get("authorization")?.trim() ?? "";
  return safeEqualString(header, `Bearer ${secret}`);
}
