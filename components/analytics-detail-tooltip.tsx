"use client";

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { formatCurrency } from "@/lib/format";
import type {
  AnalyticsDetailMonth,
  AnalyticsDetailResponse,
  AnalyticsDetailRow,
  AnalyticsDetailTxn,
} from "@/app/api/analytics/detail/route";
import { currencyMeta } from "@/components/currency-meta";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export type DetailEntity = "category" | "merchant" | "country" | "dow" | "currency";

const ENTITY_TYPE_LABEL: Record<DetailEntity, string> = {
  category: "Category",
  merchant: "Merchant",
  country: "Country",
  dow: "Day of Week",
  currency: "Currency",
};

function countryFlag(iso: string): string {
  if (!iso || iso.length !== 2) return "🌍";
  const offset = 0x1f1e6;
  return String.fromCodePoint(
    iso.charCodeAt(0) - 65 + offset,
    iso.charCodeAt(1) - 65 + offset,
  );
}

function compactNumber(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(abs >= 10_000 ? 0 : 1)}K`;
  return n.toFixed(abs < 10 ? 2 : 0);
}

function formatMonthShort(m: string): { full: string; tick: string; year: number; month: number } {
  const [y, mo] = m.split("-").map((s) => parseInt(s, 10));
  const d = new Date(Date.UTC(y, mo - 1, 1));
  const tick = d.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  const full = d.toLocaleString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
  return { full, tick, year: y, month: mo };
}

function formatDateShort(iso: string): string {
  if (!iso) return "";
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function relativeFromMonths(monthly: AnalyticsDetailMonth[]): {
  thisMonth: number;
  prevMonth: number;
  delta: number | null;
  trailing3: number;
  trailing6: number;
  trailing12: number;
} {
  const n = monthly.length;
  const thisMonth = n > 0 ? monthly[n - 1].total : 0;
  const prevMonth = n > 1 ? monthly[n - 2].total : 0;
  let delta: number | null = null;
  if (prevMonth > 0) {
    delta = ((thisMonth - prevMonth) / prevMonth) * 100;
  } else if (prevMonth === 0 && thisMonth > 0) {
    delta = null;
  }
  const sumLast = (k: number) =>
    monthly.slice(Math.max(0, n - k)).reduce((s, m) => s + m.total, 0);
  return {
    thisMonth,
    prevMonth,
    delta,
    trailing3: sumLast(3),
    trailing6: sumLast(6),
    trailing12: sumLast(12),
  };
}

function MonthlyTrendChart({
  monthly,
  median,
  avg,
  accent,
  highlightMonth,
  height = 110,
}: {
  monthly: AnalyticsDetailMonth[];
  median: number;
  avg: number;
  accent: string;
  highlightMonth?: string | null;
  height?: number;
}) {
  const W = 320;
  const H = height;
  const padTop = 14;
  const padBottom = 18;
  const padX = 10;
  const innerW = W - padX * 2;
  const innerH = H - padTop - padBottom;
  const max = Math.max(...monthly.map((m) => m.total), median, avg, 1);

  const barCount = monthly.length;
  const slot = innerW / barCount;
  const barW = Math.min(slot - 4, 18);

  const ticks: { y: number; label: string }[] = [];
  for (let i = 0; i <= 2; i++) {
    const v = (max * (2 - i)) / 2;
    const y = padTop + ((max - v) / max) * innerH;
    ticks.push({ y, label: compactNumber(v) });
  }

  const medianY = padTop + ((max - median) / max) * innerH;
  const avgY = padTop + ((max - avg) / max) * innerH;

  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-2.5">
      <div className="mb-1.5 flex items-baseline justify-between">
        <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-white/40">
          Monthly trend · 12 mo
        </p>
        <div className="flex items-center gap-2 text-[9px] tabular-nums text-white/45">
          <span className="flex items-center gap-1">
            <span className="inline-block h-1.5 w-2.5 rounded-full" style={{ background: accent }} />
            month
          </span>
          {avg > 0 && (
            <span className="flex items-center gap-1">
              <span className="inline-block h-px w-3 bg-white/45" />
              avg
            </span>
          )}
          {median > 0 && median !== avg && (
            <span className="flex items-center gap-1">
              <span className="inline-block h-px w-3 bg-emerald-300/55" />
              median
            </span>
          )}
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label="Monthly spend">
        <defs>
          <linearGradient id="mtc-bar" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={accent} stopOpacity={0.95} />
            <stop offset="100%" stopColor={accent} stopOpacity={0.45} />
          </linearGradient>
        </defs>
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={padX} x2={W - padX} y1={t.y} y2={t.y} stroke="rgba(255,255,255,0.06)" strokeDasharray="2 4" />
            <text x={W - padX} y={t.y - 2} textAnchor="end" className="fill-white/30" style={{ fontSize: 7.5 }}>
              {t.label}
            </text>
          </g>
        ))}
        {avg > 0 && (
          <line x1={padX} x2={W - padX} y1={avgY} y2={avgY} stroke="rgba(255,255,255,0.55)" strokeWidth={0.7} strokeDasharray="3 3" />
        )}
        {median > 0 && median !== avg && (
          <line x1={padX} x2={W - padX} y1={medianY} y2={medianY} stroke="rgba(110,231,183,0.6)" strokeWidth={0.7} />
        )}
        {monthly.map((m, i) => {
          const cx = padX + slot * i + slot / 2;
          const x = cx - barW / 2;
          const h = (m.total / max) * innerH;
          const y = padTop + (innerH - h);
          const tick = formatMonthShort(m.month).tick;
          const isLast = i === monthly.length - 1;
          const isHighlighted = highlightMonth ? m.month === highlightMonth : isLast;
          const showTick = i === 0 || i === monthly.length - 1 || tick === "Jan" || isHighlighted;
          return (
            <g key={m.month}>
              <rect
                x={x}
                y={y}
                width={barW}
                height={Math.max(h, m.total > 0 ? 1.5 : 0)}
                rx={2}
                fill={isHighlighted ? accent : "url(#mtc-bar)"}
                opacity={m.total > 0 ? 1 : 0.0}
              />
              {isHighlighted && m.total > 0 && (
                <rect
                  x={x - 1.5}
                  y={y - 4}
                  width={barW + 3}
                  height={3}
                  rx={1.5}
                  fill={accent}
                  opacity={0.8}
                />
              )}
              {showTick && (
                <text
                  x={cx}
                  y={H - 6}
                  textAnchor="middle"
                  className={isHighlighted ? "fill-white/85" : "fill-white/45"}
                  style={{ fontSize: 7.5, letterSpacing: "0.04em" }}
                >
                  {tick}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function DowStrip({
  values,
  accent,
  busiest,
}: {
  values: number[];
  accent: string;
  busiest: number | null;
}) {
  const max = Math.max(...values, 1);
  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-2.5">
      <p className="mb-1.5 text-[9px] font-semibold uppercase tracking-[0.18em] text-white/40">
        By day of week
      </p>
      <div className="flex items-end justify-between gap-1">
        {values.map((v, i) => {
          const h = (v / max) * 32;
          const isBusiest = i === busiest && v > 0;
          return (
            <div key={i} className="flex min-w-0 flex-1 flex-col items-center gap-1">
              <span className="text-[8px] tabular-nums text-white/45">
                {v > 0 ? compactNumber(v) : "—"}
              </span>
              <div className="relative flex h-[32px] w-full items-end justify-center">
                <div
                  className="w-full rounded-t-[3px]"
                  style={{
                    height: `${Math.max(h, v > 0 ? 2 : 0)}px`,
                    background: isBusiest
                      ? accent
                      : v > 0
                        ? "rgba(255,255,255,0.18)"
                        : "transparent",
                    boxShadow: isBusiest ? `0 0 8px ${accent}55` : undefined,
                  }}
                />
              </div>
              <span
                className={
                  isBusiest
                    ? "text-[9px] font-semibold text-white"
                    : "text-[9px] text-white/45"
                }
              >
                {DAY_LABELS[i]}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function HorizontalBars({
  rows,
  totalForShare,
  currency,
  accent,
  formatLeading,
  iconRender,
  emptyMsg,
  max = 5,
}: {
  rows: AnalyticsDetailRow[];
  totalForShare: number;
  currency: string;
  accent: string;
  formatLeading?: (r: AnalyticsDetailRow) => string;
  iconRender?: (r: AnalyticsDetailRow) => string;
  emptyMsg: string;
  max?: number;
}) {
  if (!rows || rows.length === 0) {
    return (
      <p className="px-2 py-3 text-center text-[10.5px] text-white/40">{emptyMsg}</p>
    );
  }
  const slice = rows.slice(0, max);
  const m = Math.max(...slice.map((r) => r.total), 1);
  return (
    <ul className="space-y-1.5">
      {slice.map((r, i) => {
        const widthPct = (r.total / m) * 100;
        const share = totalForShare > 0 ? (r.total / totalForShare) * 100 : 0;
        const lead = formatLeading ? formatLeading(r) : `${i + 1}`;
        const ico = iconRender ? iconRender(r) : null;
        return (
          <li
            key={`${r.name}-${i}`}
            className="relative overflow-hidden rounded-lg border border-white/[0.06] bg-white/[0.025] px-2 py-1.5"
          >
            <div
              className="pointer-events-none absolute inset-y-0 left-0 opacity-25"
              style={{
                width: `${Math.min(100, widthPct)}%`,
                background: `linear-gradient(90deg, ${accent}55, transparent)`,
              }}
            />
            <div className="relative flex items-center gap-2">
              <span className="w-3 shrink-0 text-right text-[9px] font-semibold tabular-nums text-white/35">
                {lead}
              </span>
              {ico && <span className="shrink-0 text-[12px] leading-none">{ico}</span>}
              <div className="min-w-0 flex-1">
                <p className="truncate text-[11px] font-medium leading-snug text-white/90" title={r.name}>
                  {r.name}
                </p>
                <p className="text-[9px] leading-none text-white/40 tabular-nums">
                  {r.count} {r.count === 1 ? "txn" : "txns"} · {share.toFixed(1)}%
                </p>
              </div>
              <span className="shrink-0 text-[11px] font-semibold tabular-nums text-white/90">
                {formatCurrency(r.total, currency)}
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function TopTransactionList({
  txns,
  currency,
}: {
  txns: AnalyticsDetailTxn[];
  currency: string;
}) {
  if (!txns || txns.length === 0) {
    return (
      <p className="px-2 py-3 text-center text-[10.5px] text-white/40">No transactions in this slice.</p>
    );
  }
  return (
    <ul className="space-y-1">
      {txns.map((t, i) => (
        <li
          key={`${t.date}-${i}`}
          className="flex items-baseline justify-between gap-2 rounded-md border border-white/[0.05] bg-white/[0.02] px-2 py-1.5"
        >
          <div className="min-w-0 flex-1">
            <p className="truncate text-[11px] font-medium leading-snug text-white/88" title={t.description}>
              {t.description || "—"}
            </p>
            <p className="text-[9px] leading-none text-white/40 tabular-nums">
              {formatDateShort(t.date)}
            </p>
          </div>
          <span className="shrink-0 text-[11px] font-semibold tabular-nums text-white/95">
            {formatCurrency(t.amount, t.currency || currency)}
          </span>
        </li>
      ))}
    </ul>
  );
}

function KpiTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-white/[0.07] bg-white/[0.025] px-2 py-1.5">
      <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-white/40">
        {label}
      </p>
      <p className="mt-0.5 text-[12.5px] font-semibold tabular-nums tracking-tight text-white/95">
        {value}
      </p>
      {hint && <p className="text-[9px] leading-tight text-white/45 tabular-nums">{hint}</p>}
    </div>
  );
}

function DeltaPill({ delta }: { delta: number | null }) {
  if (delta == null || !Number.isFinite(delta)) return null;
  const up = delta > 0;
  const flat = Math.abs(delta) < 0.5;
  const color = flat
    ? "bg-white/8 text-white/60 ring-white/15"
    : up
      ? "bg-rose-500/15 text-rose-300 ring-rose-400/30"
      : "bg-emerald-500/15 text-emerald-300 ring-emerald-400/30";
  const symbol = flat ? "·" : up ? "▲" : "▼";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-semibold tabular-nums ring-1 ${color}`}
      title="Change vs previous month"
    >
      <span style={{ fontSize: 8 }}>{symbol}</span>
      {Math.abs(delta).toFixed(0)}%
    </span>
  );
}

interface DetailTooltipProps {
  rect: DOMRect;
  entity: DetailEntity;
  label: string;
  accentColor: string;
  data: AnalyticsDetailResponse | null;
  loading: boolean;
  errorMessage: string | null;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

export function AnalyticsDetailTooltip({
  rect,
  entity,
  label,
  accentColor,
  data,
  loading,
  errorMessage,
  onMouseEnter,
  onMouseLeave,
}: DetailTooltipProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  /** Smart placement: measure tooltip after first paint, then choose the side that fits without clipping. */
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const margin = 10;
    const winW = window.innerWidth;
    const winH = window.innerHeight;
    const r = node.getBoundingClientRect();
    const tw = r.width;
    const th = r.height;

    /** Anchor point: row right edge for list rows; row centre when row is wide (bars). */
    const wide = rect.width > 220;
    const anchorX = wide ? rect.left + rect.width / 2 : rect.right;
    let left = wide ? anchorX - tw / 2 : anchorX + 12;
    let top = rect.top + rect.height / 2 - th / 2;

    /** Horizontal clamp; if the right-of-row layout would clip, flip to left of row. */
    if (!wide && left + tw + margin > winW) {
      left = rect.left - tw - 12;
    }
    left = Math.min(winW - margin - tw, Math.max(margin, left));

    /** Vertical clamp; if vertical centring clips, anchor to top edge of row, then clamp. */
    if (top + th + margin > winH) top = winH - margin - th;
    if (top < margin) top = margin;

    setPos({ left, top });
  }, [rect, data, loading, errorMessage]);

  useEffect(() => {
    const onResize = () => {
      const node = ref.current;
      if (!node) return;
      // trigger remount of layout effect by clearing pos to recompute on next paint
      setPos(null);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  /** Re-measure when data settles. */
  useLayoutEffect(() => {
    if (!data && !loading) return;
  }, [data, loading]);

  const style: CSSProperties = {
    left: pos?.left ?? -9999,
    top: pos?.top ?? -9999,
    width: "min(420px, calc(100vw - 20px))",
    maxWidth: 420,
    visibility: pos ? "visible" : "hidden",
  };

  return (
    <div
      ref={ref}
      className="pointer-events-auto fixed z-[9999] rounded-2xl border border-white/[0.12] bg-[#0a0814]/[0.97] shadow-[0_24px_64px_-12px_rgba(0,0,0,0.85),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-xl"
      style={style}
      role="tooltip"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <DetailContent
        entity={entity}
        label={label}
        accentColor={accentColor}
        data={data}
        loading={loading}
        errorMessage={errorMessage}
      />
    </div>
  );
}

function DetailContent({
  entity,
  label,
  accentColor,
  data,
  loading,
  errorMessage,
}: {
  entity: DetailEntity;
  label: string;
  accentColor: string;
  data: AnalyticsDetailResponse | null;
  loading: boolean;
  errorMessage: string | null;
}) {
  const currency = data?.primaryCurrency ?? "USD";
  const showFlag = entity === "country";
  const flag = showFlag ? countryFlag(label.toUpperCase()) : null;
  const ccyMeta =
    entity === "currency" && data ? currencyMeta(data.value || data.label) : null;

  const metrics = useMemo(() => (data ? relativeFromMonths(data.monthly) : null), [data]);

  return (
    <div className="relative max-h-[min(560px,calc(100vh-40px))] overflow-y-auto overscroll-contain rounded-2xl">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -right-16 -top-20 h-44 w-44 rounded-full opacity-25 blur-3xl"
        style={{ background: `radial-gradient(circle at center, ${accentColor}88 0%, transparent 65%)` }}
        aria-hidden
      />
      <div className="relative space-y-3 px-3 pb-3 pt-3">
        {/* Header */}
        <header className="flex items-start gap-2.5 border-b border-white/[0.08] pb-2.5">
          {ccyMeta ? (
            <div
              className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full ring-1 ring-white/15"
              style={{
                background: `linear-gradient(135deg, ${ccyMeta.gradient[0]} 0%, ${ccyMeta.gradient[1]} 100%)`,
                boxShadow: `0 6px 16px -4px ${ccyMeta.gradient[1]}aa, inset 0 1px 0 rgba(255,255,255,0.18)`,
              }}
              aria-hidden
            >
              <span
                className="font-bold leading-none text-white drop-shadow"
                style={{
                  fontSize: ccyMeta.symbol.length > 2 ? 13 : 18,
                  textShadow: "0 1px 2px rgba(0,0,0,0.45)",
                }}
              >
                {ccyMeta.symbol}
              </span>
            </div>
          ) : (
            <span
              className="mt-0.5 h-9 w-1.5 shrink-0 rounded-full"
              style={{
                background: `linear-gradient(180deg, ${accentColor}, ${accentColor}88)`,
                boxShadow: `0 0 16px ${accentColor}55`,
              }}
            />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-[9px] font-semibold uppercase tracking-[0.22em] text-white/40">
              {ENTITY_TYPE_LABEL[entity]}
            </p>
            <div className="mt-0.5 flex items-center gap-1.5">
              {flag && <span className="text-[16px] leading-none">{flag}</span>}
              {ccyMeta && (
                <span className="text-[14px] leading-none">{ccyMeta.flag}</span>
              )}
              <p className="break-words text-[14.5px] font-semibold leading-tight text-white">
                {label}
              </p>
            </div>
          </div>
          {data && metrics && metrics.delta != null && (
            <div className="shrink-0 pt-1">
              <DeltaPill delta={metrics.delta} />
            </div>
          )}
        </header>

        {loading && !data ? (
          <div className="flex flex-col items-center justify-center gap-2 py-10">
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-white/10 border-t-violet-400" />
            <p className="text-[10px] uppercase tracking-[0.18em] text-white/35">Crunching numbers</p>
          </div>
        ) : errorMessage ? (
          <p className="py-6 text-center text-[11px] text-rose-300/80">{errorMessage}</p>
        ) : data && data.count === 0 ? (
          <p className="py-6 text-center text-[11px] text-white/45">
            No outflows recorded for this slice.
          </p>
        ) : data ? (
          <Body data={data} currency={currency} accent={accentColor} entity={entity} metrics={metrics!} />
        ) : null}
      </div>
    </div>
  );
}

function Body({
  data,
  currency,
  accent,
  entity,
  metrics,
}: {
  data: AnalyticsDetailResponse;
  currency: string;
  accent: string;
  entity: DetailEntity;
  metrics: ReturnType<typeof relativeFromMonths>;
}) {
  const dateRange =
    data.firstSeen && data.lastSeen
      ? `${formatDateShort(data.firstSeen)} → ${formatDateShort(data.lastSeen)}`
      : null;

  return (
    <div className="space-y-2.5">
      {/* KPI strip */}
      <div className="grid grid-cols-4 gap-1.5">
        <KpiTile label="Total" value={formatCurrency(data.total, currency)} />
        <KpiTile
          label="Txns"
          value={data.count.toLocaleString("en-US")}
          hint={`${data.uniqueDays} ${data.uniqueDays === 1 ? "day" : "days"}`}
        />
        <KpiTile label="Share" value={`${data.share.toFixed(1)}%`} hint="of all spend" />
        <KpiTile label="Avg/txn" value={formatCurrency(data.avgPerTxn, currency)} />
      </div>

      {/* This-month vs prev */}
      {(metrics.thisMonth > 0 || metrics.prevMonth > 0) && (
        <div className="grid grid-cols-3 gap-1.5">
          <KpiTile
            label="This mo."
            value={formatCurrency(metrics.thisMonth, currency)}
          />
          <KpiTile
            label="Prev mo."
            value={formatCurrency(metrics.prevMonth, currency)}
          />
          <KpiTile
            label="Avg / mo."
            value={formatCurrency(data.monthlyAvg, currency)}
            hint={
              data.busiestMonth
                ? `peak ${formatMonthShort(data.busiestMonth.month).tick} ${formatCurrency(data.busiestMonth.total, currency)}`
                : undefined
            }
          />
        </div>
      )}

      {/* Trends row */}
      <MonthlyTrendChart
        monthly={data.monthly}
        median={data.monthlyMedian}
        avg={data.monthlyAvg}
        accent={accent}
        highlightMonth={data.selectedMonth}
      />
      <DowStrip
        values={data.dowDistribution}
        accent={accent}
        busiest={data.busiestDow}
      />

      {/* Breakdowns */}
      <div className="space-y-2">
        {entity !== "merchant" && data.topMerchants.length > 0 && (
          <Section title="Top merchants" badge={`${data.topMerchants.length}`}>
            <HorizontalBars
              rows={data.topMerchants}
              totalForShare={data.total}
              currency={currency}
              accent={accent}
              emptyMsg="No merchant data"
            />
          </Section>
        )}
        {entity !== "category" && data.topCategories.length > 0 && (
          <Section title="Top categories" badge={`${data.topCategories.length}`}>
            <HorizontalBars
              rows={data.topCategories}
              totalForShare={data.total}
              currency={currency}
              accent={accent}
              emptyMsg="No category data"
            />
          </Section>
        )}
        {entity !== "country" && data.topCountries.length > 0 && (
          <Section title="Top countries" badge={`${data.topCountries.length}`}>
            <HorizontalBars
              rows={data.topCountries}
              totalForShare={data.total}
              currency={currency}
              accent={accent}
              iconRender={(r) => countryFlag(r.name.toUpperCase())}
              emptyMsg="No country data"
            />
          </Section>
        )}
        {data.topTransactions.length > 0 && (
          <Section title="Biggest transactions" badge={`${data.topTransactions.length}`}>
            <TopTransactionList txns={data.topTransactions} currency={currency} />
          </Section>
        )}
      </div>

      {dateRange && (
        <p className="border-t border-white/[0.06] pt-2 text-center text-[9px] uppercase tracking-[0.18em] text-white/35">
          {dateRange}
        </p>
      )}
    </div>
  );
}

function Section({
  title,
  badge,
  children,
}: {
  title: string;
  badge?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-1 flex items-baseline justify-between">
        <h3 className="text-[9px] font-semibold uppercase tracking-[0.18em] text-white/45">
          {title}
        </h3>
        {badge && <span className="text-[9px] tabular-nums text-white/30">{badge}</span>}
      </div>
      {children}
    </section>
  );
}
