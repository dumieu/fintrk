"use client";

import { useCallback, useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { motion } from "framer-motion";
import { ArrowUpDown, Loader2 } from "lucide-react";
import {
  TRANSACTION_TABLE_ROW_GRID,
  type TransactionRowData,
  type TransactionTableUserCategory,
} from "@/components/transaction-table-cells";
import { TransactionTableRow } from "@/components/transaction-table-row";
import { dispatchTransactionsChanged } from "@/lib/notify-transactions-changed";
import { cn } from "@/lib/utils";

export type CategoryTransaction = TransactionRowData;

export type UserCategory = TransactionTableUserCategory;

export type CategoryTransactionSortKey =
  | "postedDate"
  | "description"
  | "label"
  | "category"
  | "amount"
  | "flags"
  | "note";

export function CategoryTransactionsTable({
  title,
  subtitle,
  rows,
  loading,
  userCategories,
  allLabels,
  onRowsChange,
  emptyMessage = "No transactions found for this category.",
  fillHeight = false,
}: {
  title: string;
  subtitle: string;
  rows: CategoryTransaction[];
  loading: boolean;
  userCategories: UserCategory[];
  allLabels: string[];
  onRowsChange: Dispatch<SetStateAction<CategoryTransaction[]>>;
  emptyMessage?: string;
  fillHeight?: boolean;
}) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<{ key: CategoryTransactionSortKey; dir: "asc" | "desc" }>({
    key: "amount",
    dir: "desc",
  });

  const normalizedCategories = useMemo<TransactionTableUserCategory[]>(
    () =>
      userCategories.map((cat) => ({
        id: cat.id,
        name: cat.name,
        color: cat.color ?? null,
        subcategories: cat.subcategories ?? [],
      })),
    [userCategories],
  );

  const flatCategories = useMemo(
    () =>
      normalizedCategories.flatMap((cat) => [
        { id: cat.id, name: cat.name, parentName: null as string | null },
        ...cat.subcategories.map((sub) => ({ id: sub.id, name: sub.name, parentName: cat.name })),
      ]),
    [normalizedCategories],
  );

  const categoryText = useCallback((txn: CategoryTransaction) => {
    return txn.subcategoryName
      ? `${txn.categoryName ?? ""} ${txn.subcategoryName}`.trim()
      : txn.categoryName ?? "";
  }, []);

  const flagsText = useCallback((txn: CategoryTransaction) => {
    return [txn.countryIso?.toUpperCase(), txn.isRecurring ? "Recurring" : null].filter(Boolean).join(" ");
  }, []);

  const sortedRows = useMemo(() => {
    const dir = sort.dir === "asc" ? 1 : -1;
    const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
    const valueFor = (txn: CategoryTransaction): string | number => {
      switch (sort.key) {
        case "postedDate":
          return new Date(txn.postedDate).getTime() || 0;
        case "description":
          return txn.merchantName?.trim() || txn.rawDescription;
        case "label":
          return txn.label?.trim() || "";
        case "category":
          return categoryText(txn);
        case "amount":
          return Math.abs(Number.parseFloat(txn.baseAmount) || 0);
        case "flags":
          return flagsText(txn);
        case "note":
          return txn.note?.trim() || "";
      }
    };
    return [...rows].sort((a, b) => {
      const av = valueFor(a);
      const bv = valueFor(b);
      const result =
        typeof av === "number" && typeof bv === "number"
          ? av - bv
          : collator.compare(String(av), String(bv));
      return result === 0 ? collator.compare(a.id, b.id) : result * dir;
    });
  }, [categoryText, flagsText, rows, sort]);

  const toggleSort = useCallback((key: CategoryTransactionSortKey) => {
    setSort((current) => ({
      key,
      dir: current.key === key && current.dir === "desc" ? "asc" : "desc",
    }));
  }, []);

  const patchTransaction = useCallback(
    async (
      txn: CategoryTransaction,
      body: Record<string, unknown>,
      applyLocal: (row: CategoryTransaction) => CategoryTransaction,
    ) => {
      const before = rows;
      onRowsChange((current) => current.map((row) => (row.id === txn.id ? applyLocal(row) : row)));
      try {
        const res = await fetch("/api/transactions", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transactionId: txn.id, ...body }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : "Update failed");

        const merchantName = txn.merchantName?.trim();
        const updateMerchantRows =
          merchantName &&
          ((body.warningFlag !== undefined && typeof json.bulkWarningCount === "number" && json.bulkWarningCount > 1) ||
            (body.applyToAllMerchants === true && typeof json.bulkMerchantCount === "number" && json.bulkMerchantCount > 1) ||
            (body.labelApplyScope === "merchant" && typeof json.bulkLabelCount === "number" && json.bulkLabelCount > 1) ||
            (body.categoryApplyScope === "merchant" && typeof json.bulkCategoryCount === "number" && json.bulkCategoryCount > 1));
        if (updateMerchantRows) {
          const key = merchantName.toLowerCase();
          onRowsChange((current) =>
            current.map((row) => (row.merchantName?.trim().toLowerCase() === key ? applyLocal(row) : row)),
          );
        }
        if (
          body.categoryApplyScope === "label" &&
          typeof body.categoryLabel === "string" &&
          typeof json.bulkCategoryCount === "number" &&
          json.bulkCategoryCount > 1
        ) {
          const key = body.categoryLabel.trim();
          onRowsChange((current) =>
            current.map((row) => (row.label?.trim() === key ? applyLocal(row) : row)),
          );
        }
        dispatchTransactionsChanged();
      } catch (err) {
        onRowsChange(before);
        window.alert(err instanceof Error ? err.message : "Update failed");
      }
    },
    [onRowsChange, rows],
  );

  const saveMerchantName = useCallback(
    async (id: string, newName: string | null, applyAll: boolean, oldName: string | null) => {
      if (!newName) return;
      const txn = rows.find((r) => r.id === id);
      if (!txn) return;
      await patchTransaction(
        txn,
        {
          merchantName: newName,
          applyToAllMerchants: applyAll,
          oldMerchantName: oldName,
        },
        (row) => ({ ...row, merchantName: newName }),
      );
    },
    [patchTransaction, rows],
  );

  const saveTransactionLabel = useCallback(
    (id: string, label: string | null, scope: "this" | "merchant", mName: string | null) => {
      if (scope === "merchant" && mName) {
        const mLower = mName.trim().toLowerCase();
        onRowsChange((prev) =>
          prev.map((t) => (t.merchantName?.trim().toLowerCase() === mLower ? { ...t, label } : t)),
        );
      } else {
        onRowsChange((prev) => prev.map((t) => (t.id === id ? { ...t, label } : t)));
      }
    },
    [onRowsChange],
  );

  const saveTransactionNote = useCallback(
    (id: string, note: string | null, scope: "this" | "merchant", mName: string | null) => {
      if (scope === "merchant" && mName) {
        const mLower = mName.trim().toLowerCase();
        onRowsChange((prev) =>
          prev.map((t) => (t.merchantName?.trim().toLowerCase() === mLower ? { ...t, note } : t)),
        );
      } else {
        onRowsChange((prev) => prev.map((t) => (t.id === id ? { ...t, note } : t)));
      }
    },
    [onRowsChange],
  );

  const saveCategory = useCallback(
    (
      txnId: string,
      categoryId: number,
      scope: "this" | "merchant" | "label",
      merchantName: string | null,
      label: string | null,
      resolvedCategoryName: string | null,
      resolvedSubcategoryName: string | null,
    ) => {
      const txn = rows.find((r) => r.id === txnId);
      if (!txn) return;
      const picked = flatCategories.find((cat) => cat.id === categoryId);
      if (!picked) return;
      const patch = {
        categoryId,
        categoryName: resolvedCategoryName ?? picked.parentName ?? picked.name,
        subcategoryName: resolvedSubcategoryName ?? (picked.parentName ? picked.name : null),
      };
      void patchTransaction(
        txn,
        {
          categoryId,
          categoryApplyScope: scope,
          categoryMerchantName: scope === "merchant" && merchantName ? merchantName : undefined,
          categoryLabel: scope === "label" ? label : undefined,
        },
        (row) => {
          if (scope === "merchant" && merchantName && row.merchantName?.trim().toLowerCase() === merchantName.trim().toLowerCase()) {
            return { ...row, ...patch };
          }
          if (scope === "label" && label && row.label?.trim() === label.trim()) {
            return { ...row, ...patch };
          }
          if (row.id === txnId) return { ...row, ...patch };
          return row;
        },
      );
    },
    [flatCategories, patchTransaction, rows],
  );

  const toggleWarningFlag = useCallback(
    async (txn: CategoryTransaction) => {
      const nextWarningFlag = !txn.warningFlag;
      await patchTransaction(txn, { warningFlag: nextWarningFlag }, (row) => ({
        ...row,
        warningFlag: nextWarningFlag,
      }));
    },
    [patchTransaction],
  );

  const deleteSelected = useCallback(async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    if (!window.confirm(`Delete ${ids.length} transaction${ids.length === 1 ? "" : "s"} permanently?`)) return;
    const beforeRows = rows;
    onRowsChange((current) => current.filter((row) => !selectedIds.has(row.id)));
    setSelectedIds(new Set());
    try {
      const res = await fetch("/api/transactions", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactionIds: ids }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : "Delete failed");
      dispatchTransactionsChanged();
    } catch (err) {
      onRowsChange(beforeRows);
      setSelectedIds(new Set(ids));
      window.alert(err instanceof Error ? err.message : "Delete failed");
    }
  }, [onRowsChange, rows, selectedIds]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "overflow-hidden rounded-2xl border border-chart-border bg-chart-surface text-card-foreground shadow-chart shadow-[0_30px_80px_-20px_rgba(0,0,0,0.55)]",
        fillHeight && "flex min-h-0 flex-1 flex-col",
      )}
    >
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-chart-border bg-chart-surface/95 px-4 py-3 backdrop-blur-md">
        <div>
          <p className="text-sm font-semibold text-white">{title}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">{subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          {selectedIds.size > 0 ? (
            <button
              type="button"
              onClick={() => void deleteSelected()}
              className="rounded-full border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider text-red-200 transition hover:border-red-400/50 hover:bg-red-500/15"
            >
              {selectedIds.size.toLocaleString()} selected · Delete
            </button>
          ) : null}
          <span className="rounded-full border border-chart-border bg-chart-muted px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            {loading ? "Loading" : `${rows.length.toLocaleString()} shown`}
          </span>
        </div>
      </div>

      {loading ? (
        <div
          className={cn(
            "flex items-center justify-center gap-3 px-4 py-10",
            fillHeight ? "min-h-0 flex-1" : "min-h-40",
          )}
        >
          <Loader2 className="h-6 w-6 animate-spin text-[#0BC18D]" />
          <span className="text-xs text-muted-foreground">Loading transactions…</span>
        </div>
      ) : rows.length === 0 ? (
        <div
          className={cn(
            "flex items-center justify-center px-4 py-10 text-center text-sm text-muted-foreground",
            fillHeight ? "min-h-0 flex-1" : "min-h-40",
          )}
        >
          {emptyMessage}
        </div>
      ) : (
        <div
          className={cn(
            "scrollbar-slim-dark overflow-auto",
            fillHeight ? "min-h-0 flex-1" : "max-h-[520px]",
          )}
        >
          <div
            className={cn(
              "sticky top-0 z-10 hidden min-w-[1040px] items-center justify-items-stretch gap-2 border-b border-chart-border bg-chart-surface/98 px-3 py-2.5 text-center text-[10px] font-medium tracking-wide text-muted-foreground backdrop-blur-md sm:grid sm:px-4 sm:py-3",
              TRANSACTION_TABLE_ROW_GRID,
            )}
          >
            <div className="flex min-w-0 items-center justify-center gap-1">
              <span className="inline-flex h-7 w-7 shrink-0" aria-hidden />
              <SortableCategoryHeader label="Date" sortKey="postedDate" activeSort={sort} onSort={toggleSort} />
            </div>
            <SortableCategoryHeader label="Description" sortKey="description" activeSort={sort} onSort={toggleSort} />
            <SortableCategoryHeader label="Label" sortKey="label" activeSort={sort} onSort={toggleSort} />
            <div className="flex min-w-0 w-full justify-center px-0.5 text-center">
              <span className="line-clamp-2 max-w-full text-[10px] font-medium leading-tight tracking-wide text-muted-foreground">
                Category / Subcategory
              </span>
            </div>
            <SortableCategoryHeader label="Amount" sortKey="amount" activeSort={sort} onSort={toggleSort} />
            <span className="block w-full text-center">Flags</span>
            <SortableCategoryHeader label="Note" sortKey="note" activeSort={sort} onSort={toggleSort} />
            <span className="sr-only">Select and warning</span>
          </div>
          <div className="min-w-[1040px] divide-y divide-white/10">
            {sortedRows.map((txn, i) => (
              <TransactionTableRow
                key={txn.id}
                txn={txn}
                rowIndex={i}
                userCategories={normalizedCategories}
                allLabels={allLabels}
                selected={selectedIds.has(txn.id)}
                onToggleSelect={() =>
                  setSelectedIds((current) => {
                    const next = new Set(current);
                    if (next.has(txn.id)) next.delete(txn.id);
                    else next.add(txn.id);
                    return next;
                  })
                }
                onSavedMerchantName={saveMerchantName}
                onSavedLabel={saveTransactionLabel}
                onSavedCategory={saveCategory}
                onSavedNote={saveTransactionNote}
                onToggleWarning={() => void toggleWarningFlag(txn)}
                onIgnored={(info) =>
                  onRowsChange((current) =>
                    current.filter((row) =>
                      info.scope === "item"
                        ? row.id !== info.transactionId
                        : (row.merchantName ?? row.rawDescription ?? "")
                            .trim()
                            .toLowerCase() !== info.nameKey,
                    ),
                  )
                }
                animate={false}
              />
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}

function SortableCategoryHeader({
  label,
  sortKey,
  activeSort,
  onSort,
}: {
  label: string;
  sortKey: CategoryTransactionSortKey;
  activeSort: { key: CategoryTransactionSortKey; dir: "asc" | "desc" };
  onSort: (key: CategoryTransactionSortKey) => void;
}) {
  const active = activeSort.key === sortKey;
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      className={cn(
        "flex min-w-0 w-full items-center justify-center gap-1 text-center transition-colors hover:text-foreground",
        active ? "text-foreground" : "text-muted-foreground",
      )}
      aria-sort={active ? (activeSort.dir === "asc" ? "ascending" : "descending") : "none"}
      title={`Sort by ${label}`}
    >
      <span className="min-w-0 truncate">{label}</span>
      <ArrowUpDown
        className={cn(
          "h-3 w-3 shrink-0 opacity-70",
          active && activeSort.dir === "asc" && "rotate-180",
        )}
        aria-hidden
      />
    </button>
  );
}


