"use client";

import { Sparkles, X } from "lucide-react";
import { useDemo, useDemoSnapshot } from "../demo-store";

const SEVERITY_COLOR: Record<string, string> = {
  high: "#FF6F69",
  medium: "#ECAA0B",
  low: "#2CA2FF",
  info: "#AD74FF",
};

export function DemoInsightsSection() {
  const snap = useDemoSnapshot();
  const { dispatch } = useDemo();
  const visible = snap.insights.filter((i) => !i.is_dismissed);

  return (
    <section className="rounded-2xl border border-[#AD74FF]/20 bg-[#AD74FF]/[0.04] p-5 sm:p-6 h-full">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-[#AD74FF]" />
        <h2 className="text-base font-bold text-white">AI Insights</h2>
      </div>
      <p className="text-[11px] text-white/55">{visible.length} active observations</p>

      <div className="mt-4 space-y-2 max-h-[420px] overflow-y-auto pr-1">
        {visible.map((i) => {
          const c = SEVERITY_COLOR[i.severity ?? "info"] ?? "#AD74FF";
          return (
            <div
              key={i.id}
              className="group relative rounded-xl border border-white/10 bg-white/[0.04] p-3"
              style={{ boxShadow: `inset 3px 0 0 0 ${c}` }}
            >
              <button
                type="button"
                onClick={() => dispatch({ type: "DISMISS_INSIGHT", id: i.id })}
                className="absolute top-1.5 right-1.5 rounded p-0.5 text-white/35 opacity-0 transition group-hover:opacity-100 hover:bg-white/10 hover:text-white"
              >
                <X className="h-3 w-3" />
              </button>
              <p className="pr-5 text-[11px] font-semibold text-white/90">{i.title}</p>
              <p className="mt-1 text-[10px] leading-relaxed text-white/65">{i.body}</p>
            </div>
          );
        })}
        {visible.length === 0 && (
          <p className="py-6 text-center text-xs text-white/45">No insights right now.</p>
        )}
      </div>
    </section>
  );
}
