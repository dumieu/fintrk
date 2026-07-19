"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { format, formatDistanceToNow } from "date-fns";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { InfoPopover } from "@/components/info-popover";
import { cn } from "@/lib/utils";
import {
  Copy,
  Check,
  Heart,
  Frown,
  MessageCircle,
  Sparkles,
  TrendingUp,
  TrendingDown,
  Minus,
  UserX,
  Search,
  RefreshCw,
  ThumbsUp,
  ThumbsDown,
} from "lucide-react";

/** BullTRK status palette  -  feedback dashboard */
const COL = {
  optimal: "#0BC18D",
  info: "#2CA2FF",
  purple: "#AD74FF",
  amber: "#ECAA0B",
  coral: "#FF6F69",
  grey: "#808080",
} as const;

type SentimentFilter = "all" | "loving_it" | "tough_time";

interface StatsPayload {
  total: number;
  loving_it: number;
  tough_time: number;
  with_message: number;
  anonymous: number;
  last_7d: number;
  prev_7d: number;
}

interface FeedbackItem {
  idFeedback: string | number;
  clerkUserId: string | null;
  name: string | null;
  email: string;
  appName: string | null;
  sentiment: string;
  message: string | null;
  ideaRedesignScreen: string | null;
  ideaOtherTools: string | null;
  ideaSpreadsheetTracking: string | null;
  ideaFirstFeature: string | null;
  ideaFriendDescription: string | null;
  ideaMissMost: string | null;
  createdAt: string;
}

const IDEA_LABELS: { key: keyof FeedbackItem; label: string }[] = [
  { key: "ideaRedesignScreen", label: "Redesign screen" },
  { key: "ideaOtherTools", label: "Other tools" },
  { key: "ideaSpreadsheetTracking", label: "Spreadsheet tracking" },
  { key: "ideaFirstFeature", label: "First feature" },
  { key: "ideaFriendDescription", label: "Friend description" },
  { key: "ideaMissMost", label: "Miss most" },
];

interface ApiResponse {
  stats: StatsPayload;
  daily: { day: string; count: number }[];
  items: FeedbackItem[];
}

function fillLast14Days(daily: { day: string; count: number }[]) {
  const map = new Map(daily.map((d) => [d.day.slice(0, 10), d.count]));
  const out: { day: string; count: number; label: string }[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - i);
    const key = d.toISOString().slice(0, 10);
    out.push({
      day: key,
      count: map.get(key) ?? 0,
      label: format(d, "MMM d"),
    });
  }
  return out;
}

function trendDelta(current: number, previous: number): {
  pct: number;
  direction: "up" | "down" | "flat";
} {
  if (previous === 0) {
    if (current === 0) return { pct: 0, direction: "flat" };
    return { pct: 100, direction: "up" };
  }
  const raw = ((current - previous) / previous) * 100;
  const pct = Math.round(raw);
  if (Math.abs(pct) < 1) return { pct: 0, direction: "flat" };
  return { pct: Math.abs(pct), direction: raw >= 0 ? "up" : "down" };
}

export function FeedbackSubmissionsDashboard() {
  const [filter, setFilter] = useState<SentimentFilter>("all");
  const [query, setQuery] = useState("");
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | number | null>(null);

  const load = useCallback(async (sentiment: SentimentFilter) => {
    setLoading(true);
    setError(null);
    try {
      const q =
        sentiment === "all" ? "" : `?sentiment=${encodeURIComponent(sentiment)}`;
      const res = await fetch(`/api/feedback-submissions${q}`);
      if (!res.ok) throw new Error("Failed to load");
      const json = (await res.json()) as ApiResponse;
      setData(json);
    } catch {
      setError("Could not load feedback");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(filter);
  }, [filter, load]);

  const chartDaily = useMemo(
    () => (data?.daily ? fillLast14Days(data.daily) : []),
    [data?.daily]
  );

  const pieData = useMemo(() => {
    if (!data?.stats) return [];
    const { loving_it: l, tough_time: t } = data.stats;
    if (l === 0 && t === 0) return [];
    return [
      { name: "Loving it", value: l, fill: COL.optimal },
      { name: "Tough time", value: t, fill: COL.coral },
    ];
  }, [data?.stats]);

  const filteredItems = useMemo(() => {
    if (!data?.items) return [];
    const q = query.trim().toLowerCase();
    if (!q) return data.items;
    return data.items.filter((row) => {
      const haystack = [
        row.email,
        row.name,
        row.message,
        row.clerkUserId,
        row.appName,
        row.ideaRedesignScreen,
        row.ideaOtherTools,
        row.ideaSpreadsheetTracking,
        row.ideaFirstFeature,
        row.ideaFriendDescription,
        row.ideaMissMost,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [data?.items, query]);

  const stats = data?.stats;
  const trend = stats ? trendDelta(stats.last_7d, stats.prev_7d) : null;
  const pctPositive =
    stats && stats.total > 0
      ? Math.round((stats.loving_it / stats.total) * 1000) / 10
      : 0;

  const copyClerkId = async (id: string | number, clerkId: string) => {
    try {
      await navigator.clipboard.writeText(clerkId);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      /* ignore */
    }
  };

  if (error && !data) {
    return (
      <Card className="border-dashed border-[#FF6F69]/40 bg-[#FF6F69]/5">
        <CardContent className="flex flex-col items-center justify-center gap-3 py-12">
          <p className="text-sm text-muted-foreground">{error}</p>
          <Button variant="outline" size="sm" onClick={() => void load(filter)}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="relative min-w-0 w-full space-y-6">
      {/* ambient */}
      <div
        className="pointer-events-none absolute -top-24 left-1/2 h-64 w-[min(100%,720px)] -translate-x-1/2 rounded-full opacity-[0.12] blur-3xl dark:opacity-[0.18]"
        style={{
          background: `radial-gradient(ellipse at center, ${COL.purple} 0%, ${COL.info} 45%, transparent 70%)`,
        }}
      />

      <div className="relative flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-xl shadow-md"
              style={{
                background: `linear-gradient(135deg, ${COL.optimal} 0%, ${COL.info} 100%)`,
              }}
            >
              <Sparkles className="h-4 w-4 text-white" />
            </div>
            <h2 className="text-lg font-bold tracking-tight text-slate-900 dark:text-foreground">
              User feedback
            </h2>
          </div>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Submissions from the{" "}
            <span className="font-medium text-foreground">/feedback</span> page  -  sentiment,
            optional messages, and contact email.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="shrink-0 gap-1.5 self-start sm:self-auto"
          disabled={loading}
          onClick={() => void load(filter)}
        >
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {/* KPI row */}
      <div className="relative grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {loading && !stats ? (
          <>
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-[88px] rounded-xl" />
            ))}
          </>
        ) : stats ? (
          <>
            <Card
              className={cn(
                "min-h-12 sm:min-h-14 p-1 sm:p-2 border shadow-sm flex flex-col justify-between",
                "text-[#2CA2FF] bg-[#2CA2FF]/8 border-[#2CA2FF]/60 dark:text-[#7cc4ff] dark:bg-[#2CA2FF]/12 dark:border-[#2CA2FF]/50"
              )}
            >
              <div className="flex items-center justify-between px-2 pt-1.5">
                <span className="text-[8px] sm:text-[9px] font-medium opacity-70">
                  Total submissions
                </span>
                <InfoPopover title="Total feedback">
                  <p>All rows in feedback_submissions, including anonymous entries.</p>
                </InfoPopover>
              </div>
              <div className="flex items-end justify-between px-2 pb-1.5">
                <span className="text-sm sm:text-base font-bold">{stats.total}</span>
                <span className="text-[9px] sm:text-[10px] font-semibold opacity-70">
                  all time
                </span>
              </div>
            </Card>

            <Card
              className={cn(
                "min-h-12 sm:min-h-14 p-1 sm:p-2 border shadow-sm flex flex-col justify-between",
                "text-[#0BC18D] bg-[#0BC18D]/8 border-[#0BC18D]/60 dark:text-[#34d399] dark:bg-[#0BC18D]/12 dark:border-[#0BC18D]/50"
              )}
            >
              <div className="flex items-center justify-between px-2 pt-1.5">
                <span className="text-[8px] sm:text-[9px] font-medium opacity-70 flex items-center gap-1">
                  <ThumbsUp className="h-3 w-3" />
                  Loving it
                </span>
              </div>
              <div className="flex items-end justify-between px-2 pb-1.5">
                <span className="text-sm sm:text-base font-bold">{stats.loving_it}</span>
                <span className="text-[9px] sm:text-[10px] font-semibold opacity-70">
                  {stats.total > 0 ? `${pctPositive}%` : " - "} of total
                </span>
              </div>
            </Card>

            <Card
              className={cn(
                "min-h-12 sm:min-h-14 p-1 sm:p-2 border shadow-sm flex flex-col justify-between",
                "text-[#FF6F69] bg-[#FF6F69]/8 border-[#FF6F69]/60 dark:text-[#fca5a5] dark:bg-[#FF6F69]/12 dark:border-[#FF6F69]/50"
              )}
            >
              <div className="flex items-center justify-between px-2 pt-1.5">
                <span className="text-[8px] sm:text-[9px] font-medium opacity-70 flex items-center gap-1">
                  <ThumbsDown className="h-3 w-3" />
                  Tough time
                </span>
              </div>
              <div className="flex items-end justify-between px-2 pb-1.5">
                <span className="text-sm sm:text-base font-bold">{stats.tough_time}</span>
                <span className="text-[9px] sm:text-[10px] font-semibold opacity-70">
                  needs attention
                </span>
              </div>
            </Card>

            <Card
              className={cn(
                "min-h-12 sm:min-h-14 p-1 sm:p-2 border shadow-sm flex flex-col justify-between",
                "text-[#AD74FF] bg-[#AD74FF]/8 border-[#AD74FF]/60 dark:text-[#c9a0ff] dark:bg-[#AD74FF]/12 dark:border-[#AD74FF]/50"
              )}
            >
              <div className="flex items-center justify-between px-2 pt-1.5">
                <span className="text-[8px] sm:text-[9px] font-medium opacity-70">
                  Last 7 days
                </span>
                {trend && (
                  <span
                    className={cn(
                      "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-semibold",
                      trend.direction === "up" && "bg-[#0BC18D]/15 text-[#0BC18D]",
                      trend.direction === "down" && "bg-[#FF6F69]/15 text-[#FF6F69]",
                      trend.direction === "flat" && "bg-muted text-muted-foreground"
                    )}
                  >
                    {trend.direction === "up" && <TrendingUp className="h-3 w-3" />}
                    {trend.direction === "down" && <TrendingDown className="h-3 w-3" />}
                    {trend.direction === "flat" && <Minus className="h-3 w-3" />}
                    {trend.direction === "flat" ? "flat" : `${trend.pct}%`}
                  </span>
                )}
              </div>
              <div className="flex items-end justify-between px-2 pb-1.5">
                <span className="text-sm sm:text-base font-bold">{stats.last_7d}</span>
                <span className="text-[9px] sm:text-[10px] font-semibold opacity-70">
                  vs prior week {stats.prev_7d}
                </span>
              </div>
            </Card>
          </>
        ) : null}
      </div>

      {/* Secondary stats + charts */}
      <div className="relative grid grid-cols-1 gap-4 lg:grid-cols-12 min-w-0">
        <Card className="lg:col-span-4 overflow-hidden border-slate-200/80 dark:border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Sentiment split</CardTitle>
            <CardDescription className="text-xs">
              Share of positive vs struggling responses
            </CardDescription>
          </CardHeader>
          <CardContent className="h-[220px] min-h-[220px] min-w-0">
            {loading && !data ? (
              <Skeleton className="h-full w-full rounded-lg" />
            ) : pieData.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-center px-4">
                <div
                  className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-dashed"
                  style={{ borderColor: `${COL.grey}55` }}
                >
                  <Heart className="h-6 w-6 opacity-40" style={{ color: COL.grey }} />
                </div>
                <p className="text-sm text-muted-foreground">No feedback submissions yet</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={52}
                    outerRadius={78}
                    paddingAngle={2}
                  >
                    {pieData.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} stroke="transparent" />
                    ))}
                  </Pie>
                  <RechartsTooltip
                    formatter={(value, name) => [value ?? 0, String(name)]}
                    contentStyle={{
                      borderRadius: 10,
                      border: `1px solid ${COL.info}40`,
                      fontSize: 12,
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-8 overflow-hidden border-slate-200/80 dark:border-border min-w-0">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Activity (14 days)</CardTitle>
            <CardDescription className="text-xs">
              Submission volume by day (UTC)
            </CardDescription>
          </CardHeader>
          <CardContent className="h-[220px] min-h-[220px] min-w-0 pl-0 sm:pl-2">
            {loading && !data ? (
              <Skeleton className="h-full w-full rounded-lg" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartDaily} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
                  <defs>
                    <linearGradient id="feedbackArea" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={COL.info} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={COL.info} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted/40" />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    interval="preserveStartEnd"
                    tickLine={false}
                  />
                  <YAxis
                    allowDecimals={false}
                    width={28}
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <RechartsTooltip
                    content={({ active, payload: tp }) => {
                      if (!active || !tp?.length) return null;
                      const p = tp[0].payload as { day: string; count: number };
                      const dayStr = p.day?.slice(0, 10) ?? "";
                      return (
                        <div
                          className="rounded-lg border bg-background/95 px-2.5 py-1.5 text-xs shadow-md backdrop-blur-sm"
                          style={{ borderColor: `${COL.purple}55` }}
                        >
                          <div className="text-muted-foreground">
                            {dayStr
                              ? format(new Date(`${dayStr}T12:00:00.000Z`), "MMM d, yyyy")
                              : ""}
                          </div>
                          <div className="font-semibold tabular-nums" style={{ color: COL.info }}>
                            {p.count} submission{p.count === 1 ? "" : "s"}
                          </div>
                        </div>
                      );
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="count"
                    stroke={COL.info}
                    strokeWidth={2}
                    fill="url(#feedbackArea)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick stats strip */}
      {stats && (
        <div className="flex flex-wrap gap-2">
          <Badge
            variant="outline"
            className="gap-1 border-[#ECAA0B]/50 bg-[#ECAA0B]/8 text-[#ECAA0B] dark:text-[#fcd34d]"
          >
            <MessageCircle className="h-3 w-3" />
            {stats.with_message} with a written message
          </Badge>
          <Badge
            variant="outline"
            className="gap-1 border-[#808080]/50 bg-muted/50 text-muted-foreground"
          >
            <UserX className="h-3 w-3" />
            {stats.anonymous} anonymous (no Clerk ID)
          </Badge>
        </div>
      )}

      {/* List toolbar */}
      <Card className="border-slate-200/80 dark:border-border overflow-hidden">
        <CardHeader className="space-y-4 pb-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-base">All submissions</CardTitle>
              <CardDescription className="text-xs mt-1">
                Filter by sentiment or search email, message, or user ID
              </CardDescription>
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="h-9 pl-8 text-sm"
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["all", "All", null],
                ["loving_it", "Loving it", Heart],
                ["tough_time", "Tough time", Frown],
              ] as const
            ).map(([key, label, Icon]) => (
              <Button
                key={key}
                variant={filter === key ? "default" : "outline"}
                size="sm"
                className={cn(
                  "h-8 text-xs gap-1.5",
                  filter === key &&
                    key === "loving_it" &&
                    "bg-[#0BC18D] hover:bg-[#0BC18D]/90 text-white border-transparent",
                  filter === key &&
                    key === "tough_time" &&
                    "bg-[#FF6F69] hover:bg-[#FF6F69]/90 text-white border-transparent",
                  filter === key && key === "all" && "bg-[#2CA2FF] hover:bg-[#2CA2FF]/90 text-white border-transparent"
                )}
                disabled={loading}
                onClick={() => setFilter(key)}
              >
                {Icon && <Icon className="h-3.5 w-3.5" />}
                {label}
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="max-h-[min(520px,55vh)] overflow-y-auto pr-1 space-y-2.5">
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-20 w-full rounded-xl" />
              ))}
            </div>
          ) : filteredItems.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              No submissions match your filters
            </p>
          ) : (
            filteredItems.map((row) => {
              const positive = row.sentiment === "loving_it";
              return (
                <div
                  key={row.idFeedback}
                  className={cn(
                    "group rounded-xl border p-3 sm:p-4 transition-all",
                    "border-slate-100 bg-white/80 hover:shadow-md dark:bg-card/60 dark:border-border",
                    "hover:border-[#2CA2FF]/30"
                  )}
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between min-w-0">
                    <div className="flex flex-wrap items-center gap-2 min-w-0">
                      <Badge
                        className={cn(
                          "shrink-0 gap-1 font-medium border-0",
                          positive
                            ? "bg-[#0BC18D]/15 text-[#0BC18D] dark:text-[#34d399]"
                            : "bg-[#FF6F69]/15 text-[#FF6F69] dark:text-[#fca5a5]"
                        )}
                      >
                        {positive ? (
                          <ThumbsUp className="h-3 w-3" />
                        ) : (
                          <ThumbsDown className="h-3 w-3" />
                        )}
                        {positive ? "Loving it" : "Tough time"}
                      </Badge>
                      <div className="min-w-0">
                        {row.name ? (
                          <span className="block text-xs font-medium text-slate-800 dark:text-foreground truncate max-w-[min(100%,280px)]">
                            {row.name}
                          </span>
                        ) : null}
                        <span className="block text-xs text-slate-600 dark:text-muted-foreground truncate max-w-[min(100%,280px)]">
                          {row.email}
                        </span>
                      </div>
                      {row.appName ? (
                        <Badge variant="outline" className="shrink-0 text-[10px] font-normal">
                          {row.appName}
                        </Badge>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                        {formatDistanceToNow(new Date(row.createdAt), { addSuffix: true })}
                      </span>
                    </div>
                  </div>
                  {row.clerkUserId ? (
                    <div className="mt-2 flex items-center gap-2 min-w-0">
                      <code className="text-[10px] sm:text-xs bg-muted/80 rounded px-1.5 py-0.5 truncate max-w-[min(100%,100%)] font-mono text-muted-foreground">
                        {row.clerkUserId}
                      </code>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0 touch-manipulation"
                        aria-label="Copy Clerk user ID"
                        onClick={() => void copyClerkId(row.idFeedback, row.clerkUserId!)}
                      >
                        {copiedId === row.idFeedback ? (
                          <Check className="h-3.5 w-3.5 text-[#0BC18D]" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </div>
                  ) : (
                    <p className="mt-2 text-[10px] text-muted-foreground italic">Anonymous submission</p>
                  )}
                  {row.message ? (
                    <p className="mt-2 text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-wrap break-words">
                      {row.message}
                    </p>
                  ) : (
                    <p className="mt-2 text-[11px] text-muted-foreground italic">No message text</p>
                  )}
                  {IDEA_LABELS.some((idea) => {
                    const v = row[idea.key];
                    return typeof v === "string" && v.trim().length > 0;
                  }) ? (
                    <div className="mt-3 space-y-2 border-t border-border/60 pt-3">
                      {IDEA_LABELS.map((idea) => {
                        const v = row[idea.key];
                        if (typeof v !== "string" || !v.trim()) return null;
                        return (
                          <div key={idea.key}>
                            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                              {idea.label}
                            </p>
                            <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300 whitespace-pre-wrap break-words">
                              {v}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}
