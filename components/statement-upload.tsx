"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Upload,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Sparkles,
  FileText,
  FileSpreadsheet,
  X,
  Ban,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { dispatchTransactionsChanged } from "@/lib/notify-transactions-changed";

const ACCEPT = ".csv,.xls,.xlsx,.pdf";
const MAX_SIZE = 1 * 1024 * 1024;
const SESSION_KEY = "fintrk:upload-queue";

type LocalStatus = "queued" | "deferred" | "parsing" | "checking" | "submitting" | "submitted" | "completed" | "failed" | "duplicate" | "error";

const BATCH_LIMIT = 100;

interface QueuedFile {
  id: string;
  fileName: string;
  fileSize: number;
  hash: string;
  status: LocalStatus;
  error: string | null;
  statementId?: number;
  imported?: number;
  duplicateTxns?: number;
}

interface SerializedQueue {
  items: QueuedFile[];
  ts: number;
}

function fileFingerprint(f: File): string {
  const normalName = f.name.trim().toLowerCase();
  return `${normalName}|${f.size}|${f.lastModified}`;
}

function fileIcon(name: string) {
  if (name.endsWith(".pdf")) return <FileText className="w-4 h-4 text-[#FF6F69]" />;
  if (name.endsWith(".xls") || name.endsWith(".xlsx")) return <FileSpreadsheet className="w-4 h-4 text-[#0BC18D]" />;
  return <FileSpreadsheet className="w-4 h-4 text-[#2CA2FF]" />;
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function clientParse(f: File): Promise<{ headers: string[]; rows: Record<string, unknown>[] } | null> {
  if (f.type === "application/pdf" || f.name.endsWith(".pdf")) return null;

  if (f.type === "text/csv" || f.name.endsWith(".csv")) {
    const text = await f.text();
    return new Promise((resolve, reject) => {
      Papa.parse(text, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          resolve({ headers: results.meta.fields ?? [], rows: results.data as Record<string, unknown>[] });
        },
        error: () => reject(new Error("Failed to parse CSV")),
      });
    });
  }

  if (f.name.endsWith(".xls") || f.name.endsWith(".xlsx") ||
      f.type === "application/vnd.ms-excel" ||
      f.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") {
    const buffer = await f.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) throw new Error("No sheets found");
    const sheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
    if (jsonData.length === 0) throw new Error("Empty spreadsheet");
    return { headers: Object.keys(jsonData[0]), rows: jsonData };
  }

  return null;
}

async function isPasswordProtected(f: File): Promise<boolean> {
  const ext = f.name.split(".").pop()?.toLowerCase();

  if (ext === "pdf") {
    const buf = await f.arrayBuffer();
    const bytes = new Uint8Array(buf);
    const text = new TextDecoder("latin1").decode(bytes);
    return text.includes("/Encrypt");
  }

  if (ext === "xls" || ext === "xlsx") {
    try {
      const buf = await f.arrayBuffer();
      XLSX.read(buf, { type: "array" });
      return false;
    } catch {
      return true;
    }
  }

  return false;
}

async function checkDuplicatesOnServer(
  files: { hash: string; size: number; name: string }[],
): Promise<Map<string, { isDuplicate: boolean; reason: string | null }>> {
  const result = new Map<string, { isDuplicate: boolean; reason: string | null }>();
  try {
    const res = await fetch("/api/ingest/check-duplicates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ files }),
    });
    if (res.ok) {
      const { results } = await res.json();
      for (const r of results as { hash: string; isDuplicate: boolean; reason: string | null }[]) {
        result.set(r.hash, { isDuplicate: r.isDuplicate, reason: r.reason });
      }
    }
  } catch {}
  return result;
}

function persistQueue(items: QueuedFile[]) {
  try {
    const data: SerializedQueue = { items, ts: Date.now() };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(data));
  } catch {}
}

function loadPersistedQueue(): QueuedFile[] {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw) as SerializedQueue;
    if (Date.now() - data.ts > 30 * 60 * 1000) {
      sessionStorage.removeItem(SESSION_KEY);
      return [];
    }
    return data.items.filter((f) => f.status !== "queued" && f.status !== "parsing" && f.status !== "checking" && f.status !== "submitting" && f.status !== "deferred");
  } catch {
    return [];
  }
}

export function StatementUpload() {
  const [queue, setQueue] = useState<QueuedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileStash = useRef<Map<string, File>>(new Map());
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    const restored = loadPersistedQueue();
    if (restored.length > 0) setQueue(restored);
  }, []);

  useEffect(() => {
    if (queue.length > 0) persistQueue(queue);
  }, [queue]);

  // Poll status + trigger AI processing one statement at a time.
  // Each /api/ingest/process call gets its own 300s serverless invocation,
  // so even 100 statements won't time out.
  const pendingCount = queue.filter((f) => f.status === "submitted").length;
  const processingRef = useRef(false);
  useEffect(() => {
    if (pendingCount === 0) return;

    let cancelled = false;

    const triggerNext = async (activelyProcessingIds: Set<number>, uploadedIds: Set<number>) => {
      if (processingRef.current || cancelled) return;
      // Only trigger if nothing is currently being processed by AI
      if (activelyProcessingIds.size > 0) return;

      // Find a submitted item whose statement is "uploaded" (saved but AI hasn't started)
      const candidate = queue.find(
        (item) =>
          item.status === "submitted" &&
          item.statementId &&
          uploadedIds.has(item.statementId),
      );
      if (!candidate?.statementId) return;

      processingRef.current = true;
      try {
        await fetch("/api/ingest/process", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ statementId: candidate.statementId }),
        });
      } catch {}
      processingRef.current = false;
    };

    const poll = async () => {
      try {
        const res = await fetch("/api/ingest/status");
        if (!res.ok || cancelled) return;
        const data = await res.json() as {
          processing: { id: number; fileName: string; status: string }[];
          recentlyFinished: { id: number; fileName: string; status: string; transactionsImported: number | null; transactionsDuplicate: number | null; aiError: string | null }[];
        };

        const processingIds = new Set(data.processing.map((s) => s.id));
        const finishedMap = new Map(data.recentlyFinished.map((s) => [s.id, s]));
        const finishedByName = new Map(data.recentlyFinished.map((s) => [s.fileName, s]));

        setQueue((prev) => {
          let becameCompleted = false;
          const next = prev.map((item) => {
            if (item.status !== "submitted") return item;

            if (item.statementId) {
              if (processingIds.has(item.statementId)) return item;
              const finished = finishedMap.get(item.statementId);
              if (finished) {
                if (finished.status === "completed") {
                  becameCompleted = true;
                  return { ...item, status: "completed" as const, imported: finished.transactionsImported ?? 0, duplicateTxns: finished.transactionsDuplicate ?? 0 };
                }
                return { ...item, status: "failed" as const, error: finished.aiError ?? "Processing failed" };
              }
            }

            const byName = finishedByName.get(item.fileName);
            if (byName && !processingIds.has(byName.id)) {
              if (byName.status === "completed") {
                becameCompleted = true;
                return { ...item, status: "completed" as const, statementId: byName.id, imported: byName.transactionsImported ?? 0, duplicateTxns: byName.transactionsDuplicate ?? 0 };
              }
              return { ...item, status: "failed" as const, statementId: byName.id, error: byName.aiError ?? "Processing failed" };
            }

            if (item.statementId && !processingIds.has(item.statementId) && !finishedMap.has(item.statementId)) {
              becameCompleted = true;
              return { ...item, status: "completed" as const, imported: 0, duplicateTxns: 0 };
            }

            return item;
          });
          if (becameCompleted) queueMicrotask(() => dispatchTransactionsChanged());
          return next;
        });

        // Separate "uploaded" (waiting for AI) from "processing" (AI running)
        const activelyProcessingIds = new Set(
          data.processing.filter((s) => s.status === "processing").map((s) => s.id),
        );
        const uploadedIds = new Set(
          data.processing.filter((s) => s.status === "uploaded").map((s) => s.id),
        );

        // Trigger AI for the next unprocessed statement (one at a time)
        void triggerNext(activelyProcessingIds, uploadedIds);
      } catch {}
    };

    poll();
    const interval = setInterval(poll, 4000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [pendingCount, queue]);

  // Auto-promote deferred files when active batch slots free up
  useEffect(() => {
    const activeCount = queue.filter((f) =>
      f.status === "queued" || f.status === "parsing" || f.status === "submitting" || f.status === "submitted" || f.status === "checking",
    ).length;
    const deferredCount = queue.filter((f) => f.status === "deferred").length;
    if (deferredCount === 0 || activeCount >= BATCH_LIMIT) return;

    const slotsToFill = Math.min(BATCH_LIMIT - activeCount, deferredCount);
    if (slotsToFill <= 0) return;

    let promoted = 0;
    setQueue((prev) =>
      prev.map((item) => {
        if (item.status !== "deferred" || promoted >= slotsToFill) return item;
        promoted++;
        return { ...item, status: "queued", error: null };
      }),
    );
  }, [queue]);

  const addFiles = useCallback(async (files: FileList | File[]) => {
    const candidates: { file: File; hash: string }[] = [];
    const rejected: QueuedFile[] = [];

    for (const f of Array.from(files)) {
      if (f.size > MAX_SIZE) continue;
      const ext = f.name.split(".").pop()?.toLowerCase();
      if (!ext || !["csv", "xls", "xlsx", "pdf"].includes(ext)) continue;
      candidates.push({ file: f, hash: fileFingerprint(f) });
    }
    if (candidates.length === 0) return;

    // Dedup against current queue
    const currentHashes = new Set(queue.map((q) => q.hash));
    const fresh = candidates.filter((c) => !currentHashes.has(c.hash));
    if (fresh.length === 0) return;

    // Check for password-protected files
    const checked: { file: File; hash: string }[] = [];
    for (const c of fresh) {
      if (await isPasswordProtected(c.file)) {
        rejected.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          fileName: c.file.name,
          fileSize: c.file.size,
          hash: c.hash,
          status: "error",
          error: "Password-protected files are not supported",
        });
      } else {
        checked.push(c);
      }
    }

    // Immediately add to queue as "checking"
    const newItems: QueuedFile[] = checked.map((c) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      fileName: c.file.name,
      fileSize: c.file.size,
      hash: c.hash,
      status: "checking" as const,
      error: null,
    }));

    for (const c of checked) fileStash.current.set(c.hash, c.file);
    setQueue((prev) => [...prev, ...rejected, ...newItems]);

    if (checked.length === 0) return;

    // Server-side duplicate check
    const serverResults = await checkDuplicatesOnServer(
      fresh.map((c) => ({ hash: c.hash, size: c.file.size, name: c.file.name })),
    );

    setQueue((prev) => {
      const alreadyQueued = prev.filter((f) => f.status === "queued" || f.status === "parsing" || f.status === "submitting" || f.status === "submitted").length;
      let slotsLeft = Math.max(0, BATCH_LIMIT - alreadyQueued);

      return prev.map((item) => {
        const check = serverResults.get(item.hash);
        if (item.status !== "checking") return item;
        if (check?.isDuplicate && check.reason !== "previously_failed") {
          return { ...item, status: "duplicate", error: "Already uploaded — skipped to save AI costs" };
        }
        if (slotsLeft > 0) {
          slotsLeft--;
          return { ...item, status: "queued" };
        }
        return { ...item, status: "deferred", error: null };
      });
    });
  }, [queue]);

  const removeFile = useCallback((id: string) => {
    setQueue((prev) => {
      const updated = prev.filter((f) => f.id !== id);
      if (updated.length === 0) {
        try { sessionStorage.removeItem(SESSION_KEY); } catch {}
      }
      return updated;
    });
  }, []);

  const updateFile = useCallback((id: string, patch: Partial<QueuedFile>) => {
    setQueue((prev) => prev.map((f) => f.id === id ? { ...f, ...patch } : f));
  }, []);

  const submitAll = useCallback(async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);

    const pending = queue.filter((f) => f.status === "queued");
    if (pending.length === 0) { setIsSubmitting(false); return; }

    const structuredPayloads: { data: Record<string, unknown>[]; headers: string[]; fileName: string; fileHash: string; id: string }[] = [];
    const binaryFiles: { id: string; file: File; hash: string }[] = [];

    for (const item of pending) {
      const file = fileStash.current.get(item.hash);
      if (!file) {
        updateFile(item.id, { status: "error", error: "File reference lost — please re-add" });
        continue;
      }
      updateFile(item.id, { status: "parsing" });
      try {
        const parsed = await clientParse(file);
        if (parsed) {
          structuredPayloads.push({ data: parsed.rows, headers: parsed.headers, fileName: file.name, fileHash: item.hash, id: item.id });
          updateFile(item.id, { status: "submitting" });
        } else {
          binaryFiles.push({ id: item.id, file, hash: item.hash });
          updateFile(item.id, { status: "submitting" });
        }
      } catch (err) {
        updateFile(item.id, { status: "error", error: err instanceof Error ? err.message : "Parse failed" });
      }
    }

    if (structuredPayloads.length > 0) {
      try {
        const payloads = structuredPayloads.map(({ data, headers, fileName, fileHash }) => ({ data, headers, fileName, fileHash }));
        const res = await fetch("/api/ingest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payloads.length === 1 ? payloads[0] : payloads),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "Submission failed" }));
          for (const item of structuredPayloads) {
            updateFile(item.id, { status: "error", error: err.error ?? "Submission failed" });
          }
        } else {
          const json = await res.json();
          const stmtIds: number[] = json.statementIds ?? [];
          const fileNames: string[] = json.files ?? [];
          const dupSkipped: string[] = json.duplicatesSkipped ?? [];
          for (const item of structuredPayloads) {
            if (dupSkipped.includes(item.fileName)) {
              updateFile(item.id, { status: "duplicate", error: "Server rejected — already processed" });
            } else {
              const idx = fileNames.indexOf(item.fileName);
              updateFile(item.id, { status: "submitted", statementId: idx >= 0 ? stmtIds[idx] : undefined });
            }
          }
        }
      } catch (err) {
        for (const item of structuredPayloads) {
          updateFile(item.id, { status: "error", error: err instanceof Error ? err.message : "Network error" });
        }
      }
    }

    if (binaryFiles.length > 0) {
      const formData = new FormData();
      const hashMap: Record<string, string> = {};
      for (const { file, hash } of binaryFiles) {
        formData.append("file", file);
        hashMap[file.name] = hash;
      }
      formData.append("fileHashes", JSON.stringify(hashMap));
      try {
        const res = await fetch("/api/ingest", { method: "POST", body: formData });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "Submission failed" }));
          for (const { id } of binaryFiles) updateFile(id, { status: "error", error: err.error ?? "Submission failed" });
        } else {
          const json = await res.json();
          const stmtIds: number[] = json.statementIds ?? [];
          const fileNames: string[] = json.files ?? [];
          const dupSkipped: string[] = json.duplicatesSkipped ?? [];
          for (const bf of binaryFiles) {
            const file = fileStash.current.get(bf.hash);
            const name = file?.name ?? "";
            if (dupSkipped.includes(name)) {
              updateFile(bf.id, { status: "duplicate", error: "Server rejected — already processed" });
            } else {
              const idx = fileNames.indexOf(name);
              updateFile(bf.id, { status: "submitted", statementId: idx >= 0 ? stmtIds[idx] : undefined });
            }
          }
        }
      } catch (err) {
        for (const { id } of binaryFiles) {
          updateFile(id, { status: "error", error: err instanceof Error ? err.message : "Network error" });
        }
      }
    }

    setIsSubmitting(false);
  }, [queue, isSubmitting, updateFile]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    addFiles(e.dataTransfer.files);
  }, [addFiles]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) addFiles(e.target.files);
    e.target.value = "";
  }, [addFiles]);

  const reset = useCallback(() => {
    setQueue([]);
    setIsSubmitting(false);
    fileStash.current.clear();
    try { sessionStorage.removeItem(SESSION_KEY); } catch {}
  }, []);

  const hasQueued = queue.some((f) => f.status === "queued");
  const hasChecking = queue.some((f) => f.status === "checking");
  const hasSubmitted = queue.some((f) => f.status === "submitted");
  const terminalStatuses: LocalStatus[] = ["completed", "failed", "error", "duplicate"];
  const allDone = queue.length > 0 && queue.every((f) => terminalStatuses.includes(f.status));
  const completedCount = queue.filter((f) => f.status === "completed").length;
  const submittedCount = queue.filter((f) => f.status === "submitted").length;
  const duplicateCount = queue.filter((f) => f.status === "duplicate").length;
  const errorCount = queue.filter((f) => f.status === "error" || f.status === "failed").length;
  const deferredCount = queue.filter((f) => f.status === "deferred").length;
  const queuedCount = queue.filter((f) => f.status === "queued").length;

  return (
    <div className="w-full max-w-3xl mx-auto space-y-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={cn(
          "relative cursor-pointer rounded-2xl border-2 border-dashed p-6 sm:p-10 text-center transition-all duration-300",
          isDragging
            ? "border-[#0BC18D] bg-[#0BC18D]/5 scale-[1.02] shadow-[0_0_40px_rgba(11,193,141,0.15)]"
            : "border-white/15 hover:border-white/25 hover:bg-white/[0.04]",
        )}
      >
        <div className="absolute inset-0 rounded-2xl overflow-hidden pointer-events-none">
          <div className={cn(
            "absolute inset-0 rounded-2xl transition-opacity duration-500",
            isDragging ? "opacity-100" : "opacity-0",
          )} style={{
            background: "conic-gradient(from 0deg, #0BC18D, #2CA2FF, #AD74FF, #ECAA0B, #FF6F69, #0BC18D)",
            mask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
            maskComposite: "exclude",
            WebkitMaskComposite: "xor",
            padding: "2px",
          }} />
        </div>

        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          multiple
          onChange={handleFileInput}
          className="hidden"
        />

        <motion.div
          animate={isDragging ? { scale: 1.1, y: -4 } : { scale: 1, y: 0 }}
          className="mb-3 mx-auto w-14 h-14 rounded-2xl bg-[#0BC18D]/10 flex items-center justify-center"
        >
          <Upload className="w-6 h-6 text-[#0BC18D]" />
        </motion.div>

        <h3 className="text-lg font-semibold text-white mb-1">
          {queue.length > 0 ? "Drop more statements" : "Drop your bank statements here"}
        </h3>
        <p className="text-sm text-white/65 mb-4">
          or click to browse — drop multiple files at once
        </p>

        <div className="flex flex-wrap justify-center gap-2">
          {[".CSV", ".XLS", ".XLSX", ".PDF"].map((ext) => (
            <span key={ext} className="px-3 py-1 rounded-full text-[11px] font-mono font-medium bg-white/8 text-white/70 border border-white/15">
              {ext}
            </span>
          ))}
        </div>
        <p className="mt-3 text-[11px] text-white/50">Max 1MB per file</p>
      </motion.div>

      <AnimatePresence>
        {queue.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="rounded-2xl border border-white/15 bg-white/[0.04] overflow-hidden"
          >
            <div className="shrink-0 px-5 py-3 border-b border-white/15 flex items-center justify-between">
              <p className="text-xs font-medium text-white/70">
                {queue.length} file{queue.length !== 1 ? "s" : ""}
                {submittedCount > 0 && <span className="text-[#0BC18D] ml-2">{submittedCount} queued for processing</span>}
                {deferredCount > 0 && <span className="text-[#2CA2FF] ml-2">{deferredCount} queued next</span>}
                {duplicateCount > 0 && <span className="text-[#ECAA0B] ml-2">{duplicateCount} duplicate{duplicateCount !== 1 ? "s" : ""} skipped</span>}
                {errorCount > 0 && <span className="text-[#FF6F69] ml-2">{errorCount} failed</span>}
              </p>
              {allDone && (
                <Button onClick={reset} variant="ghost" size="sm" className="text-white/60 hover:text-white h-7 text-xs">
                  Clear
                </Button>
              )}
            </div>

            <div className="max-h-[min(52vh,28rem)] min-h-0 overflow-y-auto overscroll-y-contain [scrollbar-gutter:stable]">
              <div className="divide-y divide-white/10">
              {queue.map((item) => (
                <motion.div
                  key={item.id}
                  layout
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, height: 0 }}
                  className="px-5 py-3 flex items-center gap-3"
                >
                  <div className="shrink-0">
                    {item.status === "completed" ? (
                      <div className="w-8 h-8 rounded-lg bg-[#0BC18D]/10 flex items-center justify-center">
                        <CheckCircle2 className="w-4 h-4 text-[#0BC18D]" />
                      </div>
                    ) : item.status === "submitted" ? (
                      <div className="w-8 h-8 rounded-lg bg-[#AD74FF]/10 flex items-center justify-center">
                        <Loader2 className="w-4 h-4 text-[#AD74FF] animate-spin" />
                      </div>
                    ) : item.status === "failed" ? (
                      <div className="w-8 h-8 rounded-lg bg-[#FF6F69]/10 flex items-center justify-center">
                        <AlertCircle className="w-4 h-4 text-[#FF6F69]" />
                      </div>
                    ) : item.status === "duplicate" ? (
                      <div className="w-8 h-8 rounded-lg bg-[#ECAA0B]/10 flex items-center justify-center">
                        <Ban className="w-4 h-4 text-[#ECAA0B]" />
                      </div>
                    ) : item.status === "error" ? (
                      <div className="w-8 h-8 rounded-lg bg-[#FF6F69]/10 flex items-center justify-center">
                        <AlertCircle className="w-4 h-4 text-[#FF6F69]" />
                      </div>
                    ) : (item.status === "parsing" || item.status === "submitting" || item.status === "checking") ? (
                      <div className="w-8 h-8 rounded-lg bg-[#AD74FF]/10 flex items-center justify-center">
                        <Loader2 className="w-4 h-4 text-[#AD74FF] animate-spin" />
                      </div>
                    ) : item.status === "deferred" ? (
                      <div className="w-8 h-8 rounded-lg bg-[#2CA2FF]/10 flex items-center justify-center">
                        {fileIcon(item.fileName)}
                      </div>
                    ) : (
                      <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center">
                        {fileIcon(item.fileName)}
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-white/90 truncate">{item.fileName}</p>
                    <p className="text-[10px] text-white/50">
                      {item.status === "queued" && <>{formatSize(item.fileSize)}</>}
                      {item.status === "deferred" && <span className="text-[#2CA2FF]">Waiting — next batch</span>}
                      {item.status === "checking" && "Checking for duplicates…"}
                      {item.status === "parsing" && "Parsing file…"}
                      {item.status === "submitting" && "Submitting to server…"}
                      {item.status === "submitted" && (
                        <span className="text-[#AD74FF]">AI is processing…</span>
                      )}
                      {item.status === "completed" && (
                        <span className="text-[#0BC18D]">
                          {item.imported ?? 0} imported{(item.duplicateTxns ?? 0) > 0 && `, ${item.duplicateTxns} duplicate txns`}
                        </span>
                      )}
                      {item.status === "failed" && (
                        <span className="text-[#FF6F69]">{item.error ?? "Processing failed"}</span>
                      )}
                      {item.status === "duplicate" && (
                        <span className="text-[#ECAA0B]">{item.error}</span>
                      )}
                      {item.status === "error" && <span className="text-[#FF6F69]">{item.error}</span>}
                    </p>
                  </div>

                  <div className="shrink-0">
                    {(item.status === "queued" || item.status === "deferred" || item.status === "duplicate" || item.status === "error" || item.status === "completed" || item.status === "failed") && (
                      <button type="button" onClick={(e) => { e.stopPropagation(); removeFile(item.id); }} className="p-1 text-white/40 hover:text-white/70 transition-colors">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </motion.div>
              ))}
              </div>
            </div>

            <div className="shrink-0 px-5 py-3 border-t border-white/15 flex items-center justify-between">
              {allDone ? (
                <div className="flex items-center gap-2 w-full">
                  {duplicateCount > 0 && completedCount === 0 && errorCount === 0 ? (
                    <>
                      <Ban className="w-4 h-4 text-[#ECAA0B] shrink-0" />
                      <p className="text-xs text-white/75">
                        {duplicateCount === 1 ? "This file was" : "All files were"} already processed — no AI costs incurred.
                      </p>
                    </>
                  ) : completedCount > 0 ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-[#0BC18D] shrink-0" />
                      <p className="text-xs text-white/75">
                        Processing complete.
                      </p>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="w-4 h-4 text-[#FF6F69] shrink-0" />
                      <p className="text-xs text-white/75">Done.</p>
                    </>
                  )}
                </div>
              ) : hasSubmitted ? (
                <div className="flex items-center gap-2 w-full justify-center">
                  <Loader2 className="w-4 h-4 text-[#AD74FF] animate-spin" />
                  <p className="text-xs text-white/65">AI is processing — you can navigate away safely</p>
                </div>
              ) : hasQueued && !isSubmitting && !hasChecking ? (
                <div className="flex items-center justify-between w-full">
                  <p className="text-[10px] text-white/50">
                    {queuedCount} file{queuedCount !== 1 ? "s" : ""} ready
                    {deferredCount > 0 && ` · ${deferredCount} more in next batch`}
                  </p>
                  <Button
                    onClick={submitAll}
                    className="bg-gradient-to-r from-[#0BC18D] to-[#2CA2FF] text-white font-semibold px-6 hover:opacity-90 transition-opacity"
                    size="sm"
                  >
                    <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                    Process {queuedCount} with AI
                  </Button>
                </div>
              ) : (isSubmitting || hasChecking) ? (
                <div className="flex items-center gap-2 w-full justify-center">
                  <Loader2 className="w-4 h-4 text-[#AD74FF] animate-spin" />
                  <p className="text-xs text-white/65">{hasChecking ? "Checking files…" : "Submitting files…"}</p>
                </div>
              ) : null}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
