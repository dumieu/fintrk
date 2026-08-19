import "server-only";

/**
 * Per-user request caps for the AI chat, held in memory per serverless isolate
 * (same posture as lib/rate-limit.ts: defense-in-depth, not a global quota).
 * They sit far above normal conversation so real users never feel them; they
 * exist to stop runaway scripts before the daily spend budget has to.
 *
 * The authoritative cost ceiling is the Neon-backed daily budget in
 * lib/fin-ai/usage.ts. These counters just make the cheap path cheap.
 */

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * 60 * 1000;

const PER_MINUTE = 8;
const PER_DAY = 150;

/** Guard against unbounded map growth on a long-lived isolate. */
const MAX_TRACKED_USERS = 5_000;

interface Window {
  count: number;
  resetAt: number;
}

const minuteBuckets = new Map<string, Window>();
const dayBuckets = new Map<string, Window>();

function sweep(map: Map<string, Window>, now: number) {
  for (const [key, w] of map) {
    if (w.resetAt <= now) map.delete(key);
  }
  if (map.size <= MAX_TRACKED_USERS) return;
  // Still oversized after expiry sweep: drop the soonest-to-reset entries.
  const sorted = [...map.entries()].sort((a, b) => a[1].resetAt - b[1].resetAt);
  for (let i = 0; i < map.size - MAX_TRACKED_USERS; i++) {
    map.delete(sorted[i][0]);
  }
}

function consume(map: Map<string, Window>, id: string, limit: number, windowMs: number) {
  const now = Date.now();
  let w = map.get(id);
  if (!w || w.resetAt <= now) {
    if (map.size >= MAX_TRACKED_USERS) sweep(map, now);
    w = { count: 0, resetAt: now + windowMs };
    map.set(id, w);
  }
  w.count += 1;
  return { allowed: w.count <= limit, retryAfter: Math.ceil((w.resetAt - now) / 1000) };
}

export interface ChatRateVerdict {
  allowed: boolean;
  retryAfter?: number;
  reason?: string;
}

/** Consume one chat request for this user. */
export function chatRateLimit(userId: string): ChatRateVerdict {
  const minute = consume(minuteBuckets, userId, PER_MINUTE, MINUTE_MS);
  if (!minute.allowed) {
    return {
      allowed: false,
      retryAfter: minute.retryAfter,
      reason: "You're sending messages very fast. Give it a few seconds.",
    };
  }
  const day = consume(dayBuckets, userId, PER_DAY, DAY_MS);
  if (!day.allowed) {
    return {
      allowed: false,
      retryAfter: day.retryAfter,
      reason: "Daily message limit reached. It resets tomorrow.",
    };
  }
  return { allowed: true };
}
