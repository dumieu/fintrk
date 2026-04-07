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

export function formatDate(dateStr: string, style: "short" | "long" = "short"): string {
  try {
    const d = new Date(dateStr + "T00:00:00");
    if (style === "long") {
      return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
    }
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return dateStr;
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
