"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type {
  DiscretionaryBucket,
  DiscretionaryResponse,
} from "@/app/api/analytics/discretionary/route";
import { formatCurrency } from "@/lib/format";
import { AnalyticsDetailTooltip } from "@/components/analytics-detail-tooltip";
import { useAnalyticsDetail } from "@/components/use-analytics-detail";

const DEFAULT_MONTHS = 12;

function compactK(n: number): string {
  const a = Math.abs(n);
  if (a >= 1_000_000) return `${(n / 1_000_000).toFixed(a >= 10_000_000 ? 0 : 1)}M`;
  if (a >= 1_000) return `${(n / 1_000).toFixed(a >= 10_000 ? 1 : 1)}K`;
  return Math.round(n).toLocaleString();
}

export function DiscretionaryBreakdown({ months = DEFAULT_MONTHS }: { months?: number }) {
  const [data, setData] = useState<DiscretionaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { tip, open, scheduleClose, clearLeave } = useAnalyticsDetail();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/analytics/discretionary?months=${months}`)
      .then((r) => r.json())
      .then((j: DiscretionaryResponse | { error: string }) => {
        if (cancelled) return;
        if ("error" in j) {
          setError(j.error);
          setData(null);
        } else {
          setData(j);
          setError(null);
        }
      })
      .catch(() => {
        if (cancelled) return;
        setError("Network error");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [months]);

  if (loading && !data) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center text-sm text-white/40">
        Loading discretionary breakdown…
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center text-sm text-rose-300/80">
        {error ?? "Failed to load discretionary breakdown."}
      </div>
    );
  }
  if (data.total <= 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 text-sm text-white/40">
        <p>No discretionary data yet.</p>
        <p className="text-[11px] text-white/30">
          Tag categories with a discretionary type to populate this view.
        </p>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div className="grid min-h-0 flex-1 grid-cols-3 gap-2">
        {data.buckets.map((b) => (
          <BucketCard
            key={b.type}
            bucket={b}
            currency={data.primaryCurrency}
            monthsCovered={data.monthsCovered}
            open={open}
            scheduleClose={scheduleClose}
          />
        ))}
      </div>

      {typeof document !== "undefined" &&
        tip &&
        createPortal(
          <AnalyticsDetailTooltip
            rect={tip.rect}
            entity={tip.entity}
            label={tip.label}
            accentColor={tip.accent}
            data={tip.data}
            loading={tip.loading}
            errorMessage={tip.error}
            onMouseEnter={clearLeave}
            onMouseLeave={scheduleClose}
          />,
          document.body,
        )}
    </div>
  );
}

function BucketCard({
  bucket,
  currency,
  monthsCovered,
  open,
  scheduleClose,
}: {
  bucket: DiscretionaryBucket;
  currency: string;
  monthsCovered: number;
  open: ReturnType<typeof useAnalyticsDetail>["open"];
  scheduleClose: ReturnType<typeof useAnalyticsDetail>["scheduleClose"];
}) {
  const accent = bucket.accent;

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      {/* Header — colored title + share + total (compact for half-width card) */}
      <div className="text-center">
        <h3
          className="text-[11px] font-bold leading-tight"
          style={{ color: accent, textShadow: `0 0 16px ${accent}55` }}
        >
          {bucket.label}
        </h3>
        <div className="mt-1 flex flex-wrap items-baseline justify-center gap-x-1.5 gap-y-0.5">
          <span
            className="text-[15px] font-extrabold leading-none tabular-nums"
            style={{ color: accent }}
          >
            {bucket.share.toFixed(0)}%
          </span>
          <span className="whitespace-nowrap text-[13px] font-extrabold leading-none tabular-nums text-white/95">
            {compactCurrency(bucket.total, currency)}
          </span>
        </div>
      </div>

      {/* Card body — soft tinted glass with leaves stacked vertically.
       *  Internal scroll keeps the card height constant and lets long lists be browsed. */}
      <div
        className="min-h-0 flex-1 overflow-hidden rounded-xl border backdrop-blur-md"
        style={{
          background: `linear-gradient(180deg, ${bucket.bg} 0%, rgba(255,255,255,0.02) 100%)`,
          borderColor: `${accent}33`,
          boxShadow: `inset 0 0 0 1px rgba(255,255,255,0.04), 0 8px 22px -14px ${accent}55`,
        }}
      >
        {bucket.leaves.length === 0 ? (
          <div className="flex h-full items-center justify-center px-2 py-4 text-center text-[10px] text-white/40">
            No spending in this bucket.
          </div>
        ) : (
          <ul className="h-full divide-y divide-white/5 overflow-y-auto overscroll-contain px-2 py-1 [scrollbar-gutter:stable]">
            {bucket.leaves.map((leaf) => (
              <li
                key={leaf.name}
                className="group flex cursor-pointer flex-col items-center gap-0.5 py-1.5 transition-colors hover:bg-white/[0.04]"
                onMouseEnter={(e) =>
                  void open({
                    rect: e.currentTarget.getBoundingClientRect(),
                    entity: "category",
                    value: leaf.name,
                    label: leaf.name,
                    accent,
                  })
                }
                onMouseLeave={scheduleClose}
              >
                <span
                  className="text-[15px] font-extrabold leading-none tabular-nums tracking-tight text-white/95"
                  style={{ textShadow: "0 1px 2px rgba(0,0,0,0.45)" }}
                >
                  {compactK(leaf.monthlyAvg)}
                </span>
                <span className="line-clamp-2 px-1 text-center text-[9px] leading-tight text-white/55">
                  Monthly Avg {leaf.name}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Footer — bucket-level monthly average */}
      <div className="text-center text-[9px] text-white/45">
        ≈ {compactCurrency(bucket.monthlyAvg, currency)} / mo · {monthsCovered}mo
      </div>
    </div>
  );
}

function compactCurrency(n: number, currency: string): string {
  const a = Math.abs(n);
  if (a >= 1_000) {
    const sym = currencySymbol(currency);
    return `${sym}${compactK(n)}`;
  }
  return formatCurrency(n, currency);
}

function currencySymbol(c: string): string {
  switch (c) {
    case "USD":
    case "AUD":
    case "CAD":
    case "NZD":
    case "SGD":
    case "HKD":
      return "$";
    case "EUR":
      return "€";
    case "GBP":
      return "£";
    case "JPY":
    case "CNY":
      return "¥";
    case "INR":
      return "₹";
    case "KRW":
      return "₩";
    case "CHF":
      return "CHF ";
    default:
      return `${c} `;
  }
}
