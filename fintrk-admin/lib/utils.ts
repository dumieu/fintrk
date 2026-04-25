import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatMs(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return "–";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) return `${(ms / 60000).toFixed(1)}m`;
  return `${(ms / 3600000).toFixed(1)}h`;
}

export function truncate(str: string, maxLen: number = 60): string {
  if (!str || str.length <= maxLen) return str;
  return str.slice(0, maxLen) + "…";
}

export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return "–";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "–";
  const diff = Date.now() - t;
  if (diff < 60_000) return `${Math.max(1, Math.floor(diff / 1000))}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 30 * 86_400_000) return `${Math.floor(diff / 86_400_000)}d ago`;
  return new Date(iso).toISOString().slice(0, 10);
}

export function formatNumber(n: number | string | null | undefined, decimals = 0): string {
  if (n == null || n === "") return "–";
  const v = typeof n === "string" ? Number(n) : n;
  if (!Number.isFinite(v)) return "–";
  return v.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function formatCurrency(amount: number | string | null | undefined, currency = "USD"): string {
  if (amount == null || amount === "") return "–";
  const v = typeof amount === "string" ? Number(amount) : amount;
  if (!Number.isFinite(v)) return "–";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency || "USD",
      maximumFractionDigits: 2,
    }).format(v);
  } catch {
    return `${v.toFixed(2)} ${currency}`;
  }
}

export function pct(numerator: number, denominator: number): string {
  if (!denominator) return "0%";
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}
