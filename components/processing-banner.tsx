"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, CheckCircle2, AlertCircle, X } from "lucide-react";
import { useRouter } from "next/navigation";

interface StatementStatus {
  id: number;
  fileName: string;
  status: "uploaded" | "processing" | "completed" | "failed";
  transactionsImported: number | null;
  transactionsDuplicate: number | null;
  aiError: string | null;
  createdAt: string;
}

interface StatusResponse {
  processing: StatementStatus[];
  recentlyFinished: StatementStatus[];
}

const POLL_ACTIVE_MS = 3000;
const POLL_IDLE_MS = 15000;

export function ProcessingBanner() {
  const [data, setData] = useState<StatusResponse | null>(null);
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());
  const router = useRouter();

  const poll = useCallback(async () => {
    try {
      const res = await fetch("/api/ingest/status");
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch {}
  }, []);

  useEffect(() => {
    poll();
    const hasActive = (data?.processing?.length ?? 0) > 0;
    const interval = setInterval(poll, hasActive ? POLL_ACTIVE_MS : POLL_IDLE_MS);
    return () => clearInterval(interval);
  }, [poll, data?.processing?.length]);

  const dismiss = (id: number) => {
    setDismissed((prev) => new Set(prev).add(id));
  };

  if (!data) return null;

  const active = data.processing;
  const finished = data.recentlyFinished.filter((s) => !dismissed.has(s.id));

  if (active.length === 0 && finished.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      <AnimatePresence mode="popLayout">
        {active.map((stmt) => (
          <motion.div
            key={stmt.id}
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            layout
            className="pointer-events-auto rounded-xl border border-[#AD74FF]/30 bg-[#160e35]/95 backdrop-blur-md shadow-lg shadow-[#AD74FF]/10 p-3 flex items-center gap-3"
          >
            <div className="w-8 h-8 rounded-lg bg-[#AD74FF]/10 flex items-center justify-center shrink-0">
              <Loader2 className="w-4 h-4 text-[#AD74FF] animate-spin" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-white/90 truncate">{stmt.fileName}</p>
              <p className="text-[10px] text-[#AD74FF]/85">AI is processing…</p>
            </div>
            <div className="shrink-0">
              <motion.div
                className="w-2 h-2 rounded-full bg-[#AD74FF]"
                animate={{ opacity: [1, 0.3, 1] }}
                transition={{ repeat: Infinity, duration: 1.5 }}
              />
            </div>
          </motion.div>
        ))}

        {finished.map((stmt) => (
          <motion.div
            key={`done-${stmt.id}`}
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            layout
            className={`pointer-events-auto rounded-xl border p-3 flex items-center gap-3 backdrop-blur-md shadow-lg cursor-pointer ${
              stmt.status === "completed"
                ? "border-[#0BC18D]/30 bg-[#160e35]/95 shadow-[#0BC18D]/10"
                : "border-[#FF6F69]/30 bg-[#160e35]/95 shadow-[#FF6F69]/10"
            }`}
            onClick={() => {
              if (stmt.status === "completed") {
                router.push("/dashboard/transactions");
              }
              dismiss(stmt.id);
            }}
          >
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
              stmt.status === "completed" ? "bg-[#0BC18D]/10" : "bg-[#FF6F69]/10"
            }`}>
              {stmt.status === "completed" ? (
                <CheckCircle2 className="w-4 h-4 text-[#0BC18D]" />
              ) : (
                <AlertCircle className="w-4 h-4 text-[#FF6F69]" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-white/90 truncate">{stmt.fileName}</p>
              <p className="text-[10px]">
                {stmt.status === "completed" ? (
                  <span className="text-[#0BC18D]">
                    {stmt.transactionsImported ?? 0} imported
                    {(stmt.transactionsDuplicate ?? 0) > 0 && `, ${stmt.transactionsDuplicate} duplicates`}
                    {" · click to view"}
                  </span>
                ) : (
                  <span className="text-[#FF6F69]">{stmt.aiError ?? "Processing failed"}</span>
                )}
              </p>
            </div>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); dismiss(stmt.id); }}
              className="p-1 text-white/40 hover:text-white/70 transition-colors shrink-0"
            >
              <X className="w-3 h-3" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
