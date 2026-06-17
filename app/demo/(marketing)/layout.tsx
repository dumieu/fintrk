import type { ReactNode } from "react";
import { DemoProvider } from "../demo-store";
import { DemoToasts } from "../demo-toasts";

/**
 * Marketing-home-only chrome: the in-memory snapshot store (for the showcase
 * sections) + a dark canvas. The app pages under /demo/* render their own
 * theme-aware shell instead, so this stays scoped to the (marketing) group.
 */
export default function DemoMarketingLayout({ children }: { children: ReactNode }) {
  return (
    <DemoProvider>
      <div className="min-h-screen bg-[#04060d] text-white">
        {children}
        <DemoToasts />
      </div>
    </DemoProvider>
  );
}
