"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SpendingChart } from "@/components/spending-chart";
import { WorldMap } from "@/components/world-map";
import {
  BarChart3,
  Globe,
  TrendingUp,
  Calendar,
  Repeat,
  AlertTriangle,
  Upload,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

interface AnalyticsData {
  categoryBreakdown: { label: string; amount: number; color: string }[];
  dayOfWeekSpend: number[];
  topMerchants: { name: string; total: number; count: number; currency: string }[];
  countrySpend: { country: string; total: number; count: number }[];
  fxFees: { total: number; count: number; worstSpread: number; currency: string };
  primaryCurrency: string;
}

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

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
          <h1 className="text-2xl font-bold text-white mb-2">Analytics</h1>
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

  const maxDaySpend = data ? Math.max(...data.dayOfWeekSpend, 1) : 1;

  return (
    <div className="min-h-[80vh] bg-gradient-to-b from-[#08051a] via-[#10082a] to-[#160e35]">
      <div className="mx-auto max-w-7xl px-4 py-8">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <h1 className="text-2xl font-bold text-white sm:text-3xl">Spending Intelligence</h1>
          <p className="mt-1 text-sm text-white/70">
            Deep analysis of your financial patterns
          </p>
        </motion.div>

        {data && (
          <div className="grid gap-6 md:grid-cols-2">
            {/* Category Breakdown */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
              <Card className="border-white/[0.10] bg-white/[0.04] text-white">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold text-white/85">
                    <BarChart3 className="w-4 h-4 inline mr-2 text-[#ECAA0B]" />
                    Category Breakdown
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <SpendingChart bars={data.categoryBreakdown} currency={data.primaryCurrency} />
                </CardContent>
              </Card>
            </motion.div>

            {/* Day-of-Week Heatmap */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
              <Card className="border-white/[0.10] bg-white/[0.04] text-white">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold text-white/85">
                    <Calendar className="w-4 h-4 inline mr-2 text-[#2CA2FF]" />
                    Spending by Day of Week
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-end gap-2 h-40">
                    {data.dayOfWeekSpend.map((spend, i) => {
                      const pct = (spend / maxDaySpend) * 100;
                      const isMax = spend === Math.max(...data.dayOfWeekSpend);
                      return (
                        <div key={i} className="flex-1 flex flex-col items-center gap-1">
                          <span className="text-[9px] text-white/60 tabular-nums">
                            {spend > 0 ? formatCurrency(spend, data.primaryCurrency) : "—"}
                          </span>
                          <motion.div
                            className={cn("w-full rounded-t-md min-h-[4px]", isMax ? "bg-[#FF6F69]" : "bg-[#2CA2FF]/60")}
                            initial={{ height: 0 }}
                            animate={{ height: `${Math.max(pct, 3)}%` }}
                            transition={{ duration: 0.5, delay: i * 0.05 }}
                          />
                          <span className="text-[10px] text-white/60 font-medium">{DAY_LABELS[i]}</span>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            {/* Top Merchants */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
              <Card className="border-white/[0.10] bg-white/[0.04] text-white">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold text-white/85">
                    <TrendingUp className="w-4 h-4 inline mr-2 text-[#0BC18D]" />
                    Top Merchants
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {data.topMerchants.map((m, i) => (
                      <div key={m.name} className="flex items-center gap-3">
                        <span className="text-[10px] text-white/40 w-4 text-right tabular-nums">{i + 1}</span>
                        <div className="w-7 h-7 rounded-lg bg-[#0BC18D]/10 flex items-center justify-center text-xs font-bold text-[#0BC18D] shrink-0">
                          {m.name.charAt(0)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-white/90 truncate">{m.name}</p>
                          <p className="text-[10px] text-white/50">{m.count} transactions</p>
                        </div>
                        <span className="text-xs font-bold text-white/85 tabular-nums">
                          {formatCurrency(m.total, m.currency)}
                        </span>
                      </div>
                    ))}
                    {data.topMerchants.length === 0 && (
                      <p className="text-sm text-white/50 text-center py-4">No merchant data yet</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            {/* Geographic Spending */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
              <Card className="border-white/[0.10] bg-white/[0.04] text-white">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold text-white/85">
                    <Globe className="w-4 h-4 inline mr-2 text-[#AD74FF]" />
                    Geographic Spending
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {data.countrySpend.length > 0 ? (
                    <div className="space-y-3">
                      <WorldMap data={data.countrySpend} currency={data.primaryCurrency} />
                      <div className="space-y-1.5 max-h-48 overflow-y-auto">
                        {data.countrySpend.map((c) => (
                          <div key={c.country} className="flex items-center justify-between rounded-lg bg-white/[0.06] px-3 py-2 border border-white/10">
                            <div className="flex items-center gap-2">
                              <span className="text-base">{countryFlag(c.country)}</span>
                              <span className="text-xs font-medium text-white/85">{c.country}</span>
                            </div>
                            <div className="text-right">
                              <span className="text-xs font-bold text-white/90 tabular-nums">
                                {formatCurrency(c.total, data.primaryCurrency)}
                              </span>
                              <p className="text-[9px] text-white/50">{c.count} txns</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-white/50 text-center py-4">No geographic data yet</p>
                  )}
                </CardContent>
              </Card>
            </motion.div>

            {/* FX Fee Tracker */}
            {data.fxFees.count > 0 && (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="md:col-span-2">
                <Card className="border-[#FF6F69]/15 bg-[#FF6F69]/[0.05] text-white">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold text-white/85">
                      <AlertTriangle className="w-4 h-4 inline mr-2 text-[#FF6F69]" />
                      Hidden FX Fee Tracker
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-3 gap-4">
                      <div className="rounded-xl bg-white/[0.06] p-4 text-center">
                        <p className="text-[10px] text-white/60 uppercase tracking-wider mb-1">Total Hidden Fees</p>
                        <p className="text-xl font-bold text-[#FF6F69]">{formatCurrency(data.fxFees.total, data.fxFees.currency)}</p>
                      </div>
                      <div className="rounded-xl bg-white/[0.06] p-4 text-center">
                        <p className="text-[10px] text-white/60 uppercase tracking-wider mb-1">FX Transactions</p>
                        <p className="text-xl font-bold text-[#AD74FF]">{data.fxFees.count}</p>
                      </div>
                      <div className="rounded-xl bg-white/[0.06] p-4 text-center">
                        <p className="text-[10px] text-white/60 uppercase tracking-wider mb-1">Worst Spread</p>
                        <p className="text-xl font-bold text-[#ECAA0B]">{(data.fxFees.worstSpread / 100).toFixed(2)}%</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function countryFlag(iso: string): string {
  if (!iso || iso.length !== 2) return "🌍";
  const offset = 0x1f1e6;
  return String.fromCodePoint(
    iso.charCodeAt(0) - 65 + offset,
    iso.charCodeAt(1) - 65 + offset,
  );
}
