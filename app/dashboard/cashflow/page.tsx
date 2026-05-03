"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import type { Dispatch, SetStateAction } from "react";
import { motion } from "framer-motion";
import {
  Waves,
  Sparkles,
  Loader2,
  Upload,
  RefreshCw,
  AlertTriangle,
  ArrowUpDown,
  ChevronDown,
  Globe,
  Repeat,
  Search,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  CashflowSankey,
  type CashflowSankeyCategorySelection,
  type CashflowSankeyData,
} from "@/components/cashflow-sankey";
import { TimeSlicer } from "@/components/time-slicer";
import {
  detectTimePreset,
  rollingRange,
  type TimePresetId,
} from "@/lib/time-range-presets";
import {
  dispatchTransactionsChanged,
  FINTRK_TRANSACTIONS_CHANGED,
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
import { CardNetworkLogo } from "@/components/card-network-logo";
import { TransactionCategoryIcon } from "@/components/transaction-category-icon";

interface Filters {
  dateFrom: string;
  dateTo: string;
  currency: string;
  includeInvestmentInflows: boolean;
  includeInvestmentOutflows: boolean;
}

interface CashflowTransaction {
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

interface UserCategory {
  id: number;
  name: string;
  parentId?: number | null;
  subcategories?: UserCategory[];
}

type CashflowTransactionSortKey =
  | "postedDate"
  | "description"
  | "label"
  | "category"
  | "amount"
  | "flags"
  | "note";

export default function CashflowPage() {
  const [data, setData] = useState<CashflowSankeyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<CashflowSankeyCategorySelection | null>(null);
  const [categoryTxns, setCategoryTxns] = useState<CashflowTransaction[]>([]);
  const [categoryTxnsLoading, setCategoryTxnsLoading] = useState(false);
  const [userCategories, setUserCategories] = useState<UserCategory[]>([]);
  const [distinctLabels, setDistinctLabels] = useState<string[]>([]);
  const [transactionRefreshTick, setTransactionRefreshTick] = useState(0);
  const categoryTableRef = useRef<HTMLDivElement | null>(null);
  const sankeySelectionRef = useRef<HTMLDivElement | null>(null);
  const [filters, setFilters] = useState<Filters>({
    dateFrom: "",
    dateTo: "",
    currency: "",
    includeInvestmentInflows: false,
    includeInvestmentOutflows: false,
  });
  const inFlightRef = useRef<AbortController | null>(null);
  const [showParticles, setShowParticles] = useState(false);

  const load = useCallback(
    async (f: Filters, mode: "initial" | "refresh") => {
      if (inFlightRef.current) inFlightRef.current.abort();
      const ctrl = new AbortController();
      inFlightRef.current = ctrl;
      if (mode === "initial") setLoading(true);
      else setRefreshing(true);
      try {
        const params = new URLSearchParams();
        if (f.dateFrom) params.set("dateFrom", f.dateFrom);
        if (f.dateTo) params.set("dateTo", f.dateTo);
        if (f.currency) params.set("currency", f.currency);
        if (f.includeInvestmentInflows) params.set("includeInvestmentInflows", "true");
        if (f.includeInvestmentOutflows) params.set("includeInvestmentOutflows", "true");
        const res = await fetch(`/api/cashflow/sankey?${params}`, { signal: ctrl.signal });
        const d = await res.json();
        if (ctrl.signal.aborted) return;
        if (!d.error) setData(d as CashflowSankeyData);
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
      } finally {
        if (!ctrl.signal.aborted) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [],
  );

  useEffect(() => {
    void load(filters, "initial");
  }, [filters, load]);

  useEffect(() => {
    const handler = () => {
      setTransactionRefreshTick((tick) => tick + 1);
      void load(filters, "refresh");
    };
    window.addEventListener(FINTRK_TRANSACTIONS_CHANGED, handler);
    return () => window.removeEventListener(FINTRK_TRANSACTIONS_CHANGED, handler);
  }, [filters, load]);

  useEffect(() => {
    fetch("/api/user-categories")
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.categories)) setUserCategories(d.categories);
      })
      .catch(() => {});
  }, []);

  const loadDistinctLabels = useCallback(() => {
    fetch("/api/transactions/labels")
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.labels)) setDistinctLabels(d.labels);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadDistinctLabels();
  }, [loadDistinctLabels]);

  useEffect(() => {
    window.addEventListener(FINTRK_TRANSACTIONS_CHANGED, loadDistinctLabels);
    return () => window.removeEventListener(FINTRK_TRANSACTIONS_CHANGED, loadDistinctLabels);
  }, [loadDistinctLabels]);

  /** Tracks viewport size so the Sankey chart can grow on tall/wide monitors
   *  but never overflow the visible page on tablets and phones. */
  const [viewport, setViewport] = useState<{ w: number; h: number }>(() => ({
    w: typeof window === "undefined" ? 1280 : window.innerWidth,
    h: typeof window === "undefined" ? 900 : window.innerHeight,
  }));
  useEffect(() => {
    const onResize = () =>
      setViewport({ w: window.innerWidth, h: window.innerHeight });
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const handleTimePreset = useCallback((preset: TimePresetId) => {
    setFilters((f) => {
      if (preset === "all") return { ...f, dateFrom: "", dateTo: "" };
      const { from, to } = rollingRange(preset);
      return { ...f, dateFrom: from, dateTo: to };
    });
  }, []);

  const activePreset = detectTimePreset(filters.dateFrom, filters.dateTo);

  const hasData = !!data && (data.inflow.value > 0 || data.outflow.value > 0 || data.savings.value > 0);

  const toggleSelectedCategory = useCallback((category: CashflowSankeyCategorySelection) => {
    setSelectedCategory((current) => {
      if (
        current?.name === category.name &&
        current.level === category.level &&
        current.flow === category.flow
      ) {
        setCategoryTxns([]);
        return null;
      }
      return category;
    });
  }, []);

  useEffect(() => {
    setSelectedCategory(null);
    setCategoryTxns([]);
  }, [
    filters.dateFrom,
    filters.dateTo,
    filters.currency,
    filters.includeInvestmentInflows,
    filters.includeInvestmentOutflows,
  ]);

  useEffect(() => {
    if (!selectedCategory) return;
    const ctrl = new AbortController();
    setCategoryTxnsLoading(true);
    const params = new URLSearchParams();
    params.set("category", selectedCategory.name);
    params.set("level", selectedCategory.level);
    params.set("flow", selectedCategory.flow);
    if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
    if (filters.dateTo) params.set("dateTo", filters.dateTo);
    if (data?.currency) params.set("currency", data.currency);
    if (filters.includeInvestmentInflows) params.set("includeInvestmentInflows", "true");
    if (filters.includeInvestmentOutflows) params.set("includeInvestmentOutflows", "true");
    void fetch(`/api/cashflow/category-transactions?${params}`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((json) => {
        if (ctrl.signal.aborted) return;
        setCategoryTxns(Array.isArray(json.data) ? json.data : []);
      })
      .catch((err) => {
        if ((err as Error).name !== "AbortError") setCategoryTxns([]);
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setCategoryTxnsLoading(false);
      });
    return () => ctrl.abort();
  }, [data?.currency, filters, selectedCategory, transactionRefreshTick]);

  useEffect(() => {
    if (!selectedCategory) return;
    requestAnimationFrame(() => {
      categoryTableRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [selectedCategory]);

  useEffect(() => {
    if (!selectedCategory) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (sankeySelectionRef.current?.contains(target)) return;
      setSelectedCategory(null);
      setCategoryTxns([]);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [selectedCategory]);

  return (
    <div className="relative flex min-h-full flex-1 flex-col overflow-y-auto overflow-x-hidden bg-gradient-to-b from-[#08051a] via-[#10082a] to-[#160e35]">
      <BackgroundAurora />

      <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-col gap-5 px-3 py-5 sm:px-6 sm:py-7">
        {/* TOOLBAR */}
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="flex flex-wrap items-end justify-end gap-3"
        >
          <TimeSlicer activePreset={activePreset} onSelect={handleTimePreset} />
          <InvestmentFlowFilter
            includeInflows={filters.includeInvestmentInflows}
            includeOutflows={filters.includeInvestmentOutflows}
            onToggle={(key) =>
              setFilters((f) => ({
                ...f,
                [key]: !f[key],
              }))
            }
          />
          {data && data.availableCurrencies.length > 1 && (
            <CurrencyPicker
              currency={data.currency}
              options={data.availableCurrencies}
              onSelect={(c) => setFilters((f) => ({ ...f, currency: c }))}
            />
          )}
          <ParticlesToggle on={showParticles} onChange={setShowParticles} />
        </motion.div>

        <div ref={sankeySelectionRef} className="contents">
          {/* SANKEY CARD — allowed to break out wider than the rest of the
           *  page on large screens. The rest of the page (header, KPI row,
           *  legend) stays bound to the standard `max-w-[1480px]` container. */}
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-[#100726]/85 via-[#0d061f]/85 to-[#08041a]/85 p-0.5 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.6)] backdrop-blur-md sm:p-2"
            style={{
            // Sankey gets a controlled "breakout" beyond the 1280px page box on
            // wider monitors only:
            //   • viewport ≤ 1480px → no breakout, card stays inside max-w-7xl
            //   • viewport between 1480px and 2120px → linear breakout
            //   • viewport ≥ 2120px → breakout caps at 320px per side
            //                          (effective card width 1920px) AND we
            //                          always preserve a 24px gap to the screen
            //                          edge so the card never touches it.
            marginLeft:
              "calc(0px - max(0px, min((100vw - 1480px) / 2, 320px, (100vw - 1280px) / 2 - 24px)))",
            marginRight:
              "calc(0px - max(0px, min((100vw - 1480px) / 2, 320px, (100vw - 1280px) / 2 - 24px)))",
            }}
          >
          {/* Animated rainbow border accent — spin tied to the Particles toggle */}
          <div
            aria-hidden
            className="pointer-events-none absolute -inset-px rounded-2xl opacity-40"
            style={{
              background:
                "conic-gradient(from 180deg at 50% 50%, rgba(11,193,141,0.0) 0deg, rgba(11,193,141,0.45) 60deg, rgba(44,162,255,0.45) 130deg, rgba(173,116,255,0.45) 200deg, rgba(255,111,105,0.45) 270deg, rgba(11,193,141,0.0) 360deg)",
              maskImage: "linear-gradient(#000, #000) content-box, linear-gradient(#000, #000)",
              WebkitMask: "linear-gradient(#000, #000) content-box, linear-gradient(#000, #000)",
              padding: 1,
              animation: showParticles ? "fintrk-spin-slow 18s linear infinite" : "none",
            }}
          />
          <div className="relative rounded-[14px] bg-[#06031a]/80 p-1.5 sm:p-4 md:p-5">
            {refreshing && (
              <div className="absolute right-4 top-4 z-20 flex items-center gap-1.5 rounded-full bg-white/[0.08] px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider text-white/65 backdrop-blur">
                <RefreshCw className="h-3 w-3 animate-spin" />
                Updating
              </div>
            )}

            {loading ? (
              <div className="flex h-[520px] flex-col items-center justify-center gap-4">
                <div className="relative">
                  <div className="absolute inset-0 animate-pulse rounded-full bg-[#0BC18D]/20 blur-xl" />
                  <Loader2 className="relative h-10 w-10 animate-spin text-[#34E6B0]" />
                </div>
                <p className="text-sm text-white/65">Mapping your money flow…</p>
              </div>
            ) : !hasData ? (
              <div className="flex h-[520px] flex-col items-center justify-center text-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[#0BC18D]/20 to-[#AD74FF]/20 ring-1 ring-white/10">
                  <Waves className="h-8 w-8 text-[#34E6B0]" />
                </div>
                <p className="text-lg font-semibold text-white/90">Your cashflow story is waiting</p>
                <p className="mt-2 max-w-md text-sm text-white/55">
                  Upload a statement to see income, spending, and savings flow as a
                  living, breathing diagram.
                </p>
                <Link href="/dashboard/upload" className="mt-5">
                  <Button className="bg-gradient-to-r from-[#0BC18D] to-[#2CA2FF] text-white hover:opacity-90">
                    <Upload className="mr-2 h-4 w-4" />
                    Upload Statement
                  </Button>
                </Link>
              </div>
            ) : (
              <CashflowSankey
                data={data!}
                height={(() => {
                  const narrow = viewport.w < 1024;
                  const veryNarrow = viewport.w < 640;
                  /** Pixels reserved for header, KPI row, padding, legend &
                   *  page chrome — measured empirically from the layout. */
                  const reserved = veryNarrow ? 380 : narrow ? 400 : 420;
                  /** Natural height for the current category count. */
                  const natural = Math.max(
                    veryNarrow ? 320 : narrow ? 380 : 480,
                    Math.min(
                      veryNarrow ? 520 : narrow ? 640 : 780,
                      80 + (data!.outflow.categories.length + data!.savings.categories.length) * 38,
                    ),
                  );
                  /** Allow up to +50% taller on tall monitors only. */
                  const ceiling = Math.round(natural * 1.5);
                  /** Hard cap so the legend stays visible on short viewports. */
                  const fits = viewport.h - reserved;
                  return Math.max(280, Math.min(ceiling, fits));
                })()}
                showParticles={showParticles}
                selectedCategory={selectedCategory}
                onCategorySelect={toggleSelectedCategory}
              />
            )}
          </div>
          </motion.div>

          {selectedCategory && (
            <div ref={categoryTableRef}>
              <CashflowCategoryTransactionsTable
                category={selectedCategory}
                rows={categoryTxns}
                loading={categoryTxnsLoading}
                userCategories={userCategories}
                allLabels={distinctLabels}
                onRowsChange={setCategoryTxns}
              />
            </div>
          )}
          </div>

        {/* LEGEND */}
        {hasData && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 rounded-xl border border-white/[0.08] bg-white/[0.025] px-4 py-2.5 text-[11px] text-white/60"
          >
            <LegendDot color="#0BC18D" label="Inflow" />
            <LegendDot color="#F4D03F" label="Income trunk" />
            <LegendDot color="#FF6F69" label="Spending" />
            <LegendDot color="#AD74FF" label="Savings & Investments" />
            <LegendDot color="#2CA2FF" label="Unallocated surplus" />
            <LegendDot color="#E11D48" label="Deficit (drawdown)" />
            <span className="ml-auto hidden text-[10px] uppercase tracking-wider text-white/35 sm:inline">
              Hover a node or ribbon to trace its path
            </span>
          </motion.div>
        )}
      </div>

      <style jsx global>{`
        @keyframes fintrk-spin-slow {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

/* ──────────────────────  CURRENCY PICKER  ─────────────────── */

function CashflowCategoryTransactionsTable({
  category,
  rows,
  loading,
  userCategories,
  allLabels,
  onRowsChange,
}: {
  category: CashflowSankeyCategorySelection;
  rows: CashflowTransaction[];
  loading: boolean;
  userCategories: UserCategory[];
  allLabels: string[];
  onRowsChange: Dispatch<SetStateAction<CashflowTransaction[]>>;
}) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<{ key: CashflowTransactionSortKey; dir: "asc" | "desc" }>({
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

  const categoryText = useCallback((txn: CashflowTransaction) => {
    return txn.subcategoryName
      ? `${txn.categoryName ?? ""} ${txn.subcategoryName}`.trim()
      : txn.categoryName ?? "";
  }, []);

  const flagsText = useCallback((txn: CashflowTransaction) => {
    return [txn.countryIso?.toUpperCase(), txn.isRecurring ? "Recurring" : null].filter(Boolean).join(" ");
  }, []);

  const sortedRows = useMemo(() => {
    const dir = sort.dir === "asc" ? 1 : -1;
    const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
    const valueFor = (txn: CashflowTransaction): string | number => {
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

  const toggleSort = useCallback((key: CashflowTransactionSortKey) => {
    setSort((current) => ({
      key,
      dir: current.key === key && current.dir === "desc" ? "asc" : "desc",
    }));
  }, []);

  const patchTransaction = useCallback(
    async (
      txn: CashflowTransaction,
      body: Record<string, unknown>,
      applyLocal: (row: CashflowTransaction) => CashflowTransaction,
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

  const saveTextField = useCallback(
    (txn: CashflowTransaction, field: "merchantName" | "label" | "note", value: string) => {
      const cleaned = value.trim();
      if (field === "merchantName") {
        if ((txn.merchantName ?? "") === cleaned) return;
        void patchTransaction(
          txn,
          { merchantName: cleaned },
          (row) => (row.id === txn.id ? { ...row, merchantName: cleaned || null } : row),
        );
        return;
      }

      if (field === "label") {
        if ((txn.label ?? "") === cleaned) return;
        const merchantName = txn.merchantName?.trim();
        void patchTransaction(
          txn,
          {
            label: cleaned,
            labelApplyScope: merchantName ? "merchant" : "this",
            ...(merchantName ? { labelMerchantName: merchantName } : {}),
          },
          (row) => ({ ...row, label: cleaned || null }),
        );
        return;
      }

      if ((txn.note ?? "") === cleaned) return;
      void patchTransaction(
        txn,
        { note: cleaned, noteApplyScope: "this" },
        (row) => (row.id === txn.id ? { ...row, note: cleaned || null } : row),
      );
    },
    [patchTransaction],
  );

  const saveCategory = useCallback(
    (
      txn: CashflowTransaction,
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
      className="overflow-hidden rounded-2xl border border-white/[0.10] bg-white/[0.04] text-white shadow-[0_30px_80px_-20px_rgba(0,0,0,0.55)]"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-[#10082a]/80 px-4 py-3 backdrop-blur-md">
        <div>
          <p className="text-sm font-semibold text-white">
            {category.name} transactions
          </p>
          <p className="mt-0.5 text-[11px] text-white/45">
            Matching the current Sankey filters and selected {category.level} only
          </p>
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
          <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider text-white/55">
            {loading ? "Loading" : `${rows.length.toLocaleString()} shown`}
          </span>
        </div>
      </div>

      {loading ? (
        <div className="flex min-h-40 items-center justify-center gap-3 px-4 py-10">
          <Loader2 className="h-6 w-6 animate-spin text-[#0BC18D]" />
          <span className="text-xs text-white/50">Loading transactions…</span>
        </div>
      ) : rows.length === 0 ? (
        <div className="flex min-h-40 items-center justify-center px-4 py-10 text-center text-sm text-white/55">
          No transactions found for this Sankey category.
        </div>
      ) : (
        <div className="max-h-[520px] overflow-auto">
          <div className="sticky top-0 z-10 hidden min-w-[1040px] grid-cols-[6.5rem_minmax(0,1.6fr)_7rem_minmax(0,12rem)_8rem_5rem_minmax(0,1fr)_4rem] gap-2 border-b border-white/10 bg-[#10082a]/95 px-4 py-3 text-center text-[10px] font-medium tracking-wide text-white/50 backdrop-blur-md sm:grid">
            <SortableCashflowHeader label="Date" sortKey="postedDate" activeSort={sort} onSort={toggleSort} />
            <SortableCashflowHeader label="Description" sortKey="description" activeSort={sort} onSort={toggleSort} />
            <SortableCashflowHeader label="Label" sortKey="label" activeSort={sort} onSort={toggleSort} />
            <SortableCashflowHeader label="Category / Subcategory" sortKey="category" activeSort={sort} onSort={toggleSort} />
            <SortableCashflowHeader label="Amount" sortKey="amount" activeSort={sort} onSort={toggleSort} />
            <SortableCashflowHeader label="Flags" sortKey="flags" activeSort={sort} onSort={toggleSort} />
            <SortableCashflowHeader label="Note" sortKey="note" activeSort={sort} onSort={toggleSort} />
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
                  <span className="text-center text-xs tabular-nums text-white/65">
                    {formatDate(txn.postedDate, "ddMmmYy")}
                  </span>
                  <div className="min-w-0">
                    <CashflowMerchantCell
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
                  <CashflowLabelCell
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
                  <CashflowCategoryCell
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
                        !isPositive && !isNegative && "text-white/70",
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
                  <CashflowFlagsCell
                    countryIso={txn.countryIso}
                    isRecurring={txn.isRecurring}
                    hasFx={hasFx}
                  />
                  <CashflowNoteCell
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
                      className="h-3.5 w-3.5 cursor-pointer rounded border-white/35 bg-white/[0.06] text-[#0BC18D] focus:ring-1 focus:ring-[#0BC18D]/50"
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
                          : "text-white/20 hover:bg-[#ECAA0B]/10 hover:text-[#ECAA0B]/75",
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

function cashflowReferenceDisplay(txn: CashflowTransaction): string | null {
  const ref = txn.referenceId?.trim();
  return ref ? ref.replace(/\s+/g, " ") : null;
}

function cashflowSourceSubtitleTitle(txn: CashflowTransaction): string {
  const kind = accountKindSubtitleLabel(txn.accountType, txn.accountCardNetwork);
  const masked = formatMaskedNumber(txn.accountMaskedNumber);
  const net = cardNetworkLabel(txn.accountCardNetwork);
  const bank = txn.accountInstitutionName?.trim() || txn.accountName?.trim() || "";
  const mid = masked && net ? `${net} ${masked}` : masked || null;
  return [kind, mid, bank].filter(Boolean).join(TRANSACTION_SUBTITLE_SEPARATOR);
}

function CashflowSourceSubtitle({ txn }: { txn: CashflowTransaction }) {
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
        {masked ? <span className="font-mono tabular-nums tracking-tight text-white/55">{masked}</span> : null}
      </span>
    ) : null,
    bank ? <span key="bank">{bank}</span> : null,
  ].filter(Boolean);
  if (segments.length === 0) return null;
  return (
    <p className="mt-0.5 min-w-0 max-w-full text-[9px] leading-snug" title={cashflowSourceSubtitleTitle(txn)}>
      <span className="block min-w-0 truncate text-white/45">
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

function CashflowMerchantCell({
  txn,
  onSave,
}: {
  txn: CashflowTransaction;
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
          className="w-full min-w-0 rounded-md border border-white/20 bg-white/[0.06] px-2 py-1 text-xs font-medium text-white/90 outline-none focus:border-[#0BC18D]/60"
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
      className="min-w-0 w-full rounded-md py-0.5 pr-1 text-left transition hover:bg-white/[0.04] hover:ring-1 hover:ring-white/15"
    >
      <p className="truncate text-xs font-medium text-white/90">{txn.merchantName ?? txn.rawDescription}</p>
      <CashflowSourceSubtitle txn={txn} />
      {cashflowReferenceDisplay(txn) ? (
        <p className="mt-0.5 truncate text-[9px] leading-snug text-white/45" title={txn.referenceId ?? undefined}>
          {cashflowReferenceDisplay(txn)}
        </p>
      ) : null}
    </button>
  );
}

function CashflowLabelCell({
  txn,
  allLabels,
  onSave,
}: {
  txn: CashflowTransaction;
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
            if (event.relatedTarget?.closest("[data-cashflow-label-editor]")) return;
            save();
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
            if (event.key === "Escape") {
              setDraft(txn.label ?? "");
              setEditing(false);
            }
          }}
          className="w-full rounded-md border border-white/20 bg-white/[0.06] px-2 py-1 font-mono text-[11px] text-white/90 outline-none focus:border-[#0BC18D]/60"
          placeholder="Label..."
        />
        <div data-cashflow-label-editor className="absolute left-0 top-[calc(100%+4px)] z-50 w-64 rounded-lg border border-white/15 bg-[#120a28] p-2 shadow-2xl">
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
            <div className="mt-2 border-t border-white/10 pt-1.5">
              {suggestions.map((label) => (
                <button
                  key={label}
                  type="button"
                  className="block w-full rounded-md px-2 py-1.5 text-left font-mono text-[11px] text-white/85 hover:bg-white/[0.08]"
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
      className="w-full truncate rounded-md bg-white/[0.04] px-2 py-1.5 text-center font-mono text-[11px] text-white/70 transition hover:bg-white/[0.07]"
      title={hasMerchant ? "Default: update all with this merchant name" : "This transaction has no merchant name"}
    >
      {txn.label?.trim() || "Label"}
    </button>
  );
}

function CashflowNoteCell({
  txn,
  onSave,
}: {
  txn: CashflowTransaction;
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
            if (event.relatedTarget?.closest("[data-cashflow-note-scope]")) return;
            save();
          }}
          rows={2}
          className="w-full min-h-[2.25rem] resize-y rounded-md border border-white/20 bg-white/[0.06] px-1.5 py-1 text-[11px] text-white/90 outline-none focus:border-[#0BC18D]/60"
          placeholder="Note..."
        />
        <div data-cashflow-note-scope>
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
      className="w-full rounded-md bg-white/[0.04] px-2 py-1.5 text-left text-[11px] leading-snug text-white/60 transition hover:bg-white/[0.07]"
    >
      {txn.note?.trim() ? <span className="line-clamp-2">{txn.note}</span> : "Note"}
    </button>
  );
}

function CashflowCategoryCell({
  txn,
  userCategories,
  onSave,
}: {
  txn: CashflowTransaction;
  userCategories: UserCategory[];
  onSave: (txn: CashflowTransaction, categoryId: number, scope: "this" | "merchant" | "label") => void;
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
        className="flex min-w-0 w-full items-center gap-2 rounded-md py-0.5 pr-1 text-left transition hover:bg-white/[0.04] hover:ring-1 hover:ring-white/15"
      >
        <TransactionCategoryIcon categoryName={txn.categoryName} subcategoryName={txn.subcategoryName} size="md" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12px] text-white/75">{txn.categoryName ?? "Uncategorized"}</span>
          {txn.subcategoryName ? <span className="block truncate text-[11px] text-white/45">{txn.subcategoryName}</span> : null}
        </span>
        <ChevronDown className={cn("h-3 w-3 shrink-0 text-white/25 transition-transform", open && "rotate-180 text-[#0BC18D]")} />
      </button>
      {open ? (
        <div className="absolute left-0 top-[calc(100%+4px)] z-50 flex max-h-[360px] w-[300px] flex-col overflow-hidden rounded-xl border border-white/15 bg-[#120a28]/98 shadow-2xl backdrop-blur-lg">
          <div className="px-2.5 pt-2 pb-1.5">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-white/30" />
              <input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search categories..."
                className="w-full rounded-md border border-white/10 bg-white/[0.04] py-1.5 pl-7 pr-2 text-[11px] text-white/90 outline-none focus:border-[#0BC18D]/40"
              />
            </div>
          </div>
          <div className="border-b border-white/10 px-2.5 pb-2">
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
                    cat.subcategories?.length ? "cursor-default text-white/40" : "text-white/70 hover:bg-white/[0.06]",
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
                    className="flex w-full items-center gap-2 py-1.5 pl-7 pr-3 text-left text-[11px] text-white/60 transition hover:bg-white/[0.06] hover:text-white/85"
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

function CashflowFlagsCell({
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
      {flag ? <span className="text-[1.05rem] leading-none">{flag}</span> : <span className="text-white/35">-</span>}
      {isRecurring ? <Repeat className="h-3 w-3 text-[#AD74FF]" aria-hidden /> : null}
      {hasFx ? <Globe className="h-3 w-3 text-[#AD74FF]/70" aria-hidden /> : null}
      <div className="pointer-events-none absolute bottom-[calc(100%+8px)] left-1/2 z-50 w-max max-w-[240px] -translate-x-1/2 opacity-0 transition-opacity group-hover:opacity-100">
        <div className="rounded-lg border border-white/15 bg-[#1a1230]/98 px-2.5 py-2 text-left text-[10px] leading-snug text-white/90 shadow-xl backdrop-blur-md">
          {countryLine ? <p className="font-medium text-white">{countryLine}</p> : null}
          <p className={cn("text-white/75", countryLine && "mt-1")}>
            <span className="text-white/50">Type: </span>
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
      <span className="shrink-0 text-[9px] text-white/35">{label}</span>
      <div className="inline-flex min-h-[22px] flex-wrap rounded-full border border-white/10 bg-white/[0.04] p-px text-[9px] font-medium">
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
                ? "cursor-not-allowed text-white/15"
                : value === option.id
                  ? "cursor-pointer bg-[#0BC18D]/20 text-[#0BC18D]"
                  : "cursor-pointer text-white/40 hover:text-white/65",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function SortableCashflowHeader({
  label,
  sortKey,
  activeSort,
  onSort,
}: {
  label: string;
  sortKey: CashflowTransactionSortKey;
  activeSort: { key: CashflowTransactionSortKey; dir: "asc" | "desc" };
  onSort: (key: CashflowTransactionSortKey) => void;
}) {
  const active = activeSort.key === sortKey;
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      className={cn(
        "flex min-w-0 items-center justify-center gap-1 text-center text-[10px] font-medium tracking-wide transition-colors hover:text-white/75",
        active ? "text-white/85" : "text-white/50",
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

function InlineTextInput({
  value,
  placeholder,
  className,
  title,
  maxLength,
  onCommit,
}: {
  value: string;
  placeholder: string;
  className?: string;
  title?: string;
  maxLength?: number;
  onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const commit = () => {
    if (draft.trim() !== value.trim()) onCommit(draft);
  };

  return (
    <input
      value={draft}
      placeholder={placeholder}
      title={title}
      maxLength={maxLength}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.currentTarget.blur();
        }
        if (event.key === "Escape") {
          setDraft(value);
          event.currentTarget.blur();
        }
      }}
      className={cn(
        "w-full min-w-0 rounded-md border border-transparent bg-white/[0.04] px-2 py-1.5 text-[11px] outline-none transition-colors placeholder:text-white/25 hover:border-white/10 focus:border-[#0BC18D]/45 focus:bg-white/[0.07]",
        className,
      )}
    />
  );
}

function InvestmentFlowFilter({
  includeInflows,
  includeOutflows,
  onToggle,
}: {
  includeInflows: boolean;
  includeOutflows: boolean;
  onToggle: (key: "includeInvestmentInflows" | "includeInvestmentOutflows") => void;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.04] p-1.5">
      <div className="flex flex-nowrap items-center gap-1">
        <span className="px-1.5 text-[10px] font-medium uppercase tracking-wider text-white/40">
          Investment
        </span>
        {([
          ["includeInvestmentInflows", "Inflows", includeInflows],
          ["includeInvestmentOutflows", "Outflows", includeOutflows],
        ] as const).map(([key, label, selected]) => {
          return (
            <button
              key={key}
              type="button"
              onClick={() => onToggle(key)}
              className={cn(
                "h-6 rounded-lg border px-2 text-[10px] font-semibold leading-none transition-all",
                selected
                  ? key === "includeInvestmentInflows"
                    ? "border-[#0BC18D]/55 bg-gradient-to-br from-[#0BC18D]/22 to-[#2CA2FF]/12 text-white shadow-[0_0_18px_-6px_rgba(11,193,141,0.55)]"
                    : "border-[#AD74FF]/55 bg-gradient-to-br from-[#AD74FF]/22 to-[#FF6F69]/12 text-white shadow-[0_0_18px_-6px_rgba(173,116,255,0.55)]"
                  : "border-white/15 bg-white/[0.03] text-white/65 hover:border-white/35 hover:text-white/85",
              )}
              aria-pressed={selected}
              title={`${selected ? "Include" : "Excluded by default: click to include"} Investment ${label.toLowerCase()} in the Sankey`}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CurrencyPicker({
  currency, options, onSelect,
}: {
  currency: string;
  options: string[];
  onSelect: (c: string) => void;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.04] p-1.5">
      <div className="flex flex-nowrap items-center gap-1">
        <span className="px-1.5 text-[10px] font-medium uppercase tracking-wider text-white/40">
          Currency
        </span>
        {options.map((c) => {
          const selected = c === currency;
          return (
            <button
              key={c}
              type="button"
              onClick={() => onSelect(c)}
              className={cn(
                "h-6 rounded-lg border px-2 text-[10px] font-semibold leading-none transition-all",
                selected
                  ? "border-[#ECAA0B]/55 bg-gradient-to-br from-[#ECAA0B]/22 to-[#ECAA0B]/8 text-white shadow-[0_0_18px_-6px_rgba(236,170,11,0.55)]"
                  : "border-white/15 bg-white/[0.03] text-white/65 hover:border-white/35 hover:text-white/85",
              )}
              aria-pressed={selected}
            >
              {c}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ──────────────────────  PARTICLES TOGGLE  ──────────────────── */

function ParticlesToggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      className={cn(
        "flex h-9 items-center gap-1.5 rounded-xl border px-2.5 text-[11px] font-semibold transition-all",
        on
          ? "border-[#0BC18D]/55 bg-gradient-to-br from-[#0BC18D]/22 to-[#2CA2FF]/12 text-white shadow-[0_0_18px_-6px_rgba(11,193,141,0.55)]"
          : "border-white/15 bg-white/[0.03] text-white/65 hover:border-white/35 hover:text-white/85",
      )}
      aria-pressed={on}
      title={on ? "Particles on" : "Particles off"}
    >
      <Sparkles className={cn("h-3.5 w-3.5", on ? "text-[#34E6B0]" : "text-white/55")} />
      Particles
    </button>
  );
}

/* ──────────────────────  LEGEND DOT  ──────────────────── */

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="inline-block h-2.5 w-2.5 rounded-full"
        style={{ background: color, boxShadow: `0 0 10px ${color}88` }}
      />
      {label}
    </span>
  );
}

/* ──────────────────────  AURORA BACKDROP  ──────────────────── */

function BackgroundAurora() {
  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
      >
        <div className="absolute -left-32 top-10 h-[460px] w-[460px] rounded-full bg-[#0BC18D]/15 blur-[120px]" />
        <div className="absolute right-0 top-32 h-[520px] w-[520px] rounded-full bg-[#AD74FF]/12 blur-[140px]" />
        <div className="absolute bottom-0 left-1/3 h-[420px] w-[420px] rounded-full bg-[#2CA2FF]/10 blur-[120px]" />
      </div>
    </>
  );
}
