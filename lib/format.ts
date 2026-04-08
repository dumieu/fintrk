const ZERO_DECIMAL_CURRENCIES = new Set(["JPY", "KRW", "VND", "CLP", "ISK", "UGX"]);
const THREE_DECIMAL_CURRENCIES = new Set(["BHD", "KWD", "OMR", "TND"]);

function decimalPlaces(currency: string): number {
  const upper = currency.toUpperCase();
  if (ZERO_DECIMAL_CURRENCIES.has(upper)) return 0;
  if (THREE_DECIMAL_CURRENCIES.has(upper)) return 3;
  return 2;
}

export function formatCurrency(
  amount: number | string,
  currency: string,
  locale = "en-US",
): string {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(num)) return "—";

  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: currency.toUpperCase(),
      minimumFractionDigits: decimalPlaces(currency),
      maximumFractionDigits: decimalPlaces(currency),
    }).format(num);
  } catch {
    return `${currency} ${num.toFixed(decimalPlaces(currency))}`;
  }
}

export function formatAmount(amount: number | string, currency: string): string {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(num)) return "—";
  const dp = decimalPlaces(currency);
  const abs = Math.abs(num);
  const sign = num < 0 ? "-" : num > 0 ? "+" : "";

  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 10_000) return `${sign}${(abs / 1_000).toFixed(1)}K`;

  return `${sign}${abs.toFixed(dp)}`;
}

export function formatDelta(
  current: number,
  previous: number,
): { text: string; direction: "up" | "down" | "flat"; percent: number } {
  if (previous === 0) {
    return { text: current === 0 ? "0%" : "—", direction: "flat", percent: 0 };
  }

  const pct = ((current - previous) / Math.abs(previous)) * 100;
  const abs = Math.abs(pct);
  const direction = pct > 0.5 ? "up" : pct < -0.5 ? "down" : "flat";
  const sign = pct > 0 ? "+" : "";

  return {
    text: `${sign}${abs >= 100 ? abs.toFixed(0) : abs.toFixed(1)}%`,
    direction,
    percent: pct,
  };
}

export function formatFxSpread(bps: number | string): string {
  const num = typeof bps === "string" ? parseFloat(bps) : bps;
  if (isNaN(num)) return "—";
  const pct = num / 100;
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`;
}

export function formatDate(
  dateStr: string,
  style: "short" | "long" | "ddMmmYy" = "short",
): string {
  try {
    const d = new Date(dateStr + "T00:00:00");
    if (style === "long") {
      return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
    }
    if (style === "ddMmmYy") {
      const day = String(d.getDate()).padStart(2, "0");
      const mon = d.toLocaleDateString("en-GB", { month: "short" });
      const yy = String(d.getFullYear()).slice(-2);
      return `${day} ${mon} ${yy}`;
    }
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return dateStr;
  }
}

const NETWORK_LABELS: Record<string, string> = {
  visa: "Visa",
  mastercard: "Mastercard",
  amex: "AMEX",
  discover: "Discover",
  jcb: "JCB",
  unionpay: "UnionPay",
  diners: "Diners Club",
};

/** Display name for `accounts.card_network` (empty if unknown / not a card). */
export function cardNetworkLabel(network: string | null | undefined): string {
  if (!network || network === "unknown") return "";
  return NETWORK_LABELS[network] ?? "";
}

/**
 * Combines card network + account type into a human label.
 * E.g. "Visa Credit", "Mastercard Debit", "AMEX Credit", "Checking", "Savings".
 */
export function accountProductLabel(
  accountType: string | null | undefined,
  cardNetwork?: string | null,
): string {
  const networkLabel = cardNetwork ? NETWORK_LABELS[cardNetwork] : undefined;

  const typeLabel = (() => {
    switch (accountType) {
      case "credit":
        return networkLabel ? "Credit" : "Credit card";
      case "checking":
        return networkLabel ? "Debit" : "Checking";
      case "savings":
        return "Savings";
      case "investment":
        return "Investment";
      case "loan":
        return "Loan";
      default:
        return networkLabel ? "" : "Account";
    }
  })();

  if (networkLabel && typeLabel) return `${networkLabel} ${typeLabel}`;
  if (networkLabel) return networkLabel;
  return typeLabel || "Account";
}

/** Format masked number as ******1234. */
export function formatMaskedNumber(masked: string | null | undefined): string {
  if (!masked) return "";
  const digits = masked.replace(/\D/g, "");
  if (digits.length < 2) return "";
  const last4 = digits.slice(-4);
  return `******${last4}`;
}

/** Separator between subtitle segments (NBSP ×3 so spaces don’t collapse in HTML). */
export const TRANSACTION_SUBTITLE_SEPARATOR = "\u00A0\u00A0\u00A0";

/**
 * User-facing account kind for transaction subtitles: Credit Card, Debit Card, Checking Account, etc.
 */
export function accountKindSubtitleLabel(
  accountType: string | null | undefined,
  cardNetwork: string | null | undefined,
): string {
  const hasNetwork = !!cardNetwork && cardNetwork !== "unknown";
  switch (accountType) {
    case "credit":
      return "Credit Card";
    case "checking":
      return hasNetwork ? "Debit Card" : "Checking Account";
    case "savings":
      return "Savings Account";
    case "investment":
      return "Investment Account";
    case "loan":
      return "Loan Account";
    default:
      return "Account";
  }
}

export function formatNumber(num: number, decimals = 0): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(num);
}

export function currencySymbol(currency: string): string {
  try {
    const parts = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency.toUpperCase(),
    }).formatToParts(0);
    return parts.find((p) => p.type === "currency")?.value ?? currency;
  } catch {
    return currency;
  }
}
