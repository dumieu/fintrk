export const STATUS_COLORS = {
  income: { fill: "#0BC18D", border: "#0BC18D", text: "#0BC18D" },
  info: { fill: "#2CA2FF", border: "#2CA2FF", text: "#2CA2FF" },
  warning: { fill: "#ECAA0B", border: "#ECAA0B", text: "#ECAA0B" },
  alert: { fill: "#FF6F69", border: "#FF6F69", text: "#FF6F69" },
  fx: { fill: "#AD74FF", border: "#AD74FF", text: "#AD74FF" },
  neutral: { fill: "#808080", border: "#808080", text: "#808080" },
} as const;

export const STATUS_TAILWIND = {
  income: {
    text: "text-[#0BC18D] dark:text-[#34d399]",
    bg: "bg-[#0BC18D]/8 dark:bg-[#0BC18D]/12",
    border: "border-[#0BC18D]/60 dark:border-[#0BC18D]/50",
    card: "text-[#0BC18D] bg-[#0BC18D]/8 border-[#0BC18D]/60 dark:text-[#34d399] dark:bg-[#0BC18D]/12 dark:border-[#0BC18D]/50",
  },
  info: {
    text: "text-[#2CA2FF] dark:text-[#7cc4ff]",
    bg: "bg-[#2CA2FF]/8 dark:bg-[#2CA2FF]/12",
    border: "border-[#2CA2FF]/60 dark:border-[#2CA2FF]/50",
    card: "text-[#2CA2FF] bg-[#2CA2FF]/8 border-[#2CA2FF]/60 dark:text-[#7cc4ff] dark:bg-[#2CA2FF]/12 dark:border-[#2CA2FF]/50",
  },
  warning: {
    text: "text-[#ECAA0B] dark:text-[#fcd34d]",
    bg: "bg-[#ECAA0B]/8 dark:bg-[#ECAA0B]/12",
    border: "border-[#ECAA0B]/60 dark:border-[#ECAA0B]/50",
    card: "text-[#ECAA0B] bg-[#ECAA0B]/8 border-[#ECAA0B]/60 dark:text-[#fcd34d] dark:bg-[#ECAA0B]/12 dark:border-[#ECAA0B]/50",
  },
  alert: {
    text: "text-[#FF6F69] dark:text-[#fca5a5]",
    bg: "bg-[#FF6F69]/8 dark:bg-[#FF6F69]/12",
    border: "border-[#FF6F69]/60 dark:border-[#FF6F69]/50",
    card: "text-[#FF6F69] bg-[#FF6F69]/8 border-[#FF6F69]/60 dark:text-[#fca5a5] dark:bg-[#FF6F69]/12 dark:border-[#FF6F69]/50",
  },
  fx: {
    text: "text-[#AD74FF] dark:text-[#c9a0ff]",
    bg: "bg-[#AD74FF]/8 dark:bg-[#AD74FF]/12",
    border: "border-[#AD74FF]/60 dark:border-[#AD74FF]/50",
    card: "text-[#AD74FF] bg-[#AD74FF]/8 border-[#AD74FF]/60 dark:text-[#c9a0ff] dark:bg-[#AD74FF]/12 dark:border-[#AD74FF]/50",
  },
  neutral: {
    text: "text-muted-foreground",
    bg: "bg-muted/50",
    border: "border-border",
    card: "bg-muted/50 border-border text-foreground",
  },
} as const;

export const STATUS_RGB = {
  income: "11,193,141",
  info: "44,162,255",
  warning: "236,170,11",
  alert: "255,111,105",
  fx: "173,116,255",
} as const;

export const ACCENT_HEX = "#0BC18D";
export const ACCENT_RGB = "11,193,141";

export type StatusKey = keyof typeof STATUS_COLORS;

export function amountToStatus(amount: number): StatusKey {
  if (amount > 0) return "income";
  return "info";
}

export function spreadToStatus(bps: number): StatusKey {
  if (bps <= 50) return "income";
  if (bps <= 150) return "warning";
  return "alert";
}

export function budgetToStatus(ratio: number): StatusKey {
  if (ratio < 0.7) return "income";
  if (ratio < 0.9) return "warning";
  return "alert";
}
