import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard-shell";
import { DashboardHeader } from "@/components/dashboard-header";
import { ProcessingBanner } from "@/components/processing-banner";
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
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <DashboardHeader />
        <div className="flex min-h-0 flex-1 flex-col overflow-x-clip overflow-y-auto overscroll-y-contain [scrollbar-gutter:stable]">
          {children}
        </div>
      </div>
      <ProcessingBanner />
    </DashboardShell>
  );
}
