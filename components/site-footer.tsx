"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Marketing / auth footer only. Never mount inside the dashboard app shell —
 * nested scroll + fill-height pages (transactions, cashflow) becomes unresponsive.
 */
export function SiteFooter() {
  const pathname = usePathname() ?? "";
  if (
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/demo")
  ) {
    return null;
  }

  return (
    <footer className="shrink-0 border-t border-border/40 bg-background/80 backdrop-blur-sm">
      <div className="mx-auto flex max-w-7xl flex-col items-center gap-2 px-4 py-4 text-xs text-muted-foreground sm:flex-row sm:justify-between sm:py-3">
        <p className="text-xs">&copy; {new Date().getFullYear()} XTRK LLC. All rights reserved.</p>
        <nav className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs" aria-label="Footer navigation">
          <Link href="/feedback" className="hover:text-foreground transition-colors">Feedback</Link>
          <Link href="/privacy" className="hover:text-foreground transition-colors">Privacy Policy</Link>
          <Link href="/terms" className="hover:text-foreground transition-colors">Terms of Service</Link>
        </nav>
      </div>
    </footer>
  );
}
