"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";

type RibbonSetter = Dispatch<SetStateAction<ReactNode>>;

const DashboardRibbonStateContext = createContext<ReactNode>(null);
const DashboardRibbonSetContext = createContext<RibbonSetter | null>(null);

/**
 * Split state/setter so pages that only call `setRibbon` (e.g. cashflow Sankey)
 * do not re-render when the header ribbon node changes.
 */
export function DashboardRibbonProvider({ children }: { children: ReactNode }) {
  const [ribbon, setRibbon] = useState<ReactNode>(null);
  return (
    <DashboardRibbonSetContext.Provider value={setRibbon}>
      <DashboardRibbonStateContext.Provider value={ribbon}>
        {children}
      </DashboardRibbonStateContext.Provider>
    </DashboardRibbonSetContext.Provider>
  );
}

export function useDashboardRibbon() {
  const setRibbon = useContext(DashboardRibbonSetContext);
  if (!setRibbon) {
    throw new Error("useDashboardRibbon must be used within DashboardRibbonProvider");
  }
  return { setRibbon };
}

export function useDashboardRibbonState() {
  return useContext(DashboardRibbonStateContext);
}

/** Header-only: subscribe to ribbon node without forcing page trees to update. */
export function useDashboardRibbonValue() {
  const ribbon = useDashboardRibbonState();
  const setRibbon = useContext(DashboardRibbonSetContext);
  if (!setRibbon) {
    throw new Error("useDashboardRibbonValue must be used within DashboardRibbonProvider");
  }
  return useMemo(() => ({ ribbon, setRibbon }), [ribbon, setRibbon]);
}

/** Optional helper when a page needs a stable empty clear. */
export function useClearDashboardRibbon() {
  const { setRibbon } = useDashboardRibbon();
  return useCallback(() => setRibbon(null), [setRibbon]);
}
