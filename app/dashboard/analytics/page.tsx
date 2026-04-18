"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SpendingChart } from "@/components/spending-chart";
import { DayOfWeekSpend } from "@/components/day-of-week-spend";
import { MerchantsAnalyticsList } from "@/components/merchants-analytics-list";
import { GeographicSpendingList } from "@/components/geographic-spending-list";
import { CurrencySpendingList } from "@/components/currency-spending-list";
import { MonthlyStackedSpend } from "@/components/monthly-stacked-spend";
import { DiscretionaryBreakdown } from "@/components/discretionary-breakdown";
import { CashflowSummary } from "@/components/cashflow-summary";
import {
  BarChart3,
  Globe,
  Store,
  Calendar,
  Coins,
  Upload,
  Search,
  CalendarRange,
  PieChart,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

interface AnalyticsData {
  categoryBreakdown: { label: string; amount: number; color: string }[];
  dayOfWeekSpend: number[];
  dayOfWeekCategoryBreakdown: { label: string; amount: number; color: string }[][];
  primaryCurrency: string;
}

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [merchantFilter, setMerchantFilter] = useState("");

  useEffect(() => {
    fetch("/api/analytics")
      .then((r) => r.json())
      .then((d) => { if (!d.error) setData(d); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (!loading && !data) {
    return (
      <div className="min-h-[80vh] bg-gradient-to-b from-[#08051a] via-[#10082a] to-[#160e35]">
        <div className="mx-auto max-w-7xl px-4 py-8">
          <p className="text-sm text-white/70 mb-8">Import statements to unlock spending intelligence</p>
          <div className="flex justify-center py-20">
            <Link href="/dashboard/upload">
              <Button className="bg-gradient-to-r from-[#0BC18D] to-[#2CA2FF] text-white">
                <Upload className="w-4 h-4 mr-2" /> Upload Statement
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[80vh] bg-gradient-to-b from-[#08051a] via-[#10082a] to-[#160e35]">
      <div className="mx-auto max-w-7xl px-4 py-8">
        {data && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8 flex justify-end"
          >
            <CashflowSummary months={12} />
          </motion.div>
        )}

        {data && (
          <div className="space-y-6">
            {/* Monthly Stacked Spend — full width hero chart */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
            >
              <Card className="border-white/[0.10] bg-white/[0.04] text-white">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-sm font-semibold text-white/85">
                    <span className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-[#0BC18D]/30 to-[#5DD3F3]/20 ring-1 ring-white/10">
                      <CalendarRange className="h-4 w-4 text-[#0BC18D]" />
                    </span>
                    Monthly Spend by Category
                  </CardTitle>
                </CardHeader>
                <CardContent className="overflow-visible pt-0">
                  <MonthlyStackedSpend months={21} />
                </CardContent>
              </Card>
            </motion.div>

            {/* 6-card uniform grid: 2 columns on md+, 1 column on mobile.
             *  Fixed card height (480px) — without it the discretionary list expanded
             *  unboundedly and broke `flex-1` internal scrolling. */}
            <div className="grid gap-6 md:grid-cols-2">
              {/* Discretionary breakdown */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.08 }}
                className="flex"
              >
                <Card className="flex h-[336px] w-full flex-col border-white/[0.10] bg-white/[0.04] text-white">
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-sm font-semibold text-white/85">
                      <span className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-[#FF6F69]/30 to-[#5DD3F3]/20 ring-1 ring-white/10">
                        <PieChart className="h-4 w-4 text-[#F2C94C]" />
                      </span>
                      Discretionary vs Non-discretionary
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="flex min-h-0 flex-1 flex-col pt-0">
                    <DiscretionaryBreakdown months={12} />
                  </CardContent>
                </Card>
              </motion.div>

              {/* Category Breakdown */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="flex"
              >
                <Card className="flex h-[336px] w-full flex-col border-white/[0.10] bg-white/[0.04] text-white">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold text-white/85">
                      <BarChart3 className="w-4 h-4 inline mr-2 text-[#ECAA0B]" />
                      Category Breakdown
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="flex min-h-0 flex-1 flex-col">
                    <SpendingChart bars={data.categoryBreakdown} currency={data.primaryCurrency} />
                  </CardContent>
                </Card>
              </motion.div>

              {/* Day-of-Week Heatmap */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
                className="flex overflow-visible"
              >
                <Card className="flex h-[336px] w-full flex-col overflow-visible border-white/[0.10] bg-white/[0.04] text-white">
                  <CardHeader className="pb-1.5">
                    <CardTitle className="text-sm font-semibold text-white/85">
                      <Calendar className="w-4 h-4 inline mr-2 text-[#2CA2FF]" />
                      Spending by Day of Week
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="flex min-h-0 flex-1 flex-col overflow-visible pb-4 pt-0">
                    <DayOfWeekSpend
                      spend={data.dayOfWeekSpend}
                      categoriesByDay={data.dayOfWeekCategoryBreakdown}
                      currency={data.primaryCurrency}
                    />
                  </CardContent>
                </Card>
              </motion.div>

              {/* Merchants — infinite scroll, ranked by spend */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="flex"
              >
                <Card className="flex h-[336px] w-full flex-col border-white/[0.10] bg-white/[0.04] text-white">
                  <CardHeader className="pb-2">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                      <CardTitle className="text-sm font-semibold text-white/85">
                        <Store className="w-4 h-4 inline mr-2 text-[#0BC18D]" />
                        Merchants
                      </CardTitle>
                      <label className="relative flex min-w-0 sm:max-w-[220px]">
                        <Search
                          className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/35"
                          aria-hidden
                        />
                        <input
                          type="search"
                          value={merchantFilter}
                          onChange={(e) => setMerchantFilter(e.target.value)}
                          placeholder="Filter…"
                          className="h-8 w-full rounded-lg border border-white/10 bg-white/[0.06] py-1 pl-8 pr-2 text-xs text-white placeholder:text-white/35 outline-none ring-0 transition-colors focus:border-[#0BC18D]/45 focus:bg-white/[0.08]"
                          aria-label="Filter merchants by name"
                          autoComplete="off"
                        />
                      </label>
                    </div>
                  </CardHeader>
                  <CardContent className="flex min-h-0 flex-1 flex-col">
                    <MerchantsAnalyticsList filterQuery={merchantFilter} />
                  </CardContent>
                </Card>
              </motion.div>

              {/* Geographic Spending */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25 }}
                className="flex"
              >
                <Card className="flex h-[336px] w-full flex-col border-white/[0.10] bg-white/[0.04] text-white">
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-sm font-semibold text-white/85">
                      <span className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-[#AD74FF]/30 to-[#2CA2FF]/20 ring-1 ring-white/10">
                        <Globe className="h-4 w-4 text-[#AD74FF]" />
                      </span>
                      Geographic Spending
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="flex min-h-0 flex-1 flex-col">
                    <GeographicSpendingList />
                  </CardContent>
                </Card>
              </motion.div>

              {/* Currency Spending */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.27 }}
                className="flex"
              >
                <Card className="flex h-[336px] w-full flex-col border-white/[0.10] bg-white/[0.04] text-white">
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-sm font-semibold text-white/85">
                      <span className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-[#F2C94C]/30 to-[#FF6F69]/20 ring-1 ring-white/10">
                        <Coins className="h-4 w-4 text-[#F2C94C]" />
                      </span>
                      Currency Spending
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="flex min-h-0 flex-1 flex-col">
                    <CurrencySpendingList />
                  </CardContent>
                </Card>
              </motion.div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
