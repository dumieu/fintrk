"use client";

import { motion } from "framer-motion";
import { AlertTriangle } from "lucide-react";
import { IgnoreTransactionButton } from "@/components/ignore-transaction-button";
import { TransactionGeminiHintButton } from "@/components/transaction-gemini-hint";
import { TransactionInsightHover } from "@/components/transaction-insight-hover";
import { TransactionCategoryIcon } from "@/components/transaction-category-icon";
import {
  CategoryCellEditor,
  DoubleChargeSuspectBadge,
  FlagsCell,
  MerchantNameEditor,
  TRANSACTION_TABLE_ROW_GRID,
  TransactionLabelCell,
  TransactionNoteCell,
  type TransactionRowData,
  type TransactionTableUserCategory,
} from "@/components/transaction-table-cells";
import { formatCurrency, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export function TransactionTableRow({
  txn,
  rowIndex = 0,
  userCategories,
  allLabels,
  selected,
  onToggleSelect,
  onSavedMerchantName,
  onSavedLabel,
  onSavedCategory,
  onSavedNote,
  onToggleWarning,
  onIgnored,
  onReviewDoubleCharge,
  animate = true,
}: {
  txn: TransactionRowData;
  rowIndex?: number;
  userCategories: TransactionTableUserCategory[];
  allLabels: string[];
  selected: boolean;
  onToggleSelect: () => void;
  onSavedMerchantName: (
    id: string,
    newName: string | null,
    applyAll: boolean,
    oldName: string | null,
  ) => void;
  onSavedLabel: (
    id: string,
    label: string | null,
    scope: "this" | "merchant",
    merchantName: string | null,
  ) => void;
  onSavedCategory: (
    txnId: string,
    categoryId: number,
    scope: "this" | "merchant" | "label",
    merchantName: string | null,
    label: string | null,
    resolvedCategoryName: string | null,
    resolvedSubcategoryName: string | null,
  ) => void;
  onSavedNote: (
    id: string,
    note: string | null,
    scope: "this" | "merchant",
    merchantName: string | null,
  ) => void;
  onToggleWarning: () => void;
  onIgnored: (info: {
    scope: "item" | "name";
    transactionId: string;
    nameKey: string;
  }) => void;
  onReviewDoubleCharge?: (merchantKey: string, displayName: string) => void;
  animate?: boolean;
}) {
  const amt = parseFloat(txn.baseAmount);
  const isPositive = amt > 0;
  const isNegative = amt < 0;
  const hasFx = !!txn.foreignCurrency;
  const spreadBps = txn.implicitFxSpreadBps ? parseFloat(txn.implicitFxSpreadBps) : 0;

  const rowClassName = cn(
    "relative grid grid-cols-[auto_1fr] gap-1.5 border border-transparent px-2.5 py-2.5 pr-16 transition-colors hover:bg-chart-muted sm:justify-items-stretch sm:gap-2 sm:px-4 sm:py-3 sm:pr-4",
    TRANSACTION_TABLE_ROW_GRID,
    txn.warningFlag &&
      "border-dotted border-[#ECAA0B]/80 bg-[#ECAA0B]/[0.035] shadow-[inset_0_0_0_1px_rgba(236,170,11,0.12)]",
    txn.doubleChargeSuspect?.verdict === "strong" &&
      "border-dotted border-[#FF6F69]/70 bg-[#FF6F69]/[0.04] shadow-[inset_0_0_0_1px_rgba(255,111,105,0.14)]",
    txn.doubleChargeSuspect?.verdict === "likely_benign" &&
      "border-dotted border-[#AD74FF]/45 bg-[#AD74FF]/[0.035]",
  );

  const content = (
    <>
      <TransactionInsightHover txn={txn}>
        <div className="flex min-w-0 items-center gap-0.5 sm:gap-1">
          <TransactionGeminiHintButton txn={txn} />
          <div className="min-w-0 text-xs text-muted-foreground tabular-nums whitespace-nowrap py-0.5 -my-0.5 rounded-md pr-1 ring-0 group-hover/txninsight:ring-1 group-hover/txninsight:ring-chart-border group-hover/txninsight:bg-chart-muted transition-[box-shadow,background]">
            {formatDate(txn.postedDate, "ddMmmYy")}
          </div>
        </div>
      </TransactionInsightHover>
      <div className="min-w-0 overflow-hidden">
        <div className="min-w-0 flex flex-wrap items-center gap-1.5 py-0.5 -my-0.5 pr-1">
          <div className="min-w-0 flex-1">
            <MerchantNameEditor txn={txn} onSaved={onSavedMerchantName} />
          </div>
          {txn.doubleChargeSuspect ? (
            <DoubleChargeSuspectBadge
              suspect={txn.doubleChargeSuspect}
              onReviewStrong={onReviewDoubleCharge}
            />
          ) : null}
        </div>
        <div className="mt-0.5 flex items-start gap-2 text-[12px] text-muted-foreground sm:hidden">
          <TransactionCategoryIcon
            categoryName={txn.categoryName}
            subcategoryName={txn.subcategoryName}
            size="sm"
            className="mt-0.5"
          />
          <span className="min-w-0 flex-1 truncate">
            {txn.subcategoryName
              ? `${txn.categoryName ?? "—"} · ${txn.subcategoryName}`
              : (txn.categoryName ?? "Uncategorized")}
          </span>
        </div>
      </div>
      <div className="col-span-2 flex min-h-0 items-center sm:col-span-1 sm:h-full sm:min-w-0">
        <TransactionLabelCell
          transactionId={txn.id}
          merchantName={txn.merchantName}
          value={txn.label ?? null}
          onSaved={onSavedLabel}
          allLabels={allLabels}
        />
      </div>
      <div className="hidden min-w-0 sm:flex sm:h-full sm:w-full sm:items-center sm:justify-start">
        <CategoryCellEditor txn={txn} userCategories={userCategories} onSaved={onSavedCategory} />
      </div>
      <div className="flex min-h-0 w-full min-w-0 max-w-full flex-col items-start justify-center text-left sm:h-full sm:min-h-[2.5rem]">
        <span
          className={cn(
            "min-w-0 whitespace-nowrap text-xs font-bold tabular-nums",
            isPositive && "text-[#A7F3D0]",
            isNegative && "text-[#FCA5A5]",
            !isPositive && !isNegative && "text-muted-foreground",
          )}
        >
          {isPositive ? "+" : isNegative ? "−" : ""}
          {formatCurrency(Math.abs(amt), txn.baseCurrency)}
        </span>
        {hasFx && txn.foreignAmount && (
          <p className="whitespace-nowrap text-[9px] text-[#AD74FF]/70 tabular-nums">
            {formatCurrency(Math.abs(parseFloat(txn.foreignAmount)), txn.foreignCurrency!)}
            {spreadBps > 50 && (
              <span className="ml-1 text-[#FF6F69]">+{(spreadBps / 100).toFixed(1)}%</span>
            )}
          </p>
        )}
      </div>
      <FlagsCell countryIso={txn.countryIso} isRecurring={txn.isRecurring} hasFx={hasFx} />
      <div className="col-span-2 flex min-h-0 items-center sm:col-span-1 sm:h-full">
        <TransactionNoteCell
          transactionId={txn.id}
          merchantName={txn.merchantName}
          value={txn.note ?? null}
          onSaved={onSavedNote}
        />
      </div>
      <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center justify-center gap-1.5 sm:static sm:right-auto sm:top-auto sm:flex sm:h-full sm:translate-y-0 sm:items-center sm:justify-center sm:pr-0">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelect}
          aria-label={`Select transaction ${txn.merchantName ?? txn.rawDescription}`}
          className="h-3.5 w-3.5 cursor-pointer rounded border-chart-border bg-chart-muted text-[#0BC18D] focus:ring-1 focus:ring-[#0BC18D]/50"
        />
        <button
          type="button"
          onClick={onToggleWarning}
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
            className={cn(
              "h-3.5 w-3.5",
              txn.warningFlag && "drop-shadow-[0_0_6px_rgba(236,170,11,0.95)]",
            )}
            fill={txn.warningFlag ? "currentColor" : "none"}
            fillOpacity={txn.warningFlag ? 0.22 : undefined}
            strokeWidth={2.4}
          />
        </button>
        <IgnoreTransactionButton
          transactionId={txn.id}
          merchantName={txn.merchantName}
          rawDescription={txn.rawDescription}
          onIgnored={onIgnored}
        />
      </div>
    </>
  );

  if (!animate) {
    return <div className={rowClassName}>{content}</div>;
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: Math.min(rowIndex, 24) * 0.015 }}
      className={rowClassName}
    >
      {content}
    </motion.div>
  );
}
