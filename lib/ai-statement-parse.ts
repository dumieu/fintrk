import { aiResponseSchema, type AiResponse } from "@/lib/validations/ingest";

/**
 * Gemini statement extraction is not a clean record. Long PDFs get cut off
 * mid-JSON, and header / total / rewards lines come back with null
 * posted_date or base_amount. The database row is strict; this module makes
 * the model payload strict before Zod sees it, and drops only the lines that
 * still are not transactions. One bad line must not fail the statement.
 */

const MONTHS: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

const ACCOUNT_TYPES = new Set(["checking", "savings", "credit", "investment", "unknown"]);
const CARD_NETWORKS = new Set([
  "visa", "mastercard", "amex", "discover", "jcb", "unionpay", "diners", "unknown",
]);

export type InterpretedStatement =
  | { ok: true; data: AiResponse }
  | { ok: false; error: string };

export function interpretAiStatement(aiText: string): InterpretedStatement {
  let parsed: unknown;
  try {
    parsed = parseModelJson(aiText);
  } catch {
    return { ok: false, error: "AI returned invalid JSON" };
  }

  const validation = aiResponseSchema.safeParse(prepareAiStatement(parsed));
  if (!validation.success) {
    const brief =
      validation.error.issues
        .slice(0, 3)
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; ") || "Schema validation failed";
    return { ok: false, error: `Schema validation failed (${brief})` };
  }
  return { ok: true, data: validation.data };
}

export function parseModelJson(text: string): unknown {
  const cleaned = stripCodeFences(text).replace(/^\uFEFF/, "").trim();
  if (!cleaned) throw new Error("empty");

  const start = indexOfValueStart(cleaned);
  if (start < 0) throw new Error("no json");
  const body = cleaned.slice(start);

  const direct = tryParse(body);
  if (direct !== undefined) return direct;

  const ends = containerEndIndexes(body);
  for (let i = ends.length - 1; i >= 0; i--) {
    const closed = closeContainers(body.slice(0, ends[i]! + 1));
    const parsed = tryParse(closed);
    if (parsed !== undefined) return parsed;
  }
  throw new Error("invalid json");
}

/** Coerce model output into the ingest shape. Incomplete lines are removed. */
export function prepareAiStatement(input: unknown): unknown {
  const root = unwrapRoot(input);
  if (!root) return input;

  const metaIn =
    root.account_metadata && typeof root.account_metadata === "object"
      ? (root.account_metadata as Record<string, unknown>)
      : {};
  const period = {
    start: coerceIsoDate(metaIn.statement_period_start),
    end: coerceIsoDate(metaIn.statement_period_end),
  };
  const metaCurrency = coerceCurrency(metaIn.primary_currency);

  const rawTxns = Array.isArray(root.transactions)
    ? root.transactions
    : root.transactions && typeof root.transactions === "object"
      ? [root.transactions]
      : [];

  const transactions = rawTxns
    .map((txn) => normalizeTransaction(txn, metaCurrency, period))
    .filter((txn): txn is Record<string, unknown> => txn !== null);

  const primary =
    metaCurrency ??
    majorityCurrency(transactions.map((txn) => txn.base_currency));

  if (primary) {
    for (const txn of transactions) {
      if (!coerceCurrency(txn.base_currency)) txn.base_currency = primary;
    }
  }

  return {
    account_metadata: {
      institution_name: asNullableString(metaIn.institution_name),
      account_type: coerceAccountType(metaIn.account_type),
      primary_currency: primary ?? metaIn.primary_currency,
      country_iso: coerceIso2(metaIn.country_iso),
      statement_period_start: period.start,
      statement_period_end: period.end,
      card_network: coerceCardNetwork(metaIn.card_network),
      masked_last_four: metaIn.masked_last_four == null || metaIn.masked_last_four === ""
        ? null
        : metaIn.masked_last_four,
    },
    transactions,
  };
}

function unwrapRoot(input: unknown): Record<string, unknown> | null {
  if (Array.isArray(input)) return { transactions: input };
  if (!input || typeof input !== "object") return null;
  return input as Record<string, unknown>;
}

function normalizeTransaction(
  txn: unknown,
  metaCurrency: string | null,
  period: { start: string | null; end: string | null },
): Record<string, unknown> | null {
  if (!txn || typeof txn !== "object" || Array.isArray(txn)) return null;
  const t = txn as Record<string, unknown>;
  const posted = coerceIsoDate(t.posted_date, period);
  const amount = coerceAmount(t.base_amount);
  const description = asText(t.raw_description) || asText(t.merchant_name);
  const currency = coerceCurrency(t.base_currency) ?? metaCurrency;
  if (!posted || amount === null || !description || !currency) return null;

  const foreignAmount = coerceAmount(t.foreign_amount);
  const foreignCurrency = coerceCurrency(t.foreign_currency);
  const fx = coerceAmount(t.implicit_fx_rate);
  const confidence = coerceConfidence(t.confidence);
  const mcc = coerceMcc(t.mcc_code);

  return {
    posted_date: posted,
    raw_description: description,
    reference_id: asNullableString(t.reference_id),
    merchant_name: asNullableString(t.merchant_name),
    base_amount: amount,
    base_currency: currency,
    foreign_amount: foreignAmount,
    foreign_currency: foreignCurrency,
    implicit_fx_rate: fx,
    mcc_code: mcc,
    country_iso: coerceIso2(t.country_iso),
    category_suggestion: asNullableString(t.category_suggestion),
    is_recurring: coerceBoolean(t.is_recurring),
    ...(confidence === undefined ? {} : { confidence }),
  };
}

function majorityCurrency(values: unknown[]): string | null {
  const counts = new Map<string, number>();
  for (const value of values) {
    const code = coerceCurrency(value);
    if (!code) continue;
    counts.set(code, (counts.get(code) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [code, count] of counts) {
    if (count > bestCount) {
      best = code;
      bestCount = count;
    }
  }
  return best;
}

export function coerceIsoDate(
  value: unknown,
  period?: { start?: string | null; end?: string | null },
): string | null {
  if (value == null) return null;
  if (typeof value === "number" && Number.isFinite(value)) return null;
  const raw = String(value).trim();
  if (!raw || /^null$/i.test(raw) || raw === "-" || raw === "—") return null;

  const iso = /^(\d{4})[-/.](\d{2})[-/.](\d{2})/.exec(raw);
  if (iso) return realIso(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const dmyNamed = /^(\d{1,2})[ .\-/]+([A-Za-z]{3,9})[ .\-/,]+(\d{2,4})$/.exec(raw);
  if (dmyNamed) {
    const month = MONTHS[dmyNamed[2]!.toLowerCase()];
    if (!month) return null;
    return realIso(expandYear(dmyNamed[3]!), month, Number(dmyNamed[1]));
  }

  const mdyNamed = /^([A-Za-z]{3,9})[ .\-/]+(\d{1,2}),?[ .\-/]+(\d{2,4})$/.exec(raw);
  if (mdyNamed) {
    const month = MONTHS[mdyNamed[1]!.toLowerCase()];
    if (!month) return null;
    return realIso(expandYear(mdyNamed[3]!), month, Number(mdyNamed[2]));
  }

  const slash = /^(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})$/.exec(raw);
  if (!slash) return null;
  const a = Number(slash[1]);
  const b = Number(slash[2]);
  const year = expandYear(slash[3]!);
  const mdy = realIso(year, a, b);
  const dmy = realIso(year, b, a);
  if (a > 12 && b <= 12) return dmy;
  if (b > 12 && a <= 12) return mdy;
  if (mdy && dmy && mdy !== dmy) return pickInsidePeriod(mdy, dmy, period);
  return mdy ?? dmy;
}

export function coerceAmount(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  let s = value.trim();
  if (!s || /^null$/i.test(s) || s === "-" || s === "—" || s === ".") return null;

  let sign = 1;
  if (/^\(.*\)$/.test(s)) {
    sign = -1;
    s = s.slice(1, -1).trim();
  }
  if (/^[-−]/.test(s) || /\bdr\b/i.test(s)) sign = -1;
  s = s.replace(/[−]/g, "");
  s = s.replace(/\b(cr|dr)\b/gi, "");
  s = s.replace(/[^\d,.-]/g, "");
  if (s.startsWith("-")) {
    sign = -1;
    s = s.slice(1);
  }
  if (!/\d/.test(s)) return null;

  const hasDot = s.includes(".");
  const hasComma = s.includes(",");
  let normalized = s;
  if (hasDot && hasComma) {
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) {
      normalized = s.replace(/\./g, "").replace(",", ".");
    } else {
      normalized = s.replace(/,/g, "");
    }
  } else if (hasComma) {
    const parts = s.split(",");
    const last = parts[parts.length - 1] ?? "";
    normalized =
      parts.length > 2 || last.length === 3 ? s.replace(/,/g, "") : s.replace(",", ".");
  }

  const n = Number(normalized);
  if (!Number.isFinite(n)) return null;
  return sign < 0 ? -Math.abs(n) : n;
}

function pickInsidePeriod(
  mdy: string,
  dmy: string,
  period?: { start?: string | null; end?: string | null },
): string | null {
  const start = isoBound(period?.start);
  const end = isoBound(period?.end);
  if (!start && !end) return null;
  const inRange = (iso: string) => {
    if (start && iso < start) return false;
    if (end && iso > end) return false;
    return true;
  };
  const mdyOk = inRange(mdy);
  const dmyOk = inRange(dmy);
  if (mdyOk && !dmyOk) return mdy;
  if (dmyOk && !mdyOk) return dmy;
  return null;
}

function isoBound(value: string | null | undefined): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}/.test(value)) return null;
  return value.slice(0, 10);
}

function realIso(year: number, month: number, day: number): string | null {
  if (year < 1990 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const dt = new Date(Date.UTC(year, month - 1, day));
  if (
    dt.getUTCFullYear() !== year ||
    dt.getUTCMonth() !== month - 1 ||
    dt.getUTCDate() !== day
  ) {
    return null;
  }
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

function expandYear(raw: string): number {
  const n = Number(raw);
  if (raw.length === 4) return n;
  return n >= 70 ? 1900 + n : 2000 + n;
}

function coerceCurrency(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const letters = value.toUpperCase().replace(/[^A-Z]/g, "");
  if (letters.length === 3) return letters;
  const match = value.toUpperCase().match(/\b[A-Z]{3}\b/);
  return match ? match[0] : null;
}

function coerceIso2(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const letters = value.toUpperCase().replace(/[^A-Z]/g, "");
  return letters.length === 2 ? letters : null;
}

function coerceAccountType(value: unknown): string {
  const s = String(value ?? "").toLowerCase();
  if (!s) return "unknown";
  if (s.includes("credit")) return "credit";
  if (s.includes("sav")) return "savings";
  if (s.includes("check") || s.includes("debit") || s.includes("current")) return "checking";
  if (s.includes("invest") || s.includes("broker")) return "investment";
  return ACCOUNT_TYPES.has(s) ? s : "unknown";
}

function coerceCardNetwork(value: unknown): string | null {
  if (value == null || value === "") return null;
  const s = String(value).toLowerCase().replace(/[^a-z]/g, "");
  if (!s || s === "null") return null;
  if (s.includes("master")) return "mastercard";
  if (s.includes("americanexpress") || s === "amex") return "amex";
  if (s.includes("diners")) return "diners";
  if (s.includes("union")) return "unionpay";
  if (s.includes("discover")) return "discover";
  if (s.includes("visa")) return "visa";
  if (s === "jcb") return "jcb";
  return CARD_NETWORKS.has(s) ? s : null;
}

function coerceBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") return /^(1|true|yes)$/i.test(value.trim());
  return false;
}

function coerceConfidence(value: unknown): number | undefined {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(n)) return undefined;
  return Math.min(1, Math.max(0, n));
}

function coerceMcc(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isInteger(n)) return null;
  return n;
}

function asText(value: unknown): string {
  if (typeof value !== "string") return "";
  const t = value.trim();
  if (!t || /^null$/i.test(t)) return "";
  return t;
}

function asNullableString(value: unknown): string | null {
  const t = asText(value);
  return t || null;
}

function tryParse(text: string): unknown | undefined {
  const normalized = text
    .replace(/,\s*([}\]])/g, "$1")
    .replace(/:\s*(NaN|-?Infinity)\b/g, ":null");
  try {
    return JSON.parse(normalized);
  } catch {
    return undefined;
  }
}

function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  const wrapped = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  if (wrapped) return wrapped[1] ?? trimmed;
  return trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
}

function indexOfValueStart(text: string): number {
  const objectAt = text.indexOf("{");
  const arrayAt = text.indexOf("[");
  if (objectAt < 0) return arrayAt;
  if (arrayAt < 0) return objectAt;
  return Math.min(objectAt, arrayAt);
}

function containerEndIndexes(text: string): number[] {
  const ends: number[] = [];
  let inString = false;
  let escape = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (inString) {
      if (escape) escape = false;
      else if (ch === "\\") escape = true;
      else if (ch === "\"") inString = false;
      continue;
    }
    if (ch === "\"") {
      inString = true;
      continue;
    }
    if (ch === "}" || ch === "]") ends.push(i);
  }
  return ends;
}

function closeContainers(text: string): string {
  const stack: Array<"{" | "["> = [];
  let inString = false;
  let escape = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (inString) {
      if (escape) escape = false;
      else if (ch === "\\") escape = true;
      else if (ch === "\"") inString = false;
      continue;
    }
    if (ch === "\"") {
      inString = true;
      continue;
    }
    if (ch === "{") stack.push("{");
    else if (ch === "[") stack.push("[");
    else if ((ch === "}" || ch === "]") && stack.length > 0) stack.pop();
  }
  let closed = text.replace(/,\s*$/, "");
  for (let i = stack.length - 1; i >= 0; i--) {
    closed += stack[i] === "{" ? "}" : "]";
  }
  return closed;
}
