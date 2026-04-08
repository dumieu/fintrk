"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KpiCard } from "@/components/kpi-card";
import { SpendingChart } from "@/components/spending-chart";
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Repeat,
  Upload,
  ArrowRight,
  Zap,
  Globe,
  BarChart3,
  Sparkles,
  Wallet,
  Activity,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { formatCurrency, formatDelta, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CashFlowChart } from "@/components/cashflow-chart";
import { CurrencyConsolidation } from "@/components/currency-consolidation";

interface DashboardData {
  kpis: {
    totalBalance: { value: number; currency: string };
    monthlyIncome: { value: number; previous: number; currency: string };
    monthlyExpenses: { value: number; previous: number; currency: string };
    recurringTotal: { value: number; count: number; currency: string };
    largestExpense: { merchant: string; amount: number };
    accountCount: number;
    transactionCount: number;
  };
  recentTransactions: {
    id: string;
    postedDate: string;
    rawDescription: string;
    merchantName: string | null;
    baseAmount: string;
    baseCurrency: string;
    foreignCurrency: string | null;
    categorySuggestion: string | null;
    countryIso: string | null;
    isRecurring: boolean;
  }[];
  categoryBreakdown: { label: string; amount: number; count: number; color: string }[];
  recurringPatterns: {
    merchantName: string;
    amount: number;
    currency: string;
    interval: string;
    nextDate: string | null;
  }[];
  primaryCurrency: string;
}

interface CashFlowData {
  historical: { month: string; income: number; expenses: number; net: number; isProjected: boolean }[];
  projections: { month: string; income: number; expenses: number; net: number; isProjected: boolean }[];
  monthlyRecurring: number;
  averageIncome: number;
  averageExpenses: number;
  trend: string;
  currency: string;
}

interface ConsolidationData {
  totalBalance: number;
  homeCurrency: string;
  accounts: {
    id: string;
    name: string;
    institution: string | null;
    type: string;
    nativeBalance: number;
    nativeCurrency: string;
    homeBalance: number;
    homeCurrency: string;
    txnCount: number;
  }[];
  currencyBreakdown: { currency: string; nativeBalance: number; homeBalance: number }[];
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [cashflow, setCashflow] = useState<CashFlowData | null>(null);
  const [consolidation, setConsolidation] = useState<ConsolidationData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/dashboard").then((r) => r.json()),
      fetch("/api/cashflow").then((r) => r.json()),
      fetch("/api/consolidation").then((r) => r.json()),
    ])
      .then(([d, cf, co]) => {
        if (d.kpis) setData(d);
        if (cf.historical) setCashflow(cf);
        if (co.accounts) setConsolidation(co);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const hasData = data && data.kpis.transactionCount > 0;

  return (
    <div className="min-h-[80vh] bg-gradient-to-b from-[#08051a] via-[#10082a] to-[#160e35]">
      <div className="mx-auto max-w-7xl px-4 py-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4"
        >
          <div>
            <h1 className="text-2xl font-bold text-white sm:text-3xl">Financial Command Center</h1>
            <p className="mt-1 text-sm text-white/70">
              {hasData
                ? `${data.kpis.transactionCount} transactions this month across ${data.kpis.accountCount} account${data.kpis.accountCount !== 1 ? "s" : ""}`
                : "Upload your first statement to get started"}
            </p>
          </div>
          <Link href="/dashboard/upload">
            <Button className="bg-gradient-to-r from-[#0BC18D] to-[#2CA2FF] text-white font-semibold hover:opacity-90 transition-opacity">
              <Upload className="w-4 h-4 mr-2" />
              Upload Statement
            </Button>
          </Link>
        </motion.div>

        {/* ── KPI Row ── */}
        {hasData ? (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <KpiCard
                label="Net Cash Flow"
                value={formatCurrency(data.kpis.totalBalance.value, data.kpis.totalBalance.currency)}
                delta={data.kpis.totalBalance.value >= 0 ? "Positive" : "Negative"}
                deltaDirection={data.kpis.totalBalance.value >= 0 ? "up" : "down"}
                icon={DollarSign}
                accentColor={data.kpis.totalBalance.value >= 0 ? "#0BC18D" : "#FF6F69"}
                accentRgb={data.kpis.totalBalance.value >= 0 ? "11,193,141" : "255,111,105"}
                index={0}
              />
              <KpiCard
                label="Income"
                value={formatCurrency(data.kpis.monthlyIncome.value, data.kpis.monthlyIncome.currency)}
                delta={formatDelta(data.kpis.monthlyIncome.value, data.kpis.monthlyIncome.previous).text}
                deltaDirection={formatDelta(data.kpis.monthlyIncome.value, data.kpis.monthlyIncome.previous).direction}
                icon={TrendingUp}
                accentColor="#0BC18D"
                accentRgb="11,193,141"
                index={1}
              />
              <KpiCard
                label="Expenses"
                value={formatCurrency(data.kpis.monthlyExpenses.value, data.kpis.monthlyExpenses.currency)}
                delta={formatDelta(data.kpis.monthlyExpenses.value, data.kpis.monthlyExpenses.previous).text}
                deltaDirection={data.kpis.monthlyExpenses.value <= data.kpis.monthlyExpenses.previous ? "up" : "down"}
                icon={TrendingDown}
                accentColor="#2CA2FF"
                accentRgb="44,162,255"
                index={2}
              />
              <KpiCard
                label="Recurring"
                value={formatCurrency(data.kpis.recurringTotal.value, data.kpis.recurringTotal.currency)}
                delta={`${data.kpis.recurringTotal.count} subscriptions`}
                icon={Repeat}
                accentColor="#AD74FF"
                accentRgb="173,116,255"
                index={3}
              />
            </div>

            {/* ── Middle Row: Spending + Transactions ── */}
            <div className="mt-6 grid gap-6 md:grid-cols-2">
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
                <Card className="border-white/[0.10] bg-white/[0.04] text-white">
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-semibold text-white/85">
                      <BarChart3 className="w-4 h-4 inline mr-2 text-[#ECAA0B]" />
                      Spending by Category
                    </CardTitle>
                    <Link href="/dashboard/analytics" className="text-[10px] text-[#2CA2FF] hover:underline flex items-center gap-1">
                      Details <ArrowRight className="w-3 h-3" />
                    </Link>
                  </CardHeader>
                  <CardContent>
                    <SpendingChart
                      bars={data.categoryBreakdown}
                      currency={data.primaryCurrency}
                    />
                  </CardContent>
                </Card>
              </motion.div>

              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}>
                <Card className="border-white/[0.10] bg-white/[0.04] text-white">
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-semibold text-white/85">
                      <Zap className="w-4 h-4 inline mr-2 text-[#0BC18D]" />
                      Recent Transactions
                    </CardTitle>
                    <Link href="/dashboard/transactions" className="text-[10px] text-[#2CA2FF] hover:underline flex items-center gap-1">
                      View all <ArrowRight className="w-3 h-3" />
                    </Link>
                  </CardHeader>
                  <CardContent className="px-0">
                    <div className="divide-y divide-white/10">
                      {data.recentTransactions.map((txn) => {
                        const amt = parseFloat(txn.baseAmount);
                        const isIncome = amt > 0;
                        return (
                          <div key={txn.id} className="flex items-center gap-3 px-6 py-2.5">
                            <div className={cn(
                              "w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0",
                              isIncome ? "bg-[#0BC18D]/10 text-[#0BC18D]" : "bg-[#2CA2FF]/10 text-[#2CA2FF]",
                            )}>
                              {(txn.merchantName ?? txn.rawDescription).charAt(0).toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium text-white/90 truncate">
                                {txn.merchantName ?? txn.rawDescription}
                              </p>
                              <p className="text-[10px] text-white/50">
                                {formatDate(txn.postedDate)}
                                {txn.categorySuggestion && ` · ${txn.categorySuggestion}`}
                                {txn.countryIso && txn.countryIso !== "US" && (
                                  <span className="ml-1">
                                    <Globe className="w-2.5 h-2.5 inline text-[#AD74FF]" /> {txn.countryIso}
                                  </span>
                                )}
                              </p>
                            </div>
                            <span className={cn(
                              "text-xs font-bold tabular-nums whitespace-nowrap",
                              isIncome ? "text-[#0BC18D]" : "text-white/90",
                            )}>
                              {isIncome ? "+" : "−"}{formatCurrency(Math.abs(amt), txn.baseCurrency)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            </div>

            {/* ── Cash Flow + Consolidation Row ── */}
            <div className="mt-6 grid gap-6 md:grid-cols-2">
              {cashflow && (cashflow.historical.length > 0 || cashflow.projections.length > 0) && (
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.38 }}>
                  <Card className="border-white/[0.10] bg-white/[0.04] text-white">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                      <CardTitle className="text-sm font-semibold text-white/85">
                        <Activity className="w-4 h-4 inline mr-2 text-[#2CA2FF]" />
                        Predictive Cash Flow
                      </CardTitle>
                      <span className={cn(
                        "text-[9px] px-2 py-0.5 rounded-full font-medium",
                        cashflow.trend === "decreasing" ? "bg-[#0BC18D]/10 text-[#0BC18D]" : cashflow.trend === "increasing" ? "bg-[#FF6F69]/10 text-[#FF6F69]" : "bg-white/8 text-white/60",
                      )}>
                        Expenses {cashflow.trend}
                      </span>
                    </CardHeader>
                    <CardContent>
                      <CashFlowChart bars={[...cashflow.historical, ...cashflow.projections]} currency={cashflow.currency} />
                    </CardContent>
                  </Card>
                </motion.div>
              )}

              {consolidation && consolidation.accounts.length > 0 && (
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
                  <Card className="border-white/[0.10] bg-white/[0.04] text-white">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                      <CardTitle className="text-sm font-semibold text-white/85">
                        <Wallet className="w-4 h-4 inline mr-2 text-[#ECAA0B]" />
                        Multi-Currency Consolidation
                      </CardTitle>
                      <Link href="/dashboard/accounts" className="text-[10px] text-[#2CA2FF] hover:underline flex items-center gap-1">
                        Manage <ArrowRight className="w-3 h-3" />
                      </Link>
                    </CardHeader>
                    <CardContent>
                      <CurrencyConsolidation
                        totalBalance={consolidation.totalBalance}
                        homeCurrency={consolidation.homeCurrency}
                        accounts={consolidation.accounts}
                        currencyBreakdown={consolidation.currencyBreakdown}
                      />
                    </CardContent>
                  </Card>
                </motion.div>
              )}
            </div>

            {/* ── Bottom Row: Recurring + AI Insight teaser ── */}
            <div className="mt-6 grid gap-6 md:grid-cols-3">
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="md:col-span-2">
                <Card className="border-white/[0.10] bg-white/[0.04] text-white">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold text-white/85">
                      <Repeat className="w-4 h-4 inline mr-2 text-[#AD74FF]" />
                      Recurring Commitments
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {data.recurringPatterns.length > 0 ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {data.recurringPatterns.slice(0, 6).map((r, i) => (
                          <div key={i} className="flex items-center justify-between rounded-lg bg-white/[0.06] px-3 py-2.5 border border-white/10">
                            <div>
                              <p className="text-xs font-medium text-white/90">{r.merchantName}</p>
                              <p className="text-[10px] text-white/50 capitalize">
                                {r.interval}{r.nextDate && ` · Next: ${formatDate(r.nextDate)}`}
                              </p>
                            </div>
                            <span className="text-xs font-bold text-white/85 tabular-nums">
                              {formatCurrency(Math.abs(r.amount), r.currency)}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-white/50 py-4 text-center">
                        Recurring patterns will appear after more statements are imported
                      </p>
                    )}
                  </CardContent>
                </Card>
              </motion.div>

              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 }}>
                <Card className="border-[#AD74FF]/15 bg-[#AD74FF]/[0.05] text-white h-full flex flex-col">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold text-white/85">
                      <Sparkles className="w-4 h-4 inline mr-2 text-[#AD74FF]" />
                      AI Insights
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="flex-1 flex flex-col justify-center items-center text-center py-6">
                    <div className="w-10 h-10 rounded-xl bg-[#AD74FF]/10 flex items-center justify-center mb-3">
                      <Sparkles className="w-5 h-5 text-[#AD74FF]" />
                    </div>
                    <p className="text-xs text-white/65 max-w-[180px]">
                      AI-powered insights will unlock as your transaction history grows
                    </p>
                  </CardContent>
                </Card>
              </motion.div>
            </div>
          </>
        ) : (
          /* ── Empty State ── */
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.6 }}
            className="mt-8 flex flex-col items-center text-center"
          >
            <div className="relative w-24 h-24 mb-8">
              <motion.div
                className="absolute inset-0 rounded-3xl"
                style={{
                  background: "conic-gradient(from 0deg, #0BC18D, #2CA2FF, #AD74FF, #ECAA0B, #FF6F69, #0BC18D)",
                  opacity: 0.15,
                }}
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 8, ease: "linear" }}
              />
              <div className="absolute inset-[3px] rounded-[21px] bg-[#10082a] flex items-center justify-center">
                <Upload className="w-8 h-8 text-[#0BC18D]/70" />
              </div>
            </div>

            <h2 className="text-xl font-bold text-white mb-2">
              Welcome to FinTRK
            </h2>
            <p className="text-sm text-white/70 max-w-sm mb-8">
              Upload your first bank statement and watch AI transform raw data into
              unprecedented financial intelligence.
            </p>

            <Link href="/dashboard/upload">
              <Button
                size="lg"
                className="bg-gradient-to-r from-[#0BC18D] to-[#2CA2FF] text-white font-semibold px-8 text-base hover:opacity-90 transition-opacity"
              >
                <Upload className="w-5 h-5 mr-2" />
                Upload Your First Statement
              </Button>
            </Link>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-16 max-w-2xl w-full">
              {[
                { icon: BarChart3, title: "Smart Categories", desc: "AI auto-classifies every transaction into detailed spending categories", color: "#0BC18D" },
                { icon: Globe, title: "Global Intelligence", desc: "Multi-currency support with hidden FX spread detection", color: "#AD74FF" },
                { icon: Sparkles, title: "Pattern Detection", desc: "Automatically discovers recurring charges and spending trends", color: "#2CA2FF" },
              ].map((f, i) => (
                <motion.div
                  key={f.title}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 + i * 0.1 }}
                  className="rounded-xl border border-white/10 bg-white/[0.04] p-5 text-left"
                >
                  <f.icon className="w-5 h-5 mb-3" style={{ color: f.color }} />
                  <h3 className="text-sm font-semibold text-white/90 mb-1">{f.title}</h3>
                  <p className="text-[11px] text-white/60 leading-relaxed">{f.desc}</p>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
