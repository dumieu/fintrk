"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CalendarDays, CheckCircle2, FileText, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FINTRK_TRANSACTIONS_CHANGED } from "@/lib/notify-transactions-changed";

type UploadedStatement = {
  id: number;
  name: string;
  account: {
    name: string;
    institutionName: string | null;
    type: string;
  } | null;
  transactionStart: string | null;
  transactionEnd: string | null;
  transactionsImported: number;
  transactionsDuplicate: number;
  processedAt: string;
};

function formatRangeDate(value: string | null): string {
  if (!value) return "—";
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return "—";
  const date = new Date(Date.UTC(year, month - 1, day));
  const dayPart = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    timeZone: "UTC",
  }).format(date);
  const monthPart = new Intl.DateTimeFormat("en-GB", {
    month: "short",
    timeZone: "UTC",
  }).format(date);
  const yearPart = new Intl.DateTimeFormat("en-GB", {
    year: "2-digit",
    timeZone: "UTC",
  }).format(date);
  return `${dayPart}-${monthPart}-${yearPart}`;
}

function accountLabel(statement: UploadedStatement): string {
  if (!statement.account) return "Account unavailable";
  const institution = statement.account.institutionName?.trim();
  return institution ? `${institution} · ${statement.account.name}` : statement.account.name;
}

export function UploadedStatementsList() {
  const [items, setItems] = useState<UploadedStatement[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (mode: "initial" | "refresh" = "refresh") => {
    if (mode === "initial") setLoading(true);
    else setRefreshing(true);
    try {
      const res = await fetch("/api/statements", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { statements?: UploadedStatement[] };
      setItems(data.statements ?? []);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load("initial");
  }, [load]);

  useEffect(() => {
    const onChanged = () => void load("refresh");
    window.addEventListener(FINTRK_TRANSACTIONS_CHANGED, onChanged);
    return () => window.removeEventListener(FINTRK_TRANSACTIONS_CHANGED, onChanged);
  }, [load]);

  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.18 }}
      className="mt-6 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.035]"
    >
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
            <FileText className="h-4 w-4 text-[#0BC18D]" />
            Uploaded statements
          </h2>
          <p className="mt-0.5 text-[11px] text-white/50">
            Permanent history of successfully processed statements for this account.
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => void load("refresh")}
          disabled={refreshing || loading}
          className="text-white/60 hover:text-white"
        >
          {refreshing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          Refresh
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 px-5 py-8 text-xs text-white/55">
          <Loader2 className="h-4 w-4 animate-spin text-[#AD74FF]" />
          Loading uploaded statements…
        </div>
      ) : items.length === 0 ? (
        <div className="px-5 py-8 text-center">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.05]">
            <CalendarDays className="h-4 w-4 text-white/45" />
          </div>
          <p className="mt-3 text-sm font-medium text-white/75">No successful uploads yet</p>
          <p className="mt-1 text-xs text-white/45">
            Once a statement finishes processing, it will appear here automatically.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-white/10">
          <AnimatePresence initial={false}>
            {items.map((statement) => (
              <motion.div
                key={statement.id}
                layout
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="grid gap-3 px-5 py-3 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto] sm:items-center"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-[#0BC18D]" />
                    <p className="truncate text-xs font-semibold text-white/90">{statement.name}</p>
                  </div>
                  <p className="mt-0.5 pl-6 text-[10px] text-white/45">
                    {statement.transactionsImported.toLocaleString("en-US")} imported
                    {statement.transactionsDuplicate > 0
                      ? ` · ${statement.transactionsDuplicate.toLocaleString("en-US")} duplicate txns`
                      : ""}
                  </p>
                </div>
                <p className="min-w-0 truncate text-xs text-white/65 sm:text-right">
                  {accountLabel(statement)}
                </p>
                <p className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-right text-[11px] font-medium tabular-nums text-white/80">
                  {formatRangeDate(statement.transactionStart)} : {formatRangeDate(statement.transactionEnd)}
                </p>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </motion.section>
  );
}
