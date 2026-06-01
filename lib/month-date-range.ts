/** Calendar month key `YYYY-MM` → inclusive local date range. */
export function monthKeyToDateRange(monthKey: string): { dateFrom: string; dateTo: string } {
  const [y, m] = monthKey.split("-").map((s) => parseInt(s, 10));
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return {
    dateFrom: `${monthKey}-01`,
    dateTo: `${monthKey}-${String(lastDay).padStart(2, "0")}`,
  };
}

export function formatMonthKeyLabel(monthKey: string): string {
  const [y, m] = monthKey.split("-").map((s) => parseInt(s, 10));
  const d = new Date(Date.UTC(y, m - 1, 1));
  const month = d.toLocaleString("en-US", { month: "long", timeZone: "UTC" });
  return `${month} ${y}`;
}
