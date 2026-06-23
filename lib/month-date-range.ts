/** Calendar month key `YYYY-MM` → inclusive local date range. */
export function monthKeyToDateRange(monthKey: string): { dateFrom: string; dateTo: string } {
  const [y, m] = monthKey.split("-").map((s) => parseInt(s, 10));
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return {
    dateFrom: `${monthKey}-01`,
    dateTo: `${monthKey}-${String(lastDay).padStart(2, "0")}`,
  };
}

/** Calendar year key `YYYY` → inclusive UTC date range (current year ends today). */
export function yearKeyToDateRange(yearKey: string): { dateFrom: string; dateTo: string } {
  const y = parseInt(yearKey, 10);
  const now = new Date();
  const isCurrent = y === now.getUTCFullYear();
  const dateTo = isCurrent
    ? `${y}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(now.getUTCDate()).padStart(2, "0")}`
    : `${y}-12-31`;
  return { dateFrom: `${y}-01-01`, dateTo };
}

/** `YYYY-MM` month key or `YYYY` year key → drill-down date range. */
export function periodKeyToDateRange(periodKey: string): { dateFrom: string; dateTo: string } {
  if (/^\d{4}-\d{2}$/.test(periodKey)) return monthKeyToDateRange(periodKey);
  if (/^\d{4}$/.test(periodKey)) return yearKeyToDateRange(periodKey);
  return monthKeyToDateRange(periodKey);
}

export function formatMonthKeyLabel(monthKey: string): string {
  const [y, m] = monthKey.split("-").map((s) => parseInt(s, 10));
  const d = new Date(Date.UTC(y, m - 1, 1));
  const month = d.toLocaleString("en-US", { month: "long", timeZone: "UTC" });
  return `${month} ${y}`;
}

export function isCurrentUtcYear(yearKey: string): boolean {
  return yearKey === String(new Date().getUTCFullYear());
}

export function formatYearKeyLabel(yearKey: string): string {
  return isCurrentUtcYear(yearKey) ? `${yearKey} (YTD)` : yearKey;
}

/** Human label for a chart period key (`YYYY-MM` or `YYYY`). */
export function formatPeriodKeyLabel(periodKey: string): string {
  if (/^\d{4}$/.test(periodKey)) return formatYearKeyLabel(periodKey);
  if (/^\d{4}-\d{2}$/.test(periodKey)) return formatMonthKeyLabel(periodKey);
  return periodKey;
}

/** Label for an inclusive date span (month or full calendar year). */
export function formatPeriodRangeLabel(dateFrom: string, dateTo: string): string {
  const yFrom = dateFrom.slice(0, 4);
  const yTo = dateTo.slice(0, 4);
  if (yFrom === yTo && dateFrom.endsWith("-01-01") && (dateTo.endsWith("-12-31") || isCurrentUtcYear(yFrom))) {
    return formatYearKeyLabel(yFrom);
  }
  if (dateFrom.length >= 7) return formatMonthKeyLabel(dateFrom.slice(0, 7));
  return yFrom;
}
