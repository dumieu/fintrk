"use client";

import Link from "next/link";
import { Sparkles, RefreshCw, ArrowRight } from "lucide-react";

/**
 * Slim, non-sticky promo bar shown at the very top of every /demo page. Dark by
 * design so it reads consistently above both the dark marketing home and the
 * theme-aware app pages below it.
 */
export function DemoRibbon() {
  return (
    <div className="relative z-50 border-b border-white/10 bg-gradient-to-r from-[#06091a] via-[#0a0f24] to-[#06091a]">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="hidden h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[#0BC18D] to-[#2CA2FF] sm:flex">
            <Sparkles className="h-3.5 w-3.5 text-white" />
          </span>
          <p className="truncate text-[11px] text-white/75 sm:text-xs">
            <span className="font-bold text-[#0BC18D]">Live demo</span>
            <span className="text-white/40"> &middot; </span>
            The Sterling family &middot; 5 years of real finances. Edit anything &middot; nothing saves. Refresh to reset.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="hidden items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-[11px] font-medium text-white/85 transition hover:bg-white/10 sm:inline-flex"
          >
            <RefreshCw className="h-3 w-3" /> Reset
          </button>
          <Link
            href="/auth"
            className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-[#0BC18D] to-[#2CA2FF] px-3 py-1.5 text-[11px] font-bold text-white transition hover:opacity-90"
          >
            Start free <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </div>
    </div>
  );
}
