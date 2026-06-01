"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SpendingChart } from "@/components/spending-chart";
import { MerchantsAnalyticsList } from "@/components/merchants-analytics-list";
import { MonthlyStackedSpend } from "@/components/monthly-stacked-spend";
import { DiscretionaryBreakdown } from "@/components/discretionary-breakdown";
import {
  BarChart3,
  Store,
  Upload,
  Search,
  PieChart,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

interface AnalyticsData {
  categoryBreakdown: { label: string; amount: number; color: string }[];
  primaryCurrency: string;
}

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [merchantFilter, setMerchantFilter] = useState("");
  const [merchantDateRange, setMerchantDateRange] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/analytics")
      .then((r) => r.json())
      .then((d) => { if (!d.error) setData(d); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (!loading && !data) {
    return (
      <div className="min-h-[80vh] bg-app-canvas">
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
    <div className="min-h-[80vh] bg-app-canvas">
      <div className="@container/analytics mx-auto max-w-7xl px-4 py-8">
        {data && (
          <div className="space-y-6">
            {/* Monthly Stacked Spend — full width hero chart */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
            >
              <MonthlyStackedSpend months={72} />
            </motion.div>

            {/* Analytics grid: 1 col mobile → 2 col tablet → 3 col when container fits */}
            <div className="grid grid-cols-1 gap-4 sm:gap-6 @[44rem]/analytics:grid-cols-2 @[60rem]/analytics:grid-cols-3">
              {/* Discretionary breakdown */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.08 }}
                className="flex min-w-0"
              >
                <Card className="flex h-[504px] w-full flex-col border-white/[0.10] bg-white/[0.04] text-white">
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
                className="flex min-w-0"
              >
                <Card className="flex h-[504px] w-full flex-col border-white/[0.10] bg-white/[0.04] text-white">
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

              {/* Merchants — infinite scroll, ranked by spend */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="flex min-w-0"
              >
                <Card className="flex h-[504px] w-full flex-col border-white/[0.10] bg-white/[0.04] text-white">
                  <CardHeader className="pb-2">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                      <div className="min-w-0">
                        <CardTitle className="text-sm font-semibold text-white/85">
                          <Store className="w-4 h-4 inline mr-2 text-[#0BC18D]" />
                          Merchants
                        </CardTitle>
                        {merchantDateRange ? (
                          <p className="mt-0.5 pl-6 text-[10px] font-normal text-white/40">
                            {merchantDateRange}
                          </p>
                        ) : null}
                      </div>
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
                    <MerchantsAnalyticsList
                      filterQuery={merchantFilter}
                      onDateRangeLabel={setMerchantDateRange}
                    />
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
