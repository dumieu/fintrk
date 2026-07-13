/**
 * Canonical list of FinTRK cron jobs.
 * Source of truth for the Admin Crons UI.
 */
export const CRON_REGISTRY: Array<{
  path: string;
  app: "User App" | "Admin App";
  schedule: string;
}> = [
  // Schedules must match FinTRK/vercel.json (fallback when Vercel API is unset).
  { path: "/api/cron/insights", app: "User App", schedule: "0 5 * * 0" },
  { path: "/api/cron/recurring", app: "User App", schedule: "0 3 * * 1" },
  { path: "/api/cron/fx-rates", app: "User App", schedule: "0 14 * * *" },
  { path: "/api/cron/setup-stripe", app: "User App", schedule: "manual" },
];

export const CRON_DESCRIPTIONS: Record<string, string> = {
  "/api/cron/insights":
    "Generates AI spending insights for active households. Writes ai_insights rows and records spend in ai_costs.",
  "/api/cron/recurring":
    "Detects and refreshes recurring payment patterns from recent transactions into recurring_patterns.",
  "/api/cron/fx-rates":
    "Refreshes fx_rates used for multi-currency dashboards and statement conversion.",
  "/api/cron/setup-stripe":
    "One-shot / manual Stripe product and price bootstrap for FinTRK Pro billing. Not a recurring schedule.",
};

export function describeCronSchedule(cron: string): string {
  if (cron === "manual") return "Manual only";
  const parts = cron.split(" ");
  if (parts.length !== 5) return cron;
  const [min, hour, dom, , dow] = parts;
  const time = `${hour.padStart(2, "0")}:${min.padStart(2, "0")} UTC`;
  const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

  if (dow !== "*" && hour.includes("*/")) {
    const interval = hour.replace("*/", "");
    return `Every ${interval}h on weekdays`;
  }
  if (min.includes("*/")) {
    const interval = min.replace("*/", "");
    return `Every ${interval} min`;
  }
  if (hour.includes("*/")) {
    const interval = hour.replace("*/", "");
    return `Every ${interval}h`;
  }
  if (hour.includes(",")) {
    const hours = hour.split(",");
    return `${hours.length}x daily (${hours
      .map((h) => `${h.padStart(2, "0")}:${min.padStart(2, "0")}`)
      .join(", ")} UTC)`;
  }
  if (dom === "*" && dow !== "*") {
    if (dow === "1-5") return `Weekdays at ${time}`;
    if (/^[0-6]$/.test(dow)) return `${DOW[Number(dow)]} at ${time}`;
    return `Cron dow=${dow} at ${time}`;
  }
  return `Daily at ${time}`;
}
