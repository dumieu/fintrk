"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeftRight,
  Calendar,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  Globe2,
  Landmark,
  Mail,
  RefreshCcw,
  Search,
  Sparkles,
  TrendingUp,
  User as UserIcon,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { formatNumber, formatRelative } from "@/lib/utils";

interface UserRow {
  clerk_user_id: string;
  primary_email: string | null;
  first_name: string | null;
  last_name: string | null;
  username: string | null;
  image_url: string | null;
  main_currency: string | null;
  main_currency_percentage: string | number | null;
  detect_travel: string | null;
  created_at: string;
  updated_at: string;
  accounts: number;
  statements: number;
  transactions: number;
  recurring_patterns: number;
  ai_insights: number;
  last_txn_date: string | null;
  ai_spend: string | number | null;
}

export default function UsersPage() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ rows: UserRow[]; pagination: { totalRows: number; totalPages: number } } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ctl = new AbortController();
    setLoading(true);
    const t = setTimeout(() => {
      const url = new URL("/api/users", window.location.origin);
      url.searchParams.set("page", String(page));
      url.searchParams.set("limit", "50");
      if (search) url.searchParams.set("search", search);
      fetch(url.toString(), { cache: "no-store", signal: ctl.signal })
        .then((r) => r.json())
        .then(setData)
        .catch((e) => {
          if (e.name !== "AbortError") console.error(e);
        })
        .finally(() => setLoading(false));
    }, 250);
    return () => {
      ctl.abort();
      clearTimeout(t);
    };
  }, [search, page]);

  const total = data?.pagination.totalRows ?? 0;
  const totalPages = data?.pagination.totalPages ?? 1;

  const summary = useMemo(() => {
    if (!data?.rows.length) return null;
    const txns = data.rows.reduce((s, r) => s + (r.transactions || 0), 0);
    const stmts = data.rows.reduce((s, r) => s + (r.statements || 0), 0);
    const recur = data.rows.reduce((s, r) => s + (r.recurring_patterns || 0), 0);
    const ins = data.rows.reduce((s, r) => s + (r.ai_insights || 0), 0);
    return { txns, stmts, recur, ins };
  }, [data]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-[0.3em] text-emerald-600/80">User Behavior</p>
          <h1 className="text-2xl font-bold tracking-tight">Users</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {formatNumber(total)} users · click any row to open the full behavior dossier.
          </p>
        </div>
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search email, name, clerk id…"
            className="pl-8"
          />
        </div>
      </div>

      {summary ? (
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <PageStat icon={ArrowLeftRight} label="Txns on page" value={summary.txns} />
          <PageStat icon={FileSpreadsheet} label="Statements on page" value={summary.stmts} />
          <PageStat icon={RefreshCcw} label="Recurring on page" value={summary.recur} />
          <PageStat icon={Sparkles} label="AI insights on page" value={summary.ins} />
        </div>
      ) : null}

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">User</th>
                <th className="px-3 py-3 text-right font-semibold">Txns</th>
                <th className="px-3 py-3 text-right font-semibold">Stmts</th>
                <th className="px-3 py-3 text-right font-semibold">Accts</th>
                <th className="px-3 py-3 text-right font-semibold">Recurring</th>
                <th className="px-3 py-3 text-right font-semibold">Insights</th>
                <th className="px-3 py-3 text-right font-semibold">AI $</th>
                <th className="px-3 py-3 text-left font-semibold">Currency</th>
                <th className="px-3 py-3 text-left font-semibold">Last activity</th>
                <th className="px-3 py-3 text-left font-semibold">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={10} className="px-4 py-4">
                      <div className="h-8 w-full animate-pulse rounded bg-secondary" />
                    </td>
                  </tr>
                ))
              ) : data?.rows.length ? (
                data.rows.map((u) => (
                  <tr key={u.clerk_user_id} className="hover:bg-accent/40 transition-colors">
                    <td className="px-4 py-2.5">
                      <Link href={`/users/${encodeURIComponent(u.clerk_user_id)}`} className="flex items-center gap-3 group">
                        {u.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={u.image_url}
                            alt=""
                            className="h-8 w-8 rounded-full border border-border object-cover"
                          />
                        ) : (
                          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-foreground/70">
                            <UserIcon className="h-4 w-4" />
                          </span>
                        )}
                        <div className="leading-tight">
                          <div className="text-sm font-semibold group-hover:text-primary">
                            {[u.first_name, u.last_name].filter(Boolean).join(" ") || u.username || "—"}
                          </div>
                          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                            <Mail className="h-3 w-3" /> {u.primary_email ?? "no email"}
                          </div>
                        </div>
                      </Link>
                    </td>
                    <Cell value={u.transactions} bold />
                    <Cell value={u.statements} />
                    <Cell value={u.accounts} />
                    <Cell value={u.recurring_patterns} />
                    <Cell value={u.ai_insights} />
                    <td className="px-3 py-2.5 text-right tabular-nums text-xs">
                      ${Number(u.ai_spend ?? 0).toFixed(2)}
                    </td>
                    <td className="px-3 py-2.5 text-xs">
                      {u.main_currency ? (
                        <Badge variant="secondary" className="gap-1">
                          {u.main_currency}
                          <span className="opacity-70">
                            {Number(u.main_currency_percentage ?? 0).toFixed(0)}%
                          </span>
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">
                      {formatRelative(u.last_txn_date)}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">
                      {formatRelative(u.created_at)}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center text-sm text-muted-foreground">
                    No users match this search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between border-t border-border bg-secondary/40 px-4 py-2.5 text-xs">
          <div className="text-muted-foreground">
            Page {page} of {totalPages} · {formatNumber(total)} users
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-card disabled:opacity-40 hover:bg-accent cursor-pointer"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-card disabled:opacity-40 hover:bg-accent cursor-pointer"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </Card>
    </div>
  );
}

function Cell({ value, bold }: { value: number; bold?: boolean }) {
  return (
    <td className={`px-3 py-2.5 text-right tabular-nums text-xs ${bold ? "font-semibold text-foreground" : "text-foreground/80"}`}>
      {formatNumber(value)}
    </td>
  );
}

function PageStat({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: number }) {
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
