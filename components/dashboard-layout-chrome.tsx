"use client";

import type { ReactNode } from "react";
import { DashboardHeader } from "@/components/dashboard-header";
import { DashboardRibbonProvider, useDashboardRibbon } from "@/components/dashboard-ribbon-context";

function DashboardLayoutChromeInner({ children }: { children: ReactNode }) {
  const { ribbon } = useDashboardRibbon();
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <DashboardHeader ribbon={ribbon} />
      <div className="flex min-h-0 flex-1 flex-col overflow-x-clip overflow-y-auto overscroll-y-contain [scrollbar-gutter:stable]">
        {children}
      </div>
    </div>
  );
}

export function DashboardLayoutChrome({ children }: { children: ReactNode }) {
  return (
    <DashboardRibbonProvider>
      <DashboardLayoutChromeInner>{children}</DashboardLayoutChromeInner>
    </DashboardRibbonProvider>
  );
}
