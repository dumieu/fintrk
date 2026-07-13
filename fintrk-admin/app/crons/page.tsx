"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Timer,
  Play,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  Info,
  RefreshCw,
} from "lucide-react";
import { describeCronSchedule } from "@/lib/cron-registry";

interface CronItem {
  id: string;
  app: string;
  path: string;
  schedule: string;
  host: string;
  description: string;
  enabledAt: string | null;
  updatedAt: string | null;
  deploymentId: string | null;
  lastSuccessAt: string | null;
  lastDurationMs: number | null;
  lastSummary: Record<string, unknown> | null;
  lastFailureAt: string | null;
  failureDurationMs: number | null;
  failureSummary: Record<string, unknown> | null;
}

interface TestResult {
  status: "success" | "error" | "triggered";
  httpStatus: number;
  elapsed: number;
  response: Record<string, unknown>;
  targetUrl?: string;
  testedAt: string;
}

const APP_COLORS: Record<string, string> = {
  "User App": "bg-blue-100 text-blue-700 border-blue-200",
  "MktgTRK": "bg-purple-100 text-purple-700 border-purple-200",
  "Admin App": "bg-amber-100 text-amber-700 border-amber-200",
};

function timeAgo(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "-";
  const ms = Date.now() - d.getTime();
  const m = Math.floor(ms / 60_000);
  const h = Math.floor(ms / 3_600_000);
  const dd = Math.floor(ms / 86_400_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  if (h < 24) return `${h}h ago`;
  return `${dd}d ago`;
}

export default function CronsPage() {
  const [crons, setCrons] = useState<CronItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [testing, setTesting] = useState<Record<string, boolean>>({});
  const [results, setResults] = useState<Record<string, TestResult>>({});

  const fetchCrons = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/crons");
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || `HTTP ${res.status}`);
        setCrons([]);
        return;
      }
      const data: CronItem[] = await res.json();
      setCrons(data);
    } catch {
      setError("Failed to fetch crons");
      setCrons([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCrons();
  }, [fetchCrons]);

  const handleTest = async (cron: CronItem) => {
    setTesting((p) => ({ ...p, [cron.id]: true }));
    try {
      const res = await fetch("/api/crons/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ app: cron.app, path: cron.path }),
      });
      const data = await res.json();

      const result: TestResult = {
        status: data.status ?? "error",
        httpStatus: data.httpStatus ?? res.status,
        elapsed: data.elapsed ?? 0,
        response: data.response ?? data,
        targetUrl: data.targetUrl,
        testedAt: data.testedAt ?? new Date().toISOString(),
      };

      setResults((p) => ({ ...p, [cron.id]: result }));
      fetchCrons();
    } catch {
      setResults((p) => ({
        ...p,
        [cron.id]: {
          status: "error",
          httpStatus: 0,
          elapsed: 0,
          response: { error: "Network error - could not reach Admin App API" },
          testedAt: new Date().toISOString(),
        },
      }));
    } finally {
      setTesting((p) => ({ ...p, [cron.id]: false }));
    }
  };

  const getStatusIndicator = (id: string) => {
    const result = results[id];
    if (!result) {
      return (
        <span className="flex items-center gap-1.5 text-slate-400 text-xs">
          <span className="h-2 w-2 rounded-full bg-slate-300" />
          Idle
        </span>
      );
    }
    if (result.status === "success") {
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="flex items-center gap-1.5 text-emerald-600 text-xs font-medium cursor-help">
                <CheckCircle2 className="h-3.5 w-3.5" />
                OK · {result.elapsed}ms
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-md p-4 bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-800 shadow-lg">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                  OK · {result.elapsed}ms
                </span>
              </div>
              <pre className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap break-all leading-relaxed">
                {JSON.stringify(result.response, null, 2)}
              </pre>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }
    if (result.status === "triggered") {
      return (
        <span className="flex items-center gap-1.5 text-blue-600 text-xs font-medium">
          <Clock className="h-3.5 w-3.5 animate-pulse" />
          Triggered  -  refresh in a few min
        </span>
      );
    }
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="flex items-center gap-1.5 text-red-600 text-xs font-medium cursor-help">
              <XCircle className="h-3.5 w-3.5" />
              Fail{result.httpStatus ? ` · ${result.httpStatus}` : ""}
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-md p-4 bg-white dark:bg-slate-900 border border-red-200 dark:border-red-800 shadow-lg">
            <div className="flex items-center gap-2 mb-2">
              <XCircle className="h-4 w-4 text-red-500 shrink-0" />
              <span className="text-sm font-semibold text-red-600 dark:text-red-400">
                HTTP {result.httpStatus || "N/A"}
              </span>
            </div>
            {!!result.response?.error && (
              <p className="text-sm text-slate-700 dark:text-slate-300 mb-2">
                {String(result.response.error)}
              </p>
            )}
            {result.targetUrl && (
              <p className="text-xs text-slate-500 dark:text-slate-400 break-all">
                {result.targetUrl}
              </p>
            )}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  };

  const apps = ["User App", "Admin App"];
  const appCounts = apps.map((a) => ({
    app: a,
    count: crons.filter((c) => c.app === a).length,
  }));

  return (
    <>
        <div className="flex items-start justify-between mb-6">
          <div className="flex items-start gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-orange-500 to-red-600 shadow-sm">
              <Timer className="h-4 w-4 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
                Crons
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Live cron jobs from Vercel across all apps
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchCrons}
            disabled={loading}
            className="cursor-pointer"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          {appCounts.map(({ app, count }) => (
            <Card key={app} className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">{app}</p>
                  <p className="text-2xl font-bold tabular-nums">
                    {loading ? "-" : count}
                  </p>
                </div>
                <Badge variant="outline" className={APP_COLORS[app] ?? ""}>
                  {loading ? "…" : `${count} cron${count !== 1 ? "s" : ""}`}
                </Badge>
              </div>
            </Card>
          ))}
        </div>

        {/* Error state */}
        {error && (
          <Card className="mb-6 border-red-200 bg-red-50">
            <CardContent className="p-4 text-sm text-red-700">
              <strong>Error:</strong> {error}
              <p className="mt-1 text-xs text-red-500">
                Make sure VERCEL_API_TOKEN and the project ID env vars are set.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Crons table */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Cron Registry{!loading && ` (${crons.length})`}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-[300px] w-full rounded-lg" />
            ) : crons.length === 0 && !error ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                No crons found. Ensure project IDs are configured.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>App</TableHead>
                    <TableHead>Schedule</TableHead>
                    <TableHead className="hidden lg:table-cell">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="flex items-center gap-1 cursor-help">
                              Description
                              <Info className="h-3 w-3 text-muted-foreground" />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-xs text-xs">
                            Edit descriptions in:<br />
                            <code className="text-[11px] bg-slate-100 px-1 py-0.5 rounded">
                              biotrk-admin-app/lib/cron-registry.ts
                            </code>
                            <br />
                            Add an entry to the <strong>CRON_DESCRIPTIONS</strong> map,
                            keyed by the cron path.
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </TableHead>
                    <TableHead>Last Failure</TableHead>
                    <TableHead>Last Success</TableHead>
                    <TableHead>Test Status</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {crons.map((cron) => {
                    const cronName = cron.path
                      .replace(/^\/api\/cron\//, "")
                      .replace(/\//g, "-");
                    return (
                      <TableRow key={cron.id}>
                        <TableCell>
                          <div>
                            <span className="font-medium font-mono text-sm">
                              {cronName}
                            </span>
                            <p className="text-[11px] text-muted-foreground font-mono mt-0.5">
                              {cron.path}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={`text-[11px] ${APP_COLORS[cron.app] ?? ""}`}
                          >
                            {cron.app}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="text-sm cursor-help flex items-center gap-1">
                                  {describeCronSchedule(cron.schedule)}
                                  <Info className="h-3 w-3 text-muted-foreground" />
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="top">
                                <code className="text-xs">{cron.schedule}</code>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          <p className="text-xs text-muted-foreground whitespace-pre-line">
                            {cron.description || (
                              <span className="italic">No description</span>
                            )}
                          </p>
                        </TableCell>
                        <TableCell>
                          {cron.lastFailureAt ? (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="text-xs text-red-600 font-medium cursor-help flex items-center gap-1">
                                    <XCircle className="h-3 w-3" />
                                    {timeAgo(cron.lastFailureAt)}
                                    {cron.failureDurationMs != null && (
                                      <span className="text-red-400 font-normal">
                                        · {cron.failureDurationMs < 1000 ? `${cron.failureDurationMs}ms` : `${(cron.failureDurationMs / 1000).toFixed(1)}s`}
                                      </span>
                                    )}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="max-w-sm border-red-200 dark:border-red-800">
                                  <p className="text-xs font-medium mb-1 text-red-600 dark:text-red-400">
                                    {new Date(cron.lastFailureAt).toLocaleString()}
                                  </p>
                                  {cron.failureSummary && (
                                    <pre className="text-[11px] whitespace-pre-wrap break-all mt-1 opacity-80">
                                      {JSON.stringify(cron.failureSummary, null, 2)}
                                    </pre>
                                  )}
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          ) : (
                            <span className="text-xs text-slate-400">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {cron.lastSuccessAt ? (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="text-xs text-emerald-600 font-medium cursor-help flex items-center gap-1">
                                    <CheckCircle2 className="h-3 w-3" />
                                    {timeAgo(cron.lastSuccessAt)}
                                    {cron.lastDurationMs != null && (
                                      <span className="text-muted-foreground font-normal">
                                        · {cron.lastDurationMs < 1000 ? `${cron.lastDurationMs}ms` : `${(cron.lastDurationMs / 1000).toFixed(1)}s`}
                                      </span>
                                    )}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="max-w-sm">
                                  <p className="text-xs font-medium mb-1">
                                    {new Date(cron.lastSuccessAt).toLocaleString()}
                                  </p>
                                  {cron.lastSummary && (
                                    <pre className="text-[11px] whitespace-pre-wrap break-all mt-1 opacity-80">
                                      {JSON.stringify(cron.lastSummary, null, 2)}
                                    </pre>
                                  )}
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          ) : (
                            <span className="text-xs text-slate-400">Never</span>
                          )}
                        </TableCell>
                        <TableCell>{getStatusIndicator(cron.id)}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs cursor-pointer"
                            disabled={testing[cron.id]}
                            onClick={() => handleTest(cron)}
                          >
                            {testing[cron.id] ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Play className="h-3.5 w-3.5" />
                            )}
                            <span className="ml-1">Test</span>
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
    </>
  );
}
