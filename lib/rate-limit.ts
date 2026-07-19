import "server-only";

/**
 * In-memory fixed-window rate limiter (per Vercel serverless isolate).
 * Counters do NOT share across isolates; defense-in-depth only.
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();
const MAX_STORE_ENTRIES = 10_000;
const CLEANUP_INTERVAL = 60_000;
let lastCleanup = Date.now();

function cleanup(force = false) {
  const now = Date.now();
  if (!force && now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;
  for (const [key, entry] of store) {
    if (entry.resetAt <= now) store.delete(key);
  }
  if (store.size <= MAX_STORE_ENTRIES) return;
  const sorted = [...store.entries()].sort((a, b) => a[1].resetAt - b[1].resetAt);
  const toDrop = store.size - MAX_STORE_ENTRIES;
  for (let i = 0; i < toDrop; i++) {
    const key = sorted[i]?.[0];
    if (key) store.delete(key);
  }
}

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

const RATE_LIMITS: Record<string, RateLimitConfig> = {
  "api-mcp-register": { windowMs: 300_000, maxRequests: 10 },
  "api-mcp-token": { windowMs: 60_000, maxRequests: 30 },
  /** Authorize triggers CIMD outbound fetches; keep per-IP budget tight. */
  "api-mcp-authorize": { windowMs: 60_000, maxRequests: 30 },
  "api-contact": { windowMs: 300_000, maxRequests: 5 },
  "api-feedback": { windowMs: 300_000, maxRequests: 5 },
};

export function checkRateLimit(
  key: string,
  category: keyof typeof RATE_LIMITS,
): { allowed: boolean; remaining: number; resetAt: number } {
  cleanup();

  const config = RATE_LIMITS[category];
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || entry.resetAt <= now) {
    if (!store.has(key) && store.size >= MAX_STORE_ENTRIES) {
      cleanup(true);
    }
    store.set(key, { count: 1, resetAt: now + config.windowMs });
    return {
      allowed: true,
      remaining: config.maxRequests - 1,
      resetAt: now + config.windowMs,
    };
  }

  entry.count++;
  const remaining = Math.max(0, config.maxRequests - entry.count);
  return {
    allowed: entry.count <= config.maxRequests,
    remaining,
    resetAt: entry.resetAt,
  };
}

export function getRateLimitHeaders(
  remaining: number,
  resetAt: number,
): Record<string, string> {
  return {
    "X-RateLimit-Remaining": String(remaining),
    "X-RateLimit-Reset": String(Math.ceil(resetAt / 1000)),
    "Retry-After": String(Math.max(1, Math.ceil((resetAt - Date.now()) / 1000))),
    "X-RateLimit-Scope": "isolate",
  };
}

export function clientIpFrom(request: Request): string {
  const h = request.headers;
  return (
    (h.get("x-forwarded-for") ?? "").split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    "unknown"
  );
}
