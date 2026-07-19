"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Download, FileText, Loader2, Lock, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { StatementViewerTarget } from "@/lib/open-statement-viewer";

interface StatementViewerProps extends StatementViewerTarget {
  onClose: () => void;
}

function isPdf(mime: string | null | undefined, name: string | null | undefined): boolean {
  if (mime?.includes("pdf")) return true;
  return Boolean(name && /\.pdf$/i.test(name));
}

function isImage(mime: string | null | undefined): boolean {
  return Boolean(mime && mime.startsWith("image/"));
}

export function StatementViewer({ statementId, fileName, mimeType, onClose }: StatementViewerProps) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [textPreview, setTextPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const urlRef = useRef<string | null>(null);

  const fileUrl = `/api/statements/${statementId}/file`;
  const pdf = isPdf(mimeType, fileName);
  const image = isImage(mimeType);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setTextPreview(null);

    (async () => {
      try {
        const res = await fetch(fileUrl, { cache: "no-store" });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(typeof body.error === "string" ? body.error : "Could not load file");
        }
        const blob = await res.blob();
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        urlRef.current = url;
        setBlobUrl(url);
        if (!pdf && !image) {
          const text = await blob.slice(0, 200_000).text();
          if (!cancelled) setTextPreview(text);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load file");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current);
        urlRef.current = null;
      }
    };
  }, [fileUrl, pdf, image]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const download = useCallback(() => {
    const a = document.createElement("a");
    a.href = `${fileUrl}?download=1`;
    a.rel = "noopener";
    a.download = fileName?.trim() || "statement";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }, [fileUrl, fileName]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[2147483000] flex items-center justify-center bg-black/80 p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={`Statement ${fileName ?? statementId}`}
      onClick={onClose}
    >
      <div
        className="flex h-full max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-chart-border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-chart-border px-4 py-3">
          <FileText className="h-4 w-4 shrink-0 text-[#0BC18D]" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-foreground">
              {fileName?.trim() || `Statement #${statementId}`}
            </p>
            <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <Lock className="h-2.5 w-2.5 text-[#0BC18D]" aria-hidden />
              Decrypted just now · AES-256 encrypted at rest
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            onClick={download}
            disabled={loading || Boolean(error)}
            className="bg-[#0BC18D] text-white hover:bg-[#0BC18D]/90"
          >
            <Download className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            Download
          </Button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto bg-[#0a0a0a]">
          {loading ? (
            <div className="flex h-full items-center justify-center gap-2 py-16 text-xs text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin text-[#AD74FF]" aria-hidden />
              Decrypting statement…
            </div>
          ) : error ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 px-6 py-16 text-center">
              <p className="text-sm font-medium text-[#FF6F69]">{error}</p>
              <p className="text-xs text-muted-foreground">
                The original file may not have been retained for this statement.
              </p>
            </div>
          ) : pdf && blobUrl ? (
            <object data={blobUrl} type="application/pdf" className="h-full min-h-[60vh] w-full">
              <iframe src={blobUrl} title="Statement PDF" className="h-full min-h-[60vh] w-full" />
            </object>
          ) : image && blobUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={blobUrl} alt="" className="mx-auto max-h-full w-auto" />
          ) : textPreview != null ? (
            <pre className="min-h-full w-full overflow-auto whitespace-pre-wrap break-words px-4 py-3 font-mono text-[11px] leading-relaxed text-foreground/85">
              {textPreview}
            </pre>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-6 py-16 text-center">
              <FileText className="h-8 w-8 text-muted-foreground/50" aria-hidden />
              <p className="text-sm text-muted-foreground">Preview not available for this file type.</p>
              <Button type="button" onClick={download} className="bg-[#0BC18D] text-white hover:bg-[#0BC18D]/90">
                <Download className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                Download to view
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
