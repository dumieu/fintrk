import type { ReactNode } from "react";

/** Fills the root main region (`flex-1 min-h-0`) so dashboard pages can own internal scroll. */
export function DashboardShell({ children }: { children: ReactNode }) {
  return <div className="flex min-h-0 h-full flex-1 flex-col">{children}</div>;
}
