/** Calendar month key `YYYY-MM` → inclusive local date range. */
export function monthKeyToDateRange(monthKey: string): { dateFrom: string; dateTo: string } {
  const [y, m] = monthKey.split("-").map((s) => parseInt(s, 10));
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return {
    dateFrom: `${monthKey}-01`,
    dateTo: `${monthKey}-${String(lastDay).padStart(2, "0")}`,
  };
}

/** Single calendar day `YYYY-MM-DD` → inclusive range (same day). */
export function dayKeyToDateRange(dayKey: string): { dateFrom: string; dateTo: string } {
  return { dateFrom: dayKey, dateTo: dayKey };
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

/** `YYYY-MM-DD` day, `YYYY-MM` month, or `YYYY` year → drill-down date range. */
export function periodKeyToDateRange(periodKey: string): { dateFrom: string; dateTo: string } {
  if (/^\d{4}-\d{2}-\d{2}$/.test(periodKey)) return dayKeyToDateRange(periodKey);
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

export function formatDayKeyLabel(dayKey: string): string {
  const d = new Date(`${dayKey}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return dayKey;
  return d.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function isCurrentUtcYear(yearKey: string): boolean {
  return yearKey === String(new Date().getUTCFullYear());
}

export function formatYearKeyLabel(yearKey: string): string {
  return isCurrentUtcYear(yearKey) ? `${yearKey} (YTD)` : yearKey;
}

/** Human label for a chart period key (`YYYY-MM-DD`, `YYYY-MM`, or `YYYY`). */
export function formatPeriodKeyLabel(periodKey: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(periodKey)) return formatDayKeyLabel(periodKey);
  if (/^\d{4}$/.test(periodKey)) return formatYearKeyLabel(periodKey);
  if (/^\d{4}-\d{2}$/.test(periodKey)) return formatMonthKeyLabel(periodKey);
  return periodKey;
}

/** Label for an inclusive date span (month or full calendar year). */
export function formatPeriodRangeLabel(dateFrom: string, dateTo: string): string {
  const yFrom = dateFrom.slice(0, 4);
  const yTo = dateTo.slice(0, 4);
  if (dateFrom === dateTo && /^\d{4}-\d{2}-\d{2}$/.test(dateFrom)) {
    return formatDayKeyLabel(dateFrom);
  }
  if (yFrom === yTo && dateFrom.endsWith("-01-01") && (dateTo.endsWith("-12-31") || isCurrentUtcYear(yFrom))) {
    return formatYearKeyLabel(yFrom);
  }
  if (dateFrom.length >= 7) return formatMonthKeyLabel(dateFrom.slice(0, 7));
  return yFrom;
}
