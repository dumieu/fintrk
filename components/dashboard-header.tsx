"use client";

import { usePathname } from "next/navigation";
import { HamburgerMenu } from "@/components/hamburger-menu";

/**
 * Static title + subtitle for each top-level dashboard page. The header swaps
 * its label dynamically based on the current pathname so every page has
 * a consistent, branded heading slot without each page repeating the markup.
 */
const PAGE_META: Array<{ match: (p: string) => boolean; title: string; subtitle: string }> = [
  // Order matters — most specific matches first.
  { match: (p) => p === "/dashboard", title: "Financial Command Center", subtitle: "Your money at a glance" },
  { match: (p) => p.startsWith("/dashboard/upload"), title: "Upload Statement", subtitle: "Import your bank statements — AI extracts, classifies, and analyzes every transaction" },
  { match: (p) => p.startsWith("/dashboard/transactions"), title: "Transactions", subtitle: "Browse, edit, and manage every line of your financial history" },
  { match: (p) => p.startsWith("/dashboard/cashflow"), title: "Cashflow", subtitle: "Watch every dollar move through your life — from income, into spending and savings" },
  { match: (p) => p.startsWith("/dashboard/analytics"), title: "Spending Intelligence", subtitle: "Deep analysis of your financial patterns" },
  { match: (p) => p.startsWith("/dashboard/budget"), title: "Budget Manager", subtitle: "Set spending limits and track progress" },
  { match: (p) => p.startsWith("/dashboard/goals"), title: "Financial Goals", subtitle: "Track your savings targets and milestones" },
  { match: (p) => p.startsWith("/dashboard/accounts"), title: "Accounts", subtitle: "Linked bank, card, and investment accounts" },
  { match: (p) => p.startsWith("/dashboard/categories"), title: "Category Mapping", subtitle: "Curate how transactions roll up into categories and subcategories" },
  { match: (p) => p.startsWith("/dashboard/my-profile"), title: "My Profile", subtitle: "Personal preferences and account settings" },
  { match: (p) => p.startsWith("/dashboard/profile"), title: "My Profile", subtitle: "Manage your personal information and preferences" },
  { match: (p) => p.startsWith("/dashboard/contact"), title: "Contact", subtitle: "Get in touch with the FinTRK team" },
  { match: (p) => p.startsWith("/dashboard/faq"), title: "FAQ", subtitle: "Frequently asked questions about FinTRK" },
];

const FALLBACK = { title: "Dashboard", subtitle: "" };

export function DashboardHeader() {
  const pathname = usePathname() ?? "";
  const meta = PAGE_META.find((m) => m.match(pathname)) ?? FALLBACK;

  return (
    <header className="sticky top-0 z-40 shrink-0 border-b border-border/40 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4">
        <HamburgerMenu />
        <div className="flex min-w-0 flex-1 flex-col leading-tight">
          <h1 className="truncate text-sm font-bold tracking-tight text-foreground sm:text-base">
            {meta.title}
          </h1>
          {meta.subtitle && (
            <p className="hidden truncate text-[11px] text-muted-foreground sm:block">
              {meta.subtitle}
            </p>
          )}
        </div>
      </div>
    </header>
  );
}
