"use client";

import { useState } from "react";
import { EyeOff, Loader2 } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const ACCENT = "#2CA2FF";
/** Above CategoryTransactionsModal (z-220) and chart fullscreen (z-200). */
const IGNORE_DIALOG_Z = "z-[230]";

export type IgnoreScope = "name" | "item";

export interface IgnoredInfo {
  transactionId: string;
  scope: IgnoreScope;
  /** lower(trim(merchantName ?? rawDescription)) — matches the server name key. */
  nameKey: string;
}

interface Props {
  transactionId: string;
  merchantName: string | null;
  rawDescription: string;
  /** Called after a successful ignore so the parent can drop the row(s) / refetch. */
  onIgnored?: (info: IgnoredInfo) => void;
  className?: string;
}

/**
 * Eye-off icon + confirm dialog. Confirming permanently hides the transaction
 * (or every transaction with the same name) from all analytics, charts, tables,
 * and AI until restored from My Profile > Ignored.
 */
export function IgnoreTransactionButton({
  transactionId,
  merchantName,
  rawDescription,
  onIgnored,
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<IgnoreScope>("name");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const displayName = merchantName?.trim() || rawDescription?.trim() || "this transaction";
  const nameKey = (merchantName ?? rawDescription ?? "").trim().toLowerCase();

  async function confirm() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/transactions/ignore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactionId, scope }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : "Failed to ignore.");
      setOpen(false);
      onIgnored?.({ transactionId, scope, nameKey });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to ignore.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setScope("name");
          setError(null);
          setOpen(true);
        }}
        aria-label={`Ignore transaction ${displayName}`}
        title="Ignore — hide from all analytics"
        className={cn(
          "inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground/50 transition-all hover:bg-[#2CA2FF]/10 hover:text-[#2CA2FF]/80 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#2CA2FF]/70",
          className,
        )}
      >
        <EyeOff className="h-3.5 w-3.5" strokeWidth={2.2} />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className={IGNORE_DIALOG_Z} overlayClassName={IGNORE_DIALOG_Z}>
          <DialogHeader>
            <DialogTitle>Ignore transaction</DialogTitle>
            <DialogDescription>
              Ignored items are permanently removed from every chart, total, table, and AI
              insight until you restore them from My Profile &rsaquo; Ignored.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => setScope("name")}
              className={cn(
                "flex items-start gap-3 rounded-lg border p-3 text-left transition-colors",
                scope === "name"
                  ? "border-[#2CA2FF]/70 bg-[#2CA2FF]/10"
                  : "border-border hover:bg-muted/40",
              )}
            >
              <span
                className={cn(
                  "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2",
                  scope === "name" ? "border-[#2CA2FF]" : "border-muted-foreground/40",
                )}
              >
                {scope === "name" ? (
                  <span className="h-2 w-2 rounded-full" style={{ background: ACCENT }} />
                ) : null}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium text-foreground">
                  All with this name
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  Every transaction named &ldquo;{displayName}&rdquo;
                </span>
              </span>
            </button>

            <button
              type="button"
              onClick={() => setScope("item")}
              className={cn(
                "flex items-start gap-3 rounded-lg border p-3 text-left transition-colors",
                scope === "item"
                  ? "border-[#2CA2FF]/70 bg-[#2CA2FF]/10"
                  : "border-border hover:bg-muted/40",
              )}
            >
              <span
                className={cn(
                  "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2",
                  scope === "item" ? "border-[#2CA2FF]" : "border-muted-foreground/40",
                )}
              >
                {scope === "item" ? (
                  <span className="h-2 w-2 rounded-full" style={{ background: ACCENT }} />
                ) : null}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium text-foreground">Only this item</span>
                <span className="block text-xs text-muted-foreground">
                  Just this single transaction
                </span>
              </span>
            </button>
          </div>

          {error ? <p className="text-sm text-red-400">{error}</p> : null}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button
              onClick={confirm}
              disabled={submitting}
              className="gap-1.5 bg-[#2CA2FF] text-white hover:bg-[#2CA2FF]/90"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <EyeOff className="h-4 w-4" />}
              Ignore
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
