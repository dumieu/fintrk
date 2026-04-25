"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { use } from "react";
import {
  ArrowLeft,
  ArrowLeftRight,
  Banknote,
  BrainCircuit,
  Calendar,
  ChartLine,
  FileSpreadsheet,
  Globe2,
  Landmark,
  Mail,
  RefreshCcw,
  Sparkles,
  TrendingDown,
  TrendingUp,
  User as UserIcon,
} from "lucide-react";
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
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatNumber, formatRelative } from "@/lib/utils";

interface UserDetail {
  profile: {
    clerk_user_id: string;
    primary_email: string | null;
    first_name: string | null;
    last_name: string | null;
    username: string | null;
    image_url: string | null;
    main_currency: string | null;
    main_currency_percentage: string | null;
    detect_travel: string | null;
    created_at: string;
    updated_at: string;
  };
  counts: Record<string, number | string>;
  lifetime: {
    first_txn_date: string | null;
    last_txn_date: string | null;
    txn_count: number;
    distinct_currencies: number;
    distinct_countries: number;
    distinct_merchants: number;
  };
  monthlyTimeline: Array<{ month: string; inflow: string; outflow: string; savings: string; txns: number }>;
  flowSplit: Array<{ flow: string; txns: number; volume: string }>;
  currencyMix: Array<{ currency: string; count: number; volume: string }>;
  countryMix: Array<{ country: string; count: number }>;
  topMerchants: Array<{ merchant: string; txns: number; volume: string }>;
  topCategories: Array<{ category: string; flow: string; txns: number; volume: string }>;
  activeRecurring: Array<{
    id: number;
    merchant_name: string;
    interval_label: string;
    expected_amount: string;
    currency: string;
    next_expected_date: string | null;
    last_seen_date: string | null;
    occurrence_count: number;
  }>;
  recentTransactions: Array<{
    id: string;
    posted_date: string;
    raw_description: string;
    merchant_name: string | null;
    base_amount: string;
    base_currency: string;
    foreign_amount: string | null;
    foreign_currency: string | null;
    country_iso: string | null;
    is_recurring: boolean;
    category: string | null;
  }>;
  recentStatements: Array<{
    id: number;
    file_name: string;
    file_size: number;
    status: string;
    ai_model: string | null;
    transactions_imported: number | null;
    transactions_duplicate: number | null;
    period_start: string | null;
    period_end: string | null;
    ai_error: string | null;
    created_at: string;
    ai_processed_at: string | null;
  }>;
  aiCost: { total_cost: string | number; cost_7d: string | number; calls: number };
  hourly: Array<{ hour: number; count: number }>;
  dow: Array<{ dow: number; count: number }>;
}

const PALETTE = ["#0BC18D", "#22d3ee", "#38bdf8", "#a78bfa", "#f472b6", "#fb923c", "#facc15", "#10b981"];
const DOW_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function UserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/users/${encodeURIComponent(id)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(setData)
      .catch((e) => setErr(e instanceof Error ? e.message : "Failed"))
      .finally(() => setLoading(false));
  }, [id]);

  const hourSeries = (() => {
    if (!data?.hourly) return [] as Array<{ hour: string; count: number }>;
    const map = new Map<number, number>();
    for (const r of data.hourly) map.set(Number(r.hour), Number(r.count));
    return Array.from({ length: 24 }, (_, i) => ({ hour: `${i}h`, count: map.get(i) ?? 0 }));
  })();

  const dowSeries = (() => {
    if (!data?.dow) return [] as Array<{ dow: string; count: number }>;
    const map = new Map<number, number>();
    for (const r of data.dow) map.set(Number(r.dow), Number(r.count));
    return DOW_LABELS.map((label, i) => ({ dow: label, count: map.get(i) ?? 0 }));
  })();

  if (loading) return <DetailSkeleton />;
  if (err || !data) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-16 text-center">
        <h1 className="text-lg font-semibold">User not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">{err}</p>
        <Link href="/users" className="mt-4 inline-flex items-center gap-1 text-sm text-primary">
          <ArrowLeft className="h-4 w-4" /> Back to users
        </Link>
      </div>
    );
  }

  const p = data.profile;
  const fullName = [p.first_name, p.last_name].filter(Boolean).join(" ") || p.username || "—";
  const totalSpend = data.flowSplit.find((f) => f.flow === "outflow")?.volume ?? "0";
  const totalIn = data.flowSplit.find((f) => f.flow === "inflow")?.volume ?? "0";

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <Link href="/users" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to users
      </Link>

      {/* Profile header */}
      <div className="mt-3 flex flex-col gap-6 rounded-2xl border border-border bg-gradient-to-br from-emerald-50/60 via-card to-card p-6 sm:flex-row sm:items-center">
        {p.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={p.image_url}
            alt=""
            className="h-20 w-20 rounded-2xl border-2 border-white object-cover shadow-md"
          />
        ) : (
          <span className="flex h-20 w-20 items-center justify-center rounded-2xl bg-secondary text-foreground/70">
            <UserIcon className="h-8 w-8" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-2xl font-bold tracking-tight">{fullName}</h1>
            {p.detect_travel === "Yes" ? (
              <Badge variant="info" className="gap-1">
                <Globe2 className="h-3 w-3" /> Travel ON
              </Badge>
            ) : null}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Mail className="h-3 w-3" /> {p.primary_email ?? "no email"}
            </span>
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" /> Joined {formatRelative(p.created_at)}
            </span>
            <span className="font-mono opacity-70">{p.clerk_user_id}</span>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-3">
          <HeaderStat icon={ArrowLeftRight} label="Txns" value={data.lifetime.txn_count} />
          <HeaderStat icon={Banknote} label="Currencies" value={data.lifetime.distinct_currencies} />
          <HeaderStat icon={Globe2} label="Countries" value={data.lifetime.distinct_countries} />
        </div>
      </div>

      {/* Behavior KPIs */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat icon={ArrowLeftRight} label="Transactions" value={Number(data.counts.transactions ?? 0)} />
        <Stat icon={FileSpreadsheet} label="Statements" value={Number(data.counts.statements ?? 0)} />
        <Stat icon={Landmark} label="Accounts" value={Number(data.counts.accounts ?? 0)} />
        <Stat icon={RefreshCcw} label="Recurring" value={Number(data.counts.recurring_patterns ?? 0)} />
        <Stat icon={Sparkles} label="AI insights" value={Number(data.counts.ai_insights ?? 0)} />
        <Stat icon={BrainCircuit} label="AI spend $" value={Number(data.aiCost.total_cost ?? 0)} decimals={2} />
      </div>

      {/* Inflow vs outflow KPI cards */}
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <FlowCard label="Inflow (lifetime)" value={Number(totalIn)} icon={TrendingUp} accent="emerald" />
        <FlowCard label="Outflow (lifetime)" value={Number(totalSpend)} icon={TrendingDown} accent="rose" />
        <FlowCard
          label="Net"
          value={Number(totalIn) - Number(totalSpend)}
          icon={ChartLine}
          accent={Number(totalIn) - Number(totalSpend) >= 0 ? "emerald" : "rose"}
        />
      </div>

      {/* Charts row */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold">Monthly cashflow</h2>
              <p className="text-xs text-muted-foreground">Inflow vs outflow vs savings.</p>
            </div>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.monthlyTimeline.map((r) => ({ ...r, inflow: Number(r.inflow), outflow: Number(r.outflow), savings: Number(r.savings) }))}>
                <defs>
                  <linearGradient id="inGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0BC18D" stopOpacity={0.7} />
                    <stop offset="100%" stopColor="#0BC18D" stopOpacity={0.05} />
                  </linearGradient>
                  <linearGradient id="outGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ef4444" stopOpacity={0.7} />
                    <stop offset="100%" stopColor="#ef4444" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
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
                <Area type="monotone" dataKey="outflow" stroke="#ef4444" fill="url(#outGrad)" />
                <Area type="monotone" dataKey="inflow" stroke="#0BC18D" fill="url(#inGrad)" />
                <Area type="monotone" dataKey="savings" stroke="#a78bfa" fillOpacity={0} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-5">
          <div className="mb-3">
            <h2 className="text-sm font-semibold">Currency exposure</h2>
            <p className="text-xs text-muted-foreground">Where their money lives.</p>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data.currencyMix.map((c) => ({ name: c.currency, value: Number(c.volume) }))}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={50}
                  outerRadius={90}
                  paddingAngle={2}
                  stroke="#fff"
                >
                  {data.currencyMix.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
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
        </Card>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="text-sm font-semibold">Spending rhythm — by hour</h2>
          <p className="mb-3 text-xs text-muted-foreground">When transactions land in the database.</p>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hourSeries}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="hour" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="count" fill="#22d3ee" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="text-sm font-semibold">Spending rhythm — by weekday</h2>
          <p className="mb-3 text-xs text-muted-foreground">Posted-date aggregation.</p>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dowSeries}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="dow" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="count" fill="#0BC18D" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="text-sm font-semibold">Top merchants</h2>
          <p className="mb-3 text-xs text-muted-foreground">By total volume.</p>
          <RankList
            rows={data.topMerchants}
            label={(r) => r.merchant}
            secondary={(r) => `${formatNumber(r.txns)} txns`}
            value={(r) => formatCurrency(Number(r.volume), p.main_currency ?? "USD")}
          />
        </Card>

        <Card className="p-5">
          <h2 className="text-sm font-semibold">Top categories</h2>
          <p className="mb-3 text-xs text-muted-foreground">Outflow only.</p>
          <RankList
            rows={data.topCategories}
            label={(r) => r.category}
            secondary={(r) => `${formatNumber(r.txns)} txns · ${r.flow}`}
            value={(r) => formatCurrency(Number(r.volume), p.main_currency ?? "USD")}
          />
        </Card>
      </div>

      {/* Recurring */}
      <Card className="mt-4 p-5">
        <h2 className="text-sm font-semibold">Active recurring</h2>
        <p className="mb-3 text-xs text-muted-foreground">{data.activeRecurring.length} active patterns.</p>
        {data.activeRecurring.length ? (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-xs">
              <thead className="bg-secondary/50 text-[10px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Merchant</th>
                  <th className="px-3 py-2 text-left">Interval</th>
                  <th className="px-3 py-2 text-right">Expected</th>
                  <th className="px-3 py-2 text-right">Occurrences</th>
                  <th className="px-3 py-2 text-left">Last seen</th>
                  <th className="px-3 py-2 text-left">Next expected</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.activeRecurring.map((r) => (
                  <tr key={r.id} className="hover:bg-accent/40">
                    <td className="px-3 py-2 font-medium">{r.merchant_name}</td>
                    <td className="px-3 py-2 text-muted-foreground">{r.interval_label}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatCurrency(Number(r.expected_amount), r.currency)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.occurrence_count}</td>
                    <td className="px-3 py-2 text-muted-foreground">{r.last_seen_date ?? "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground">{r.next_expected_date ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-xs text-muted-foreground">No recurring patterns detected yet.</div>
        )}
      </Card>

      {/* Recent statements */}
      <Card className="mt-4 p-5">
        <h2 className="text-sm font-semibold">Recent statements</h2>
        <p className="mb-3 text-xs text-muted-foreground">Last 20 uploads.</p>
        {data.recentStatements.length ? (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-xs">
              <thead className="bg-secondary/50 text-[10px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">File</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-right">Imported</th>
                  <th className="px-3 py-2 text-right">Dup</th>
                  <th className="px-3 py-2 text-left">Period</th>
                  <th className="px-3 py-2 text-left">Uploaded</th>
                  <th className="px-3 py-2 text-left">Model</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.recentStatements.map((s) => (
                  <tr key={s.id} className="hover:bg-accent/40">
                    <td className="px-3 py-2 font-medium" title={s.file_name}>
                      <span className="block max-w-xs truncate">{s.file_name}</span>
                      {s.ai_error ? (
                        <span className="block max-w-xs truncate text-[10px] text-red-600">{s.ai_error}</span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2">
                      <StatusBadge status={s.status} />
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{s.transactions_imported ?? "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                      {s.transactions_duplicate ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {s.period_start && s.period_end ? `${s.period_start} → ${s.period_end}` : "—"}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{formatRelative(s.created_at)}</td>
                    <td className="px-3 py-2 text-muted-foreground">{s.ai_model ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-xs text-muted-foreground">No statements uploaded yet.</div>
        )}
      </Card>

      {/* Recent transactions */}
      <Card className="mt-4 p-5">
        <h2 className="text-sm font-semibold">Recent transactions</h2>
        <p className="mb-3 text-xs text-muted-foreground">Last 30 ledger entries.</p>
        {data.recentTransactions.length ? (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-xs">
              <thead className="bg-secondary/50 text-[10px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Date</th>
                  <th className="px-3 py-2 text-left">Description</th>
                  <th className="px-3 py-2 text-left">Merchant</th>
                  <th className="px-3 py-2 text-left">Category</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                  <th className="px-3 py-2 text-left">FX</th>
                  <th className="px-3 py-2 text-left">Country</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.recentTransactions.map((t) => (
                  <tr key={t.id} className="hover:bg-accent/40">
                    <td className="px-3 py-2 text-muted-foreground tabular-nums">{t.posted_date}</td>
                    <td className="px-3 py-2" title={t.raw_description}>
                      <span className="block max-w-xs truncate">{t.raw_description}</span>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{t.merchant_name ?? "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground">{t.category ?? "—"}</td>
                    <td className={`px-3 py-2 text-right tabular-nums ${Number(t.base_amount) < 0 ? "text-red-600" : "text-emerald-600"}`}>
                      {formatCurrency(Number(t.base_amount), t.base_currency)}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {t.foreign_amount && t.foreign_currency
                        ? `${formatCurrency(Number(t.foreign_amount), t.foreign_currency)}`
                        : "—"}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{t.country_iso ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-xs text-muted-foreground">No transactions yet.</div>
        )}
      </Card>
    </div>
  );
}

function HeaderStat({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: number }) {
  return (
    <div className="flex flex-col items-center rounded-lg bg-white/60 px-3 py-2 ring-1 ring-emerald-100">
      <Icon className="h-4 w-4 text-emerald-600" />
      <span className="mt-1 text-xs uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className="text-base font-semibold tabular-nums">{formatNumber(value)}</span>
    </div>
  );
}

function Stat({ icon: Icon, label, value, decimals = 0 }: { icon: React.ElementType; label: string; value: number; decimals?: number }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-3">
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-secondary text-foreground/70">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 leading-tight">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className="text-base font-semibold tabular-nums">{formatNumber(value, decimals)}</div>
      </div>
    </div>
  );
}

function FlowCard({ label, value, icon: Icon, accent }: { label: string; value: number; icon: React.ElementType; accent: "emerald" | "rose" }) {
  const map = {
    emerald: { from: "from-emerald-50", text: "text-emerald-600", ring: "ring-emerald-100" },
    rose: { from: "from-rose-50", text: "text-rose-600", ring: "ring-rose-100" },
  } as const;
  return (
    <div className={`rounded-xl border bg-gradient-to-br ${map[accent].from} to-white p-4 ring-1 ${map[accent].ring}`}>
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</span>
        <Icon className={`h-4 w-4 ${map[accent].text}`} />
      </div>
      <div className="mt-2 text-2xl font-bold tabular-nums">{formatCurrency(value, "USD")}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "completed") return <Badge variant="success">completed</Badge>;
  if (status === "failed") return <Badge variant="destructive">failed</Badge>;
  if (status === "processing") return <Badge variant="warning">processing</Badge>;
  return <Badge variant="info">{status}</Badge>;
}

interface RankRow {
  txns: number;
  volume: string | number;
  flow?: string;
}
function RankList<R extends RankRow>({
  rows,
  label,
  secondary,
  value,
}: {
  rows: R[];
  label: (r: R) => string;
  secondary: (r: R) => string;
  value: (r: R) => string;
}) {
  if (rows.length === 0) {
    return <div className="text-xs text-muted-foreground">No data yet.</div>;
  }
  const max = Math.max(1, ...rows.map((r) => Number(r.volume) || 0));
  return (
    <div className="space-y-1.5">
      {rows.map((r, i) => {
        const v = Number(r.volume) || 0;
        const pct = (v / max) * 100;
        return (
          <div key={i} className="flex items-center gap-3">
            <span className="w-6 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">{i + 1}</span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-3">
                <span className="truncate text-sm font-medium">{label(r)}</span>
                <span className="shrink-0 text-xs font-semibold tabular-nums">{value(r)}</span>
              </div>
              <div className="mt-1 flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, background: PALETTE[i % PALETTE.length] }} />
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

function DetailSkeleton() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="h-32 animate-pulse rounded-2xl bg-secondary" />
      <div className="mt-4 grid grid-cols-3 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-xl bg-secondary" />
        ))}
      </div>
      <div className="mt-4 h-72 animate-pulse rounded-xl bg-secondary" />
    </div>
  );
}
