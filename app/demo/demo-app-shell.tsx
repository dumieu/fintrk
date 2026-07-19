"use client";

/**
 * DemoAppShell - full replica of authenticated dashboard chrome for /demo/*.
 * Reuses real dashboard page bodies; navigation is Clerk-free and scoped to
 * /demo routes. Writes are no-ops via DemoApiBridge.
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
  BookOpen,
  Landmark,
  Network,
  Upload,
  Mail,
  HelpCircle,
  Gem,
  UserRound,
  ArrowRight,
} from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { FintrkShortLogo } from "@/components/fintrk-short-logo";
import { CashflowSummary } from "@/components/cashflow-summary";
import { CashflowLegendHelpButton } from "@/components/cashflow-legend-help";
import {
  isTransactionsStatementsRoute,
  TransactionsStatementsSlicer,
} from "@/components/transactions-statements-slicer";
import {
  DashboardRibbonProvider,
  useDashboardRibbonValue,
} from "@/components/dashboard-ribbon-context";

const ACCENT = "#0BC18D";

type NavItem = {
  label: string;
  href: string;
  icon: typeof Waves;
  match?: (p: string) => boolean;
};

const PRIMARY_NAV: NavItem[] = [
  {
    label: "Cashflow",
    href: "/demo/cashflow",
    icon: Waves,
  },
  {
    label: "Spend Intelligence",
    href: "/demo/analytics",
    icon: BarChart3,
  },
  {
    label: "Transactions & Statements",
    href: "/demo/transactions",
    icon: ArrowLeftRight,
    match: (p) =>
      p.startsWith("/demo/transactions") || p.startsWith("/demo/upload"),
  },
  {
    label: "Net Worth Atlas",
    href: "/demo/net-worth",
    icon: Sparkles,
  },
  {
    label: "Accounts",
    href: "/demo/accounts",
    icon: Landmark,
  },
  {
    label: "Categories",
    href: "/demo/categories",
    icon: Network,
  },
];

const SECONDARY_NAV: NavItem[] = [
  {
    label: "Upload statements",
    href: "/demo/upload",
    icon: Upload,
  },
  {
    label: "Connect your AI",
    href: "/demo/connect-ai",
    icon: Sparkles,
  },
  {
    label: "Profile & settings",
    href: "/demo/profile",
    icon: UserRound,
  },
  {
    label: "Plan & Billing",
    href: "/demo/upgrade",
    icon: Gem,
  },
  {
    label: "Feedback",
    href: "/demo/contact",
    icon: Mail,
  },
  {
    label: "FAQ",
    href: "/demo/faq",
    icon: HelpCircle,
  },
  {
    label: "About this demo",
    href: "/demo",
    icon: BookOpen,
    match: (p) => p === "/demo" || p === "/demo/",
  },
];

const PAGE_META: Array<{ match: (p: string) => boolean; title: string }> = [
  { match: (p) => p.startsWith("/demo/transactions"), title: "Transactions" },
  { match: (p) => p.startsWith("/demo/upload"), title: "Upload Statements" },
  { match: (p) => p.startsWith("/demo/cashflow"), title: "Cashflow" },
  { match: (p) => p.startsWith("/demo/analytics"), title: "Spending Intelligence" },
  { match: (p) => p.startsWith("/demo/net-worth"), title: "Net Worth Atlas" },
  { match: (p) => p.startsWith("/demo/accounts"), title: "Accounts" },
  { match: (p) => p.startsWith("/demo/categories"), title: "Categories" },
  { match: (p) => p.startsWith("/demo/connect-ai"), title: "Connect your AI" },
  { match: (p) => p.startsWith("/demo/profile"), title: "Profile" },
  { match: (p) => p.startsWith("/demo/upgrade"), title: "Plan & Billing" },
  { match: (p) => p.startsWith("/demo/contact"), title: "Feedback" },
  { match: (p) => p.startsWith("/demo/faq"), title: "FAQ" },
  { match: (p) => p === "/demo" || p === "/demo/", title: "Sterling Family Demo" },
];
const FALLBACK = { title: "Demo" };

function NavLink({
  item,
  pathname,
}: {
  item: NavItem;
  pathname: string;
}) {
  const isActive = item.match
    ? item.match(pathname)
    : pathname.startsWith(item.href);
  const Icon = item.icon;
  return (
    <li>
      <SheetClose
        nativeButton={false}
        render={
          <Link
            href={item.href}
            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
              isActive
                ? "bg-primary/10 text-foreground"
                : "text-muted-foreground hover:bg-muted/50"
            }`}
          >
            <Icon
              className="h-5 w-5 shrink-0"
              style={
                item.href === "/demo/upgrade" || item.href === "/demo/connect-ai"
                  ? { color: ACCENT }
                  : undefined
              }
            />
            {item.label}
          </Link>
        }
      />
    </li>
  );
}

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
      <SheetContent side="left" showCloseButton={false} className="flex h-full w-72 flex-col p-0">
        <SheetHeader className="border-b border-border px-5 py-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <FintrkShortLogo size="header" />
              <SheetTitle
                className="font-aldhabi text-lg font-bold tracking-tight"
                style={{ color: ACCENT }}
              >
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

        <nav className="flex-1 overflow-y-auto px-3 py-3">
          <ul className="space-y-1">
            {PRIMARY_NAV.map((item) => (
              <NavLink key={item.href} item={item} pathname={pathname} />
            ))}
          </ul>
          <div className="my-3 border-t border-border" />
          <ul className="space-y-1">
            {SECONDARY_NAV.map((item) => (
              <NavLink key={item.href} item={item} pathname={pathname} />
            ))}
          </ul>
        </nav>

        <div className="border-t border-border p-3">
          <Link
            href="/auth/sign-up"
            className="flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-[#0BC18D] to-[#2CA2FF] px-3 py-2.5 text-sm font-bold text-white transition hover:opacity-90"
          >
            Start your own free trial
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
  const { ribbon } = useDashboardRibbonValue();
  const showCashflowSummary = pathname.startsWith("/demo/cashflow");
  const showCashflowLegend = pathname.startsWith("/demo/cashflow");
  const showTxStatementsSlicer = isTransactionsStatementsRoute(pathname);
  const trailing = ribbon;

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
        </div>
        {showTxStatementsSlicer ? (
          <div className="order-last flex w-full justify-center sm:order-none sm:w-auto">
            <TransactionsStatementsSlicer />
          </div>
        ) : null}
        {showCashflowSummary || trailing ? (
          <div className="flex min-w-0 shrink-0 items-center gap-2">
            {showCashflowSummary ? <CashflowSummary months={12} variant="ribbon" /> : null}
            {trailing}
          </div>
        ) : null}
      </div>
    </header>
  );
}

export function DemoAppShell({ children }: { children: ReactNode }) {
  return (
    <DashboardRibbonProvider>
      <div className="flex min-h-screen flex-col bg-app-canvas">
        <DemoHeader />
        <div className="flex min-h-0 flex-1 flex-col overflow-x-clip overflow-y-auto">
          {children}
        </div>
      </div>
    </DashboardRibbonProvider>
  );
}
