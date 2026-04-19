"use client";

import { useState } from "react";
import {
  AlertTriangle,
  CalendarClock,
  CircleDollarSign,
  Globe,
  MoonStar,
  Repeat,
  ScissorsLineDashed,
  ShoppingBag,
  TrendingUp,
} from "lucide-react";

export interface Leak {
  id: string;
  kind:
    | "subscription"
    | "fx-bleed"
    | "category-runaway"
    | "merchant-fragmentation"
    | "late-night"
    | "weekend-binge"
    | "duplicate-subscription"
    | "tail-spend";
  title: string;
  body: string;
  monthlyImpact: number;
  annualImpact: number;
  severity: "low" | "medium" | "high";
  evidence: Record<string, string | number>;
}

const ICON: Record<Leak["kind"], React.ComponentType<{ className?: string }>> = {
  subscription: Repeat,
  "fx-bleed": Globe,
  "category-runaway": TrendingUp,
  "merchant-fragmentation": ShoppingBag,
  "late-night": MoonStar,
  "weekend-binge": CalendarClock,
  "duplicate-subscription": Repeat,
  "tail-spend": CircleDollarSign,
};

const SEV_TONE: Record<Leak["severity"], string> = {
  high: "from-rose-500/30 to-orange-500/10 border-rose-400/40",
  medium: "from-amber-400/25 to-yellow-300/5 border-amber-300/40",
  low: "from-emerald-400/20 to-cyan-400/5 border-emerald-300/30",
};

const SEV_RING: Record<Leak["severity"], string> = {
  high: "ring-rose-400/40",
  medium: "ring-amber-300/40",
  low: "ring-emerald-300/30",
};

interface Props {
  leak: Leak;
  currency: string;
  onSelect: (leak: Leak, applied: boolean) => void;
}

export function LeakCard({ leak, currency, onSelect }: Props) {
  const [applied, setApplied] = useState(false);
  const Icon = ICON[leak.kind];
  const fmt = new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 });

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border bg-gradient-to-br p-4 ring-1 ring-white/5 transition-all hover:scale-[1.01] hover:shadow-2xl ${SEV_TONE[leak.severity]}`}
    >
      <div className="flex items-start gap-3">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-black/30 ring-1 ${SEV_RING[leak.severity]}`}>
          <Icon className="h-5 w-5 text-white" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-white/50">
            {leak.kind.replace(/-/g, " ")}
          </div>
          <div className="mt-0.5 text-sm font-bold text-white">{leak.title}</div>
          <p className="mt-1 text-xs leading-relaxed text-white/70">{leak.body}</p>
        </div>
      </div>

      <div className="mt-3 flex items-end justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-white/50">Reclaim / year</div>
          <div className="text-2xl font-extrabold text-white">{fmt.format(Math.round(leak.annualImpact))}</div>
          <div className="text-[10px] text-white/45">~ {fmt.format(Math.round(leak.monthlyImpact))} / mo</div>
        </div>

        <button
          onClick={() => {
            const next = !applied;
            setApplied(next);
            onSelect(leak, next);
          }}
          className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all ${
            applied
              ? "bg-emerald-400 text-emerald-950"
              : "bg-white/10 text-white hover:bg-white/20"
          }`}
        >
          {applied ? (
            <>
              <AlertTriangle className="h-3.5 w-3.5" />
              Applied
            </>
          ) : (
            <>
              <ScissorsLineDashed className="h-3.5 w-3.5" />
              Plug it
            </>
          )}
        </button>
      </div>
    </div>
  );
}
