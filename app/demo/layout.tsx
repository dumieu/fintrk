import type { ReactNode } from "react";
import type { Metadata } from "next";
import { DemoProvider } from "./demo-store";
import { DemoBanner } from "./demo-banner";
import { DemoToasts } from "./demo-toasts";

export const metadata: Metadata = {
  title: "FinTRK Live Demo · The Sterling Family",
  description:
    "Walk through three years of real financial life — incomes, mortgage, two kids' colleges, every transaction. Edit anything; nothing persists. Refresh to reset.",
  robots: { index: true, follow: true },
};

export default function DemoLayout({ children }: { children: ReactNode }) {
  return (
    <DemoProvider>
      <div className="flex min-h-screen flex-col bg-[#04060d] text-white">
        <DemoBanner />
        <main className="flex-1">{children}</main>
        <DemoToasts />
      </div>
    </DemoProvider>
  );
}
