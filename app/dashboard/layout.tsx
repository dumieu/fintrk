import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard-shell";
import { DashboardLayoutChrome } from "@/components/dashboard-layout-chrome";
import { ProcessingBanner } from "@/components/processing-banner";
import { UpgradeRedirectGuard } from "@/components/upgrade-redirect-guard";
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
      <UpgradeRedirectGuard />
      <DashboardLayoutChrome>{children}</DashboardLayoutChrome>
      <ProcessingBanner />
    </DashboardShell>
  );
}
