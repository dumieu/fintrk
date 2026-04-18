import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard-shell";
import { DashboardHeader } from "@/components/dashboard-header";
import { ProcessingBanner } from "@/components/processing-banner";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
    const { auth } = await import("@clerk/nextjs/server");
    const { userId } = await auth();
    if (!userId) redirect("/unauth1");
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
