"use client";

import { useState, useCallback, useRef } from "react";
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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import Papa from "papaparse";
import * as XLSX from "xlsx";

const ACCEPT = ".csv,.xls,.xlsx,.pdf";
const MAX_SIZE = 10 * 1024 * 1024;

type LocalStatus = "queued" | "parsing" | "submitting" | "submitted" | "error";

interface QueuedFile {
  id: string;
  file: File;
  status: LocalStatus;
  error: string | null;
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

export function StatementUpload() {
  const [queue, setQueue] = useState<QueuedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback((files: FileList | File[]) => {
    const newItems: QueuedFile[] = [];
    for (const f of Array.from(files)) {
      if (f.size > MAX_SIZE) continue;
      const ext = f.name.split(".").pop()?.toLowerCase();
      if (!ext || !["csv", "xls", "xlsx", "pdf"].includes(ext)) continue;

      newItems.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        file: f,
        status: "queued",
        error: null,
      });
    }
    if (newItems.length > 0) {
      setQueue((prev) => [...prev, ...newItems]);
    }
  }, []);

  const removeFile = useCallback((id: string) => {
    setQueue((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const updateFile = useCallback((id: string, patch: Partial<QueuedFile>) => {
    setQueue((prev) => prev.map((f) => f.id === id ? { ...f, ...patch } : f));
  }, []);

  const submitAll = useCallback(async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);

    const pending = queue.filter((f) => f.status === "queued");

    const structuredPayloads: { data: Record<string, unknown>[]; headers: string[]; fileName: string }[] = [];
    const binaryFiles: { id: string; file: File }[] = [];

    for (const item of pending) {
      updateFile(item.id, { status: "parsing" });
      try {
        const parsed = await clientParse(item.file);
        if (parsed) {
          structuredPayloads.push({ data: parsed.rows, headers: parsed.headers, fileName: item.file.name });
          updateFile(item.id, { status: "submitting" });
        } else {
          binaryFiles.push({ id: item.id, file: item.file });
          updateFile(item.id, { status: "submitting" });
        }
      } catch (err) {
        updateFile(item.id, { status: "error", error: err instanceof Error ? err.message : "Parse failed" });
      }
    }

    if (structuredPayloads.length > 0) {
      try {
        const res = await fetch("/api/ingest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(structuredPayloads.length === 1 ? structuredPayloads[0] : structuredPayloads),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "Submission failed" }));
          for (const item of pending.filter((f) => !f.file.name.endsWith(".pdf"))) {
            updateFile(item.id, { status: "error", error: err.error ?? "Submission failed" });
          }
        } else {
          for (const item of pending.filter((f) => !f.file.name.endsWith(".pdf"))) {
            updateFile(item.id, { status: "submitted" });
          }
        }
      } catch (err) {
        for (const item of pending.filter((f) => !f.file.name.endsWith(".pdf"))) {
          updateFile(item.id, { status: "error", error: err instanceof Error ? err.message : "Network error" });
        }
      }
    }

    if (binaryFiles.length > 0) {
      const formData = new FormData();
      for (const { file } of binaryFiles) {
        formData.append("file", file);
      }
      try {
        const res = await fetch("/api/ingest", { method: "POST", body: formData });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "Submission failed" }));
          for (const { id } of binaryFiles) updateFile(id, { status: "error", error: err.error ?? "Submission failed" });
        } else {
          for (const { id } of binaryFiles) updateFile(id, { status: "submitted" });
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
  }, []);

  const hasQueued = queue.some((f) => f.status === "queued");
  const allSubmitted = queue.length > 0 && queue.every((f) => f.status === "submitted" || f.status === "error");
  const submittedCount = queue.filter((f) => f.status === "submitted").length;
  const errorCount = queue.filter((f) => f.status === "error").length;

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
        <p className="mt-3 text-[11px] text-white/50">Max 10MB per file</p>
      </motion.div>

      <AnimatePresence>
        {queue.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="rounded-2xl border border-white/15 bg-white/[0.04] overflow-hidden"
          >
            <div className="px-5 py-3 border-b border-white/15 flex items-center justify-between">
              <p className="text-xs font-medium text-white/70">
                {queue.length} file{queue.length !== 1 ? "s" : ""}
                {submittedCount > 0 && <span className="text-[#0BC18D] ml-2">{submittedCount} queued for processing</span>}
                {errorCount > 0 && <span className="text-[#FF6F69] ml-2">{errorCount} failed</span>}
              </p>
              {allSubmitted && (
                <Button onClick={reset} variant="ghost" size="sm" className="text-white/60 hover:text-white h-7 text-xs">
                  Clear
                </Button>
              )}
            </div>

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
                    {item.status === "submitted" ? (
                      <div className="w-8 h-8 rounded-lg bg-[#0BC18D]/10 flex items-center justify-center">
                        <CheckCircle2 className="w-4 h-4 text-[#0BC18D]" />
                      </div>
                    ) : item.status === "error" ? (
                      <div className="w-8 h-8 rounded-lg bg-[#FF6F69]/10 flex items-center justify-center">
                        <AlertCircle className="w-4 h-4 text-[#FF6F69]" />
                      </div>
                    ) : (item.status === "parsing" || item.status === "submitting") ? (
                      <div className="w-8 h-8 rounded-lg bg-[#AD74FF]/10 flex items-center justify-center">
                        <Loader2 className="w-4 h-4 text-[#AD74FF] animate-spin" />
                      </div>
                    ) : (
                      <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center">
                        {fileIcon(item.file.name)}
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-white/90 truncate">{item.file.name}</p>
                    <p className="text-[10px] text-white/50">
                      {item.status === "queued" && formatSize(item.file.size)}
                      {item.status === "parsing" && "Parsing file…"}
                      {item.status === "submitting" && "Submitting to server…"}
                      {item.status === "submitted" && (
                        <span className="text-[#0BC18D]">Queued — AI is processing in the background</span>
                      )}
                      {item.status === "error" && <span className="text-[#FF6F69]">{item.error}</span>}
                    </p>
                  </div>

                  <div className="shrink-0">
                    {item.status === "queued" && (
                      <button type="button" onClick={(e) => { e.stopPropagation(); removeFile(item.id); }} className="p-1 text-white/40 hover:text-white/70 transition-colors">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>

            <div className="px-5 py-3 border-t border-white/15 flex items-center justify-between">
              {allSubmitted ? (
                <div className="flex items-center gap-2 w-full">
                  <CheckCircle2 className="w-4 h-4 text-[#0BC18D] shrink-0" />
                  <p className="text-xs text-white/75">
                    All files submitted. AI is processing in the background — you can navigate away safely.
                  </p>
                </div>
              ) : hasQueued && !isSubmitting ? (
                <div className="flex items-center justify-between w-full">
                  <p className="text-[10px] text-white/50">
                    {queue.filter((f) => f.status === "queued").length} file{queue.filter((f) => f.status === "queued").length !== 1 ? "s" : ""} ready
                  </p>
                  <Button
                    onClick={submitAll}
                    className="bg-gradient-to-r from-[#0BC18D] to-[#2CA2FF] text-white font-semibold px-6 hover:opacity-90 transition-opacity"
                    size="sm"
                  >
                    <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                    Process {queue.filter((f) => f.status === "queued").length > 1 ? "All" : ""} with AI
                  </Button>
                </div>
              ) : isSubmitting ? (
                <div className="flex items-center gap-2 w-full justify-center">
                  <Loader2 className="w-4 h-4 text-[#AD74FF] animate-spin" />
                  <p className="text-xs text-white/65">Submitting files…</p>
                </div>
              ) : null}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
