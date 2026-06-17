"use client";

/**
 * DemoAppShell - reproduces the authenticated dashboard chrome (header, page
 * title, ribbon slot, scroll container, side nav) for the public /demo pages,
 * but with a Clerk-free nav that links between /demo/* sections. The actual
 * page bodies are the REAL dashboard page components, rendered as children.
 */

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetClose,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import {
  Menu,
  Waves,
  BarChart3,
  ArrowLeftRight,
  Sparkles,
  Landmark,
  Network,
  LayoutDashboard,
  ArrowRight,
} from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { FintrkShortLogo } from "@/components/fintrk-short-logo";
import { CashflowSummary } from "@/components/cashflow-summary";
import { CashflowLegendHelpButton } from "@/components/cashflow-legend-help";
import {
  DashboardRibbonProvider,
  useDashboardRibbon,
} from "@/components/dashboard-ribbon-context";

const ACCENT = "#0BC18D";

const NAV = [
  { label: "Overview", href: "/demo", icon: LayoutDashboard },
  { label: "Cashflow", href: "/demo/cashflow", icon: Waves },
  { label: "Spend Analytics", href: "/demo/analytics", icon: BarChart3 },
  { label: "Transactions", href: "/demo/transactions", icon: ArrowLeftRight },
  { label: "Net Worth Atlas", href: "/demo/net-worth", icon: Sparkles },
  { label: "Accounts", href: "/demo/accounts", icon: Landmark },
  { label: "Category Mapping", href: "/demo/categories", icon: Network },
] as const;

const PAGE_META: Array<{ match: (p: string) => boolean; title: string; subtitle: string }> = [
  { match: (p) => p.startsWith("/demo/transactions"), title: "Transactions", subtitle: "Browse, edit, and manage every line of your financial history" },
  { match: (p) => p.startsWith("/demo/cashflow"), title: "Cashflow", subtitle: "Watch every dollar move through your life - from income, into spending and savings" },
  { match: (p) => p.startsWith("/demo/analytics"), title: "Spending Intelligence", subtitle: "Deep analysis of your financial patterns" },
  { match: (p) => p.startsWith("/demo/net-worth"), title: "Net Worth Atlas", subtitle: "Map your wealth today - then watch it compound 5, 10, 20, 30 years out" },
  { match: (p) => p.startsWith("/demo/accounts"), title: "Accounts", subtitle: "Linked bank, card, and investment accounts" },
  { match: (p) => p.startsWith("/demo/categories"), title: "Category Mapping", subtitle: "Curate how transactions roll up into categories and subcategories" },
];
const FALLBACK = { title: "Demo", subtitle: "The Sterling family - 5 years of real financial life" };

function DemoNav() {
  const pathname = usePathname() ?? "";
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button variant="ghost" size="icon" className="min-h-[44px] min-w-[44px]">
            <Menu className="h-5 w-5" />
            <span className="sr-only">Open menu</span>
          </Button>
        }
      />
      <SheetContent side="left" showCloseButton={false} className="w-72 p-0">
        <SheetHeader className="border-b border-border px-5 py-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <FintrkShortLogo size="header" />
              <SheetTitle className="font-aldhabi text-lg font-bold tracking-tight" style={{ color: ACCENT }}>
                FinTRK
              </SheetTitle>
              <span className="rounded-full bg-[#0BC18D]/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#0BC18D]">
                Demo
              </span>
            </div>
            <ThemeToggle />
          </div>
          <SheetDescription className="sr-only">Demo navigation menu</SheetDescription>
        </SheetHeader>

        <nav className="flex-1 px-3 py-3">
          <ul className="space-y-1">
            {NAV.map((item) => {
              const isActive =
                item.href === "/demo" ? pathname === "/demo" : pathname.startsWith(item.href);
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <SheetClose
                    nativeButton={false}
                    render={
                      <Link
                        href={item.href}
                        className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                          isActive ? "bg-primary/10 text-foreground" : "text-muted-foreground hover:bg-muted/50"
                        }`}
                      >
                        <Icon className="h-5 w-5 shrink-0" />
                        {item.label}
                      </Link>
                    }
                  />
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="border-t border-border p-3">
          <Link
            href="/auth"
            className="flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-[#0BC18D] to-[#2CA2FF] px-3 py-2.5 text-sm font-bold text-white transition hover:opacity-90"
          >
            Start your own free
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function DemoHeader() {
  const pathname = usePathname() ?? "";
  const meta = PAGE_META.find((m) => m.match(pathname)) ?? FALLBACK;
  const { ribbon } = useDashboardRibbon();
  const showCashflowSummary = pathname.startsWith("/demo/analytics");
  const showCashflowLegend = pathname.startsWith("/demo/cashflow");
  const trailing = ribbon ?? (showCashflowSummary ? <CashflowSummary months={12} variant="ribbon" /> : null);

  return (
    <header className="sticky top-0 z-40 shrink-0 border-b border-border/40 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2 sm:min-h-14 sm:flex-nowrap sm:py-2">
        <DemoNav />
        <div className="flex min-w-0 flex-1 flex-col justify-center leading-tight">
          <div className="flex min-w-0 items-center gap-1.5">
            <h1 className="truncate text-sm font-bold tracking-tight text-foreground sm:text-base">
              {meta.title}
            </h1>
            {showCashflowLegend ? <CashflowLegendHelpButton /> : null}
          </div>
          {meta.subtitle && (
            <p className="hidden truncate text-[11px] text-muted-foreground sm:block">{meta.subtitle}</p>
          )}
        </div>
        {trailing ? <div className="flex min-w-0 shrink-0 items-center">{trailing}</div> : null}
      </div>
    </header>
  );
}

export function DemoAppShell({ children }: { children: ReactNode }) {
  return (
    <DashboardRibbonProvider>
      <div className="flex min-h-screen flex-col bg-app-canvas">
        <DemoHeader />
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      </div>
    </DashboardRibbonProvider>
  );
}
