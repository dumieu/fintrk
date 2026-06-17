"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  Waves,
  Loader2,
  Upload,
  RefreshCw,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  CashflowSankey,
  computeCashflowSankeyDisplayHeight,
  type CashflowSankeyCategorySelection,
  type CashflowSankeyData,
} from "@/components/cashflow-sankey";
import {
  CategoryTransactionsTable,
  type CategoryTransaction,
  type UserCategory,
} from "@/components/category-transactions-table";
import { CashflowToolbar } from "@/components/cashflow-toolbar";
import { useDashboardRibbon } from "@/components/dashboard-ribbon-context";
import {
  detectTimePreset,
  rollingRange,
  type TimePresetId,
} from "@/lib/time-range-presets";
import { FINTRK_TRANSACTIONS_CHANGED } from "@/lib/notify-transactions-changed";
import { chartOverlayPillClass } from "@/lib/chart-ui";
import { cn } from "@/lib/utils";

interface Filters {
  dateFrom: string;
  dateTo: string;
}

export default function CashflowPage() {
  const { setRibbon } = useDashboardRibbon();
  const [data, setData] = useState<CashflowSankeyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<CashflowSankeyCategorySelection | null>(null);
  const [categoryTxns, setCategoryTxns] = useState<CategoryTransaction[]>([]);
  const [categoryTxnsLoading, setCategoryTxnsLoading] = useState(false);
  const [userCategories, setUserCategories] = useState<UserCategory[]>([]);
  const [distinctLabels, setDistinctLabels] = useState<string[]>([]);
  const [transactionRefreshTick, setTransactionRefreshTick] = useState(0);
  const categoryTableRef = useRef<HTMLDivElement | null>(null);
  const sankeySelectionRef = useRef<HTMLDivElement | null>(null);
  const sankeyAreaRef = useRef<HTMLDivElement | null>(null);
  const [sankeyAreaSize, setSankeyAreaSize] = useState({ w: 1280, h: 720 });
  const sankeyHeight = computeCashflowSankeyDisplayHeight(
    sankeyAreaSize.w,
    sankeyAreaSize.h,
  );
  const [filters, setFilters] = useState<Filters>({
    dateFrom: "",
    dateTo: "",
  });
  const inFlightRef = useRef<AbortController | null>(null);

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

  const handleTimePreset = useCallback((preset: TimePresetId) => {
    setFilters((f) => {
      if (preset === "all") return { ...f, dateFrom: "", dateTo: "" };
      const { from, to } = rollingRange(preset);
      return { ...f, dateFrom: from, dateTo: to };
    });
  }, []);

  const activePreset = detectTimePreset(filters.dateFrom, filters.dateTo);

  useEffect(() => {
    setRibbon(
      <CashflowToolbar
        activePreset={activePreset}
        onTimePreset={handleTimePreset}
      />,
    );
    return () => setRibbon(null);
  }, [activePreset, handleTimePreset, setRibbon]);

  const hasData = !!data && (data.inflow.value > 0 || data.outflow.value > 0 || data.savings.value > 0);

  useEffect(() => {
    const el = sankeyAreaRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (!r) return;
      const w = Math.floor(r.width);
      const h = Math.floor(r.height);
      if (w > 0 && h > 0) {
        setSankeyAreaSize((prev) =>
          prev.w === w && prev.h === h ? prev : { w, h },
        );
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [selectedCategory, loading, hasData]);

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
  }, [filters.dateFrom, filters.dateTo]);

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
    <div
      ref={sankeySelectionRef}
      className={`flex min-h-0 flex-1 flex-col bg-app-canvas ${selectedCategory ? "overflow-y-auto" : "overflow-hidden"}`}
    >
      <div
        ref={sankeyAreaRef}
        className="relative flex min-h-0 w-full flex-1 items-center justify-center"
      >
        {refreshing && (
          <div className={cn(chartOverlayPillClass, "absolute right-3 top-3 z-20 flex items-center gap-1.5 rounded-full uppercase tracking-wider sm:right-4 sm:top-4")}>
            <RefreshCw className="h-3 w-3 animate-spin" />
            Updating
          </div>
        )}

        {loading ? (
          <div className="flex h-full min-h-[280px] flex-col items-center justify-center gap-4">
            <div className="relative">
              <div className="absolute inset-0 animate-pulse rounded-full bg-[#0BC18D]/20 blur-xl" />
              <Loader2 className="relative h-10 w-10 animate-spin text-[#34E6B0]" />
            </div>
            <p className="text-sm text-muted-foreground">Mapping your money flow…</p>
          </div>
        ) : !hasData ? (
          <div className="flex h-full min-h-[280px] flex-col items-center justify-center px-4 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[#0BC18D]/20 to-[#AD74FF]/20 ring-1 ring-chart-border">
              <Waves className="h-8 w-8 text-[#34E6B0]" />
            </div>
            <p className="text-lg font-semibold text-foreground">Your cashflow story is waiting</p>
            <p className="mt-2 max-w-md text-sm text-muted-foreground">
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
            height={sankeyHeight}
            selectedCategory={selectedCategory}
            onCategorySelect={toggleSelectedCategory}
          />
        )}
      </div>

      {selectedCategory ? (
        <div
          ref={categoryTableRef}
          className="scrollbar-slim max-h-[min(45vh,480px)] shrink-0 overflow-y-auto border-t border-chart-border px-3 py-3 sm:px-4"
        >
          <CategoryTransactionsTable
            title={`${selectedCategory.name} transactions`}
            subtitle={`Matching the current Sankey filters and selected ${selectedCategory.level} only`}
            rows={categoryTxns}
            loading={categoryTxnsLoading}
            userCategories={userCategories}
            allLabels={distinctLabels}
            onRowsChange={setCategoryTxns}
            emptyMessage="No transactions found for this Sankey category."
          />
        </div>
      ) : null}
    </div>
  );
}
