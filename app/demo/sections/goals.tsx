"use client";

import { Flag, Plus } from "lucide-react";
import { useState } from "react";
import { useDemo, useDemoSnapshot } from "../demo-store";
import { num } from "../derived";
import { formatCurrency } from "@/lib/format";

export function DemoGoalsSection() {
  const snap = useDemoSnapshot();
  const { dispatch, toast } = useDemo();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");

  const submit = () => {
    if (!name || !target) return;
    dispatch({
      type: "ADD_GOAL",
      payload: {
        id: Date.now(),
        name,
        target_amount: parseFloat(target).toFixed(2),
        current_amount: "0",
        currency: snap.family.homeCurrency,
        target_date: null,
        linked_account_ids: null,
        is_completed: false,
      },
    });
    toast(`Created “${name}” · demo only`, "ok");
    setName("");
    setTarget("");
    setAdding(false);
  };

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 sm:p-6">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-bold text-white">
            <Flag className="h-4 w-4 text-[#0BC18D]" />
            Goals
          </h2>
          <p className="text-[11px] text-white/55">
            Try adding a "New car" goal — it'll appear in the list, then vanish when you refresh.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-[11px] font-semibold text-white/85 hover:bg-white/10"
        >
          <Plus className="h-3.5 w-3.5" /> {adding ? "Cancel" : "New goal"}
        </button>
      </div>

      {adding && (
        <div className="mt-4 grid gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-3 sm:grid-cols-[1fr_180px_auto]">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Goal name (e.g. Family vacation 2027)"
            className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs text-white"
          />
          <input
            type="number"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder="Target amount"
            className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs text-white tabular-nums"
          />
          <button
            type="button"
            onClick={submit}
            className="rounded-lg bg-gradient-to-r from-[#0BC18D] to-[#2CA2FF] px-4 py-2 text-xs font-semibold text-white"
          >
            Save
          </button>
        </div>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {snap.goals.map((g) => {
          const cur = num(g.current_amount);
          const tgt = num(g.target_amount);
          const pct = tgt > 0 ? Math.min(cur / tgt, 1) : 0;
          return (
            <div key={g.id} className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <p className="text-xs font-semibold text-white/90">{g.name}</p>
              <p className="mt-1 text-[10px] text-white/55">
                {formatCurrency(cur, g.currency)} / {formatCurrency(tgt, g.currency)}{g.target_date && ` · by ${g.target_date}`}
              </p>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full bg-gradient-to-r from-[#0BC18D] to-[#2CA2FF] transition-all"
                  style={{ width: `${pct * 100}%` }}
                />
              </div>
              <div className="mt-2 flex items-center justify-between text-[10px]">
                <span className="text-white/55">{(pct * 100).toFixed(1)}% funded</span>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      dispatch({
                        type: "UPDATE_GOAL",
                        id: g.id,
                        patch: { current_amount: (cur + 500).toFixed(2) },
                      });
                      toast(`${g.name} +$500`, "ok");
                    }}
                    className="rounded border border-white/15 px-2 py-0.5 text-[10px] text-white/75 hover:bg-white/10"
                  >+$500</button>
                  <button
                    type="button"
                    onClick={() => {
                      dispatch({ type: "DELETE_GOAL", id: g.id });
                      toast(`Removed ${g.name}`, "warn");
                    }}
                    className="rounded border border-white/15 px-2 py-0.5 text-[10px] text-white/55 hover:bg-[#FF6F69]/15 hover:text-[#FF6F69]"
                  >Remove</button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
