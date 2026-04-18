"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PiggyBank, Plus, X, Wallet, TrendingDown } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

interface Budget {
  id: number;
  name: string;
  amount: string;
  currency: string;
  period: string;
  spent: number;
  categoryName: string | null;
}

export default function BudgetPage() {
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", amount: "", currency: "USD", period: "monthly" });

  const fetchBudgets = useCallback(async () => {
    try {
      const res = await fetch("/api/budgets");
      const data = await res.json();
      if (data.data) setBudgets(data.data);
    } catch {} finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchBudgets(); }, [fetchBudgets]);

  const createBudget = async () => {
    if (!form.name || !form.amount) return;
    try {
      await fetch("/api/budgets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, amount: parseFloat(form.amount) }),
      });
      setShowCreate(false);
      setForm({ name: "", amount: "", currency: "USD", period: "monthly" });
      fetchBudgets();
    } catch {}
  };

  return (
    <div className="min-h-[80vh] bg-gradient-to-b from-[#08051a] via-[#10082a] to-[#160e35]">
      <div className="mx-auto max-w-7xl px-4 py-8">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-8 flex justify-end">
          <Button onClick={() => setShowCreate(true)} className="bg-gradient-to-r from-[#0BC18D] to-[#2CA2FF] text-white font-semibold hover:opacity-90">
            <Plus className="w-4 h-4 mr-2" />
            New Budget
          </Button>
        </motion.div>

        {/* Create Budget Form */}
        <AnimatePresence>
          {showCreate && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="mb-6 overflow-hidden">
              <Card className="border-[#0BC18D]/25 bg-[#0BC18D]/[0.05] text-white">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm">Create Budget</CardTitle>
                  <Button variant="ghost" size="icon" onClick={() => setShowCreate(false)} className="text-white/60 hover:text-white w-8 h-8">
                    <X className="w-4 h-4" />
                  </Button>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                    <input
                      type="text" placeholder="Budget name" value={form.name}
                      onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                      className="rounded-lg border border-white/15 bg-white/[0.05] px-3 py-2.5 text-sm text-white placeholder:text-white/45 focus:border-[#0BC18D]/40 focus:outline-none"
                    />
                    <input
                      type="number" placeholder="Amount" value={form.amount}
                      onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                      className="rounded-lg border border-white/15 bg-white/[0.05] px-3 py-2.5 text-sm text-white placeholder:text-white/45 focus:border-[#0BC18D]/40 focus:outline-none"
                    />
                    <select
                      value={form.period} onChange={(e) => setForm((f) => ({ ...f, period: e.target.value }))}
                      className="rounded-lg border border-white/15 bg-white/[0.05] px-3 py-2.5 text-sm text-white focus:border-[#0BC18D]/40 focus:outline-none"
                    >
                      <option value="weekly">Weekly</option>
                      <option value="monthly">Monthly</option>
                      <option value="quarterly">Quarterly</option>
                      <option value="yearly">Yearly</option>
                    </select>
                    <Button onClick={createBudget} className="bg-[#0BC18D] text-white hover:bg-[#0BC18D]/90">
                      Create
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Budget Cards */}
        {budgets.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {budgets.map((budget, i) => {
              const limit = parseFloat(budget.amount);
              const ratio = limit > 0 ? budget.spent / limit : 0;
              const barColor = ratio < 0.7 ? "#0BC18D" : ratio < 0.9 ? "#ECAA0B" : "#FF6F69";
              const remaining = limit - budget.spent;

              return (
                <motion.div key={budget.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                  <Card className="border-white/[0.10] bg-white/[0.04] text-white">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${barColor}15` }}>
                            <PiggyBank className="w-3.5 h-3.5" style={{ color: barColor }} />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-white/95">{budget.name}</p>
                            <p className="text-[10px] text-white/50 capitalize">{budget.period}</p>
                          </div>
                        </div>
                        <span className="text-[10px] font-bold tabular-nums" style={{ color: barColor }}>
                          {(ratio * 100).toFixed(0)}%
                        </span>
                      </div>

                      <div className="h-2 rounded-full bg-white/8 overflow-hidden mb-3">
                        <motion.div
                          className="h-full rounded-full"
                          style={{ backgroundColor: barColor }}
                          initial={{ width: 0 }}
                          animate={{ width: `${Math.min(ratio * 100, 100)}%` }}
                          transition={{ duration: 0.6 }}
                        />
                      </div>

                      <div className="flex items-center justify-between text-xs">
                        <span className="text-white/70">
                          <TrendingDown className="w-3 h-3 inline mr-1" />
                          {formatCurrency(budget.spent, budget.currency)} spent
                        </span>
                        <span className={cn("font-medium", remaining >= 0 ? "text-[#0BC18D]" : "text-[#FF6F69]")}>
                          {remaining >= 0 ? formatCurrency(remaining, budget.currency) + " left" : formatCurrency(Math.abs(remaining), budget.currency) + " over"}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        ) : (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center justify-center py-20 text-center">
            <Wallet className="w-10 h-10 text-white/20 mb-4" />
            <p className="text-sm text-white/60 mb-2">No budgets set up yet</p>
            <p className="text-xs text-white/45 max-w-xs">
              Create spending limits for different categories to track how well you stick to your financial plan
            </p>
          </motion.div>
        )}
      </div>
    </div>
  );
}
