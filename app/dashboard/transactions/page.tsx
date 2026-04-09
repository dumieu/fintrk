"use client";

import { Fragment, useEffect, useState, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Search,
  ArrowUpDown,
  Globe,
  Repeat,
  Upload,
  ArrowLeftRight,
  Trash2,
  Loader2,
} from "lucide-react";
import Link from "next/link";
import {
  accountKindSubtitleLabel,
  cardNetworkLabel,
  formatCurrency,
  formatDate,
  formatMaskedNumber,
  TRANSACTION_SUBTITLE_SEPARATOR,
} from "@/lib/format";
import { countryDisplayName, flagEmoji, transactionTypeLabel } from "@/lib/transaction-flags";
import { cn } from "@/lib/utils";
import { CardNetworkLogo } from "@/components/card-network-logo";
import { TransactionInsightHover } from "@/components/transaction-insight-hover";
import { TransactionCategoryIcon } from "@/components/transaction-category-icon";
import { CategorySlicer, type CategorySlicerOption } from "@/components/category-slicer";
import { TimeSlicer } from "@/components/time-slicer";
import { detectTimePreset, rollingRange, type TimePresetId } from "@/lib/time-range-presets";
import {
  dispatchTransactionsChanged,
  FINTRK_TRANSACTIONS_CHANGED,
} from "@/lib/notify-transactions-changed";

interface Transaction {
  id: string;
  postedDate: string;
  valueDate: string | null;
  rawDescription: string;
  referenceId: string | null;
  merchantName: string | null;
  mccCode: number | null;
  baseAmount: string;
  baseCurrency: string;
  foreignAmount: string | null;
  foreignCurrency: string | null;
  implicitFxRate: string | null;
  implicitFxSpreadBps: string | null;
  categoryId: number | null;
  categorySuggestion: string | null;
  categoryConfidence: string | null;
  /** Resolved parent category (DB hierarchy) or suggestion fallback. */
  categoryName: string | null;
  /** Leaf category when assigned to a subcategory row; null if top-level only. */
  subcategoryName: string | null;
  countryIso: string | null;
  isRecurring: boolean;
  aiConfidence: string | null;
  balanceAfter: string | null;
  accountId: string;
  statementId: number | null;
  accountType: string | null;
  accountCardNetwork: string | null;
  accountMaskedNumber: string | null;
  accountInstitutionName: string | null;
  accountName: string | null;
  statementFileName: string | null;
  statementPeriodStart: string | null;
  statementPeriodEnd: string | null;
  note: string | null;
  label: string | null;
}

interface Filters {
  search: string;
  dateFrom: string;
  dateTo: string;
  isRecurring: string;
  accountId: string;
  categoryId: string;
  accountKind: string;
  accountNumber: string;
  amountMin: number;
  amountMax: number;
  countryIso: string;
  sortBy: string;
  sortDir: string;
}

const AMOUNT_RANGE_MIN = -50_000;
const AMOUNT_RANGE_MAX = 50_000;
const AMOUNT_STEP = 50;
/** Page size for API + infinite scroll (under API max of 100). */
const TRANSACTION_PAGE_SIZE = 40;

interface AmountTotalRow {
  currency: string;
  creditSum: string;
  debitSum: string;
}

/** Keeps first occurrence; avoids duplicate keys when API pages overlap on sort ties. */
function dedupeTransactionsById(rows: Transaction[]): Transaction[] {
  const seen = new Set<string>();
  const out: Transaction[] = [];
  for (const row of rows) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    out.push(row);
  }
  return out;
}

function buildTransactionQueryParams(f: Filters, page: number): URLSearchParams {
  const params = new URLSearchParams();
  if (f.search) params.set("search", f.search);
  if (f.dateFrom) params.set("dateFrom", f.dateFrom);
  if (f.dateTo) params.set("dateTo", f.dateTo);
  if (f.isRecurring) params.set("isRecurring", f.isRecurring);
  if (f.accountId) params.set("accountId", f.accountId);
  if (f.categoryId) params.set("categoryId", f.categoryId);
  if (f.accountKind) params.set("accountKind", f.accountKind);
  if (f.accountNumber.trim()) params.set("accountNumber", f.accountNumber.trim());
  if (f.amountMin > AMOUNT_RANGE_MIN) params.set("amountMin", f.amountMin.toString());
  if (f.amountMax < AMOUNT_RANGE_MAX) params.set("amountMax", f.amountMax.toString());
  if (f.countryIso) params.set("countryIso", f.countryIso);
  params.set("sortBy", f.sortBy);
  params.set("sortDir", f.sortDir);
  params.set("page", String(page));
  params.set("limit", String(TRANSACTION_PAGE_SIZE));
  return params;
}

function transactionReferenceDisplay(txn: Transaction): string | null {
  const ref = txn.referenceId?.trim();
  if (ref) return ref.replace(/\s+/g, " ");
  return null;
}

function transactionReferenceTitle(txn: Transaction): string | undefined {
  const ref = txn.referenceId?.trim();
  return ref || undefined;
}

/** Plain-text subtitle for tooltips / accessibility (includes network name when a logo is shown). */
function transactionSourceSubtitleTitle(txn: Transaction): string {
  const kind = accountKindSubtitleLabel(txn.accountType, txn.accountCardNetwork);
  const masked = formatMaskedNumber(txn.accountMaskedNumber);
  const net = cardNetworkLabel(txn.accountCardNetwork);
  const bank =
    (txn.accountInstitutionName?.trim() || txn.accountName?.trim() || "") || null;

  const mid =
    masked && net ? `${net} ${masked}` : masked || null;
  const parts = [kind, mid, bank].filter(Boolean) as string[];
  return parts.join(TRANSACTION_SUBTITLE_SEPARATOR);
}

function TransactionSourceSubtitle({ txn }: { txn: Transaction }) {
  const kind = accountKindSubtitleLabel(txn.accountType, txn.accountCardNetwork);
  const masked = formatMaskedNumber(txn.accountMaskedNumber);
  const bank =
    (txn.accountInstitutionName?.trim() || txn.accountName?.trim() || "") || null;
  const network = txn.accountCardNetwork;
  const showLogo =
    Boolean(masked) && Boolean(network) && network !== "unknown";

  const sep = (
    <span className="inline-block shrink-0" aria-hidden>
      {TRANSACTION_SUBTITLE_SEPARATOR}
    </span>
  );

  const segments: React.ReactNode[] = [];
  if (kind) segments.push(<span>{kind}</span>);
  if (showLogo || masked) {
    segments.push(
      <span className="inline-flex items-center gap-1 align-middle">
        {showLogo ? <CardNetworkLogo network={network} className="relative top-px" /> : null}
        {masked ? (
          <span className="font-mono tabular-nums tracking-tight text-white/55">{masked}</span>
        ) : null}
      </span>,
    );
  }
  if (bank) segments.push(<span>{bank}</span>);

  if (segments.length === 0) return null;

  const title = transactionSourceSubtitleTitle(txn);

  return (
    <p className="mt-0.5 min-w-0 max-w-full text-[9px] leading-snug" title={title}>
      <span className="block min-w-0 truncate text-white/45">
        {segments.map((node, i) => (
          <Fragment key={i}>
            {i > 0 ? sep : null}
            {node}
          </Fragment>
        ))}
      </span>
    </p>
  );
}

function FlagsCell({
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
  const countryLine = name
    ? `${name}${countryIso ? ` (${countryIso.toUpperCase()})` : ""}`
    : null;
  const tooltip = [countryLine, `Transaction: ${typeLine}`].filter(Boolean).join(" · ");

  return (
    <div className="hidden h-full w-full sm:flex items-center justify-center">
      <div
        className="group relative flex cursor-default items-center justify-center gap-1.5 px-1 py-0.5"
        aria-label={tooltip}
      >
        {flag ? (
          <span className="text-[1.05rem] leading-none select-none" aria-hidden>
            {flag}
          </span>
        ) : (
          <span className="flex h-5 w-5 items-center justify-center rounded bg-white/[0.06] text-[9px] text-white/35">
            —
          </span>
        )}
        {isRecurring && <Repeat className="h-3 w-3 shrink-0 text-[#AD74FF]" aria-hidden />}
        {hasFx && <Globe className="h-3 w-3 shrink-0 text-[#AD74FF]/70" aria-hidden />}

        <div className="pointer-events-none absolute bottom-[calc(100%+8px)] left-1/2 z-50 w-max max-w-[min(240px,calc(100vw-2rem))] -translate-x-1/2 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
          <div className="rounded-lg border border-white/15 bg-[#1a1230]/98 px-2.5 py-2 text-left text-[10px] leading-snug text-white/90 shadow-xl backdrop-blur-md">
            {countryLine && <p className="font-medium text-white">{countryLine}</p>}
            <p className={cn("text-white/75", countryLine && "mt-1")}>
              <span className="text-white/50">Type: </span>
              {typeLine}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

const LABEL_MAX_LEN = 20;

function TransactionLabelCell({
  transactionId,
  value,
  onSaved,
}: {
  transactionId: string;
  value: string | null;
  onSaved: (id: string, label: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");

  useEffect(() => {
    if (!editing) setDraft(value ?? "");
  }, [value, editing]);

  const persist = async () => {
    const trimmed = draft.trim().slice(0, LABEL_MAX_LEN);
    const next = trimmed === "" ? null : trimmed;
    const prev = (value ?? "").trim().slice(0, LABEL_MAX_LEN) || null;
    if (next === prev) {
      setEditing(false);
      return;
    }
    try {
      const res = await fetch("/api/transactions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactionId, label: trimmed }),
      });
      if (res.ok) {
        const json = (await res.json()) as { label?: string | null };
        onSaved(transactionId, json.label ?? next);
        dispatchTransactionsChanged();
      }
    } finally {
      setEditing(false);
    }
  };

  return (
    <div
      className="min-w-0 w-full max-w-full"
      onClick={(e) => e.stopPropagation()}
    >
      {editing ? (
        <input
          type="text"
          autoFocus
          maxLength={LABEL_MAX_LEN}
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, LABEL_MAX_LEN))}
          onBlur={() => void persist()}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setDraft(value ?? "");
              setEditing(false);
            }
          }}
          className="w-full min-w-0 rounded-md border border-white/20 bg-white/[0.06] px-1.5 py-1 font-mono text-[11px] tabular-nums text-white/90 outline-none focus:border-[#0BC18D]/60 focus:ring-1 focus:ring-[#0BC18D]/30"
          aria-label="Transaction label"
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          aria-label="Add or edit label"
          className={cn(
            "w-full max-w-full truncate text-left font-mono text-[11px] tabular-nums transition-[background-color]",
            value?.trim()
              ? "rounded-md px-1.5 py-1 text-white/75 hover:bg-white/[0.06]"
              : "min-h-[1.75rem] rounded-full bg-white/[0.015] px-2 py-1.5 hover:bg-white/[0.04]",
          )}
        >
          {value?.trim() ? value : null}
        </button>
      )}
    </div>
  );
}

function TransactionNoteCell({
  transactionId,
  value,
  onSaved,
}: {
  transactionId: string;
  value: string | null;
  onSaved: (id: string, note: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");

  useEffect(() => {
    if (!editing) setDraft(value ?? "");
  }, [value, editing]);

  const persist = async () => {
    const trimmed = draft.trim();
    const next = trimmed === "" ? null : trimmed;
    const prev = (value ?? "").trim() || null;
    if (next === prev) {
      setEditing(false);
      return;
    }
    try {
      const res = await fetch("/api/transactions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactionId, note: trimmed }),
      });
      if (res.ok) {
        const json = (await res.json()) as { note?: string | null };
        onSaved(transactionId, json.note ?? next);
        dispatchTransactionsChanged();
      }
    } finally {
      setEditing(false);
    }
  };

  return (
    <div
      className="min-w-0 w-full"
      onClick={(e) => e.stopPropagation()}
    >
      {editing ? (
        <textarea
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => void persist()}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setDraft(value ?? "");
              setEditing(false);
            }
          }}
          rows={2}
          className="w-full min-h-[2.25rem] resize-y rounded-md border border-white/20 bg-white/[0.06] px-1.5 py-1 text-[11px] leading-snug text-white/90 placeholder:text-white/35 outline-none focus:border-[#0BC18D]/60 focus:ring-1 focus:ring-[#0BC18D]/30"
          placeholder="Note…"
          aria-label="Transaction note"
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          aria-label="Add or edit note"
          className={cn(
            "w-full max-w-full text-left text-[11px] leading-snug transition-[background-color,border-color,box-shadow]",
            value?.trim()
              ? "rounded-md px-1.5 py-1 text-white/75 hover:bg-white/[0.06]"
              : "min-h-[1.75rem] rounded-full bg-white/[0.015] px-3 py-1.5 hover:bg-white/[0.04]",
          )}
        >
          {value?.trim() ? <span className="line-clamp-3 break-words">{value}</span> : null}
        </button>
      )}
    </div>
  );
}

function formatCompact(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "−" : "";
  if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(abs % 1_000 === 0 ? 0 : 1)}K`;
  return `${sign}${abs}`;
}

function AmountRangeSlider({
  min,
  max,
  step,
  valueMin,
  valueMax,
  onChange,
}: {
  min: number;
  max: number;
  step: number;
  valueMin: number;
  valueMax: number;
  onChange: (lo: number, hi: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const pctMin = ((valueMin - min) / (max - min)) * 100;
  const pctMax = ((valueMax - min) / (max - min)) * 100;
  const isDefault = valueMin === min && valueMax === max;

  return (
    <div className="relative min-w-0 w-full">
      {/* Title + reset — positioned above the track so they don't affect flex alignment height */}
      <div className="absolute inset-x-0 -top-4 flex items-center justify-between px-0.5">
        <span className="text-[8px] font-medium uppercase tracking-wider text-white/40 sm:text-[9px]">
          Amount range
        </span>
        {!isDefault && (
          <button
            type="button"
            onClick={() => onChange(min, max)}
            className="text-[9px] font-medium uppercase tracking-wider text-[#0BC18D]/80 transition-colors hover:text-[#0BC18D]"
          >
            Reset
          </button>
        )}
      </div>

      {/* Track — this is the only element contributing to the box height for flex alignment */}
      <div className="relative flex h-6 items-center">
        <div
          ref={trackRef}
          className="absolute inset-x-0 top-1/2 h-[5px] -translate-y-1/2 rounded-full"
          style={{
            background: "linear-gradient(90deg, rgba(252,165,165,.15), rgba(255,255,255,.06) 50%, rgba(167,243,208,.15))",
          }}
        />
        <div
          className="absolute top-1/2 h-[5px] -translate-y-1/2 rounded-full"
          style={{
            left: `${pctMin}%`,
            right: `${100 - pctMax}%`,
            background: "linear-gradient(90deg, #FCA5A5, #7E57C2 50%, #A7F3D0)",
            boxShadow: "0 0 8px rgba(126,87,194,.35)",
          }}
        />

        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={valueMin}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (v <= valueMax) onChange(v, valueMax);
          }}
          className="amount-range-thumb pointer-events-none absolute inset-x-0 top-0 h-full w-full appearance-none bg-transparent"
          style={{ zIndex: pctMin > 50 ? 5 : 3 }}
          aria-label="Minimum amount"
        />

        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={valueMax}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (v >= valueMin) onChange(valueMin, v);
          }}
          className="amount-range-thumb pointer-events-none absolute inset-x-0 top-0 h-full w-full appearance-none bg-transparent"
          style={{ zIndex: pctMax < 50 ? 5 : 4 }}
          aria-label="Maximum amount"
        />
      </div>

      {/* Value labels — positioned below the track */}
      <div className="absolute inset-x-0 -bottom-3.5 flex items-center justify-between px-0.5">
        <span className={cn(
          "text-[10px] font-semibold tabular-nums transition-colors",
          valueMin > min ? "text-[#FCA5A5]" : "text-white/30",
        )}>
          ${formatCompact(valueMin)}
        </span>
        <span className={cn(
          "text-[10px] font-semibold tabular-nums transition-colors",
          valueMax < max ? "text-[#A7F3D0]" : "text-white/30",
        )}>
          ${formatCompact(valueMax)}
        </span>
      </div>
    </div>
  );
}

export default function TransactionsPage() {
  const [txns, setTxns] = useState<Transaction[]>([]);
  const [total, setTotal] = useState(0);
  const [statementCount, setStatementCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteInProgress, setDeleteInProgress] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>({
    search: "",
    dateFrom: "",
    dateTo: "",
    isRecurring: "",
    accountId: "",
    categoryId: "",
    accountKind: "",
    accountNumber: "",
    amountMin: AMOUNT_RANGE_MIN,
    amountMax: AMOUNT_RANGE_MAX,
    countryIso: "",
    sortBy: "posted_date",
    sortDir: "desc",
  });
  const loadMoreGuardRef = useRef(false);
  const scrollSentinelRef = useRef<HTMLDivElement | null>(null);
  const tableScrollRef = useRef<HTMLDivElement | null>(null);
  const txnsLengthRef = useRef(0);
  txnsLengthRef.current = txns.length;
  /** Bumps when filters/sort change so in-flight load-more responses are ignored. */
  const listVersionRef = useRef(0);
  const [categoryOptions, setCategoryOptions] = useState<CategorySlicerOption[]>([]);
  const [amountTotals, setAmountTotals] = useState<AmountTotalRow[]>([]);

  useEffect(() => {
    fetch("/api/transactions/filter-options")
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.categories)) setCategoryOptions(d.categories);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const reloadFilterOptions = () => {
      fetch("/api/transactions/filter-options")
        .then((r) => r.json())
        .then((d) => {
          if (Array.isArray(d.categories)) setCategoryOptions(d.categories);
        })
        .catch(() => {});
    };
    window.addEventListener(FINTRK_TRANSACTIONS_CHANGED, reloadFilterOptions);
    return () => window.removeEventListener(FINTRK_TRANSACTIONS_CHANGED, reloadFilterOptions);
  }, []);

  /** Drop category filter if that category no longer appears (e.g. no history after data change). */
  useEffect(() => {
    if (!filters.categoryId) return;
    const stillValid = categoryOptions.some((o) => o.value === filters.categoryId);
    if (!stillValid) setFilters((f) => ({ ...f, categoryId: "" }));
  }, [categoryOptions, filters.categoryId]);

  useEffect(() => {
    setSelectedIds(new Set());
  }, [
    filters.search,
    filters.accountId,
    filters.categoryId,
    filters.dateFrom,
    filters.dateTo,
    filters.isRecurring,
    filters.accountKind,
    filters.accountNumber,
    filters.amountMin,
    filters.amountMax,
    filters.countryIso,
    filters.sortBy,
    filters.sortDir,
  ]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const saveTransactionNote = useCallback((id: string, note: string | null) => {
    setTxns((prev) => prev.map((t) => (t.id === id ? { ...t, note } : t)));
  }, []);

  const saveTransactionLabel = useCallback((id: string, label: string | null) => {
    setTxns((prev) => prev.map((t) => (t.id === id ? { ...t, label } : t)));
  }, []);

  const handleTimePreset = useCallback((preset: TimePresetId) => {
    setFilters((f) => {
      if (preset === "all") {
        return { ...f, dateFrom: "", dateTo: "" };
      }
      const { from, to } = rollingRange(preset);
      return { ...f, dateFrom: from, dateTo: to };
    });
  }, []);

  /** Initial / filter change: replace list from page 1. */
  useEffect(() => {
    let cancelled = false;
    listVersionRef.current += 1;
    setLoading(true);
    loadMoreGuardRef.current = false;
    const params = buildTransactionQueryParams(filters, 1);
    void (async () => {
      try {
        const res = await fetch(`/api/transactions?${params}`);
        const data = await res.json();
        if (cancelled) return;
        if (data.data) {
          setTxns(dedupeTransactionsById(data.data));
          setTotal(typeof data.total === "number" ? data.total : 0);
          setStatementCount(typeof data.statementCount === "number" ? data.statementCount : 0);
          setAmountTotals(Array.isArray(data.amountTotals) ? data.amountTotals : []);
        } else {
          setTxns([]);
          setTotal(0);
          setStatementCount(0);
          setAmountTotals([]);
        }
      } catch {
        if (!cancelled) {
          setTxns([]);
          setTotal(0);
          setStatementCount(0);
          setAmountTotals([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [filters]);

  const loadMore = useCallback(async () => {
    if (loading || loadMoreGuardRef.current) return;
    const len = txnsLengthRef.current;
    if (len >= total || total === 0) return;
    const version = listVersionRef.current;
    loadMoreGuardRef.current = true;
    setLoadingMore(true);
    const nextPage = Math.floor(len / TRANSACTION_PAGE_SIZE) + 1;
    try {
      const params = buildTransactionQueryParams(filters, nextPage);
      const res = await fetch(`/api/transactions?${params}`);
      const data = await res.json();
      if (version !== listVersionRef.current) return;
      if (data.data?.length) {
        setTxns((prev) => {
          const seen = new Set(prev.map((t) => t.id));
          const merged = [...prev];
          for (const row of data.data) {
            if (seen.has(row.id)) continue;
            seen.add(row.id);
            merged.push(row);
          }
          return merged;
        });
      }
      if (typeof data.total === "number") setTotal(data.total);
      if (typeof data.statementCount === "number") setStatementCount(data.statementCount);
    } catch {
      /* keep existing rows */
    } finally {
      loadMoreGuardRef.current = false;
      setLoadingMore(false);
    }
  }, [filters, loading, total]);

  const hasMore = total > 0 && txns.length < total;

  useEffect(() => {
    const root = tableScrollRef.current;
    const el = scrollSentinelRef.current;
    if (!root || !el || !hasMore || loading) return;
    const obs = new IntersectionObserver(
      (entries) => {
        const hit = entries.some((e) => e.isIntersecting);
        if (hit) void loadMore();
      },
      { root, rootMargin: "120px 0px 200px 0px", threshold: 0 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasMore, loadMore, loading, txns.length]);

  const toggleSort = (col: string) => {
    setFilters((f) => ({
      ...f,
      sortBy: col,
      sortDir: f.sortBy === col && f.sortDir === "desc" ? "asc" : "desc",
    }));
  };

  const confirmDeleteSelected = useCallback(async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setDeleteInProgress(true);
    setDeleteError(null);
    try {
      const res = await fetch("/api/transactions", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactionIds: ids }),
      });
      const deleteJson = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof deleteJson.error === "string" ? deleteJson.error : "Delete failed");
      setSelectedIds(new Set());
      setDeleteConfirmOpen(false);
      const params = buildTransactionQueryParams(filters, 1);
      const refresh = await fetch(`/api/transactions?${params}`);
      const listJson = await refresh.json();
      if (listJson.data) {
        setTxns(dedupeTransactionsById(listJson.data));
        setTotal(typeof listJson.total === "number" ? listJson.total : 0);
        setStatementCount(typeof listJson.statementCount === "number" ? listJson.statementCount : 0);
        setAmountTotals(Array.isArray(listJson.amountTotals) ? listJson.amountTotals : []);
      }
      dispatchTransactionsChanged();
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setDeleteInProgress(false);
    }
  }, [selectedIds, filters]);

  const selectedCount = selectedIds.size;

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-gradient-to-b from-[#08051a] via-[#10082a] to-[#160e35]">
      <div className="mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col px-2.5 py-3 sm:px-4 sm:py-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-3 flex shrink-0 flex-col gap-3 sm:mb-4 sm:flex-row sm:items-end sm:justify-between sm:gap-4"
        >
          <div className="min-w-0">
            <h1 className="text-xl font-bold leading-tight text-white sm:text-2xl md:text-3xl">Transactions</h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-1 text-xs leading-snug text-white/70 sm:text-sm">
              <span>
                {total > 0 ? (
                  <>
                    {total.toLocaleString()} transactions
                    {statementCount > 0 && (
                      <>
                        <span className="text-white/35 select-none" aria-hidden>
                          {"\u00A0\u00A0·\u00A0\u00A0"}
                        </span>
                        {statementCount.toLocaleString()} {statementCount === 1 ? "statement" : "statements"}
                      </>
                    )}
                  </>
                ) : (
                  "No transactions yet"
                )}
              </span>
              {total > 0 && amountTotals.length > 0 && (
                <>
                  <span className="text-white/35 select-none" aria-hidden>
                    {"\u00A0\u00A0\u00A0"}
                  </span>
                  {amountTotals.map((t, i) => {
                    const creditN = parseFloat(t.creditSum);
                    const debitN = parseFloat(t.debitSum);
                    const suffix = amountTotals.length > 1 ? ` ${t.currency}` : "";
                    return (
                      <Fragment key={t.currency}>
                        {i > 0 ? (
                          <span className="text-white/30 select-none px-2" aria-hidden>
                            ·
                          </span>
                        ) : null}
                        <span className="font-medium tabular-nums text-[#FCA5A5]">
                          Credit{suffix}{" "}
                          {creditN < 0
                            ? `−${formatCurrency(Math.abs(creditN), t.currency)}`
                            : formatCurrency(0, t.currency)}
                        </span>
                        <span className="text-white/35 select-none" aria-hidden>
                          {"\u00A0\u00A0"}
                        </span>
                        <span className="font-medium tabular-nums text-[#A7F3D0]">
                          Debit{suffix}{" "}
                          {debitN > 0
                            ? `+${formatCurrency(debitN, t.currency)}`
                            : formatCurrency(0, t.currency)}
                        </span>
                      </Fragment>
                    );
                  })}
                </>
              )}
            </p>
          </div>
          <Link href="/dashboard/upload" className="shrink-0 sm:ml-auto">
            <Button
              variant="ghost"
              className="w-full justify-center text-[#0BC18D] hover:bg-[#0BC18D]/10 sm:w-auto"
            >
              <Upload className="mr-2 h-4 w-4" />
              Import More
            </Button>
          </Link>
        </motion.div>

        {selectedCount > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-3 flex shrink-0 flex-col gap-2 rounded-lg border border-red-500/25 bg-red-500/[0.08] px-2.5 py-2.5 sm:mb-4 sm:flex-row sm:items-center sm:justify-between sm:rounded-xl sm:px-4 sm:py-3"
          >
            <p className="text-sm text-white/85">
              <span className="font-medium text-white">{selectedCount}</span>
              {" "}transaction{selectedCount === 1 ? "" : "s"} selected
            </p>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              className="border-red-500/40 bg-red-600/90 text-white hover:bg-red-600"
              onClick={() => {
                setDeleteError(null);
                setDeleteConfirmOpen(true);
              }}
            >
              <Trash2 className="w-3.5 h-3.5 mr-1.5" />
              Delete transaction{selectedCount === 1 ? "" : "s"}
            </Button>
          </motion.div>
        )}

        {deleteConfirmOpen && (
          <div
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/75 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="txn-delete-title"
            onClick={() => {
              if (!deleteInProgress) {
                setDeleteConfirmOpen(false);
                setDeleteError(null);
              }
            }}
          >
            <div
              className="w-full max-w-md rounded-xl border border-white/15 bg-[#120a28] p-6 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 id="txn-delete-title" className="text-lg font-semibold text-white">
                Delete {selectedCount} transaction{selectedCount === 1 ? "" : "s"}?
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-white/65">
                This will permanently remove the selected transaction{selectedCount === 1 ? "" : "s"} from your
                database. This action cannot be undone.
              </p>
              {deleteError && (
                <p className="mt-3 text-sm text-red-400" role="alert">
                  {deleteError}
                </p>
              )}
              <div className="mt-6 flex flex-wrap justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  disabled={deleteInProgress}
                  onClick={() => {
                    setDeleteConfirmOpen(false);
                    setDeleteError(null);
                  }}
                  className="text-white/80"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  disabled={deleteInProgress}
                  className="bg-red-600 text-white hover:bg-red-600/90"
                  onClick={() => void confirmDeleteSelected()}
                >
                  {deleteInProgress ? "Deleting…" : "Delete permanently"}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Search + Amount Range + Period */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="mb-3 flex min-w-0 shrink-0 flex-col gap-2 sm:mb-4 sm:flex-row sm:items-center sm:gap-3"
        >
          {/* Search — full width on xs; ~1/6 from sm */}
          <div className="relative w-full min-w-0 shrink-0 sm:w-[16.666%]">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/50 sm:left-3" />
            <input
              type="text"
              placeholder="Search…"
              value={filters.search}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
              className="w-full rounded-lg border border-white/15 bg-white/[0.05] py-2 pl-9 pr-3 text-sm text-white placeholder:text-white/45 focus:border-[#0BC18D]/40 focus:outline-none focus:ring-1 focus:ring-[#0BC18D]/20 sm:py-2.5 sm:pl-10"
            />
          </div>

          {/* Amount range — fills horizontal space between search and Period on sm+ */}
          <div className="my-4 min-w-0 w-full sm:my-0 sm:min-w-0 sm:flex-1">
            <AmountRangeSlider
              min={AMOUNT_RANGE_MIN}
              max={AMOUNT_RANGE_MAX}
              step={AMOUNT_STEP}
              valueMin={filters.amountMin}
              valueMax={filters.amountMax}
              onChange={(lo, hi) => setFilters((f) => ({ ...f, amountMin: lo, amountMax: hi }))}
            />
          </div>

          <div className="w-full max-w-full sm:w-auto sm:shrink-0">
            <TimeSlicer
              activePreset={detectTimePreset(filters.dateFrom, filters.dateTo)}
              onSelect={handleTimePreset}
            />
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12, duration: 0.25 }}
          className="mb-3 shrink-0 sm:mb-4"
        >
          <CategorySlicer
            options={categoryOptions}
            selectedId={filters.categoryId}
            onSelect={(categoryId) => setFilters((f) => ({ ...f, categoryId }))}
          />
        </motion.div>

        {/* Transaction Table — fills remaining viewport; list scrolls inside */}
        <Card className="flex min-h-0 flex-1 flex-col overflow-hidden border-white/[0.10] bg-white/[0.04] py-0 text-white rounded-xl sm:rounded-2xl">
          <CardContent className="flex min-h-0 flex-1 flex-col p-0">
            {loading && txns.length === 0 ? (
              <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-4 py-8">
                <Loader2 className="h-8 w-8 animate-spin text-[#0BC18D]/90" aria-hidden />
                <p className="text-xs text-white/50">Loading transactions…</p>
              </div>
            ) : txns.length > 0 ? (
              <div
                ref={tableScrollRef}
                className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-auto overscroll-y-contain [scrollbar-gutter:stable]"
              >
                {/* Desktop header — sticky within scroll area */}
                <div className="sticky top-0 z-10 hidden sm:grid sm:grid-cols-[auto_minmax(0,1.65fr)_minmax(4.5rem,6.5rem)_minmax(0,12rem)_max-content_80px_minmax(7rem,1.25fr)_36px] sm:items-center gap-2 border-b border-white/10 bg-[#10082a]/95 px-3 py-2.5 backdrop-blur-md sm:px-4 sm:py-3">
                  <button
                    type="button"
                    onClick={() => toggleSort("posted_date")}
                    className="flex w-full min-w-0 items-center justify-center gap-1 whitespace-nowrap text-center text-[10px] font-medium tracking-wide text-white/50 hover:text-white/70"
                  >
                    Date <ArrowUpDown className="h-3 w-3 shrink-0 opacity-70" aria-hidden />
                  </button>
                  <span className="block w-full min-w-0 text-center text-[10px] font-medium tracking-wide text-white/50">Description</span>
                  <span className="block w-full min-w-0 truncate text-center text-[10px] font-medium tracking-wide text-white/50">Label</span>
                  <div className="flex min-w-0 w-full justify-center px-0.5 text-center">
                    <span className="line-clamp-2 max-w-full text-[10px] font-medium leading-tight tracking-wide text-white/50">Category / Subcategory</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleSort("base_amount")}
                    className="flex w-full min-w-0 items-center justify-center gap-1 text-center text-[10px] font-medium tracking-wide text-white/50 hover:text-white/70"
                  >
                    Amount <ArrowUpDown className="h-3 w-3 shrink-0 opacity-70" aria-hidden />
                  </button>
                  <span className="block w-full text-center text-[10px] font-medium tracking-wide text-white/50">Flags</span>
                  <span className="block w-full min-w-0 text-center text-[10px] font-medium tracking-wide text-white/50">Note</span>
                  <span className="sr-only">Select</span>
                </div>

                <div className="min-w-0 divide-y divide-white/10">
                  {txns.map((txn, i) => {
                    const amt = parseFloat(txn.baseAmount);
                    const isPositive = amt > 0;
                    const isNegative = amt < 0;
                    const hasFx = !!txn.foreignCurrency;
                    const spreadBps = txn.implicitFxSpreadBps ? parseFloat(txn.implicitFxSpreadBps) : 0;
                    return (
                      <motion.div
                        key={txn.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: Math.min(i, 24) * 0.015 }}
                        className="relative grid grid-cols-[auto_1fr] gap-1.5 px-2.5 py-2.5 pr-10 transition-colors hover:bg-white/[0.06] sm:grid-cols-[auto_minmax(0,1.65fr)_minmax(4.5rem,6.5rem)_minmax(0,12rem)_max-content_80px_minmax(7rem,1.25fr)_36px] sm:gap-2 sm:px-4 sm:py-3 sm:pr-4"
                      >
                        <TransactionInsightHover txn={txn}>
                          <div className="text-xs text-white/65 tabular-nums whitespace-nowrap pr-1 py-0.5 -my-0.5 rounded-md ring-0 group-hover/txninsight:ring-1 group-hover/txninsight:ring-white/15 group-hover/txninsight:bg-white/[0.04] transition-[box-shadow,background]">
                            {formatDate(txn.postedDate, "ddMmmYy")}
                          </div>
                        </TransactionInsightHover>
                        <div className="min-w-0">
                          <TransactionInsightHover txn={txn}>
                            <div className="min-w-0 rounded-md py-0.5 -my-0.5 pr-1 ring-0 group-hover/txninsight:ring-1 group-hover/txninsight:ring-white/15 group-hover/txninsight:bg-white/[0.04] transition-[box-shadow,background]">
                              <p className="text-xs font-medium text-white/90 truncate">
                                {txn.merchantName ?? txn.rawDescription}
                              </p>
                              <TransactionSourceSubtitle txn={txn} />
                              {transactionReferenceDisplay(txn) != null && (
                                <p
                                  className="mt-0.5 min-w-0 max-w-full text-[9px] leading-snug"
                                  title={transactionReferenceTitle(txn)}
                                >
                                  <span className="block min-w-0 truncate text-white/45">
                                    {transactionReferenceDisplay(txn)}
                                  </span>
                                </p>
                              )}
                            </div>
                          </TransactionInsightHover>
                          <div className="mt-0.5 flex items-start gap-2 text-[12px] text-white/50 sm:hidden">
                            <TransactionCategoryIcon
                              categoryName={txn.categoryName}
                              subcategoryName={txn.subcategoryName}
                              categorySuggestion={txn.categorySuggestion}
                              size="sm"
                              className="mt-0.5"
                            />
                            <span className="min-w-0 flex-1 truncate">
                              {txn.subcategoryName
                                ? `${txn.categoryName ?? txn.categorySuggestion ?? "—"} · ${txn.subcategoryName}`
                                : (txn.categoryName ?? txn.categorySuggestion ?? "Uncategorized")}
                            </span>
                          </div>
                        </div>
                        <div className="col-span-2 flex min-h-0 items-center sm:col-span-1 sm:h-full sm:min-w-0">
                          <TransactionLabelCell
                            transactionId={txn.id}
                            value={txn.label ?? null}
                            onSaved={saveTransactionLabel}
                          />
                        </div>
                        <div className="hidden min-w-0 sm:flex sm:h-full sm:w-full sm:items-center sm:justify-start sm:gap-2.5">
                          <TransactionCategoryIcon
                            categoryName={txn.categoryName}
                            subcategoryName={txn.subcategoryName}
                            categorySuggestion={txn.categorySuggestion}
                            size="md"
                          />
                          <div className="flex min-w-0 flex-1 flex-col sm:items-start sm:justify-center sm:gap-0.5 sm:text-left">
                            <span
                              className="block w-full max-w-full truncate text-[12px] text-white/75"
                              title={
                                txn.subcategoryName
                                  ? `${txn.categoryName ?? ""} · ${txn.subcategoryName}`
                                  : (txn.categoryName ?? txn.categorySuggestion ?? "Uncategorized")
                              }
                            >
                              {txn.categoryName ?? txn.categorySuggestion ?? "Uncategorized"}
                            </span>
                            {txn.subcategoryName ? (
                              <span
                                className="block w-full max-w-full truncate text-[11px] text-white/45"
                                title={txn.subcategoryName}
                              >
                                {txn.subcategoryName}
                              </span>
                            ) : null}
                          </div>
                        </div>
                        <div className="flex min-h-0 w-max max-w-full flex-col items-start justify-center text-left sm:h-full sm:min-h-[2.5rem]">
                          <span className={cn(
                            "whitespace-nowrap text-xs font-bold tabular-nums",
                            isPositive && "text-[#A7F3D0]",
                            isNegative && "text-[#FCA5A5]",
                            !isPositive && !isNegative && "text-white/70",
                          )}>
                            {isPositive ? "+" : isNegative ? "−" : ""}{formatCurrency(Math.abs(amt), txn.baseCurrency)}
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
                        <FlagsCell
                          countryIso={txn.countryIso}
                          isRecurring={txn.isRecurring}
                          hasFx={hasFx}
                        />
                        <div className="col-span-2 flex min-h-0 items-center sm:col-span-1 sm:h-full">
                          <TransactionNoteCell
                            transactionId={txn.id}
                            value={txn.note ?? null}
                            onSaved={saveTransactionNote}
                          />
                        </div>
                        <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center justify-center sm:static sm:right-auto sm:top-auto sm:flex sm:h-full sm:translate-y-0 sm:items-center sm:justify-center sm:pr-0">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(txn.id)}
                            onChange={() => toggleSelect(txn.id)}
                            aria-label={`Select transaction ${txn.merchantName ?? txn.rawDescription}`}
                            className="h-3.5 w-3.5 cursor-pointer rounded border-white/35 bg-white/[0.06] text-[#0BC18D] focus:ring-1 focus:ring-[#0BC18D]/50"
                          />
                        </div>
                      </motion.div>
                    );
                  })}
                </div>

                {/* Infinite scroll sentinel */}
                {hasMore ? (
                  <div
                    ref={scrollSentinelRef}
                    className="flex min-h-[48px] shrink-0 items-center justify-center gap-2 border-t border-white/10 px-4 py-2"
                  >
                    {loadingMore ? (
                      <>
                        <Loader2 className="h-5 w-5 shrink-0 animate-spin text-[#0BC18D]/85" aria-hidden />
                        <span className="text-[10px] text-white/45">Loading more…</span>
                      </>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-2 py-8 text-center sm:py-12">
                <ArrowLeftRight className="mb-3 h-7 w-7 text-white/20 sm:mb-4 sm:h-8 sm:w-8" />
                <p className="mb-3 text-xs text-white/60 sm:mb-4 sm:text-sm">No transactions found</p>
                <Link href="/dashboard/upload">
                  <Button className="bg-[#0BC18D] text-white hover:bg-[#0BC18D]/90">
                    <Upload className="w-4 h-4 mr-2" /> Upload Statement
                  </Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
