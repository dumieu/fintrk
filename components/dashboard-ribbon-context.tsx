"use client";

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";

type DashboardRibbonContextValue = {
  ribbon: ReactNode;
  setRibbon: Dispatch<SetStateAction<ReactNode>>;
};

const DashboardRibbonContext = createContext<DashboardRibbonContextValue | null>(null);

export function DashboardRibbonProvider({ children }: { children: ReactNode }) {
  const [ribbon, setRibbon] = useState<ReactNode>(null);
  const value = useMemo(() => ({ ribbon, setRibbon }), [ribbon]);
  return (
    <DashboardRibbonContext.Provider value={value}>
      {children}
    </DashboardRibbonContext.Provider>
  );
}

export function useDashboardRibbon() {
  const ctx = useContext(DashboardRibbonContext);
  if (!ctx) {
    throw new Error("useDashboardRibbon must be used within DashboardRibbonProvider");
  }
  return ctx;
}
