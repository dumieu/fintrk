"use client";

import { FileText, FileSpreadsheet, X, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";

interface StatementPreviewProps {
  file: File;
  parsedData: { headers: string[]; rows: Record<string, unknown>[] } | null;
  onReset: () => void;
  onSubmit: () => void;
}

function fileTypeIcon(name: string) {
  if (name.endsWith(".pdf")) return <FileText className="w-5 h-5 text-[#FF6F69]" />;
  return <FileSpreadsheet className="w-5 h-5 text-[#0BC18D]" />;
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function StatementPreview({ file, parsedData, onReset, onSubmit }: StatementPreviewProps) {
  return (
    <motion.div
      key="preview"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden"
    >
      <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
        <div className="flex items-center gap-3">
          {fileTypeIcon(file.name)}
          <div>
            <p className="text-sm font-medium text-white truncate max-w-[200px] sm:max-w-none">{file.name}</p>
            <p className="text-[11px] text-white/40">{formatSize(file.size)}</p>
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={onReset} className="text-white/40 hover:text-white">
          <X className="w-4 h-4" />
        </Button>
      </div>

      {parsedData && parsedData.rows.length > 0 && (
        <div className="overflow-x-auto max-h-64 scrollbar-thin">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-black/60 backdrop-blur">
              <tr>
                {parsedData.headers.map((h) => (
                  <th key={h} className="text-left px-3 py-2 text-white/50 font-medium whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {parsedData.rows.slice(0, 10).map((row, i) => (
                <tr key={i} className="border-t border-white/5">
                  {parsedData.headers.map((h) => (
                    <td key={h} className="px-3 py-2 text-white/70 whitespace-nowrap max-w-[200px] truncate">
                      {String(row[h] ?? "")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {parsedData.rows.length > 10 && (
            <p className="px-3 py-2 text-[11px] text-white/30 text-center border-t border-white/5">
              Showing 10 of {parsedData.rows.length} rows
            </p>
          )}
        </div>
      )}

      {!parsedData && (
        <div className="px-5 py-8 text-center">
          <FileText className="w-10 h-10 mx-auto mb-3 text-[#AD74FF]/60" />
          <p className="text-sm text-white/50">
            PDF will be processed by AI vision — no preview available
          </p>
        </div>
      )}

      <div className="flex items-center gap-3 px-5 py-4 border-t border-white/10">
        <Button onClick={onReset} variant="ghost" className="text-white/50 hover:text-white">
          Try another file
        </Button>
        <div className="flex-1" />
        <Button
          onClick={onSubmit}
          className="bg-gradient-to-r from-[#0BC18D] to-[#2CA2FF] text-white font-semibold px-6 hover:opacity-90 transition-opacity"
        >
          <Sparkles className="w-4 h-4 mr-2" />
          Process with AI
        </Button>
      </div>
    </motion.div>
  );
}
