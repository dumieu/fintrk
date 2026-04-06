"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, TrendingDown, DollarSign, PiggyBank, Target, Wallet } from "lucide-react";

const kpis = [
  { label: "Net Worth", value: "$---,---", change: "+---%", icon: DollarSign, positive: true },
  { label: "Monthly Income", value: "$---,---", change: "+---%", icon: TrendingUp, positive: true },
  { label: "Monthly Expenses", value: "$---,---", change: "----%", icon: TrendingDown, positive: false },
  { label: "Savings Rate", value: "--%", change: "+---%", icon: PiggyBank, positive: true },
  { label: "Investments", value: "$---,---", change: "+---%", icon: Wallet, positive: true },
  { label: "Goals Progress", value: "-/- goals", change: "--%", icon: Target, positive: true },
];

export default function DashboardPage() {
  return (
    <div className="min-h-[80vh] bg-gradient-to-b from-[#04000a] via-[#0a0014] to-[#0f001a]">
      <div className="mx-auto max-w-7xl px-4 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white sm:text-3xl">
            Financial Overview
          </h1>
          <p className="mt-1 text-sm text-white/60">
            Your complete financial snapshot
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {kpis.map((kpi, i) => {
            const Icon = kpi.icon;
            return (
              <Card
                key={kpi.label}
                className="kpi-glass border-white/[0.06] text-white"
                style={{ animationDelay: `${i * 80}ms` }}
              >
                <CardContent className="p-3 sm:p-4">
                  <div className="flex items-center gap-1.5 mb-2">
                    <Icon className="w-3.5 h-3.5 text-[#0BC18D]/70" />
                    <span className="text-[10px] sm:text-[11px] font-medium text-white/50 truncate">
                      {kpi.label}
                    </span>
                  </div>
                  <div className="text-sm sm:text-lg font-bold tabular-nums">
                    {kpi.value}
                  </div>
                  <div className={`text-[10px] sm:text-xs font-medium mt-0.5 ${
                    kpi.positive ? "text-[#0BC18D]" : "text-[#FF6F69]"
                  }`}>
                    {kpi.change}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="mt-8 grid gap-6 md:grid-cols-2">
          <Card className="kpi-glass border-white/[0.06] text-white">
            <CardHeader>
              <CardTitle className="text-base font-semibold text-white/80">
                Income vs Expenses
              </CardTitle>
            </CardHeader>
            <CardContent className="flex items-center justify-center h-48 text-white/30 text-sm">
              Chart placeholder — connect your accounts to begin
            </CardContent>
          </Card>

          <Card className="kpi-glass border-white/[0.06] text-white">
            <CardHeader>
              <CardTitle className="text-base font-semibold text-white/80">
                Portfolio Performance
              </CardTitle>
            </CardHeader>
            <CardContent className="flex items-center justify-center h-48 text-white/30 text-sm">
              Chart placeholder — add your investments to track
            </CardContent>
          </Card>
        </div>

        <div className="mt-6 grid gap-6 md:grid-cols-3">
          <Card className="kpi-glass border-white/[0.06] text-white">
            <CardHeader>
              <CardTitle className="text-sm font-semibold text-white/80">
                Recent Transactions
              </CardTitle>
            </CardHeader>
            <CardContent className="flex items-center justify-center h-32 text-white/30 text-xs">
              No transactions yet
            </CardContent>
          </Card>

          <Card className="kpi-glass border-white/[0.06] text-white">
            <CardHeader>
              <CardTitle className="text-sm font-semibold text-white/80">
                Budget Breakdown
              </CardTitle>
            </CardHeader>
            <CardContent className="flex items-center justify-center h-32 text-white/30 text-xs">
              Set up your budget to track spending
            </CardContent>
          </Card>

          <Card className="kpi-glass border-white/[0.06] text-white">
            <CardHeader>
              <CardTitle className="text-sm font-semibold text-white/80">
                Goal Progress
              </CardTitle>
            </CardHeader>
            <CardContent className="flex items-center justify-center h-32 text-white/30 text-xs">
              Create your first financial goal
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
