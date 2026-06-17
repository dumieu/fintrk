"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowUpDown,
  ChevronDown,
  Globe,
  Loader2,
  Repeat,
  Search,
} from "lucide-react";
import { CardNetworkLogo } from "@/components/card-network-logo";
import { TransactionCategoryIcon } from "@/components/transaction-category-icon";
import {
  dispatchTransactionsChanged,
} from "@/lib/notify-transactions-changed";
import { cn } from "@/lib/utils";
import {
  accountKindSubtitleLabel,
  cardNetworkLabel,
  formatCurrency,
  formatDate,
  formatMaskedNumber,
  TRANSACTION_SUBTITLE_SEPARATOR,
} from "@/lib/format";
import { countryDisplayName, flagEmoji, transactionTypeLabel } from "@/lib/transaction-flags";

export interface CategoryTransaction {
  id: string;
  postedDate: string;
  rawDescription: string;
  referenceId: string | null;
  merchantName: string | null;
  baseAmount: string;
  baseCurrency: string;
  foreignAmount: string | null;
  foreignCurrency: string | null;
  implicitFxRate: string | null;
  implicitFxSpreadBps: string | null;
  categoryId: number | null;
  categoryConfidence: string | null;
  categoryName: string | null;
  subcategoryName: string | null;
  countryIso: string | null;
  isRecurring: boolean;
  warningFlag: boolean;
  aiConfidence: string | null;
  balanceAfter: string | null;
  note: string | null;
  label: string | null;
  accountId: string;
  statementId: number | null;
  accountType: string | null;
  accountCardNetwork: string | null;
  accountMaskedNumber: string | null;
  accountName: string | null;
  accountInstitutionName: string | null;
  statementFileName: string | null;
  statementPeriodStart: string | null;
  statementPeriodEnd: string | null;
}

export interface UserCategory {
  id: number;
  name: string;
  parentId?: number | null;
  subcategories?: UserCategory[];
}

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
  /** When true, table stretches to fill a modal / flex parent and scrolls internally. */
  fillHeight?: boolean;
}) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<{ key: CategoryTransactionSortKey; dir: "asc" | "desc" }>({
    key: "amount",
    dir: "desc",
  });
  const flatCategories = useMemo(
    () =>
      userCategories.flatMap((cat) => [
        { id: cat.id, name: cat.name, parentName: null as string | null },
        ...(cat.subcategories ?? []).map((sub) => ({ id: sub.id, name: sub.name, parentName: cat.name })),
      ]),
    [userCategories],
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

  const saveCategory = useCallback(
    (
      txn: CategoryTransaction,
      categoryId: number,
      scope: "this" | "merchant" | "label" = "this",
    ) => {
      const picked = flatCategories.find((cat) => cat.id === categoryId);
      if (!picked) return;
      const merchantName = txn.merchantName?.trim();
      const label = txn.label?.trim();
      const effectiveScope = scope === "merchant" && !merchantName ? "this" : scope === "label" && !label ? "this" : scope;
      void patchTransaction(
        txn,
        {
          categoryId,
          categoryApplyScope: effectiveScope,
          ...(effectiveScope === "merchant" && merchantName ? { categoryMerchantName: merchantName } : {}),
          ...(effectiveScope === "label" && label ? { categoryLabel: label } : {}),
        },
        (row) =>
          effectiveScope === "merchant" && merchantName && row.merchantName?.trim().toLowerCase() === merchantName.toLowerCase()
            ? {
                ...row,
                categoryId,
                categoryName: picked.parentName ?? picked.name,
                subcategoryName: picked.parentName ? picked.name : null,
              }
            : effectiveScope === "label" && label && row.label?.trim() === label
              ? {
                  ...row,
                  categoryId,
                  categoryName: picked.parentName ?? picked.name,
                  subcategoryName: picked.parentName ? picked.name : null,
                }
              : row.id === txn.id
            ? {
                ...row,
                categoryId,
                categoryName: picked.parentName ?? picked.name,
                subcategoryName: picked.parentName ? picked.name : null,
              }
            : row,
      );
    },
    [flatCategories, patchTransaction],
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
              {selectedIds.size.toLocaleString()} selected
              {" "}· Delete
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
          <div className="sticky top-0 z-10 hidden min-w-[1040px] grid-cols-[6.5rem_minmax(0,1.6fr)_7rem_minmax(0,12rem)_8rem_5rem_minmax(0,1fr)_4rem] gap-2 border-b border-chart-border bg-chart-surface/98 px-4 py-3 text-center text-[10px] font-medium tracking-wide text-muted-foreground backdrop-blur-md sm:grid">
            <SortableCategoryHeader label="Date" sortKey="postedDate" activeSort={sort} onSort={toggleSort} />
            <SortableCategoryHeader label="Description" sortKey="description" activeSort={sort} onSort={toggleSort} />
            <SortableCategoryHeader label="Label" sortKey="label" activeSort={sort} onSort={toggleSort} />
            <SortableCategoryHeader label="Category / Subcategory" sortKey="category" activeSort={sort} onSort={toggleSort} />
            <SortableCategoryHeader label="Amount" sortKey="amount" activeSort={sort} onSort={toggleSort} />
            <SortableCategoryHeader label="Flags" sortKey="flags" activeSort={sort} onSort={toggleSort} />
            <SortableCategoryHeader label="Note" sortKey="note" activeSort={sort} onSort={toggleSort} />
            <span>Select</span>
          </div>
          <div className="min-w-[1040px] divide-y divide-white/10">
            {sortedRows.map((txn) => {
              const amount = parseFloat(txn.baseAmount);
              const isPositive = amount > 0;
              const isNegative = amount < 0;
              const hasFx = Boolean(txn.foreignCurrency);
              return (
                <div
                  key={txn.id}
                  className={cn(
                    "grid grid-cols-[6.5rem_minmax(0,1.6fr)_7rem_minmax(0,12rem)_8rem_5rem_minmax(0,1fr)_4rem] items-center gap-2 border border-transparent px-4 py-3 transition-colors hover:bg-white/[0.05]",
                    txn.warningFlag && "border-dotted border-[#ECAA0B]/80 bg-[#ECAA0B]/[0.035] shadow-[inset_0_0_0_1px_rgba(236,170,11,0.12)]",
                  )}
                >
                  <span className="text-center text-xs tabular-nums text-muted-foreground">
                    {formatDate(txn.postedDate, "ddMmmYy")}
                  </span>
                  <div className="min-w-0">
                    <CategoryMerchantCell
                      txn={txn}
                      onSave={(value, applyAll) =>
                        patchTransaction(
                          txn,
                          { merchantName: value, applyToAllMerchants: applyAll, oldMerchantName: txn.merchantName },
                          (row) => ({ ...row, merchantName: value || null }),
                        )
                      }
                    />
                  </div>
                  <CategoryLabelCell
                    txn={txn}
                    allLabels={allLabels}
                    onSave={(value, scope) =>
                      patchTransaction(
                        txn,
                        {
                          label: value,
                          labelApplyScope: scope,
                          ...(scope === "merchant" && txn.merchantName ? { labelMerchantName: txn.merchantName } : {}),
                        },
                        (row) => ({ ...row, label: value.trim() || null }),
                      )
                    }
                  />
                  <CategoryCategoryCell
                    txn={txn}
                    userCategories={userCategories}
                    onSave={saveCategory}
                  />
                  <div className="text-center">
                    <p
                      className={cn(
                        "whitespace-nowrap text-xs font-bold tabular-nums",
                        isPositive && "text-[#A7F3D0]",
                        isNegative && "text-[#FCA5A5]",
                        !isPositive && !isNegative && "text-muted-foreground",
                      )}
                    >
                      {isPositive ? "+" : isNegative ? "-" : ""}
                      {formatCurrency(Math.abs(amount), txn.baseCurrency)}
                    </p>
                    {txn.foreignAmount && txn.foreignCurrency ? (
                      <p className="mt-0.5 whitespace-nowrap text-[9px] text-[#AD74FF]/70">
                        {formatCurrency(Math.abs(parseFloat(txn.foreignAmount)), txn.foreignCurrency)}
                      </p>
                    ) : null}
                  </div>
                  <CategoryFlagsCell
                    countryIso={txn.countryIso}
                    isRecurring={txn.isRecurring}
                    hasFx={hasFx}
                  />
                  <CategoryNoteCell
                    txn={txn}
                    onSave={(value, scope) =>
                      patchTransaction(
                        txn,
                        {
                          note: value,
                          noteApplyScope: scope,
                          ...(scope === "merchant" && txn.merchantName ? { noteMerchantName: txn.merchantName } : {}),
                        },
                        (row) => ({ ...row, note: value.trim() || null }),
                      )
                    }
                  />
                  <div className="flex items-center justify-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(txn.id)}
                      onChange={() =>
                        setSelectedIds((current) => {
                          const next = new Set(current);
                          if (next.has(txn.id)) next.delete(txn.id);
                          else next.add(txn.id);
                          return next;
                        })
                      }
                      aria-label={`Select transaction ${txn.merchantName ?? txn.rawDescription}`}
                      className="h-3.5 w-3.5 cursor-pointer rounded border-chart-border bg-chart-muted text-[#0BC18D] focus:ring-1 focus:ring-[#0BC18D]/50"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        void patchTransaction(
                          txn,
                          { warningFlag: !txn.warningFlag },
                          (row) => ({ ...row, warningFlag: !txn.warningFlag }),
                        )
                      }
                      aria-pressed={txn.warningFlag}
                      aria-label={`${txn.warningFlag ? "Remove warning from" : "Mark warning on"} transaction ${txn.merchantName ?? txn.rawDescription}`}
                      className={cn(
                        "inline-flex h-6 w-6 items-center justify-center rounded-md transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#ECAA0B]/70",
                        txn.warningFlag
                          ? "bg-[#ECAA0B]/15 text-[#ECAA0B] shadow-[0_0_14px_rgba(236,170,11,0.45)]"
                          : "text-muted-foreground/50 hover:bg-[#ECAA0B]/10 hover:text-[#ECAA0B]/75",
                      )}
                      title={txn.warningFlag ? "Warning on — click to turn off" : "Warning off — click to turn on"}
                    >
                      <AlertTriangle
                        className={cn("h-3.5 w-3.5", txn.warningFlag && "drop-shadow-[0_0_6px_rgba(236,170,11,0.95)]")}
                        fill={txn.warningFlag ? "currentColor" : "none"}
                        fillOpacity={txn.warningFlag ? 0.22 : undefined}
                        strokeWidth={2.4}
                      />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </motion.div>
  );
}

function categoryReferenceDisplay(txn: CategoryTransaction): string | null {
  const ref = txn.referenceId?.trim();
  return ref ? ref.replace(/\s+/g, " ") : null;
}

function categorySourceSubtitleTitle(txn: CategoryTransaction): string {
  const kind = accountKindSubtitleLabel(txn.accountType, txn.accountCardNetwork);
  const masked = formatMaskedNumber(txn.accountMaskedNumber);
  const net = cardNetworkLabel(txn.accountCardNetwork);
  const bank = txn.accountInstitutionName?.trim() || txn.accountName?.trim() || "";
  const mid = masked && net ? `${net} ${masked}` : masked || null;
  return [kind, mid, bank].filter(Boolean).join(TRANSACTION_SUBTITLE_SEPARATOR);
}

function CategorySourceSubtitle({ txn }: { txn: CategoryTransaction }) {
  const kind = accountKindSubtitleLabel(txn.accountType, txn.accountCardNetwork);
  const masked = formatMaskedNumber(txn.accountMaskedNumber);
  const bank = txn.accountInstitutionName?.trim() || txn.accountName?.trim() || null;
  const network = txn.accountCardNetwork;
  const showLogo = Boolean(masked) && Boolean(network) && network !== "unknown";
  const segments = [
    kind ? <span key="kind">{kind}</span> : null,
    showLogo || masked ? (
      <span key="masked" className="inline-flex items-center gap-1 align-middle">
        {showLogo ? <CardNetworkLogo network={network} className="relative top-px" /> : null}
        {masked ? <span className="font-mono tabular-nums tracking-tight text-muted-foreground">{masked}</span> : null}
      </span>
    ) : null,
    bank ? <span key="bank">{bank}</span> : null,
  ].filter(Boolean);
  if (segments.length === 0) return null;
  return (
    <p className="mt-0.5 min-w-0 max-w-full text-[9px] leading-snug" title={categorySourceSubtitleTitle(txn)}>
      <span className="block min-w-0 truncate text-muted-foreground">
        {segments.map((node, i) => (
          <span key={i}>
            {i > 0 ? <span className="inline-block shrink-0" aria-hidden>{TRANSACTION_SUBTITLE_SEPARATOR}</span> : null}
            {node}
          </span>
        ))}
      </span>
    </p>
  );
}

function CategoryMerchantCell({
  txn,
  onSave,
}: {
  txn: CategoryTransaction;
  onSave: (value: string, applyAll: boolean) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(txn.merchantName ?? "");
  const [applyAll, setApplyAll] = useState(true);
  useEffect(() => {
    if (!editing) setDraft(txn.merchantName ?? "");
  }, [editing, txn.merchantName]);
  const save = () => {
    const next = draft.trim().toLowerCase();
    if (next && next !== (txn.merchantName ?? "").trim().toLowerCase()) onSave(next, applyAll);
    setEditing(false);
  };
  if (editing) {
    return (
      <div className="space-y-1.5" onClick={(event) => event.stopPropagation()}>
        <input
          autoFocus
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={save}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
            if (event.key === "Escape") {
              setDraft(txn.merchantName ?? "");
              setEditing(false);
            }
          }}
          className="w-full min-w-0 rounded-md border border-chart-border bg-chart-muted px-2 py-1 text-xs font-medium text-foreground outline-none focus:border-[#0BC18D]/60"
          aria-label="Merchant name"
        />
        <ScopeToggle
          label="Apply to:"
          options={[
            { id: "merchant", label: "All with this name", disabled: !txn.merchantName?.trim() },
            { id: "this", label: "Only this" },
          ]}
          value={applyAll ? "merchant" : "this"}
          onChange={(scope) => setApplyAll(scope === "merchant")}
        />
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        setEditing(true);
        setApplyAll(true);
      }}
      className="min-w-0 w-full rounded-md py-0.5 pr-1 text-left transition hover:bg-chart-muted hover:ring-1 hover:ring-chart-border"
    >
      <p className="truncate text-xs font-medium text-foreground">{txn.merchantName ?? txn.rawDescription}</p>
      <CategorySourceSubtitle txn={txn} />
      {categoryReferenceDisplay(txn) ? (
        <p className="mt-0.5 truncate text-[9px] leading-snug text-muted-foreground" title={txn.referenceId ?? undefined}>
          {categoryReferenceDisplay(txn)}
        </p>
      ) : null}
    </button>
  );
}

function CategoryLabelCell({
  txn,
  allLabels,
  onSave,
}: {
  txn: CategoryTransaction;
  allLabels: string[];
  onSave: (value: string, scope: "this" | "merchant") => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(txn.label ?? "");
  const hasMerchant = Boolean(txn.merchantName?.trim());
  const [scope, setScope] = useState<"this" | "merchant">(hasMerchant ? "merchant" : "this");
  useEffect(() => {
    if (!editing) {
      setDraft(txn.label ?? "");
      setScope(hasMerchant ? "merchant" : "this");
    }
  }, [editing, txn.label, hasMerchant]);
  const suggestions = useMemo(() => {
    const q = draft.trim().toLowerCase();
    return allLabels
      .filter((label) => label.trim() && label.toLowerCase() !== (txn.label ?? "").toLowerCase())
      .filter((label) => !q || label.toLowerCase().includes(q))
      .slice(0, 8);
  }, [allLabels, draft, txn.label]);
  const save = (value = draft) => {
    const effectiveScope = scope === "merchant" && !hasMerchant ? "this" : scope;
    if (value.trim() !== (txn.label ?? "").trim()) onSave(value.trim().slice(0, 20), effectiveScope);
    setEditing(false);
  };
  if (editing) {
    return (
      <div className="relative" onClick={(event) => event.stopPropagation()}>
        <input
          autoFocus
          value={draft}
          maxLength={20}
          onChange={(event) => setDraft(event.target.value.slice(0, 20))}
          onBlur={(event) => {
            if (event.relatedTarget?.closest("[data-category-label-editor]")) return;
            save();
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
            if (event.key === "Escape") {
              setDraft(txn.label ?? "");
              setEditing(false);
            }
          }}
          className="w-full rounded-md border border-chart-border bg-chart-muted px-2 py-1 font-mono text-[11px] text-foreground outline-none focus:border-[#0BC18D]/60"
          placeholder="Label..."
        />
        <div data-category-label-editor className="absolute left-0 top-[calc(100%+4px)] z-50 w-64 rounded-lg border border-chart-border bg-popover p-2 shadow-2xl">
          <ScopeToggle
            label="Update for:"
            options={[
              { id: "this", label: "This item" },
              { id: "merchant", label: "All with this name", disabled: !hasMerchant },
            ]}
            value={scope}
            onChange={(next) => setScope(next as "this" | "merchant")}
          />
          {suggestions.length > 0 ? (
            <div className="mt-2 border-t border-chart-border pt-1.5">
              {suggestions.map((label) => (
                <button
                  key={label}
                  type="button"
                  className="block w-full rounded-md px-2 py-1.5 text-left font-mono text-[11px] text-foreground hover:bg-chart-hover"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    save(label);
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        setEditing(true);
      }}
      className="w-full truncate rounded-md bg-chart-muted px-2 py-1.5 text-center font-mono text-[11px] text-muted-foreground transition hover:bg-chart-hover"
      title={hasMerchant ? "Default: update all with this merchant name" : "This transaction has no merchant name"}
    >
      {txn.label?.trim() || "Label"}
    </button>
  );
}

function CategoryNoteCell({
  txn,
  onSave,
}: {
  txn: CategoryTransaction;
  onSave: (value: string, scope: "this" | "merchant") => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(txn.note ?? "");
  const [scope, setScope] = useState<"this" | "merchant">("this");
  const hasMerchant = Boolean(txn.merchantName?.trim());
  useEffect(() => {
    if (!editing) {
      setDraft(txn.note ?? "");
      setScope("this");
    }
  }, [editing, txn.note]);
  const save = () => {
    const effectiveScope = scope === "merchant" && !hasMerchant ? "this" : scope;
    if (draft.trim() !== (txn.note ?? "").trim()) onSave(draft.trim(), effectiveScope);
    setEditing(false);
  };
  if (editing) {
    return (
      <div className="space-y-1.5" onClick={(event) => event.stopPropagation()}>
        <textarea
          autoFocus
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={(event) => {
            if (event.relatedTarget?.closest("[data-category-note-scope]")) return;
            save();
          }}
          rows={2}
          className="w-full min-h-[2.25rem] resize-y rounded-md border border-chart-border bg-chart-muted px-1.5 py-1 text-[11px] text-foreground outline-none focus:border-[#0BC18D]/60"
          placeholder="Note..."
        />
        <div data-category-note-scope>
          <ScopeToggle
            label="Update for:"
            options={[
              { id: "this", label: "This item" },
              { id: "merchant", label: "All with this name", disabled: !hasMerchant },
            ]}
            value={scope}
            onChange={(next) => setScope(next as "this" | "merchant")}
          />
        </div>
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        setEditing(true);
      }}
      className="w-full rounded-md bg-chart-muted px-2 py-1.5 text-left text-[11px] leading-snug text-muted-foreground transition hover:bg-chart-hover"
    >
      {txn.note?.trim() ? <span className="line-clamp-2">{txn.note}</span> : "Note"}
    </button>
  );
}

function CategoryCategoryCell({
  txn,
  userCategories,
  onSave,
}: {
  txn: CategoryTransaction;
  userCategories: UserCategory[];
  onSave: (txn: CategoryTransaction, categoryId: number, scope: "this" | "merchant" | "label") => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<"merchant" | "label" | "this">("merchant");
  const hasMerchant = Boolean(txn.merchantName?.trim());
  const hasLabel = Boolean(txn.label?.trim());
  const effectiveScope = scope === "merchant" && !hasMerchant ? "this" : scope === "label" && !hasLabel ? "this" : scope;
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return userCategories;
    return userCategories
      .map((cat) => ({
        ...cat,
        subcategories: (cat.subcategories ?? []).filter(
          (sub) => sub.name.toLowerCase().includes(q) || cat.name.toLowerCase().includes(q),
        ),
      }))
      .filter((cat) => cat.name.toLowerCase().includes(q) || (cat.subcategories ?? []).length > 0);
  }, [query, userCategories]);
  return (
    <div className="relative min-w-0" onClick={(event) => event.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex min-w-0 w-full items-center gap-2 rounded-md py-0.5 pr-1 text-left transition hover:bg-chart-muted hover:ring-1 hover:ring-chart-border"
      >
        <TransactionCategoryIcon categoryName={txn.categoryName} subcategoryName={txn.subcategoryName} size="md" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12px] text-foreground">{txn.categoryName ?? "Uncategorized"}</span>
          {txn.subcategoryName ? <span className="block truncate text-[11px] text-muted-foreground">{txn.subcategoryName}</span> : null}
        </span>
        <ChevronDown className={cn("h-3 w-3 shrink-0 text-muted-foreground/60 transition-transform", open && "rotate-180 text-[#0BC18D]")} />
      </button>
      {open ? (
        <div className="absolute left-0 top-[calc(100%+4px)] z-50 flex max-h-[360px] w-[300px] flex-col overflow-hidden rounded-xl border border-chart-border bg-popover shadow-2xl backdrop-blur-lg">
          <div className="px-2.5 pt-2 pb-1.5">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground/70" />
              <input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search categories..."
                className="w-full rounded-md border border-chart-border bg-chart-muted py-1.5 pl-7 pr-2 text-[11px] text-foreground outline-none focus:border-[#0BC18D]/40"
              />
            </div>
          </div>
          <div className="border-b border-chart-border px-2.5 pb-2">
            <ScopeToggle
              label="Apply to:"
              options={[
                { id: "merchant", label: "All with this name", disabled: !hasMerchant },
                { id: "label", label: hasLabel ? txn.label!.trim() : "No label", disabled: !hasLabel },
                { id: "this", label: "Only this" },
              ]}
              value={effectiveScope}
              onChange={(next) => setScope(next as "merchant" | "label" | "this")}
            />
          </div>
          <div className="flex-1 overflow-y-auto py-1">
            {filtered.map((cat) => (
              <div key={cat.id}>
                <button
                  type="button"
                  onClick={() => {
                    if (!cat.subcategories?.length) {
                      onSave(txn, cat.id, effectiveScope);
                      setOpen(false);
                    }
                  }}
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] font-semibold",
                    cat.subcategories?.length ? "cursor-default text-muted-foreground" : "text-muted-foreground hover:bg-chart-muted",
                  )}
                >
                  {cat.name}
                </button>
                {(cat.subcategories ?? []).map((sub) => (
                  <button
                    key={sub.id}
                    type="button"
                    onClick={() => {
                      onSave(txn, sub.id, effectiveScope);
                      setOpen(false);
                    }}
                    className="flex w-full items-center gap-2 py-1.5 pl-7 pr-3 text-left text-[11px] text-muted-foreground transition hover:bg-chart-muted hover:text-foreground"
                  >
                    <span className="truncate">{sub.name}</span>
                    {txn.categoryId === sub.id ? <span className="ml-auto text-[9px] text-[#0BC18D]/70">current</span> : null}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function CategoryFlagsCell({
  countryIso,
  isRecurring,
  hasFx,
}: {
  countryIso: string | null;
  isRecurring: boolean;
  hasFx: boolean;
}) {
  const name = countryDisplayName(countryIso);
  const flag = flagEmoji(countryIso);
  const typeLine = transactionTypeLabel(isRecurring, hasFx);
  const countryLine = name ? `${name}${countryIso ? ` (${countryIso.toUpperCase()})` : ""}` : null;
  return (
    <div className="group relative flex items-center justify-center gap-1.5 px-1 py-0.5">
      {flag ? <span className="text-[1.05rem] leading-none">{flag}</span> : <span className="text-muted-foreground/80">-</span>}
      {isRecurring ? <Repeat className="h-3 w-3 text-[#AD74FF]" aria-hidden /> : null}
      {hasFx ? <Globe className="h-3 w-3 text-[#AD74FF]/70" aria-hidden /> : null}
      <div className="pointer-events-none absolute bottom-[calc(100%+8px)] left-1/2 z-50 w-max max-w-[240px] -translate-x-1/2 opacity-0 transition-opacity group-hover:opacity-100">
        <div className="rounded-lg border border-chart-border bg-popover px-2.5 py-2 text-left text-[10px] leading-snug text-foreground shadow-xl backdrop-blur-md">
          {countryLine ? <p className="font-medium text-white">{countryLine}</p> : null}
          <p className={cn("text-foreground", countryLine && "mt-1")}>
            <span className="text-muted-foreground">Type: </span>
            {typeLine}
          </p>
        </div>
      </div>
    </div>
  );
}

function ScopeToggle({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Array<{ id: string; label: string; disabled?: boolean }>;
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="shrink-0 text-[9px] text-muted-foreground/80">{label}</span>
      <div className="inline-flex min-h-[22px] flex-wrap rounded-full border border-chart-border bg-chart-muted p-px text-[9px] font-medium">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            disabled={option.disabled}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              if (!option.disabled) onChange(option.id);
            }}
            className={cn(
              "rounded-full px-2 transition-colors",
              option.disabled
                ? "cursor-not-allowed text-muted-foreground/40"
                : value === option.id
                  ? "cursor-pointer bg-[#0BC18D]/20 text-[#0BC18D]"
                  : "cursor-pointer text-muted-foreground hover:text-muted-foreground",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
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
        "flex min-w-0 items-center justify-center gap-1 text-center text-[10px] font-medium tracking-wide transition-colors hover:text-foreground",
        active ? "text-foreground" : "text-muted-foreground",
      )}
      aria-sort={active ? (activeSort.dir === "asc" ? "ascending" : "descending") : "none"}
      title={`Sort by ${label}`}
    >
      <span className="min-w-0 truncate">{label}</span>
      <ArrowUpDown
        className={cn(
          "h-3 w-3 shrink-0 opacity-60 transition-transform",
          active && activeSort.dir === "asc" && "rotate-180",
        )}
        aria-hidden
      />
    </button>
  );
}
