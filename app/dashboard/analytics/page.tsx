"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MerchantsAnalyticsList } from "@/components/merchants-analytics-list";
import { MonthlyStackedSpend } from "@/components/monthly-stacked-spend";
import { DiscretionaryBreakdown } from "@/components/discretionary-breakdown";
import { InsightsCategoryBreakdown } from "@/components/insights-category-breakdown";
import {
  BarChart3,
  Store,
  Upload,
  Search,
  PieChart,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  chartIconBadgeClass,
  chartInputClass,
  chartMutedClass,
  chartPanelClass,
  chartTitleClass,
} from "@/lib/chart-ui";
import {
  analyticsChartFiltersEqual,
  DEFAULT_ANALYTICS_CHART_FILTERS,
  type AnalyticsChartFilters,
} from "@/lib/analytics/workspace-filters";
import { FINTRK_BOTTOM_PANEL_RAIL_H_PX } from "@/lib/workspace-panels/layout";
import { cn } from "@/lib/utils";
import { useAppHref } from "@/lib/app-base-path";
import { WorkspacePanelShell } from "@/components/workspace-panels/workspace-panel-shell";

export default function AnalyticsPage() {
  const uploadHref = useAppHref("/upload");
  const [hasData, setHasData] = useState<boolean | null>(null);
  const [merchantFilter, setMerchantFilter] = useState("");
  const [merchantDateRange, setMerchantDateRange] = useState<string | null>(null);
  const [chartFilters, setChartFilters] = useState<AnalyticsChartFilters>(
    DEFAULT_ANALYTICS_CHART_FILTERS,
  );

  const onChartFiltersChange = useCallback((next: AnalyticsChartFilters) => {
    setChartFilters((prev) => (analyticsChartFiltersEqual(prev, next) ? prev : next));
  }, []);

  useEffect(() => {
    fetch("/api/analytics/category-breakdown")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setHasData(false);
        else setHasData(Array.isArray(d.categoryBreakdown) && d.categoryBreakdown.length > 0);
      })
      .catch(() => setHasData(false));
  }, []);

  const insightsStack = (
      <div className="flex h-full min-h-0 flex-col gap-1.5 overflow-hidden p-1.5">
        <Card className={cn(chartPanelClass, "flex min-h-0 flex-1 flex-col gap-0 py-0")}>
          <CardHeader className="shrink-0 gap-0 space-y-0 px-2 py-1">
            <CardTitle className={cn(chartTitleClass, "flex items-center justify-center gap-1.5 text-center text-[12px] leading-none")}>
              <span className={cn(chartIconBadgeClass, "h-5 w-5 rounded-md bg-gradient-to-br from-[#FF6F69]/30 to-[#5DD3F3]/20")}>
                <PieChart className="h-3 w-3 text-[#F2C94C]" />
              </span>
              Discretionary vs Non-discretionary
            </CardTitle>
          </CardHeader>
          <CardContent className="flex min-h-0 flex-1 flex-col px-2 pb-1.5 pt-0">
            <DiscretionaryBreakdown filters={chartFilters} />
          </CardContent>
        </Card>

        <Card className={cn(chartPanelClass, "flex min-h-0 flex-1 flex-col gap-0 py-0")}>
          <CardHeader className="shrink-0 gap-0 space-y-0 px-2 py-1">
            <CardTitle className={cn(chartTitleClass, "flex items-center justify-center gap-1.5 text-center text-[12px] leading-none")}>
              <BarChart3 className="h-3.5 w-3.5 shrink-0 text-[#ECAA0B]" />
              Category Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent className="flex min-h-0 flex-1 flex-col px-2 pb-1.5 pt-0">
            <InsightsCategoryBreakdown filters={chartFilters} />
          </CardContent>
        </Card>

        <Card className={cn(chartPanelClass, "flex min-h-0 flex-1 flex-col gap-0 py-0")}>
          <CardHeader className="shrink-0 gap-0 space-y-0 px-2 py-1">
            <div className="relative flex min-w-0 items-center justify-center gap-2">
              <div className="min-w-0 text-center leading-none">
                <CardTitle className={cn(chartTitleClass, "flex items-center justify-center gap-1.5 text-[12px] leading-none")}>
                  <Store className="h-3.5 w-3.5 shrink-0 text-[#0BC18D]" />
                  Merchants
                </CardTitle>
                {merchantDateRange ? (
                  <p className="mt-0.5 text-[9px] font-normal leading-none text-muted-foreground">
                    {merchantDateRange}
                  </p>
                ) : null}
              </div>
              <label className="absolute right-0 top-1/2 min-w-0 max-w-[8.5rem] -translate-y-1/2 shrink-0">
                <Search
                  className="pointer-events-none absolute left-1.5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <input
                  type="search"
                  value={merchantFilter}
                  onChange={(e) => setMerchantFilter(e.target.value)}
                  placeholder="Filter…"
                  className={cn(chartInputClass, "h-6 py-0 pl-6 pr-1.5 text-[10px]")}
                  aria-label="Filter merchants by name"
                  autoComplete="off"
                />
              </label>
            </div>
          </CardHeader>
          <CardContent className="flex min-h-0 flex-1 flex-col px-2 pb-1.5 pt-0">
            <MerchantsAnalyticsList
              filterQuery={merchantFilter}
              onDateRangeLabel={setMerchantDateRange}
              chartFilters={chartFilters}
            />
          </CardContent>
        </Card>
      </div>
  );

  if (hasData === false) {
    return (
      <WorkspacePanelShell
        leftLabel="Insights"
        rightLabel="Details"
        bottomLabel="Notes"
        centerMode="fill"
      >
        <div className="flex h-full min-h-0 flex-col items-center justify-center bg-app-canvas px-4">
          <p className={cn(chartMutedClass, "mb-8")}>Import statements to unlock spending intelligence</p>
          <Link href={uploadHref}>
            <Button className="bg-gradient-to-r from-[#0BC18D] to-[#2CA2FF] text-white">
              <Upload className="w-4 h-4 mr-2" /> Upload Statement
            </Button>
          </Link>
        </div>
      </WorkspacePanelShell>
    );
  }

  return (
    <WorkspacePanelShell
      leftLabel="Insights"
      rightLabel="Details"
      bottomLabel="Notes"
      leftContent={insightsStack}
      centerMode="fill"
    >
      <div
        className="flex h-full min-h-0 flex-col overflow-hidden bg-app-canvas pt-0"
        style={{
          paddingLeft: "1cm",
          paddingRight: "1cm",
          paddingBottom: `calc(1cm + ${FINTRK_BOTTOM_PANEL_RAIL_H_PX}px)`,
        }}
      >
        <motion.div
          className="flex min-h-0 flex-1 flex-col"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
        >
          <MonthlyStackedSpend months={72} fill onFiltersChange={onChartFiltersChange} />
        </motion.div>
      </div>
    </WorkspacePanelShell>
  );
}
