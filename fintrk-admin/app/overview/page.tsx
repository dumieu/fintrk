"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  BookOpen,
  BrainCircuit,
  FileSpreadsheet,
  Globe2,
  Landmark,
  PiggyBank,
  Receipt,
  RefreshCcw,
  Sparkles,
  TrendingUp,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { cn, formatCurrency, formatNumber, formatRelative } from "@/lib/utils";

interface Stats {
  counts: Record<string, number>;
  trends: Record<string, { current: number; previous: number }>;
  sparklines: Array<Record<string, number | string>>;
  userGrowth: Array<{ month: string; count: number; cumulative: number }>;
  currencyMix: Array<{ currency: string; count: number }>;
  countryMix: Array<{ country: string; count: number }>;
  topMerchants: Array<{ merchant: string; txns: number; volume: number }>;
  topCategories: Array<{ category: string; flow: string; txns: number; volume: number }>;
  flowSplit: Array<{ flow: string | null; txns: number; volume: number }>;
  ingestPulse: Array<{ day: string; status: string; count: number }>;
  aiCost: { total: number; cost7d: number; calls: number };
  dataFreshness: Record<string, string | null>;
  tableSizes: Array<{ table_name: string; row_count: number }>;
}

const PALETTE = [
  "#0BC18D", "#22d3ee", "#38bdf8", "#a78bfa", "#f472b6",
  "#fb923c", "#facc15", "#10b981", "#0ea5e9", "#6366f1",
  "#ef4444", "#84cc16",
];

export default function OverviewPage() {
  const [data, setData] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/stats", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load stats"))
      .finally(() => setLoading(false));
  }, []);

  const ingestSeries = useMemo(() => {
    if (!data?.ingestPulse) return [];
    const map = new Map<string, Record<string, number | string>>();
    for (const r of data.ingestPulse) {
      const key = r.day;
      if (!map.has(key)) map.set(key, { day: key, completed: 0, processing: 0, failed: 0, uploaded: 0 });
      const row = map.get(key)!;
      row[r.status] = ((row[r.status] as number) ?? 0) + r.count;
    }
    return Array.from(map.values());
  }, [data?.ingestPulse]);

  if (loading) return <PageSkeleton />;
  if (error || !data) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-16 text-center">
        <h1 className="text-lg font-semibold">Could not load dashboard</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error ?? "Unknown error"}</p>
      </div>
    );
  }

  const txnDelta = pctChange(data.trends.transactions.current, data.trends.transactions.previous);
  const usrDelta = pctChange(data.trends.users.current, data.trends.users.previous);
  const stmtDelta = pctChange(data.trends.statements.current, data.trends.statements.previous);
  const aiDelta = pctChange(data.trends.aiInsights.current, data.trends.aiInsights.previous);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.3em] text-emerald-600/80">FinTRK Console</p>
          <h1 className="text-2xl font-bold tracking-tight">Overview</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Real-time pulse of every user, transaction, and AI dollar flowing through FinTRK.
          </p>
        </div>
        <div className="hidden items-center gap-2 text-xs text-muted-foreground md:flex">
          <RefreshCcw className="h-3.5 w-3.5" />
          Live data · refresh page to update
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <KpiCard
          icon={Users}
          label="Users"
          value={data.counts.users}
          delta={usrDelta}
          accent="emerald"
        />
        <KpiCard
          icon={Receipt}
          label="Transactions"
          value={data.counts.transactions}
          delta={txnDelta}
          accent="cyan"
        />
        <KpiCard
          icon={FileSpreadsheet}
          label="Statements"
          value={data.counts.statements}
          delta={stmtDelta}
          accent="sky"
        />
        <KpiCard
          icon={Sparkles}
          label="AI insights"
          value={data.counts.aiInsights}
          delta={aiDelta}
          accent="violet"
        />
        <KpiCard
          icon={BrainCircuit}
          label="AI spend (7d)"
          value={`$${data.aiCost.cost7d.toFixed(2)}`}
          subtitle={`${formatNumber(data.aiCost.calls)} calls · $${data.aiCost.total.toFixed(2)} lifetime`}
          accent="amber"
        />
      </div>

      {/* Sub KPI strip — secondary entities */}
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <MiniKpi icon={Landmark} label="Accounts" value={data.counts.accounts} />
        <MiniKpi icon={Banknote} label="Merchants" value={data.counts.merchants} />
        <MiniKpi icon={BookOpen} label="Categories" value={data.counts.userCategories} />
        <MiniKpi icon={RefreshCcw} label="Recurring" value={data.counts.recurringPatterns} />
        <MiniKpi icon={PiggyBank} label="Budgets" value={data.counts.budgets} />
        <MiniKpi icon={TrendingUp} label="Goals" value={data.counts.goals} />
      </div>

      {/* Charts row 1 */}
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="col-span-1 p-5 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold">Activity pulse · 30 days</h2>
              <p className="text-xs text-muted-foreground">
                Daily new users · transactions · statements · AI insights.
              </p>
            </div>
            <Badge variant="secondary">Sparkline</Badge>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.sparklines}>
                <defs>
                  <linearGradient id="usersGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0BC18D" stopOpacity={0.8} />
                    <stop offset="100%" stopColor="#0BC18D" stopOpacity={0.05} />
                  </linearGradient>
                  <linearGradient id="txnGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.8} />
                    <stop offset="100%" stopColor="#22d3ee" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="day" hide />
                <YAxis hide />
                <Tooltip
                  contentStyle={{
                    background: "#0a0f1f",
                    border: "1px solid #1f2a44",
                    borderRadius: 8,
                    color: "#e2e8f0",
                    fontSize: 12,
                  }}
                />
                <Area type="monotone" dataKey="transactions" stroke="#22d3ee" fill="url(#txnGrad)" />
                <Area type="monotone" dataKey="users" stroke="#0BC18D" fill="url(#usersGrad)" />
                <Area type="monotone" dataKey="statements" stroke="#a78bfa" fillOpacity={0.0} />
                <Area type="monotone" dataKey="insights" stroke="#fb923c" fillOpacity={0.0} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <Legend
            items={[
              { color: "#0BC18D", label: "Users" },
              { color: "#22d3ee", label: "Transactions" },
              { color: "#a78bfa", label: "Statements" },
              { color: "#fb923c", label: "AI insights" },
            ]}
          />
        </Card>

        <Card className="p-5">
          <div className="mb-3">
            <h2 className="text-sm font-semibold">Currency mix</h2>
            <p className="text-xs text-muted-foreground">
              Transactions by their booking currency.
            </p>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data.currencyMix}
                  dataKey="count"
                  nameKey="currency"
                  innerRadius={50}
                  outerRadius={90}
                  paddingAngle={2}
                  stroke="#fff"
                >
                  {data.currencyMix.map((_, i) => (
                    <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: "#0a0f1f",
                    border: "1px solid #1f2a44",
                    borderRadius: 8,
                    color: "#e2e8f0",
                    fontSize: 12,
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-1 flex flex-wrap justify-center gap-x-3 gap-y-1 text-[11px]">
            {data.currencyMix.slice(0, 6).map((c, i) => (
              <span key={c.currency} className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ background: PALETTE[i % PALETTE.length] }} />
                {c.currency} · {formatNumber(c.count)}
              </span>
            ))}
          </div>
        </Card>
      </div>

      {/* Charts row 2 */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="p-5">
          <div className="mb-3">
            <h2 className="text-sm font-semibold">User growth</h2>
            <p className="text-xs text-muted-foreground">Monthly new + cumulative.</p>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.userGrowth}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{
                    background: "#0a0f1f",
                    border: "1px solid #1f2a44",
                    borderRadius: 8,
                    color: "#e2e8f0",
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="count" fill="#0BC18D" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-5">
          <div className="mb-3">
            <h2 className="text-sm font-semibold">Statement ingest pulse</h2>
            <p className="text-xs text-muted-foreground">By daily status (last 30 days).</p>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={ingestSeries}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="day" tick={{ fontSize: 10 }} hide />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{
                    background: "#0a0f1f",
                    border: "1px solid #1f2a44",
                    borderRadius: 8,
                    color: "#e2e8f0",
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="completed" stackId="s" fill="#0BC18D" />
                <Bar dataKey="processing" stackId="s" fill="#facc15" />
                <Bar dataKey="failed" stackId="s" fill="#ef4444" />
                <Bar dataKey="uploaded" stackId="s" fill="#38bdf8" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <Legend
            items={[
              { color: "#0BC18D", label: "Completed" },
              { color: "#facc15", label: "Processing" },
              { color: "#ef4444", label: "Failed" },
              { color: "#38bdf8", label: "Uploaded" },
            ]}
          />
        </Card>

        <Card className="p-5">
          <div className="mb-3">
            <h2 className="text-sm font-semibold">Top countries</h2>
            <p className="text-xs text-muted-foreground">By transaction count.</p>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.countryMix.slice(0, 10)} layout="vertical" margin={{ left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis type="number" tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="country" tick={{ fontSize: 11 }} width={50} />
                <Tooltip
                  contentStyle={{
                    background: "#0a0f1f",
                    border: "1px solid #1f2a44",
                    borderRadius: 8,
                    color: "#e2e8f0",
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="count" fill="#38bdf8" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Tables row */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <div className="mb-3">
            <h2 className="text-sm font-semibold">Top merchants</h2>
            <p className="text-xs text-muted-foreground">Aggregated across all users.</p>
          </div>
          <RankedList
            rows={data.topMerchants}
            label="merchant"
            primaryKey="merchant"
            secondary={(r) => `${formatNumber(r.txns)} txns`}
            valueFn={(r) => formatCurrency(r.volume, "USD")}
          />
        </Card>

        <Card className="p-5">
          <div className="mb-3">
            <h2 className="text-sm font-semibold">Top spending categories</h2>
            <p className="text-xs text-muted-foreground">Outflow only · USD-equivalent.</p>
          </div>
          <RankedList
            rows={data.topCategories}
            label="category"
            primaryKey="category"
            secondary={(r) => `${formatNumber(r.txns)} txns · ${r.flow}`}
            valueFn={(r) => formatCurrency(r.volume, "USD")}
            colorFn={(_, i) => PALETTE[i % PALETTE.length]}
          />
        </Card>
      </div>

      {/* Footer freshness */}
      <Card className="mt-4 p-5">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold">Data freshness</h2>
            <p className="text-xs text-muted-foreground">Most recent record per surface.</p>
          </div>
          <Badge variant="secondary" className="gap-1">
            <Activity className="h-3 w-3" /> live
          </Badge>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <Freshness label="Last user" iso={data.dataFreshness.lastUser} />
          <Freshness label="Last txn" iso={data.dataFreshness.lastTransaction} />
          <Freshness label="Last statement" iso={data.dataFreshness.lastStatement} />
          <Freshness label="Last AI insight" iso={data.dataFreshness.lastInsight} />
          <Freshness label="Last recurring" iso={data.dataFreshness.lastRecurring} />
        </div>
      </Card>
    </div>
  );
}

function pctChange(current: number, previous: number) {
  if (!previous) return current ? 100 : 0;
  return ((current - previous) / previous) * 100;
}

interface KpiCardProps {
  icon: React.ElementType;
  label: string;
  value: number | string;
  delta?: number;
  subtitle?: string;
  accent: "emerald" | "cyan" | "sky" | "violet" | "amber";
}

const ACCENT: Record<KpiCardProps["accent"], { bg: string; text: string; ring: string }> = {
  emerald: { bg: "from-emerald-50 to-white", text: "text-emerald-600", ring: "ring-emerald-100" },
  cyan: { bg: "from-cyan-50 to-white", text: "text-cyan-600", ring: "ring-cyan-100" },
  sky: { bg: "from-sky-50 to-white", text: "text-sky-600", ring: "ring-sky-100" },
  violet: { bg: "from-violet-50 to-white", text: "text-violet-600", ring: "ring-violet-100" },
  amber: { bg: "from-amber-50 to-white", text: "text-amber-600", ring: "ring-amber-100" },
};

function KpiCard({ icon: Icon, label, value, delta, subtitle, accent }: KpiCardProps) {
  const a = ACCENT[accent];
  const positive = delta == null ? null : delta >= 0;
  const display = typeof value === "number" ? formatNumber(value) : value;
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border bg-gradient-to-br p-4 ring-1",
        a.bg,
        a.ring,
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</span>
        <Icon className={cn("h-4 w-4", a.text)} />
      </div>
      <div className="mt-2 text-2xl font-bold tabular-nums">{display}</div>
      {delta != null ? (
        <div
          className={cn(
            "mt-1 inline-flex items-center gap-1 text-[11px] font-semibold",
            positive ? "text-emerald-600" : "text-red-600",
          )}
        >
          {positive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
          {Math.abs(delta).toFixed(0)}% · 7d
        </div>
      ) : subtitle ? (
        <div className="mt-1 text-[11px] text-muted-foreground">{subtitle}</div>
      ) : null}
    </div>
  );
}

function MiniKpi({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: number }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary text-foreground/70">
        <Icon className="h-4 w-4" />
      </span>
      <div className="leading-tight">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className="text-sm font-semibold tabular-nums">{formatNumber(value)}</div>
      </div>
    </div>
  );
}

function Legend({ items }: { items: Array<{ color: string; label: string }> }) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: i.color }} />
          {i.label}
        </span>
      ))}
    </div>
  );
}

function Freshness({ label, iso }: { label: string; iso: string | null | undefined }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-semibold">{formatRelative(iso)}</div>
      <div className="mt-0.5 text-[10px] text-muted-foreground">{iso ? new Date(iso).toLocaleString() : "—"}</div>
    </div>
  );
}

interface RankedListProps<R extends Record<string, unknown>> {
  rows: R[];
  label: string;
  primaryKey: keyof R;
  secondary: (r: R) => string;
  valueFn: (r: R) => string;
  colorFn?: (r: R, i: number) => string;
}

function RankedList<R extends Record<string, unknown>>({
  rows,
  primaryKey,
  secondary,
  valueFn,
  colorFn,
}: RankedListProps<R>) {
  const max = Math.max(1, ...rows.map((r) => Number((r as Record<string, unknown>).volume ?? 0)));
  return (
    <div className="space-y-1.5">
      {rows.map((r, i) => {
        const v = Number((r as Record<string, unknown>).volume ?? 0);
        const pct = (v / max) * 100;
        const color = colorFn?.(r, i) ?? PALETTE[i % PALETTE.length];
        return (
          <div key={i} className="flex items-center gap-3">
            <span className="w-6 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
              {i + 1}
            </span>
            <div className="flex-1">
              <div className="flex items-baseline justify-between gap-3">
                <span className="truncate text-sm font-medium">{String(r[primaryKey])}</span>
                <span className="shrink-0 text-xs font-semibold tabular-nums">{valueFn(r)}</span>
              </div>
              <div className="mt-1 flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
                </div>
                <span className="text-[10px] text-muted-foreground">{secondary(r)}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PageSkeleton() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="h-6 w-40 animate-pulse rounded bg-secondary" />
      <div className="mt-2 h-4 w-72 animate-pulse rounded bg-secondary" />
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl bg-secondary" />
        ))}
      </div>
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="h-80 animate-pulse rounded-xl bg-secondary lg:col-span-2" />
        <div className="h-80 animate-pulse rounded-xl bg-secondary" />
      </div>
    </div>
  );
}
