"use client";

import { Sparkles, Users, MapPin } from "lucide-react";
import type { DemoFamily } from "../demo-store";

export function DemoHero({ family }: { family: DemoFamily }) {
  return (
    <section className="relative overflow-hidden border-b border-white/[0.06]">
      <div className="mx-auto max-w-7xl px-4 pt-10 pb-12 sm:px-6 sm:pt-16 sm:pb-16">
        <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-[#0BC18D]/30 bg-[#0BC18D]/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-[#0BC18D]">
              <Sparkles className="h-3 w-3" />
              You are inside a real, working FinTRK account
            </div>
            <h1 className="mt-4 text-3xl font-black leading-tight tracking-tight text-white sm:text-5xl">
              Meet the{" "}
              <span className="bg-gradient-to-r from-[#0BC18D] via-[#2CA2FF] to-[#AD74FF] bg-clip-text text-transparent">
                {family.name.replace(/^The /, "")}
              </span>
              .
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/70 sm:text-base">
              {family.tagline}
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-3 text-[11px] text-white/65">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1">
                <MapPin className="h-3 w-3 text-[#2CA2FF]" /> {family.city}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1">
                <Users className="h-3 w-3 text-[#AD74FF]" /> 2 adults · 2 kids
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1">
                <span className="h-1.5 w-1.5 rounded-full bg-[#0BC18D]" /> 3 years of history · 4,729 transactions
              </span>
            </div>
          </div>

          <div className="grid gap-2 text-[11px] text-white/75 lg:max-w-xs">
            <p className="text-[10px] font-bold uppercase tracking-wider text-white/45">The household</p>
            {family.adults.map((a) => (
              <div key={a} className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2">
                {a}
              </div>
            ))}
            <div className="grid grid-cols-2 gap-2">
              {family.kids.map((k) => (
                <div key={k} className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-center text-[11px]">
                  {k}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
