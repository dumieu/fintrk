/**
 * Transaction-level dedupe helpers.
 *
 * File-level gating only skips byte-identical uploads (content SHA-256).
 * Every distinct statement byteset is processed; these helpers keep the
 * ledger waterproof when the same month is re-uploaded with more rows.
 */

/** Collapse AI / bank whitespace noise while keeping a stable comparison key. */
export function normalizeRawDescription(raw: string): string {
  return raw
    .normalize("NFKC")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Canonical amount string so 12.5 and 12.5000 share a signature. */
export function normalizeBaseAmount(amount: number | string): string {
  const n = typeof amount === "number" ? amount : Number(amount);
  if (!Number.isFinite(n)) return "0.0000";
  return n.toFixed(4);
}

/**
 * Only treat a reference as a soft identity hint when it looks like a real
 * per-transaction bank id (ARN / FIT / long trace). Card PANs, masked
 * account tails, NRICs, and short auth codes are reused across many lines
 * and must NEVER unique-collapse the ledger.
 */
export function isStrongReferenceId(ref: string | null | undefined): boolean {
  const t = ref?.trim();
  if (!t) return false;
  if (t.length < 12 || t.length > 64) return false;
  if (/x{2,}/i.test(t)) return false;
  if (!/\d/.test(t)) return false;

  const compact = t.replace(/[\s-]/g, "");
  const digitsOnly = compact.replace(/\D/g, "");
  // 15–19 digit all-numeric strings are almost always PANs / account numbers.
  if (
    digitsOnly.length >= 15 &&
    digitsOnly.length <= 19 &&
    digitsOnly.length === compact.length
  ) {
    return false;
  }
  return true;
}

/**
 * Line signature used with occurrence_index for unique ledger keys.
 * Stable across AI whitespace/case variance; occurrence keeps N identical lines.
 */
export function buildDedupeSignature(
  postedDate: string,
  baseAmount: number | string,
  rawDescription: string,
): string {
  return `${postedDate}|${normalizeBaseAmount(baseAmount)}|${normalizeRawDescription(rawDescription)}`;
}

/**
 * Assign occurrence indices within one extract so two identical lines on the
 * same day (same amount + description) are both kept: indices 0 and 1.
 * On a later re-upload with three such lines, only occurrence 2 is new.
 */
export function assignOccurrenceIndices(signatures: string[]): number[] {
  const counts = new Map<string, number>();
  return signatures.map((sig) => {
    const next = counts.get(sig) ?? 0;
    counts.set(sig, next + 1);
    return next;
  });
}
