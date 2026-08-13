"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { AppQuickNoteChromeSlot } from "@/components/app-top-chrome-slot";
import { HamburgerMenu } from "@/components/hamburger-menu";
import { DashboardUserMenu } from "@/components/dashboard-user-menu";
import { SignOutControl } from "@/components/sign-out-control";
import { CashflowSummary } from "@/components/cashflow-summary";
import { CashflowLegendHelpButton } from "@/components/cashflow-legend-help";
import {
  isTransactionsStatementsRoute,
  TransactionsStatementsSlicer,
} from "@/components/transactions-statements-slicer";
import { AppsLauncher } from "@/components/apps-launcher";
import { ConnectAiOrb } from "@/components/connect-ai-orb";

/**
 * Static title for each top-level dashboard page. The header swaps its label
 * dynamically based on the current pathname so every page has a consistent,
 * branded heading slot without each page repeating the markup.
 */
const PAGE_META: Array<{ match: (p: string) => boolean; title: string }> = [
  // Order matters — most specific matches first.
  { match: (p) => p.startsWith("/dashboard/upload"), title: "Statements" },
  { match: (p) => p.startsWith("/dashboard/transactions"), title: "Transactions" },
  { match: (p) => p.startsWith("/dashboard/cashflow"), title: "Cashflow" },
  { match: (p) => p.startsWith("/dashboard/analytics"), title: "Spend Intelligence" },
  { match: (p) => p.startsWith("/dashboard/net-worth"), title: "Net Worth Atlas" },
  { match: (p) => p.startsWith("/dashboard/accounts"), title: "Accounts" },
  { match: (p) => p.startsWith("/dashboard/categories"), title: "Category Mapping" },
  { match: (p) => p.startsWith("/dashboard/my-profile"), title: "My Profile" },
  { match: (p) => p.startsWith("/dashboard/profile"), title: "My Profile" },
  { match: (p) => p.startsWith("/dashboard/upgrade"), title: "Plan & Billing" },
  { match: (p) => p.startsWith("/dashboard/connect-ai"), title: "Connect your AI" },
  { match: (p) => p.startsWith("/dashboard/contact"), title: "Feedback" },
  { match: (p) => p.startsWith("/dashboard/faq"), title: "FAQ" },
];

const FALLBACK = { title: "Dashboard" };

export function DashboardHeader({
  ribbon = null,
  sessionActive = false,
}: {
  ribbon?: ReactNode;
  sessionActive?: boolean;
}) {
  const pathname = usePathname() ?? "";
  const meta = PAGE_META.find((m) => m.match(pathname)) ?? FALLBACK;
  const showCashflowSummary = pathname.startsWith("/dashboard/cashflow");
  const showCashflowLegend = pathname.startsWith("/dashboard/cashflow");
  const showTxStatementsSlicer = isTransactionsStatementsRoute(pathname);
  const trailing = ribbon;

  return (
    <header className="sticky top-0 z-40 shrink-0 border-b border-border/40 bg-background/80 backdrop-blur-md">
      <div className="relative flex w-full flex-wrap items-center gap-x-2 gap-y-2 py-2 pl-1 pr-2 sm:min-h-14 sm:flex-nowrap sm:gap-x-3 sm:py-2 sm:pl-1.5 sm:pr-3">
        <AppsLauncher current="fin" />
        <HamburgerMenu sessionActive={sessionActive} />
        <div className="flex min-w-0 flex-1 flex-col justify-center leading-tight">
          {showTxStatementsSlicer ? (
            <span className="sr-only">{meta.title}</span>
          ) : (
            <div className="flex min-w-0 items-center gap-1.5">
              <h1 className="truncate text-sm font-bold tracking-tight text-foreground sm:text-base">
                {meta.title}
              </h1>
              {showCashflowLegend ? <CashflowLegendHelpButton /> : null}
            </div>
          )}
        </div>
        {showTxStatementsSlicer ? (
          <div className="pointer-events-none absolute inset-x-0 top-1/2 z-10 flex -translate-y-1/2 justify-center px-16 sm:px-24">
            <div className="pointer-events-auto">
              <TransactionsStatementsSlicer />
            </div>
          </div>
        ) : null}
        {showCashflowSummary || trailing ? (
          <div className="flex min-w-0 shrink-0 items-center gap-2">
            {showCashflowSummary ? <CashflowSummary months={12} variant="ribbon" /> : null}
            {trailing}
          </div>
        ) : null}
        {sessionActive ? <SignOutControl variant="header" /> : null}
        <ConnectAiOrb />
        <DashboardUserMenu />
        {/* Desktop scratch-pad corner sits fixed top-right — reserve its slot. */}
        <AppQuickNoteChromeSlot className="hidden md:block" />
      </div>
    </header>
  );
}
