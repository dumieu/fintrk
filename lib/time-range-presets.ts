/** Local calendar date YYYY-MM-DD (no UTC drift). */
export function formatLocalYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export type TimePresetId = "all" | "90d" | "12m";

/** Rolling window ending today, inclusive (e.g. 90 days = today + 89 prior days). */
export function rollingRange(preset: Exclude<TimePresetId, "all">): { from: string; to: string } {
  const to = new Date();
  to.setHours(0, 0, 0, 0);
  const from = new Date(to);
  if (preset === "90d") {
    from.setDate(from.getDate() - 89);
  } else {
    from.setMonth(from.getMonth() - 12);
  }
  return { from: formatLocalYmd(from), to: formatLocalYmd(to) };
}

/** Match current filters to a preset, or `null` if custom / partial range. */
export function detectTimePreset(dateFrom: string, dateTo: string): TimePresetId | null {
  const df = dateFrom?.trim() ?? "";
  const dt = dateTo?.trim() ?? "";
  if (!df && !dt) return "all";
  const r90 = rollingRange("90d");
  const r12 = rollingRange("12m");
  if (df === r90.from && dt === r90.to) return "90d";
  if (df === r12.from && dt === r12.to) return "12m";
  return null;
}
