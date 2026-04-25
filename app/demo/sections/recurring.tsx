"use client";

import { Repeat, Calendar } from "lucide-react";
import { useDemo, useDemoSnapshot } from "../demo-store";
import { num } from "../derived";
import { formatCurrency } from "@/lib/format";

export function DemoRecurringSection() {
  const snap = useDemoSnapshot();
  const { dispatch, toast } = useDemo();

  const sorted = [...snap.recurring].sort((a, b) => Math.abs(num(b.expected_amount)) - Math.abs(num(a.expected_amount)));
  const monthlyEquiv = (intervalDays: number, amt: number) => {
    if (intervalDays <= 7) return amt * 4.34;
    if (intervalDays <= 14) return amt * 2.17;
    if (intervalDays <= 32) return amt;
    return amt / Math.max(1, intervalDays / 30);
  };

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 sm:p-6">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-bold text-white">
            <Repeat className="h-4 w-4 text-[#AD74FF]" />
            Recurring commitments
          </h2>
          <p className="text-[11px] text-white/55">
            Toggle any subscription on/off to see how monthly outflow shifts.
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-2">
        {sorted.map((r) => {
          const amt = Math.abs(num(r.expected_amount));
          const m = monthlyEquiv(r.interval_days, amt);
          const isInflow = num(r.expected_amount) > 0;
          return (
            <div
              key={r.id}
              className={`group flex items-center gap-3 rounded-xl border px-3 py-2.5 transition ${
                r.is_active ? "border-white/10 bg-white/[0.04]" : "border-white/5 bg-white/[0.02] opacity-60"
              }`}
            >
              <div
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${
                  isInflow ? "bg-[#0BC18D]/15 text-[#0BC18D]" : "bg-[#AD74FF]/15 text-[#AD74FF]"
                }`}
              >
                {r.merchant_name.charAt(0)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className={`truncate text-xs font-semibold ${r.is_active ? "text-white/90" : "text-white/55 line-through"}`}>
                    {r.merchant_name}
                  </span>
                  <span className="rounded bg-white/8 px-1.5 py-0.5 text-[9px] uppercase text-white/50">{r.interval_label}</span>
                </div>
                <p className="text-[10px] text-white/45">
                  <Calendar className="mr-1 inline h-2.5 w-2.5" />
                  {r.next_expected_date && `Next ${r.next_expected_date}`} · {r.occurrence_count} hits ·
                  ≈ {formatCurrency(m, r.currency)}/mo
                </p>
              </div>
              <span className={`shrink-0 text-sm font-bold tabular-nums ${isInflow ? "text-[#0BC18D]" : "text-white/85"}`}>
                {isInflow ? "+" : "−"}{formatCurrency(amt, r.currency)}
              </span>
              <button
                type="button"
                onClick={() => {
                  dispatch({ type: "TOGGLE_RECURRING", id: r.id });
                  toast(r.is_active ? `Paused ${r.merchant_name}` : `Resumed ${r.merchant_name}`, "ok");
                }}
                className={`relative h-5 w-9 shrink-0 rounded-full transition ${
                  r.is_active ? "bg-[#0BC18D]" : "bg-white/15"
                }`}
                aria-pressed={r.is_active}
              >
                <span
                  className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition ${
                    r.is_active ? "left-4" : "left-0.5"
                  }`}
                />
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
