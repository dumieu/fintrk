"use client";

import type { ReactNode } from "react";
import { DashboardHeader } from "@/components/dashboard-header";
import {
  DashboardRibbonProvider,
  useDashboardRibbonValue,
} from "@/components/dashboard-ribbon-context";

/** Subscribes to ribbon state alone so page trees do not re-render on ribbon updates. */
function DashboardHeaderSlot({ sessionActive = false }: { sessionActive?: boolean }) {
  const { ribbon } = useDashboardRibbonValue();
  return <DashboardHeader ribbon={ribbon} sessionActive={sessionActive} />;
}

function DashboardLayoutChromeInner({
  children,
  sessionActive = false,
}: {
  children: ReactNode;
  sessionActive?: boolean;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <DashboardHeaderSlot sessionActive={sessionActive} />
      {/* Single flex scrollport — fill-height pages own their scroll. */}
      <div className="flex min-h-0 flex-1 flex-col overflow-x-clip overflow-y-auto overscroll-y-contain [scrollbar-gutter:stable]">
        {children}
      </div>
    </div>
  );
}

export function DashboardLayoutChrome({
  children,
  sessionActive = false,
}: {
  children: ReactNode;
  sessionActive?: boolean;
}) {
  return (
    <DashboardRibbonProvider>
      <DashboardLayoutChromeInner sessionActive={sessionActive}>{children}</DashboardLayoutChromeInner>
    </DashboardRibbonProvider>
  );
}
