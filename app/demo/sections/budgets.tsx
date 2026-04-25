"use client";

import { useMemo } from "react";
import { Target, AlertTriangle } from "lucide-react";
import { useDemo, useDemoSnapshot } from "../demo-store";
import { categoryById, num, ymdToDate } from "../derived";
import { formatCurrency } from "@/lib/format";

export function DemoBudgetsSection() {
  const snap = useDemoSnapshot();
  const { dispatch, toast } = useDemo();
  const catMap = categoryById(snap);

  // Compute current-month spend per budget category.
  const monthSpend = useMemo(() => {
    const now = snap.transactions.length ? ymdToDate(snap.transactions[0]!.posted_date) : new Date();
    const yr = now.getUTCFullYear();
    const mo = now.getUTCMonth();
    // Walk parent + children for each budget category.
    const childrenByParent = new Map<number, number[]>();
    for (const c of snap.categories) {
      if (c.parent_id != null) {
        const arr = childrenByParent.get(c.parent_id) ?? [];
        arr.push(c.id);
        childrenByParent.set(c.parent_id, arr);
      }
    }
    const spendByCat = new Map<number, number>();
    for (const t of snap.transactions) {
      if (!t.category_id) continue;
      const d = ymdToDate(t.posted_date);
      if (d.getUTCFullYear() !== yr || d.getUTCMonth() !== mo) continue;
      const a = num(t.base_amount);
      if (a >= 0) continue;
      spendByCat.set(t.category_id, (spendByCat.get(t.category_id) ?? 0) + Math.abs(a));
    }
    // Roll children into their direct id.
    return (catId: number): number => {
      let total = spendByCat.get(catId) ?? 0;
      for (const cid of childrenByParent.get(catId) ?? []) total += spendByCat.get(cid) ?? 0;
      return total;
    };
  }, [snap]);

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 sm:p-6">
      <div>
        <h2 className="flex items-center gap-2 text-base font-bold text-white">
          <Target className="h-4 w-4 text-[#ECAA0B]" />
          Budgets
        </h2>
        <p className="text-[11px] text-white/55">Click any budget to bump it up or down.</p>
      </div>

      <div className="mt-4 grid gap-2">
        {snap.budgets.map((b) => {
          const cap = num(b.amount);
          const spent = b.category_id ? monthSpend(b.category_id) : 0;
          const pct = Math.min(spent / Math.max(cap, 1), 1.5);
          const overage = pct > 1;
          const cat = b.category_id ? catMap.get(b.category_id) : null;
          const color = cat?.color ?? "#2CA2FF";
          return (
            <div key={b.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold text-white/90">{b.name}</p>
                  <p className="text-[10px] text-white/45">
                    {formatCurrency(spent, b.currency)} of {formatCurrency(cap, b.currency)} · {b.period}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      dispatch({ type: "UPDATE_BUDGET", id: b.id, patch: { amount: (cap - 100).toString() } });
                      toast(`${b.name} -$100`, "info");
                    }}
                    className="rounded border border-white/15 px-2 py-0.5 text-[10px] text-white/65 hover:bg-white/10"
                  >−$100</button>
                  <button
                    type="button"
                    onClick={() => {
                      dispatch({ type: "UPDATE_BUDGET", id: b.id, patch: { amount: (cap + 100).toString() } });
                      toast(`${b.name} +$100`, "info");
                    }}
                    className="rounded border border-white/15 px-2 py-0.5 text-[10px] text-white/65 hover:bg-white/10"
                  >+$100</button>
                </div>
              </div>
              <div className="relative h-2 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full transition-all"
                  style={{
                    width: `${Math.min(pct * 100, 100)}%`,
                    background: overage ? "linear-gradient(90deg,#FF6F69,#ECAA0B)" : color,
                  }}
                />
              </div>
              {overage && (
                <p className="mt-1.5 inline-flex items-center gap-1 text-[10px] font-semibold text-[#FF6F69]">
                  <AlertTriangle className="h-3 w-3" />
                  Over by {formatCurrency(spent - cap, b.currency)} ({((pct - 1) * 100).toFixed(0)}%)
                </p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
