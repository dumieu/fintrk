"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChevronLeft,
  ChevronRight,
  Crown,
  Loader2,
  Lock,
  Mail,
  Pencil,
  Search,
  Trash2,
  User as UserIcon,
} from "lucide-react";

import { ADMIN_HARD_DELETE_USER_PHRASE } from "@/lib/admin-user-delete-phrase";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
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
  created_at: string;
  accounts: number;
  statements: number;
  transactions: number;
  recurring_patterns: number;
  ai_insights: number;
  last_txn_date: string | null;
  ai_spend: string | number | null;
  plan: string;
  planStatus: string | null;
}

interface ChartsPayload {
  series: Array<{ day: string; count: number; txns: number; cost: number }>;
  planMix: { pro: number; free: number };
}

const COL = {
  mint: "#0BC18D",
  sky: "#2CA2FF",
  coral: "#FF6F69",
  amber: "#ECAA0B",
} as const;

export default function UsersPage() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{
    rows: UserRow[];
    pagination: { totalRows: number; totalPages: number };
    charts?: ChartsPayload;
    clerkKeyMissing?: boolean;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);

  const [planTarget, setPlanTarget] = useState<UserRow | null>(null);
  const [planAction, setPlanAction] = useState<"grant_pro" | "revoke_pro">("grant_pro");
  const [planSaving, setPlanSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<UserRow | null>(null);
  const [deletePhrase, setDeletePhrase] = useState("");
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const url = new URL("/api/users", window.location.origin);
      url.searchParams.set("page", String(page));
      url.searchParams.set("limit", "50");
      if (search) url.searchParams.set("search", search);
      const r = await fetch(url.toString(), { cache: "no-store" });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error || "Failed to load");
      setData(body);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load users");
    } finally {
      setLoading(false);
    }
  }, [search, page]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 250);
    return () => clearTimeout(t);
  }, [load]);

  const total = data?.pagination.totalRows ?? 0;
  const totalPages = data?.pagination.totalPages ?? 1;

  const chartData = useMemo(() => {
    return (data?.charts?.series ?? []).map((d) => ({
      ...d,
      label: format(new Date(d.day + "T00:00:00Z"), "MMM d"),
    }));
  }, [data?.charts]);

  const handlePlan = async () => {
    if (!planTarget) return;
    setPlanSaving(true);
    try {
      const res = await fetch("/api/users/plan", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clerkUserId: planTarget.clerk_user_id,
          action: planAction,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Plan update failed");
      toast.success(
        planAction === "grant_pro"
          ? `Granted Pro to ${planTarget.primary_email ?? planTarget.clerk_user_id}`
          : `Revoked Pro from ${planTarget.primary_email ?? planTarget.clerk_user_id}`,
      );
      setPlanTarget(null);
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Plan update failed");
    } finally {
      setPlanSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    if (
      deletePhrase.trim().toLowerCase() !==
      ADMIN_HARD_DELETE_USER_PHRASE.toLowerCase()
    ) {
      toast.error("Confirmation phrase does not match");
      return;
    }
    setDeleting(true);
    try {
      const res = await fetch("/api/users/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clerkUserId: deleteTarget.clerk_user_id,
          confirmationPhrase: deletePhrase,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Delete failed");
      if (body.clerkKeyMissing) {
        toast.warning("Neon purged; Clerk key missing so Clerk user remains");
      } else if (!body.clerkDeleted) {
        toast.warning("Neon purged; Clerk delete failed");
      } else {
        toast.success("User permanently deleted");
      }
      setDeleteTarget(null);
      setDeletePhrase("");
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-[0.3em] text-emerald-600/80">User Behavior</p>
          <h1 className="text-2xl font-bold tracking-tight">Users</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {formatNumber(total)} users · click a row for the behavior dossier.
            {data?.clerkKeyMissing ? " · Clerk user-app key missing (plan badges limited)" : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={editMode ? "default" : "outline"}
            size="sm"
            onClick={() => setEditMode((v) => !v)}
            className="gap-1.5"
          >
            {editMode ? <Pencil className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
            {editMode ? "Edit mode" : "Locked"}
          </Button>
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
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <ChartCard title="Signups (30d)" color={COL.sky} dataKey="count" data={chartData} loading={loading} />
        <ChartCard title="Txn volume (30d)" color={COL.mint} dataKey="txns" data={chartData} loading={loading} />
        <ChartCard title="AI spend (30d)" color={COL.coral} dataKey="cost" data={chartData} loading={loading} money />
      </div>

      {(data?.charts?.planMix.pro || data?.charts?.planMix.free) ? (
        <div className="mb-4 flex flex-wrap gap-2 text-xs">
          <Badge className="bg-emerald-600 hover:bg-emerald-600 gap-1">
            <Crown className="h-3 w-3" /> Pro on page: {data.charts.planMix.pro}
          </Badge>
          <Badge variant="secondary">Free on page: {data.charts.planMix.free}</Badge>
        </div>
      ) : null}

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">User</th>
                <th className="px-3 py-3 text-left font-semibold">Plan</th>
                <th className="px-3 py-3 text-right font-semibold">Txns</th>
                <th className="px-3 py-3 text-right font-semibold">Stmts</th>
                <th className="px-3 py-3 text-right font-semibold">Accts</th>
                <th className="px-3 py-3 text-right font-semibold">Recurring</th>
                <th className="px-3 py-3 text-right font-semibold">Insights</th>
                <th className="px-3 py-3 text-right font-semibold">AI $</th>
                <th className="px-3 py-3 text-left font-semibold">Last activity</th>
                <th className="px-3 py-3 text-left font-semibold">Joined</th>
                {editMode ? <th className="px-3 py-3 text-right font-semibold">Actions</th> : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={editMode ? 11 : 10} className="px-4 py-4">
                      <div className="h-8 w-full animate-pulse rounded bg-secondary" />
                    </td>
                  </tr>
                ))
              ) : data?.rows.length ? (
                data.rows.map((u) => (
                  <tr key={u.clerk_user_id} className="hover:bg-accent/40 transition-colors">
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/users/${encodeURIComponent(u.clerk_user_id)}`}
                        className="flex items-center gap-3 group"
                      >
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
                            {[u.first_name, u.last_name].filter(Boolean).join(" ") ||
                              u.username ||
                              "—"}
                          </div>
                          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                            <Mail className="h-3 w-3" /> {u.primary_email ?? "no email"}
                          </div>
                        </div>
                      </Link>
                    </td>
                    <td className="px-3 py-2.5">
                      <PlanBadge plan={u.plan} status={u.planStatus} />
                    </td>
                    <Cell value={u.transactions} bold />
                    <Cell value={u.statements} />
                    <Cell value={u.accounts} />
                    <Cell value={u.recurring_patterns} />
                    <Cell value={u.ai_insights} />
                    <td className="px-3 py-2.5 text-right tabular-nums text-xs">
                      ${Number(u.ai_spend ?? 0).toFixed(2)}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">
                      {formatRelative(u.last_txn_date)}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">
                      {formatRelative(u.created_at)}
                    </td>
                    {editMode ? (
                      <td className="px-3 py-2.5 text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-[11px]"
                            onClick={() => {
                              setPlanTarget(u);
                              setPlanAction(u.plan === "pro" ? "revoke_pro" : "grant_pro");
                            }}
                          >
                            {u.plan === "pro" ? "Revoke Pro" : "Grant Pro"}
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            className="h-7 w-7 p-0"
                            onClick={() => {
                              setDeleteTarget(u);
                              setDeletePhrase("");
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    ) : null}
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={editMode ? 11 : 10}
                    className="px-4 py-12 text-center text-sm text-muted-foreground"
                  >
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

      <Dialog open={Boolean(planTarget)} onOpenChange={(o) => !o && setPlanTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {planAction === "grant_pro" ? "Grant Pro" : "Revoke Pro"}
            </DialogTitle>
            <DialogDescription>
              Updates Clerk <code>publicMetadata.plan</code> / <code>planStatus</code> for{" "}
              {planTarget?.primary_email ?? planTarget?.clerk_user_id}.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPlanTarget(null)}>
              Cancel
            </Button>
            <Button onClick={() => void handlePlan()} disabled={planSaving}>
              {planSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deleteTarget)} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Permanently delete user</DialogTitle>
            <DialogDescription>
              Cascades all FinTRK <code>user_id</code> tables, MCP tokens, the{" "}
              <code>users</code> row, then deletes the Clerk user. Type the phrase exactly:
            </DialogDescription>
          </DialogHeader>
          <p className="rounded-md bg-secondary px-3 py-2 font-mono text-xs">
            {ADMIN_HARD_DELETE_USER_PHRASE}
          </p>
          <Input
            value={deletePhrase}
            onChange={(e) => setDeletePhrase(e.target.value)}
            placeholder="Type confirmation phrase…"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={
                deleting ||
                deletePhrase.trim().toLowerCase() !==
                  ADMIN_HARD_DELETE_USER_PHRASE.toLowerCase()
              }
              onClick={() => void handleDelete()}
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Delete forever
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PlanBadge({ plan, status }: { plan: string; status: string | null }) {
  if (plan === "pro") {
    return (
      <Badge className="gap-1 bg-emerald-600 hover:bg-emerald-600">
        <Crown className="h-3 w-3" /> Pro
        {status ? <span className="opacity-80">{status}</span> : null}
      </Badge>
    );
  }
  if (plan === "free") {
    return <Badge variant="secondary">Free</Badge>;
  }
  return <Badge variant="outline">Unknown</Badge>;
}

function Cell({ value, bold }: { value: number; bold?: boolean }) {
  return (
    <td
      className={`px-3 py-2.5 text-right tabular-nums text-xs ${
        bold ? "font-semibold text-foreground" : "text-foreground/80"
      }`}
    >
      {formatNumber(value)}
    </td>
  );
}

function ChartCard({
  title,
  color,
  dataKey,
  data,
  loading,
  money,
}: {
  title: string;
  color: string;
  dataKey: string;
  data: Array<Record<string, string | number>>;
  loading: boolean;
  money?: boolean;
}) {
  return (
    <Card>
      <CardHeader className="pb-1">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent className="h-[140px] pt-0">
        {loading ? (
          <div className="h-full animate-pulse rounded bg-secondary" />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data}>
              <defs>
                <linearGradient id={`g-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={color} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
              <YAxis
                tick={{ fontSize: 10 }}
                width={36}
                tickFormatter={(v) => (money ? `$${Number(v).toFixed(0)}` : String(v))}
              />
              <RechartsTooltip
                formatter={(v) =>
                  money ? `$${Number(v).toFixed(2)}` : formatNumber(Number(v))
                }
              />
              <Area
                type="monotone"
                dataKey={dataKey}
                stroke={color}
                fill={`url(#g-${dataKey})`}
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
