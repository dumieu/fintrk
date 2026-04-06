"use client";

import { HamburgerMenu } from "@/components/hamburger-menu";

export function DashboardHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/40 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4">
        <HamburgerMenu />
        <span className="text-lg font-bold tracking-tight" style={{ color: "#0BC18D" }}>
          FinTRK
        </span>
        <div className="flex-1" />
      </div>
    </header>
  );
}
