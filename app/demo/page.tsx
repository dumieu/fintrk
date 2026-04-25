"use client";

import { useDemo } from "./demo-store";
import { DemoHero } from "./sections/hero";
import { DemoKpiStrip } from "./sections/kpi-strip";
import { DemoCashflowSection } from "./sections/cashflow";
import { DemoCategoriesSection } from "./sections/categories";
import { DemoAccountsSection } from "./sections/accounts";
import { DemoTransactionsSection } from "./sections/transactions";
import { DemoRecurringSection } from "./sections/recurring";
import { DemoGoalsSection } from "./sections/goals";
import { DemoBudgetsSection } from "./sections/budgets";
import { DemoInsightsSection } from "./sections/insights";
import { DemoFooter } from "./sections/footer";

export default function DemoPage() {
  const { snapshot, loading, error } = useDemo();

  if (loading) return <DemoLoading />;
  if (error || !snapshot) return <DemoError message={error ?? "Could not load demo"} />;

  return (
    <div className="relative">
      {/* Aurora backdrop */}
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div className="absolute -top-40 -left-40 h-[600px] w-[600px] rounded-full bg-[#0BC18D]/10 blur-[180px]" />
        <div className="absolute top-1/3 -right-40 h-[680px] w-[680px] rounded-full bg-[#2CA2FF]/10 blur-[200px]" />
        <div className="absolute bottom-0 left-1/4 h-[520px] w-[520px] rounded-full bg-[#AD74FF]/10 blur-[180px]" />
      </div>

      <div className="relative z-10">
        <DemoHero family={snapshot.family} />
        <div className="mx-auto max-w-7xl space-y-8 px-4 pb-16 sm:px-6">
          <DemoKpiStrip />
          <DemoCashflowSection />
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <DemoCategoriesSection />
            </div>
            <DemoInsightsSection />
          </div>
          <DemoAccountsSection />
          <DemoTransactionsSection />
          <div className="grid gap-6 lg:grid-cols-2">
            <DemoRecurringSection />
            <DemoBudgetsSection />
          </div>
          <DemoGoalsSection />
          <DemoFooter />
        </div>
      </div>
    </div>
  );
}

function DemoLoading() {
  return (
    <div className="flex min-h-[80vh] items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="relative h-14 w-14">
          <div className="absolute inset-0 rounded-2xl border-2 border-white/10" />
          <div
            className="absolute inset-0 rounded-2xl border-2 border-transparent border-t-[#0BC18D] border-r-[#2CA2FF]"
            style={{ animation: "spin 1.4s linear infinite" }}
          />
        </div>
        <p className="text-sm text-white/70">Loading 3 years of Sterling family finances…</p>
      </div>
    </div>
  );
}

function DemoError({ message }: { message: string }) {
  return (
    <div className="flex min-h-[80vh] items-center justify-center px-4">
      <div className="max-w-md rounded-2xl border border-[#FF6F69]/30 bg-[#FF6F69]/10 p-6 text-center">
        <p className="text-sm font-bold text-[#FF6F69]">Could not load the demo</p>
        <p className="mt-2 text-xs text-white/70">{message}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-4 rounded-lg bg-white/10 px-4 py-2 text-xs font-medium text-white hover:bg-white/20"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
