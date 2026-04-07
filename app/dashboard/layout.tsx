import { DashboardShell } from "@/components/dashboard-shell";
import { DashboardHeader } from "@/components/dashboard-header";
import { ProcessingBanner } from "@/components/processing-banner";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <DashboardShell>
      <DashboardHeader />
      {children}
      <ProcessingBanner />
    </DashboardShell>
  );
}
