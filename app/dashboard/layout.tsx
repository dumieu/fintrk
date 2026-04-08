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
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <DashboardHeader />
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
      </div>
      <ProcessingBanner />
    </DashboardShell>
  );
}
