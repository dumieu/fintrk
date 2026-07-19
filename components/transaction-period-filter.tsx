"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { CalendarDays, Check, ChevronsUpDown, Search, X } from "lucide-react";
import {
  formatMonthKeyLabel,
  formatYearKeyLabel,
  monthKeyToDateRange,
  yearKeyToDateRange,
} from "@/lib/month-date-range";
import { cn } from "@/lib/utils";

export type PeriodSelection =
  | { kind: "all" }
  | { kind: "year"; year: string }
  | { kind: "month"; monthKey: string }
  | { kind: "custom"; label: string };

function selectionFromRange(dateFrom: string, dateTo: string): PeriodSelection {
  const from = dateFrom.trim();
  const to = dateTo.trim();
  if (!from && !to) return { kind: "all" };
  if (/^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to)) {
    const yFrom = from.slice(0, 4);
    const yTo = to.slice(0, 4);
    if (yFrom === yTo && from.endsWith("-01-01")) {
      const yearEnd = yearKeyToDateRange(yFrom);
      if (to === yearEnd.dateTo) return { kind: "year", year: yFrom };
    }
    if (from.slice(0, 7) === to.slice(0, 7) && from.endsWith("-01")) {
      const monthKey = from.slice(0, 7);
      const monthEnd = monthKeyToDateRange(monthKey);
      if (to === monthEnd.dateTo) return { kind: "month", monthKey };
    }
  }
  const a = from ? from.slice(0, 7) : "…";
  const b = to ? to.slice(0, 7) : "…";
  return { kind: "custom", label: a === b ? a : `${a} → ${b}` };
}

function selectionLabel(sel: PeriodSelection): string {
  if (sel.kind === "all") return "All dates";
  if (sel.kind === "year") return formatYearKeyLabel(sel.year);
  if (sel.kind === "month") return formatMonthKeyLabel(sel.monthKey);
  return sel.label;
}

function selectionToRange(sel: PeriodSelection): { dateFrom: string; dateTo: string } {
  if (sel.kind === "all" || sel.kind === "custom") return { dateFrom: "", dateTo: "" };
  if (sel.kind === "year") return yearKeyToDateRange(sel.year);
  return monthKeyToDateRange(sel.monthKey);
}

function monthShortLabel(monthKey: string): string {
  const [y, m] = monthKey.split("-").map((s) => parseInt(s, 10));
  const d = new Date(Date.UTC(y, m - 1, 1));
  return d.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
}

type FlatOption =
  | { id: "all"; kind: "all"; label: string; search: string }
  | { id: string; kind: "year"; year: string; label: string; search: string }
  | { id: string; kind: "month"; monthKey: string; label: string; search: string; year: string };

export function TransactionPeriodFilter({
  months,
  dateFrom,
  dateTo,
  onChange,
  className,
}: {
  /** Distinct `YYYY-MM` keys from the user's transactions (newest first preferred). */
  months: string[];
  dateFrom: string;
  dateTo: string;
  onChange: (dateFrom: string, dateTo: string) => void;
  className?: string;
}) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [menuPos, setMenuPos] = useState<{ top: number; left: number; width: number } | null>(null);

  const selection = useMemo(
    () => selectionFromRange(dateFrom, dateTo),
    [dateFrom, dateTo],
  );
  const active = selection.kind !== "all";

  const years = useMemo(() => {
    const set = new Set<string>();
    for (const mk of months) set.add(mk.slice(0, 4));
    return [...set].sort((a, b) => b.localeCompare(a));
  }, [months]);

  const options = useMemo((): FlatOption[] => {
    const out: FlatOption[] = [
      {
        id: "all",
        kind: "all",
        label: "All dates",
        search: "all dates every anytime",
      },
    ];
    for (const year of years) {
      out.push({
        id: `y-${year}`,
        kind: "year",
        year,
        label: formatYearKeyLabel(year),
        search: `${year} year y${year.slice(2)}`,
      });
      const yearMonths = months
        .filter((mk) => mk.startsWith(`${year}-`))
        .sort((a, b) => b.localeCompare(a));
      for (const monthKey of yearMonths) {
        const long = formatMonthKeyLabel(monthKey);
        const short = monthShortLabel(monthKey);
        out.push({
          id: `m-${monthKey}`,
          kind: "month",
          monthKey,
          year,
          label: long,
          search: `${long} ${short} ${monthKey} ${year}`,
        });
      }
    }
    return out;
  }, [months, years]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.search.toLowerCase().includes(q));
  }, [options, query]);

  const placeMenu = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const width = Math.max(r.width, 260);
    const left = Math.min(r.left, window.innerWidth - width - 8);
    setMenuPos({
      top: r.bottom + 6,
      left: Math.max(8, left),
      width,
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    placeMenu();
    const onScroll = () => placeMenu();
    const onResize = () => placeMenu();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    const t = window.setTimeout(() => searchRef.current?.focus(), 20);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open, placeMenu]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target;
      if (!(t instanceof Node)) return;
      if (rootRef.current?.contains(t)) return;
      const menu = document.getElementById(listId);
      if (menu?.contains(t)) return;
      setOpen(false);
      setQuery("");
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        setQuery("");
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, listId]);

  const pick = useCallback(
    (opt: FlatOption) => {
      const next: PeriodSelection =
        opt.kind === "all"
          ? { kind: "all" }
          : opt.kind === "year"
            ? { kind: "year", year: opt.year }
            : { kind: "month", monthKey: opt.monthKey };
      const range = selectionToRange(next);
      onChange(range.dateFrom, range.dateTo);
      setOpen(false);
      setQuery("");
    },
    [onChange],
  );

  const isSelected = useCallback(
    (opt: FlatOption) => {
      if (opt.kind === "all") return selection.kind === "all";
      if (opt.kind === "year") {
        return selection.kind === "year" && selection.year === opt.year;
      }
      return selection.kind === "month" && selection.monthKey === opt.monthKey;
    },
    [selection],
  );

  const onTriggerKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setOpen(true);
    }
  };

  const menu =
    open &&
    menuPos &&
    typeof document !== "undefined" &&
    createPortal(
      <div
        id={listId}
        role="listbox"
        aria-label="Filter by year or month"
        className="fixed z-[80] overflow-hidden rounded-2xl border border-[#0BC18D]/30 bg-[#0c1210]/96 shadow-[0_24px_64px_-20px_rgba(0,0,0,0.75),0_0_0_1px_rgba(11,193,141,0.12)] backdrop-blur-xl"
        style={{ top: menuPos.top, left: menuPos.left, width: menuPos.width }}
      >
        <div className="border-b border-chart-border bg-gradient-to-r from-[#0BC18D]/12 via-transparent to-[#5DD3F3]/10 px-3 py-2.5">
          <label className="relative block">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#34E6B0]/80"
              aria-hidden
            />
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search year or month…"
              className="h-9 w-full rounded-xl border border-chart-border bg-black/35 py-1.5 pl-8 pr-3 text-sm text-foreground placeholder:text-muted-foreground outline-none ring-0 transition focus:border-[#0BC18D]/45 focus:bg-black/45"
              aria-autocomplete="list"
              aria-controls={listId}
            />
          </label>
        </div>

        <div className="scrollbar-slim max-h-[min(50vh,320px)] overflow-y-auto overscroll-contain p-1.5">
          {filtered.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">
              No matches for “{query.trim()}”
            </p>
          ) : (
            <ul className="space-y-0.5">
              {filtered.map((opt, idx) => {
                const selected = isSelected(opt);
                const prev = filtered[idx - 1];
                const showYearRule =
                  opt.kind === "year" &&
                  prev != null &&
                  prev.kind !== "all" &&
                  !query.trim();
                return (
                  <li key={opt.id}>
                    {showYearRule ? (
                      <div className="mx-2 my-1.5 h-px bg-gradient-to-r from-transparent via-chart-border to-transparent" />
                    ) : null}
                    <button
                      type="button"
                      role="option"
                      aria-selected={selected}
                      onClick={() => pick(opt)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left transition-colors",
                        opt.kind === "month" && "pl-7",
                        selected
                          ? "bg-[#0BC18D]/18 text-white ring-1 ring-[#0BC18D]/35"
                          : "text-foreground hover:bg-white/[0.06]",
                        opt.kind === "year" && !selected && "font-semibold",
                      )}
                    >
                      <span
                        className={cn(
                          "grid h-6 w-6 shrink-0 place-items-center rounded-lg text-[10px] font-bold",
                          opt.kind === "all" && "bg-white/10 text-muted-foreground",
                          opt.kind === "year" && "bg-[#0BC18D]/20 text-[#34E6B0]",
                          opt.kind === "month" && "bg-[#5DD3F3]/12 text-[#5DD3F3]",
                        )}
                        aria-hidden
                      >
                        {opt.kind === "all"
                          ? "∞"
                          : opt.kind === "year"
                            ? "Y"
                            : monthShortLabel(opt.monthKey).slice(0, 1)}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm">
                        {opt.kind === "month" ? (
                          <>
                            <span className="font-medium">{monthShortLabel(opt.monthKey)}</span>
                            <span className="text-muted-foreground"> · {opt.year}</span>
                          </>
                        ) : (
                          opt.label
                        )}
                      </span>
                      {selected ? (
                        <Check className="h-3.5 w-3.5 shrink-0 text-[#34E6B0]" aria-hidden />
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>,
      document.body,
    );

  return (
    <div ref={rootRef} className={cn("relative min-w-0", className)}>
      <span className="mb-1 block text-[8px] font-medium uppercase tracking-wider text-muted-foreground sm:text-[9px]">
        Period
      </span>
      <div className="flex items-center gap-1">
        <button
          ref={triggerRef}
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          onClick={() => setOpen((v) => !v)}
          onKeyDown={onTriggerKeyDown}
          className={cn(
            "group flex h-10 min-w-0 flex-1 items-center gap-2 rounded-xl border px-2.5 text-left transition-all",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0BC18D]/45 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a0a]",
            active
              ? "border-[#0BC18D]/55 bg-gradient-to-br from-[#0BC18D]/18 to-[#5DD3F3]/10 text-white shadow-[0_0_24px_-10px_rgba(11,193,141,0.55)]"
              : "border-chart-border bg-white/[0.045] text-foreground hover:border-[#0BC18D]/35 hover:bg-[#0BC18D]/[0.07]",
          )}
        >
          <CalendarDays
            className={cn(
              "h-3.5 w-3.5 shrink-0",
              active ? "text-[#34E6B0]" : "text-muted-foreground group-hover:text-[#34E6B0]/80",
            )}
            aria-hidden
          />
          <span className="min-w-0 flex-1 truncate text-xs font-semibold sm:text-[13px]">
            {selectionLabel(selection)}
          </span>
          <ChevronsUpDown
            className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70"
            aria-hidden
          />
        </button>
        {active ? (
          <button
            type="button"
            aria-label="Clear period filter"
            title="Clear period"
            onClick={() => onChange("", "")}
            className="grid h-10 w-9 shrink-0 place-items-center rounded-xl border border-chart-border bg-white/[0.045] text-muted-foreground transition hover:border-[#0BC18D]/40 hover:text-[#34E6B0]"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        ) : null}
      </div>
      {menu}
    </div>
  );
}
