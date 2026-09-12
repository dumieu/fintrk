import { redirect } from "next/navigation";
import { DashboardProGate } from "@/components/dashboard-pro-gate";
import { DashboardShell } from "@/components/dashboard-shell";
import { DashboardLayoutChrome } from "@/components/dashboard-layout-chrome";
import { ProcessingBanner } from "@/components/processing-banner";
import { AppQuickNote } from "@/components/quick-note/app-quick-note";
import { FinAiChat } from "@/components/fin-ai/fin-ai-chat";
import { UpgradeRedirectGuard } from "@/components/upgrade-redirect-guard";
import { StatementViewerHost } from "@/components/statement-viewer-host";
import { resilientAuth } from "@/lib/auth-resilient";

const CLERK_CONFIGURED = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!CLERK_CONFIGURED) {
    redirect("/unauth1");
  }
  const { userId } = await resilientAuth();
  if (!userId) {
    redirect("/unauth1");
  }

  return (
    <DashboardShell>
      <DashboardProGate />
      <UpgradeRedirectGuard />
      <AppQuickNote />
      <DashboardLayoutChrome sessionActive>{children}</DashboardLayoutChrome>
      <ProcessingBanner />
      <StatementViewerHost />
      <FinAiChat />
    </DashboardShell>
  );
}
