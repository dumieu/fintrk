"use client";

import Link from "next/link";
import { Sparkles, RefreshCw } from "lucide-react";

export function DemoBanner() {
  return (
    <div className="sticky top-0 z-40 border-b border-white/10 bg-gradient-to-r from-[#06091a]/95 via-[#0a0f24]/95 to-[#06091a]/95 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-2.5">
        <div className="flex items-center gap-3 min-w-0">
          <div className="hidden sm:flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[#0BC18D] to-[#2CA2FF] shadow-lg shadow-[#0BC18D]/20">
            <Sparkles className="h-4 w-4 text-white" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-wider text-[#0BC18D]">
              Live demo · Sterling family
            </p>
            <p className="hidden truncate text-[10px] text-white/60 sm:block">
              Click anything. Edit anything. Nothing saves — refresh resets the demo to its baseline.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="hidden sm:inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-[11px] font-medium text-white/85 transition hover:bg-white/10"
          >
            <RefreshCw className="h-3 w-3" /> Reset demo
          </button>
          <Link
            href="/"
            className="inline-flex items-center rounded-lg bg-gradient-to-r from-[#0BC18D] to-[#2CA2FF] px-3 py-1.5 text-[11px] font-bold text-white shadow-lg shadow-[#0BC18D]/20 transition hover:opacity-90"
          >
            Start your own
          </Link>
        </div>
      </div>
    </div>
  );
}
