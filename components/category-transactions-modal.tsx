"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import {
  CategoryTransactionsTable,
  type CategoryTransaction,
  type UserCategory,
} from "@/components/category-transactions-table";
import {
  FINTRK_TRANSACTIONS_CHANGED,
} from "@/lib/notify-transactions-changed";
import { formatMonthKeyLabel } from "@/lib/month-date-range";

export type CategoryTransactionsFilter =
  | { mode: "category"; name: string; level?: "category" | "subcategory"; dateFrom?: string; dateTo?: string }
  | { mode: "merchant"; name: string; dateFrom?: string; dateTo?: string };

function filterKey(filter: CategoryTransactionsFilter): string {
  const dates = filter.dateFrom && filter.dateTo ? `:${filter.dateFrom}:${filter.dateTo}` : "";
  return filter.mode === "merchant"
    ? `merchant:${filter.name}${dates}`
    : `category:${filter.level ?? "category"}:${filter.name}${dates}`;
}

function filterTitle(filter: CategoryTransactionsFilter): string {
  return filter.mode === "merchant"
    ? `${filter.name} transactions`
    : `${filter.name} transactions`;
}

function filterSubtitle(filter: CategoryTransactionsFilter): string {
  const period =
    filter.dateFrom && filter.dateTo
      ? formatMonthKeyLabel(filter.dateFrom.slice(0, 7))
      : "All-time";
  if (filter.mode === "merchant") {
    return `${period} · spending intelligence · this merchant only`;
  }
  if (filter.level === "subcategory") {
    return `${period} · spending intelligence · this subcategory only`;
  }
  return `${period} · spending intelligence · this category only`;
}

function filterEmptyMessage(filter: CategoryTransactionsFilter): string {
  if (filter.mode === "merchant") {
    return `No spending intelligence transactions found for ${filter.name}.`;
  }
  return `No spending intelligence transactions found for ${filter.name}.`;
}

export function CategoryTransactionsModal({
  filter,
  currency,
  onClose,
}: {
  filter: CategoryTransactionsFilter;
  currency: string;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<CategoryTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [userCategories, setUserCategories] = useState<UserCategory[]>([]);
  const [allLabels, setAllLabels] = useState<string[]>([]);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  useEffect(() => {
    fetch("/api/user-categories")
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.categories)) setUserCategories(d.categories);
      })
      .catch(() => {});
    fetch("/api/transactions/labels")
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.labels)) setAllLabels(d.labels);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const handler = () => setRefreshTick((t) => t + 1);
    window.addEventListener(FINTRK_TRANSACTIONS_CHANGED, handler);
    return () => window.removeEventListener(FINTRK_TRANSACTIONS_CHANGED, handler);
  }, []);

  const loadTransactions = useCallback(() => {
    const ctrl = new AbortController();
    setLoading(true);
    const params = new URLSearchParams({
      flow: "outflow",
      scope: "spending-intelligence",
    });
    if (filter.mode === "merchant") {
      params.set("merchant", filter.name);
    } else {
      params.set("category", filter.name);
      params.set("level", filter.level ?? "category");
    }
    if (currency) params.set("currency", currency);
    if (filter.dateFrom) params.set("dateFrom", filter.dateFrom);
    if (filter.dateTo) params.set("dateTo", filter.dateTo);
    void fetch(`/api/cashflow/category-transactions?${params}`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((json) => {
        if (ctrl.signal.aborted) return;
        setRows(Array.isArray(json.data) ? json.data : []);
      })
      .catch((err) => {
        if ((err as Error).name !== "AbortError") setRows([]);
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });
    return () => ctrl.abort();
  }, [filter, currency]);

  useEffect(() => loadTransactions(), [loadTransactions, refreshTick]);

  if (typeof document === "undefined") return null;

  const title = filterTitle(filter);
  const ariaLabel = title;

  return createPortal(
    <div
      className="fixed inset-0 z-[220] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="relative flex h-[calc(100dvh-2rem)] max-h-[calc(100dvh-2rem)] w-full max-w-6xl min-h-0 flex-col sm:h-[calc(100dvh-3rem)] sm:max-h-[calc(100dvh-3rem)]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 z-10 grid h-8 w-8 place-items-center rounded-lg border border-chart-border bg-chart-surface text-muted-foreground backdrop-blur-sm transition-colors hover:bg-chart-hover hover:text-white"
          aria-label="Close transactions"
        >
          <X className="h-4 w-4" />
        </button>
        <CategoryTransactionsTable
          title={title}
          subtitle={filterSubtitle(filter)}
          rows={rows}
          loading={loading}
          userCategories={userCategories}
          allLabels={allLabels}
          onRowsChange={setRows}
          emptyMessage={filterEmptyMessage(filter)}
          fillHeight
        />
      </div>
    </div>,
    document.body,
  );
}

/** Stable key for lifting modal state in parent components. */
export { filterKey };
