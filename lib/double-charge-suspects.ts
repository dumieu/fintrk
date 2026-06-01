import "server-only";

export type DoubleChargeVerdict = "strong" | "likely_benign";

export interface DoubleChargeSuspectMeta {
  verdict: DoubleChargeVerdict;
  reason: string;
  /** Other transaction ids in the same suspect cluster. */
  relatedIds: string[];
}

export interface DoubleChargeCandidate {
  id: string;
  postedDate: string;
  merchantName: string | null;
  rawDescription: string;
  baseAmount: string;
  accountId: string;
  referenceId: string | null;
  isRecurring: boolean;
  statementId: number | null;
}

const AUTH_PATTERN =
  /\b(auth(orization)?|hold|pending|pre-?auth|temporary|verification|reserved)\b/i;
const REFUND_PATTERN = /\b(refund|reversal|chargeback|credit\s+adj)\b/i;
const INSTALLMENT_PATTERN = /\b(\d+\s*\/\s*\d+|inst(allment)?\s*\d+)\b/i;

export function doubleChargeMerchantKey(
  name: string | null | undefined,
  rawDescription: string,
): string {
  const src = (name?.trim() || rawDescription || "").toLowerCase();
  return src
    .replace(/[*#]+/g, " ")
    .replace(/\b(paypal|sq |dd |amzn|cko)\s?\*/gi, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 96);
}

function daysApart(a: string, b: string): number {
  const da = new Date(`${a}T00:00:00Z`).getTime();
  const db = new Date(`${b}T00:00:00Z`).getTime();
  return Math.abs(da - db) / (1000 * 60 * 60 * 24);
}

function amountCents(value: string): number {
  return Math.round(Math.abs(parseFloat(value)) * 100);
}

function sameSign(a: string, b: string): boolean {
  const sa = Math.sign(parseFloat(a));
  const sb = Math.sign(parseFloat(b));
  if (sa === 0 || sb === 0) return true;
  return sa === sb;
}

function classifyPair(
  a: DoubleChargeCandidate,
  b: DoubleChargeCandidate,
): { verdict: DoubleChargeVerdict; reason: string } | null {
  if (a.id === b.id) return null;
  if (!sameSign(a.baseAmount, b.baseAmount)) return null;

  const centsA = amountCents(a.baseAmount);
  const centsB = amountCents(b.baseAmount);
  if (centsA === 0 || centsB === 0) return null;
  if (Math.abs(centsA - centsB) > 1) return null;

  const days = daysApart(a.postedDate, b.postedDate);
  if (days > 7) return null;

  const merchantA = doubleChargeMerchantKey(a.merchantName, a.rawDescription);
  const merchantB = doubleChargeMerchantKey(b.merchantName, b.rawDescription);
  if (!merchantA || !merchantB || merchantA !== merchantB) return null;

  const refA = a.referenceId?.trim() ?? "";
  const refB = b.referenceId?.trim() ?? "";
  if (refA && refB && refA === refB) return null;

  const blobA = `${a.rawDescription} ${a.merchantName ?? ""}`;
  const blobB = `${b.rawDescription} ${b.merchantName ?? ""}`;
  if (REFUND_PATTERN.test(blobA) || REFUND_PATTERN.test(blobB)) return null;
  if (INSTALLMENT_PATTERN.test(blobA) || INSTALLMENT_PATTERN.test(blobB)) return null;

  if (
    a.rawDescription.trim() === b.rawDescription.trim() &&
    days === 0 &&
    a.statementId != null &&
    a.statementId === b.statementId
  ) {
    return null;
  }

  const authA = AUTH_PATTERN.test(blobA);
  const authB = AUTH_PATTERN.test(blobB);
  if (authA !== authB && days <= 5) {
    return {
      verdict: "likely_benign",
      reason: "Authorization and settlement pair",
    };
  }

  if (a.isRecurring && b.isRecurring && days >= 6 && days <= 7) {
    return {
      verdict: "likely_benign",
      reason: "Weekly recurring charges",
    };
  }

  if (days <= 1 && a.accountId === b.accountId) {
    return {
      verdict: "strong",
      reason: days === 0 ? "Same-day duplicate amount" : "Next-day duplicate amount",
    };
  }

  if (days <= 3 && a.accountId === b.accountId) {
    return {
      verdict: "strong",
      reason: "Duplicate amount within 3 days",
    };
  }

  if (days <= 7 && a.accountId === b.accountId) {
    return {
      verdict: "strong",
      reason: "Duplicate amount within 7 days",
    };
  }

  if (days <= 2) {
    return {
      verdict: "strong",
      reason: "Cross-account duplicate within 2 days",
    };
  }

  return null;
}

/**
 * Find transactions that appear to be double charges at the same merchant.
 * Strong matches are same-account near-date duplicates; benign matches include
 * auth/capture pairs and some recurring collisions.
 */
export function findDoubleChargeSuspects(
  rows: DoubleChargeCandidate[],
  options?: { excludedMerchantKeys?: ReadonlySet<string> },
): Map<string, DoubleChargeSuspectMeta> {
  const excluded = options?.excludedMerchantKeys;
  const buckets = new Map<string, DoubleChargeCandidate[]>();

  for (const row of rows) {
    const merchant = doubleChargeMerchantKey(row.merchantName, row.rawDescription);
    if (!merchant) continue;
    if (excluded?.has(merchant)) continue;
    const cents = amountCents(row.baseAmount);
    if (cents < 100) continue;
    const key = `${merchant}|${cents}|${Math.sign(parseFloat(row.baseAmount)) || 0}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(row);
  }

  const pairEdges: Array<{ ids: [string, string]; meta: DoubleChargeSuspectMeta }> = [];

  for (const group of buckets.values()) {
    if (group.length < 2) continue;
    const sorted = [...group].sort((x, y) => x.postedDate.localeCompare(y.postedDate));
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const a = sorted[i];
        const b = sorted[j];
        if (daysApart(a.postedDate, b.postedDate) > 7) break;
        const verdict = classifyPair(a, b);
        if (!verdict) continue;
        pairEdges.push({
          ids: [a.id, b.id],
          meta: {
            verdict: verdict.verdict,
            reason: verdict.reason,
            relatedIds: [],
          },
        });
      }
    }
  }

  const parent = new Map<string, string>();
  const find = (id: string): string => {
    const p = parent.get(id) ?? id;
    if (p === id) return id;
    const root = find(p);
    parent.set(id, root);
    return root;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(rb, ra);
  };

  for (const edge of pairEdges) {
    union(edge.ids[0], edge.ids[1]);
  }

  const clusters = new Map<string, Set<string>>();
  for (const edge of pairEdges) {
    for (const id of edge.ids) {
      const root = find(id);
      if (!clusters.has(root)) clusters.set(root, new Set());
      clusters.get(root)!.add(id);
    }
  }

  const out = new Map<string, DoubleChargeSuspectMeta>();

  for (const edge of pairEdges) {
    const [a, b] = edge.ids;
    const cluster = clusters.get(find(a)) ?? new Set([a, b]);
    const related = [...cluster].filter((id) => id !== a);
    const existingA = out.get(a);
    const pick = (current: DoubleChargeSuspectMeta | undefined, next: DoubleChargeSuspectMeta) => {
      if (!current) return next;
      if (current.verdict === "strong") return current;
      if (next.verdict === "strong") return next;
      return current;
    };
    out.set(a, pick(existingA, { ...edge.meta, relatedIds: related.filter((id) => id !== a) }));
    const relatedB = [...cluster].filter((id) => id !== b);
    out.set(b, pick(out.get(b), { ...edge.meta, relatedIds: relatedB }));
  }

  return out;
}

export interface DoubleChargeMerchantSummary {
  key: string;
  label: string;
  count: number;
}

export function summarizeDoubleChargeMerchants(
  rows: DoubleChargeCandidate[],
  suspectById: Map<string, DoubleChargeSuspectMeta>,
): DoubleChargeMerchantSummary[] {
  const rowById = new Map(rows.map((r) => [r.id, r]));
  const byKey = new Map<string, { label: string; count: number }>();

  for (const id of suspectById.keys()) {
    const row = rowById.get(id);
    if (!row) continue;
    const key = doubleChargeMerchantKey(row.merchantName, row.rawDescription);
    if (!key) continue;
    const label = row.merchantName?.trim() || row.rawDescription.trim().slice(0, 64) || key;
    const cur = byKey.get(key);
    if (cur) cur.count += 1;
    else byKey.set(key, { label, count: 1 });
  }

  return [...byKey.entries()]
    .map(([key, v]) => ({ key, label: v.label, count: v.count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}
