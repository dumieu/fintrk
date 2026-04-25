"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  BellRing,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Database,
  FileWarning,
  Filter,
  Flame,
  RefreshCcw,
  Search,
  ShieldAlert,
  TimerReset,
  X,
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
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { formatNumber, formatRelative } from "@/lib/utils";

interface ErrorItem {
  source: "statement" | "file_upload" | "error_log";
  id: string;
  context: string;
  message: string;
  code: string | null;
  severity: string;
  pathname: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  resolvedAt: string | null;
  resolvedComment: string | null;
  user: { clerkUserId: string | null; name: string; email: string | null; imageUrl: string | null } | null;
  explanation: {
    title: string;
    reason: string;
    fix: string;
    severity: "low" | "medium" | "high" | "critical";
  };
}

interface ChartsData {
  topErrors: Array<{ name: string; count: number }>;
  topUsers: Array<{ id: string; count: number; name: string; email: string | null; imageUrl: string | null }>;
  dailyTrend: Array<{ date: string; count: number }>;
  severityCounts: Array<{ name: string; count: number }>;
  sourceCounts: Array<{ name: string; count: number }>;
  totalErrors: number;
}

const SEV_COLORS: Record<string, string> = {
  critical: "#dc2626",
  high: "#f97316",
  medium: "#eab308",
  low: "#22d3ee",
};

const SOURCE_ICONS: Record<string, React.ElementType> = {
  statement: Database,
  file_upload: FileWarning,
  error_log: ShieldAlert,
};

export default function ErrorsPage() {
  const [errors, setErrors] = useState<ErrorItem[]>([]);
  const [charts, setCharts] = useState<ChartsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [showResolved, setShowResolved] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  async function load() {
    setLoading(true);
    try {
      const r = await fetch("/api/errors", { cache: "no-store" });
      const body = await r.json();
      setErrors(body.errors ?? []);
      setCharts(body.charts ?? null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return errors.filter((e) => {
      if (severityFilter !== "all" && e.severity !== severityFilter) return false;
      if (sourceFilter !== "all" && e.source !== sourceFilter) return false;
      if (!showResolved && e.resolvedAt) return false;
      if (!t) return true;
      return (
        e.message.toLowerCase().includes(t) ||
        e.context.toLowerCase().includes(t) ||
        e.explanation.title.toLowerCase().includes(t) ||
        (e.user?.email ?? "").toLowerCase().includes(t) ||
        (e.user?.name ?? "").toLowerCase().includes(t)
      );
    });
  }, [errors, q, severityFilter, sourceFilter, showResolved]);

  const unresolvedCount = errors.filter((e) => !e.resolvedAt).length;
  const criticalCount = errors.filter((e) => !e.resolvedAt && (e.severity === "critical" || e.severity === "high")).length;

  function toggleExpanded(id: string) {
    setExpanded((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function resolveError(id: string, comment: string) {
    if (!id.startsWith("log:")) {
      toast.error("Only persisted errors can be resolved.");
      return;
    }
    try {
      const r = await fetch(`/api/errors/${encodeURIComponent(id)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      toast.success("Error resolved");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to resolve");
    }
  }

  return (
    <div className="mx-auto max-w-[100rem] px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <ShieldAlert className="h-6 w-6 text-rose-500" /> Error Monitor
          </h1>
          <p className="text-sm text-muted-foreground">
            Aggregated from statements, file uploads & application error logs.
          </p>
        </div>
        <Button variant="ghost" onClick={load} disabled={loading} className="gap-2 self-start">
          <RefreshCcw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      {/* KPI strip */}
      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile icon={BellRing} label="Total (30d)" value={errors.length} accent="amber" />
        <KpiTile icon={AlertTriangle} label="Unresolved" value={unresolvedCount} accent="rose" />
        <KpiTile icon={Flame} label="Critical/High" value={criticalCount} accent="red" />
        <KpiTile
          icon={CheckCircle2}
          label="Resolved"
          value={errors.length - unresolvedCount}
          accent="emerald"
        />
      </div>

      {/* Charts */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <h2 className="text-sm font-semibold">Daily error volume (14d)</h2>
          <p className="mb-3 text-xs text-muted-foreground">Across all sources.</p>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={charts?.dailyTrend ?? []}>
                <defs>
                  <linearGradient id="errGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ef4444" stopOpacity={0.7} />
                    <stop offset="100%" stopColor="#ef4444" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Area type="monotone" dataKey="count" stroke="#ef4444" fill="url(#errGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="text-sm font-semibold">By severity</h2>
          <p className="mb-3 text-xs text-muted-foreground">Cumulative.</p>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={charts?.severityCounts ?? []}
                  dataKey="count"
                  nameKey="name"
                  innerRadius={45}
                  outerRadius={80}
                  paddingAngle={2}
                >
                  {(charts?.severityCounts ?? []).map((s) => (
                    <Cell key={s.name} fill={SEV_COLORS[s.name] ?? "#94a3b8"} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="text-sm font-semibold">Most frequent errors</h2>
          <p className="mb-3 text-xs text-muted-foreground">Grouped by explanation title.</p>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart layout="vertical" data={charts?.topErrors ?? []} margin={{ left: 100 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis type="number" tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={140} />
                <Tooltip />
                <Bar dataKey="count" fill="#ef4444" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="text-sm font-semibold">Most affected users</h2>
          <p className="mb-3 text-xs text-muted-foreground">Top 10 by error count.</p>
          {(charts?.topUsers ?? []).length === 0 ? (
            <div className="text-xs text-muted-foreground">No errored users yet.</div>
          ) : (
            <ul className="divide-y divide-border">
              {(charts?.topUsers ?? []).map((u) => (
                <li key={u.id} className="flex items-center gap-3 py-2">
                  {u.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={u.imageUrl} className="h-8 w-8 rounded-full" alt="" />
                  ) : (
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-xs font-bold">
                      {u.name.charAt(0).toUpperCase()}
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <Link href={`/users/${u.id}`} className="block truncate text-sm font-medium hover:text-primary">
                      {u.name}
                    </Link>
                    <span className="block truncate text-[11px] text-muted-foreground">{u.email ?? "no email"}</span>
                  </div>
                  <Badge variant="destructive">{u.count}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Filters */}
      <div className="mt-6 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-sm font-semibold">
          Errors{" "}
          <span className="text-muted-foreground">
            ({formatNumber(filtered.length)} of {formatNumber(errors.length)})
          </span>
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="w-56 pl-8" />
          </div>
          <FilterPill icon={Filter} label="Severity" value={severityFilter} options={["all", "critical", "high", "medium", "low"]} onChange={setSeverityFilter} />
          <FilterPill icon={Filter} label="Source" value={sourceFilter} options={["all", "statement", "file_upload", "error_log"]} onChange={setSourceFilter} />
          <Button
            size="sm"
            variant={showResolved ? "outline" : "ghost"}
            onClick={() => setShowResolved((v) => !v)}
            className="gap-1"
          >
            {showResolved ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
            Resolved
          </Button>
        </div>
      </div>

      {/* Error list */}
      <div className="mt-3 space-y-2">
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl bg-secondary" />
          ))
        ) : filtered.length === 0 ? (
          <Card className="flex flex-col items-center gap-2 p-12 text-center">
            <CheckCircle2 className="h-10 w-10 text-emerald-500" />
            <h3 className="text-sm font-semibold">No matching errors.</h3>
            <p className="text-xs text-muted-foreground">All clear with the current filters.</p>
          </Card>
        ) : (
          filtered.map((e) => (
            <ErrorRow
              key={e.id}
              err={e}
              expanded={expanded.has(e.id)}
              onToggle={() => toggleExpanded(e.id)}
              onResolve={(comment) => resolveError(e.id, comment)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function KpiTile({ icon: Icon, label, value, accent }: { icon: React.ElementType; label: string; value: number; accent: "amber" | "rose" | "red" | "emerald" }) {
  const map = {
    amber: { from: "from-amber-50", text: "text-amber-600", ring: "ring-amber-100" },
    rose: { from: "from-rose-50", text: "text-rose-600", ring: "ring-rose-100" },
    red: { from: "from-red-50", text: "text-red-700", ring: "ring-red-100" },
    emerald: { from: "from-emerald-50", text: "text-emerald-600", ring: "ring-emerald-100" },
  } as const;
  return (
    <div className={`rounded-xl border bg-gradient-to-br ${map[accent].from} to-white p-4 ring-1 ${map[accent].ring}`}>
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</span>
        <Icon className={`h-4 w-4 ${map[accent].text}`} />
      </div>
      <div className="mt-1 text-2xl font-bold tabular-nums">{formatNumber(value)}</div>
    </div>
  );
}

function FilterPill({
  icon: Icon,
  label,
  value,
  options,
  onChange,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <label className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs">
      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      <span className="text-muted-foreground">{label}:</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="cursor-pointer bg-transparent font-medium outline-none"
      >
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </label>
  );
}

function ErrorRow({
  err,
  expanded,
  onToggle,
  onResolve,
}: {
  err: ErrorItem;
  expanded: boolean;
  onToggle: () => void;
  onResolve: (comment: string) => void;
}) {
  const [comment, setComment] = useState("");
  const SourceIcon = SOURCE_ICONS[err.source] ?? ShieldAlert;
  const sevColor = SEV_COLORS[err.severity] ?? "#94a3b8";
  const isResolved = !!err.resolvedAt;
  const canResolve = err.id.startsWith("log:") && !isResolved;

  return (
    <Card className={`overflow-hidden p-0 transition ${isResolved ? "opacity-60" : ""}`}>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 p-4 text-left hover:bg-accent/30"
      >
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
          style={{ background: `${sevColor}20`, color: sevColor }}
        >
          <SourceIcon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{err.explanation.title}</span>
            <Badge variant="outline" className="text-[10px]" style={{ color: sevColor, borderColor: sevColor }}>
              {err.severity}
            </Badge>
            <Badge variant="outline" className="font-mono text-[10px]">{err.context}</Badge>
            {isResolved ? <Badge variant="success">resolved</Badge> : null}
          </div>
          <div className="mt-1 truncate text-xs text-muted-foreground">{err.message}</div>
        </div>
        <div className="hidden text-right text-xs text-muted-foreground sm:block">
          <div className="flex items-center gap-1 justify-end"><TimerReset className="h-3 w-3" /> {formatRelative(err.createdAt)}</div>
          {err.user ? (
            <Link
              href={err.user.clerkUserId ? `/users/${err.user.clerkUserId}` : "#"}
              onClick={(e) => e.stopPropagation()}
              className="block max-w-[180px] truncate hover:text-primary"
            >
              {err.user.name}
            </Link>
          ) : (
            <span className="text-muted-foreground/70">no user</span>
          )}
        </div>
        {expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
      </button>

      {expanded ? (
        <div className="space-y-3 border-t border-border bg-secondary/30 p-4 text-xs">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Detail label="What happened">
              <p className="leading-relaxed">{err.explanation.reason}</p>
            </Detail>
            <Detail label="How to fix">
              <p className="leading-relaxed">{err.explanation.fix}</p>
            </Detail>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Detail label="Source"><span className="font-mono">{err.source}</span></Detail>
            <Detail label="Code"><span className="font-mono">{err.code ?? "—"}</span></Detail>
            <Detail label="Pathname"><span className="font-mono">{err.pathname ?? "—"}</span></Detail>
            <Detail label="When">{new Date(err.createdAt).toLocaleString()}</Detail>
          </div>
          {err.metadata ? (
            <Detail label="Metadata">
              <pre className="max-h-48 overflow-auto rounded bg-card p-2 font-mono text-[10px]">
                {JSON.stringify(err.metadata, null, 2)}
              </pre>
            </Detail>
          ) : null}
          {err.message ? (
            <Detail label="Raw message">
              <pre className="max-h-48 overflow-auto rounded bg-card p-2 font-mono text-[10px]">{err.message}</pre>
            </Detail>
          ) : null}

          {isResolved ? (
            <Detail label="Resolution">
              <p>
                Resolved {formatRelative(err.resolvedAt!)}.
                {err.resolvedComment ? <> Comment: “{err.resolvedComment}”</> : null}
              </p>
            </Detail>
          ) : canResolve ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="flex-1">
                <Detail label="Resolution comment (optional)">
                  <Textarea rows={2} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="What did you do?" />
                </Detail>
              </div>
              <Button size="sm" onClick={() => onResolve(comment)} className="gap-2">
                <CheckCircle2 className="h-4 w-4" /> Mark resolved
              </Button>
            </div>
          ) : (
            <p className="text-muted-foreground/70">
              Auto-collected errors (statements / uploads) auto-clear when the user retries successfully.
            </p>
          )}
        </div>
      ) : null}
    </Card>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-xs">{children}</div>
    </div>
  );
}
