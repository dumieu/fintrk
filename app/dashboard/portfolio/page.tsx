"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Wallet, TrendingUp, BarChart3 } from "lucide-react";

export default function PortfolioPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold sm:text-3xl">Portfolio</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Track your assets, liabilities, and net worth over time
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3 mb-6">
        {[
          { label: "Total Assets", icon: Wallet, color: "#0BC18D" },
          { label: "Total Liabilities", icon: TrendingUp, color: "#FF6F69" },
          { label: "Net Worth", icon: BarChart3, color: "#2CA2FF" },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <Card key={item.label}>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Icon className="w-4 h-4" style={{ color: item.color }} />
                  <span className="text-xs font-medium text-muted-foreground">{item.label}</span>
                </div>
                <div className="text-xl font-bold tabular-nums">$---,---</div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Asset Allocation</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-64 text-muted-foreground text-sm">
          Add your accounts and assets to see your portfolio breakdown
        </CardContent>
      </Card>
    </div>
  );
}
