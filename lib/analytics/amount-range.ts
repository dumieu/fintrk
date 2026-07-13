import { sql, type SQL } from "drizzle-orm";
import { transactions } from "@/lib/db/schema";

export type AmountRangeFilter = {
  /** Inclusive lower bound on ABS(base_amount). Null/0 = no floor. */
  min: number | null;
  /** Inclusive upper bound on ABS(base_amount). Null = no ceiling. */
  max: number | null;
};

export function parseAmountRangeParam(
  minRaw: string | null,
  maxRaw: string | null,
): AmountRangeFilter {
  const minParsed = minRaw != null && minRaw !== "" ? Number(minRaw) : null;
  const maxParsed = maxRaw != null && maxRaw !== "" ? Number(maxRaw) : null;
  const min =
    minParsed != null && Number.isFinite(minParsed) && minParsed > 0
      ? Math.min(1_000_000_000, Math.max(0, minParsed))
      : null;
  const max =
    maxParsed != null && Number.isFinite(maxParsed) && maxParsed >= 0
      ? Math.min(1_000_000_000, Math.max(0, maxParsed))
      : null;
  if (min != null && max != null && min > max) {
    return { min: max, max: min };
  }
  return { min, max };
}

/** SQL fragments for ABS(base_amount) inclusive range. Empty when no filter. */
export function amountRangeSqlParts(range: AmountRangeFilter): SQL[] {
  const absExpr = sql`ABS(CAST(${transactions.baseAmount} AS numeric))`;
  const parts: SQL[] = [];
  if (range.min != null) {
    parts.push(sql`${absExpr} >= ${range.min}`);
  }
  if (range.max != null) {
    parts.push(sql`${absExpr} <= ${range.max}`);
  }
  return parts;
}

export function amountRangeIsActive(range: AmountRangeFilter): boolean {
  return range.min != null || range.max != null;
}

/** Round a max transaction size up to a clean slider ceiling. */
export function niceTxnSizeCeiling(raw: number): number {
  const n = Math.max(0, Number.isFinite(raw) ? raw : 0);
  if (n <= 0) return 100;
  if (n <= 50) return 50;
  if (n <= 100) return 100;
  if (n <= 250) return 250;
  if (n <= 500) return 500;
  if (n <= 1000) return 1000;
  const mag = 10 ** Math.floor(Math.log10(n));
  const step = mag >= 1000 ? mag : mag;
  return Math.ceil(n / step) * step;
}
