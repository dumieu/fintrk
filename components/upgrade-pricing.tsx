"use client";

import { useState } from "react";
import { Check, Loader2 } from "lucide-react";

const ACCENT_HEX = "#0BC18D";

const FEATURES = [
  "Unlimited statement uploads with AI extraction",
  "Cashflow, spend analytics & the Net Worth Atlas",
  "Connect ChatGPT, Claude & Perplexity to your data",
  "Category mapping, recurring detection & insights",
];

type Interval = "month" | "year";

const PRICES: Record<Interval, { amount: string; sub: string }> = {
  month: { amount: "$8.98", sub: "per month" },
  year: { amount: "$83.76", sub: "per year ($6.98/mo)" },
};

export function UpgradePricing({ canTrial }: { canTrial: boolean }) {
  const [interval, setInterval] = useState<Interval>("month");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startCheckout() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interval }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.url) {
        throw new Error(typeof data?.error === "string" ? data.error : "Could not start checkout.");
      }
      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start checkout.");
      setLoading(false);
    }
  }

  const price = PRICES[interval];

  return (
    <div className="mx-auto w-full max-w-md">
      <div className="mb-5 flex justify-center">
        <div className="inline-flex rounded-full border border-border/60 bg-muted/40 p-1 text-sm">
          {(["month", "year"] as Interval[]).map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => setInterval(opt)}
              className={`rounded-full px-4 py-1.5 font-medium transition-colors ${
                interval === opt
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {opt === "month" ? "Monthly" : "Annual"}
              {opt === "year" ? <span style={{ color: ACCENT_HEX }}> -22%</span> : null}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="flex items-baseline gap-2">
          <span className="text-4xl font-bold tracking-tight text-foreground">{price.amount}</span>
          <span className="text-sm text-muted-foreground">{price.sub}</span>
        </div>
        <p className="mt-1 text-sm font-medium" style={{ color: ACCENT_HEX }}>
          FinTRK Pro
        </p>

        <ul className="mt-5 space-y-2.5">
          {FEATURES.map((f) => (
            <li key={f} className="flex items-start gap-2.5 text-sm text-foreground">
              <Check className="mt-0.5 size-4 shrink-0" style={{ color: ACCENT_HEX }} />
              <span>{f}</span>
            </li>
          ))}
        </ul>

        <button
          type="button"
          onClick={startCheckout}
          disabled={loading}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-emerald-950 transition-opacity hover:opacity-95 disabled:opacity-60"
          style={{ background: `linear-gradient(90deg, ${ACCENT_HEX}, #2CA2FF)` }}
        >
          {loading ? <Loader2 className="size-4 animate-spin" /> : null}
          {canTrial ? "Start 7-day free trial" : "Subscribe"}
        </button>

        {canTrial ? (
          <p className="mt-3 text-center text-xs text-muted-foreground">
            No charge today. We&rsquo;ll remind you before your trial ends. Cancel anytime.
          </p>
        ) : null}

        {error ? <p className="mt-3 text-center text-sm text-red-400">{error}</p> : null}
      </div>
    </div>
  );
}
