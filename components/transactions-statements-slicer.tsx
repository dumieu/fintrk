"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeftRight, Upload } from "lucide-react";
import { chartControlClass } from "@/lib/chart-ui";
import { cn } from "@/lib/utils";
import { useAppBasePath } from "@/lib/app-base-path";

/** Centered header slicer toggling Transactions ↔ Statements (upload). */
export function TransactionsStatementsSlicer({ className }: { className?: string }) {
  const pathname = usePathname() ?? "";
  const base = useAppBasePath();

  const tabs = [
    {
      id: "transactions" as const,
      label: "Transactions",
      href: `${base}/transactions`,
      active: pathname.startsWith(`${base}/transactions`),
      Icon: ArrowLeftRight,
    },
    {
      id: "statements" as const,
      label: "Statements",
      href: `${base}/upload`,
      active: pathname.startsWith(`${base}/upload`),
      Icon: Upload,
    },
  ];

  return (
    <div
      role="tablist"
      aria-label="Transactions and statements"
      className={cn(
        "inline-flex shrink-0 items-center gap-0.5 p-0.5",
        chartControlClass,
        "h-auto min-h-7",
        className,
      )}
    >
      {tabs.map(({ id, label, href, active, Icon }) => (
        <Link
          key={id}
          href={href}
          role="tab"
          aria-selected={active}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-semibold leading-none transition-all duration-200 sm:text-xs",
            active
              ? "bg-[#0BC18D]/15 text-[#0BC18D] shadow-[0_0_12px_-4px_rgba(11,193,141,0.35)] dark:bg-[#0BC18D]/18"
              : "text-muted-foreground hover:bg-chart-hover hover:text-foreground",
          )}
        >
          <Icon className="h-3.5 w-3.5 shrink-0 opacity-90" aria-hidden />
          {label}
        </Link>
      ))}
    </div>
  );
}

export function isTransactionsStatementsRoute(pathname: string): boolean {
  return (
    pathname.startsWith("/dashboard/transactions") ||
    pathname.startsWith("/dashboard/upload") ||
    pathname.startsWith("/demo/transactions") ||
    pathname.startsWith("/demo/upload")
  );
}
