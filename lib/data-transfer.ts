/**
 * FinTRK exhaustive data export / import.
 * Every transaction is included; accounts + categories travel with them so a
 * blank account can be rebuilt from the JSON alone.
 */

export const FINTRK_DATA_EXPORT_FORMAT = "fintrk-data-export" as const;
export const FINTRK_DATA_EXPORT_VERSION = 1 as const;

export type FintrkExportAccount = {
  id: string;
  institutionName: string | null;
  accountName: string;
  accountType: string;
  cardNetwork: string | null;
  maskedNumber: string | null;
  primaryCurrency: string;
  countryIso: string | null;
  isActive: boolean;
};

export type FintrkExportCategory = {
  id: number;
  name: string;
  slug: string;
  parentSlug: string | null;
  icon: string | null;
  color: string | null;
  sortOrder: number;
  subcategoryType: string | null;
  flowType: string;
  systemCategoryId: number | null;
};

export type FintrkExportTransaction = {
  id: string;
  accountId: string;
  postedDate: string;
  rawDescription: string;
  dedupeSignature: string;
  occurrenceIndex: number;
  referenceId: string | null;
  merchantName: string | null;
  categorySlug: string | null;
  categoryConfidence: string | null;
  baseAmount: string;
  baseCurrency: string;
  foreignAmount: string | null;
  foreignCurrency: string | null;
  implicitFxRate: string | null;
  implicitFxSpreadBps: string | null;
  countryIso: string | null;
  isRecurring: boolean;
  warningFlag: boolean;
  aiConfidence: string | null;
  balanceAfter: string | null;
  note: string | null;
  label: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type FintrkExportIgnore = {
  scope: string;
  /** Present when scope === "item" — matches export transaction id. */
  transactionId: string | null;
  nameKey: string | null;
  displayName: string;
};

export type FintrkDataExport = {
  format: typeof FINTRK_DATA_EXPORT_FORMAT;
  version: typeof FINTRK_DATA_EXPORT_VERSION;
  exportedAt: string;
  exportUserLabel: string;
  counts: {
    accounts: number;
    categories: number;
    transactions: number;
    transactionIgnores: number;
    merchantWarningRules: number;
    merchantLabelRules: number;
  };
  settings: {
    detectTravel: "Yes" | "No";
  };
  accounts: FintrkExportAccount[];
  categories: FintrkExportCategory[];
  transactions: FintrkExportTransaction[];
  transactionIgnores: FintrkExportIgnore[];
  merchantWarningRules: { merchantName: string }[];
  merchantLabelRules: { merchantName: string; label: string }[];
};

export type FintrkImportMode = "merge" | "replace";

export function sanitizeExportUserLabel(raw: string | null | undefined): string {
  const base = (raw ?? "user")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
  return base || "user";
}

export function formatExportFilename(userLabel: string, when = new Date()): string {
  const y = when.getFullYear();
  const m = String(when.getMonth() + 1).padStart(2, "0");
  const d = String(when.getDate()).padStart(2, "0");
  return `fintrk_${sanitizeExportUserLabel(userLabel)}_${y}-${m}-${d}.json`;
}

export function isFintrkDataExport(value: unknown): value is FintrkDataExport {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    v.format === FINTRK_DATA_EXPORT_FORMAT &&
    typeof v.version === "number" &&
    Array.isArray(v.accounts) &&
    Array.isArray(v.categories) &&
    Array.isArray(v.transactions)
  );
}
