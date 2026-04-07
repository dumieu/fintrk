import "server-only";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "@/lib/db/schema";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

const sql = neon(connectionString);

export const db = drizzle({ client: sql, schema });

export const rawSql = neon(connectionString);

type RawSqlReturn = ReturnType<typeof rawSql>;

const RETRY_DELAYS_MS = [200, 500, 1200];

export function isTransientFetchError(err: unknown): boolean {
  if (err instanceof TypeError && /fetch failed/i.test(err.message)) return true;
  if (err instanceof Error) {
    const msg = err.message;
    if (/ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|UND_ERR_CONNECT_TIMEOUT/i.test(msg)) return true;
    if (/socket hang up|network/i.test(msg)) return true;
    if (err.cause && isTransientFetchError(err.cause)) return true;
  }
  return false;
}

/**
 * Wraps a rawSql tagged-template call with retry logic for transient
 * Neon serverless fetch failures (cold starts, network blips).
 * Only retries on network-level errors — never on SQL/application errors.
 */
export async function resilientRawSql(
  queryFn: () => RawSqlReturn,
): Promise<Awaited<RawSqlReturn>> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      return await queryFn();
    } catch (err) {
      lastError = err;
      if (!isTransientFetchError(err) || attempt === RETRY_DELAYS_MS.length) break;
      await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
    }
  }
  throw lastError;
}

/**
 * Generic retry wrapper for any async DB operation (Drizzle or otherwise).
 * Retries only on transient network-level errors from the Neon HTTP driver.
 */
export async function resilientQuery<T>(queryFn: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      return await queryFn();
    } catch (err) {
      lastError = err;
      if (!isTransientFetchError(err) || attempt === RETRY_DELAYS_MS.length) break;
      await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
    }
  }
  throw lastError;
}
