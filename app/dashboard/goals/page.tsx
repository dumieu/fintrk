"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Target, Plus, X, Trophy, Calendar } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

interface Goal {
  id: number;
  name: string;
  targetAmount: string;
  currentAmount: string;
  currency: string;
  targetDate: string | null;
  isCompleted: boolean;
}

export default function GoalsPage() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", targetAmount: "", currency: "USD", targetDate: "" });

  const fetchGoals = useCallback(async () => {
    try {
      const res = await fetch("/api/goals");
      const data = await res.json();
      if (data.data) setGoals(data.data);
    } catch {} finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchGoals(); }, [fetchGoals]);

  const createGoal = async () => {
    if (!form.name || !form.targetAmount) return;
    try {
      await fetch("/api/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          targetAmount: parseFloat(form.targetAmount),
          currency: form.currency,
          targetDate: form.targetDate || undefined,
        }),
      });
      setShowCreate(false);
      setForm({ name: "", targetAmount: "", currency: "USD", targetDate: "" });
      fetchGoals();
    } catch {}
  };

  return (
    <div className="min-h-[80vh] bg-gradient-to-b from-[#08051a] via-[#10082a] to-[#160e35]">
      <div className="mx-auto max-w-7xl px-4 py-8">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-8 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white sm:text-3xl">Financial Goals</h1>
            <p className="mt-1 text-sm text-white/70">Track your savings targets and milestones</p>
          </div>
          <Button onClick={() => setShowCreate(true)} className="bg-gradient-to-r from-[#0BC18D] to-[#2CA2FF] text-white font-semibold hover:opacity-90">
            <Plus className="w-4 h-4 mr-2" />
            New Goal
          </Button>
        </motion.div>

        <AnimatePresence>
          {showCreate && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="mb-6 overflow-hidden">
              <Card className="border-[#0BC18D]/25 bg-[#0BC18D]/[0.05] text-white">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm">Create Goal</CardTitle>
                  <Button variant="ghost" size="icon" onClick={() => setShowCreate(false)} className="text-white/60 hover:text-white w-8 h-8">
                    <X className="w-4 h-4" />
                  </Button>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                    <input type="text" placeholder="Goal name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                      className="rounded-lg border border-white/15 bg-white/[0.05] px-3 py-2.5 text-sm text-white placeholder:text-white/45 focus:border-[#0BC18D]/40 focus:outline-none" />
                    <input type="number" placeholder="Target amount" value={form.targetAmount} onChange={(e) => setForm((f) => ({ ...f, targetAmount: e.target.value }))}
                      className="rounded-lg border border-white/15 bg-white/[0.05] px-3 py-2.5 text-sm text-white placeholder:text-white/45 focus:border-[#0BC18D]/40 focus:outline-none" />
                    <input type="date" value={form.targetDate} onChange={(e) => setForm((f) => ({ ...f, targetDate: e.target.value }))}
                      className="rounded-lg border border-white/15 bg-white/[0.05] px-3 py-2.5 text-sm text-white focus:border-[#0BC18D]/40 focus:outline-none" />
                    <Button onClick={createGoal} className="bg-[#0BC18D] text-white hover:bg-[#0BC18D]/90">Create</Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        {goals.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2">
            {goals.map((goal, i) => {
              const target = parseFloat(goal.targetAmount);
              const current = parseFloat(goal.currentAmount);
              const pct = target > 0 ? (current / target) * 100 : 0;
              const color = goal.isCompleted ? "#0BC18D" : pct > 75 ? "#ECAA0B" : "#2CA2FF";

              return (
                <motion.div key={goal.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                  <Card className={cn("border-white/[0.10] bg-white/[0.04] text-white", goal.isCompleted && "border-[#0BC18D]/25 bg-[#0BC18D]/[0.04]")}>
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${color}15` }}>
                            {goal.isCompleted ? <Trophy className="w-5 h-5 text-[#0BC18D]" /> : <Target className="w-5 h-5" style={{ color }} />}
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-white/95">{goal.name}</p>
                            {goal.targetDate && (
                              <p className="text-[10px] text-white/50 flex items-center gap-1 mt-0.5">
                                <Calendar className="w-2.5 h-2.5" />
                                {formatDate(goal.targetDate, "long")}
                              </p>
                            )}
                          </div>
                        </div>
                        <span className="text-xs font-bold tabular-nums" style={{ color }}>
                          {pct.toFixed(0)}%
                        </span>
                      </div>

                      <div className="h-3 rounded-full bg-white/8 overflow-hidden mb-3">
                        <motion.div className="h-full rounded-full" style={{ backgroundColor: color }}
                          initial={{ width: 0 }} animate={{ width: `${Math.min(pct, 100)}%` }} transition={{ duration: 0.8 }} />
                      </div>

                      <div className="flex justify-between text-xs text-white/65">
                        <span>{formatCurrency(current, goal.currency)} saved</span>
                        <span className="font-medium text-white/85">{formatCurrency(target, goal.currency)} target</span>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        ) : (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center justify-center py-20 text-center">
            <Target className="w-10 h-10 text-white/20 mb-4" />
            <p className="text-sm text-white/60 mb-2">No financial goals yet</p>
            <p className="text-xs text-white/45 max-w-xs">Set targets for savings, debt payoff, or investments and watch your progress over time</p>
          </motion.div>
        )}
      </div>
    </div>
  );
}
