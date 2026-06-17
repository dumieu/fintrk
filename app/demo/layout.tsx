import type { ReactNode } from "react";
import type { Metadata } from "next";
import { DemoApiBridge } from "./demo-api-bridge";
import { DemoRibbon } from "./demo-ribbon";

export const metadata: Metadata = {
  title: "FinTRK Live Demo \u00b7 The Sterling Family",
  description:
    "Explore the full FinTRK app with five years of a real upper-middle-class household's finances - income, mortgage, three kids, every transaction, the Net Worth Atlas. Edit anything; nothing saves. Refresh to reset.",
  robots: { index: true, follow: true },
};

export default function DemoLayout({ children }: { children: ReactNode }) {
  return (
    <DemoApiBridge>
      <DemoRibbon />
      {children}
    </DemoApiBridge>
  );
}
