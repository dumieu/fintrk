"use client";

import { HamburgerMenu } from "@/components/hamburger-menu";
import { FintrkShortLogo } from "@/components/fintrk-short-logo";

export function DashboardHeader() {
  return (
    <header className="sticky top-0 z-40 shrink-0 border-b border-border/40 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4">
        <HamburgerMenu />
        <div className="flex items-center gap-2">
          <FintrkShortLogo size="header" />
          <span className="font-aldhabi text-lg font-bold tracking-tight" style={{ color: "#0BC18D" }}>
            FinTRK
          </span>
        </div>
        <div className="flex-1" />
      </div>
    </header>
  );
}
