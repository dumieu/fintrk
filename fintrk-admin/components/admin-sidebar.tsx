"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useClerk, UserButton } from "@clerk/nextjs";
import {
  Activity,
  AlertTriangle,
  ArrowLeftRight,
  BadgeDollarSign,
  Banknote,
  BookOpen,
  Brain,
  ChevronDown,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Database,
  FileSpreadsheet,
  FileText,
  Flag,
  Gauge,
  Goal,
  Landmark,
  LogOut,
  Network,
  PiggyBank,
  Receipt,
  RefreshCcw,
  Search,
  Sparkles,
  Table2,
  Tag,
  TrendingUp,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";

interface TableInfo {
  name: string;
  rowCount: number;
}

interface Props {
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
}

const TABLES_BOLD = new Set([
  "users",
  "transactions",
  "accounts",
  "statements",
  "user_categories",
  "system_categories",
  "merchants",
  "recurring_patterns",
  "ai_insights",
]);

const TABLE_ICONS: Record<string, React.ElementType> = {
  users: Users,
  accounts: Landmark,
  statements: FileSpreadsheet,
  transactions: ArrowLeftRight,
  user_categories: Tag,
  system_categories: Tag,
  merchants: Receipt,
  category_rules: Network,
  recurring_patterns: RefreshCcw,
  fx_rates: TrendingUp,
  budgets: PiggyBank,
  goals: Goal,
  ai_insights: Sparkles,
  ai_costs: Brain,
  ai_token_costs: BadgeDollarSign,
  file_upload_log: FileText,
  error_logs: AlertTriangle,
};

export function AdminSidebar({ collapsed = false, onCollapsedChange }: Props) {
  const pathname = usePathname();
  const { signOut } = useClerk();
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const onTablesRoute = pathname.startsWith("/tables");
  const [tablesOpen, setTablesOpen] = useState(onTablesRoute);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    if (onTablesRoute) setTablesOpen(true);
  }, [onTablesRoute]);

  useEffect(() => {
    let cancelled = false;
    const load = async (attempt = 0) => {
      try {
        const r = await fetch("/api/introspect", { cache: "no-store" });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const json = (await r.json()) as { tables?: Array<TableInfo & { columns?: unknown }> };
        const data = Array.isArray(json) ? json : (json.tables ?? []);
        if (cancelled) return;
        setTables(
          data.map((t) => ({
            name: typeof t.name === "string" ? t.name : String(t.name ?? ""),
            rowCount:
              typeof t.rowCount === "number" && Number.isFinite(t.rowCount) ? t.rowCount : 0,
          })),
        );
        setLoading(false);
      } catch (e) {
        console.error("Introspect failed:", e);
        if (!cancelled && attempt < 2) {
          setTimeout(() => load(attempt + 1), 1500 * (attempt + 1));
        } else if (!cancelled) {
          setLoading(false);
        }
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return q ? tables.filter((t) => t.name.toLowerCase().includes(q)) : tables;
  }, [tables, filter]);

  const toggleCollapse = () => onCollapsedChange?.(!collapsed);
  const handleLogout = () => signOut({ redirectUrl: "/login" });

  if (collapsed) {
    return (
      <aside className="fixed left-0 top-0 z-40 flex h-screen w-[20px] flex-col bg-sidebar text-sidebar-foreground">
        <button
          onClick={toggleCollapse}
          className="flex h-full w-full items-center justify-center hover:bg-sidebar-accent/60 transition-colors cursor-pointer"
          title="Expand sidebar"
        >
          <ChevronsRight className="h-3 w-3 text-slate-400" />
        </button>
      </aside>
    );
  }

  return (
    <aside className="fixed left-0 top-0 z-40 flex h-screen w-[270px] flex-col bg-sidebar text-sidebar-foreground">
      {/* Brand */}
      <div className="flex items-center gap-3 px-5 py-5">
        <div className="relative flex h-9 w-9 items-center justify-center overflow-hidden rounded-lg bg-gradient-to-br from-emerald-400 via-teal-500 to-sky-500">
          <span className="absolute inset-0 brand-glow" aria-hidden="true" />
          <Banknote className="relative h-5 w-5 text-white" />
        </div>
        <div className="flex-1">
          <h1 className="text-base font-bold tracking-tight text-white">FinTRK Admin</h1>
          <p className="text-[11px] text-slate-400">Money Console</p>
        </div>
        <button
          onClick={toggleCollapse}
          className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-sidebar-accent/60 hover:text-slate-200 cursor-pointer"
          title="Collapse sidebar"
        >
          <ChevronsLeft className="h-4 w-4" />
        </button>
      </div>

      <Separator className="bg-slate-700/50" />

      <nav className="flex-1 overflow-y-auto px-3 py-3">
        <SideLink href="/overview" icon={Gauge} active={pathname === "/overview"}>
          Overview
        </SideLink>
        <SideLink href="/users" icon={Users} active={pathname === "/users" || pathname.startsWith("/users/")}>
          Users
        </SideLink>
        <SideLink href="/errors" icon={AlertTriangle} active={pathname === "/errors"}>
          Error Monitor
        </SideLink>
        <SideLink href="/data" icon={BookOpen} active={pathname === "/data"} disabled>
          Knowledge (soon)
        </SideLink>

        <div className="mt-4">
          <button
            onClick={() => setTablesOpen(!tablesOpen)}
            className="flex w-full items-center gap-2 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400 hover:text-slate-200 cursor-pointer"
          >
            <Database className="h-3.5 w-3.5" />
            <span className="flex-1 text-left">Tables</span>
            {tablesOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>

          {tablesOpen && (
            <div className="mt-1 space-y-0.5 pl-3">
              {loading ? (
                <div className="px-3 py-2 text-[12px] text-slate-500 animate-pulse">Loading tables…</div>
              ) : tables.length === 0 ? (
                <div className="px-3 py-2 text-[12px] text-slate-500">No tables found</div>
              ) : (
                <>
                  <div className="px-3 pb-2">
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
                      <Input
                        type="search"
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                        placeholder="Search tables…"
                        autoComplete="off"
                        spellCheck={false}
                        className="h-8 border-slate-600 bg-sidebar-accent/60 pl-8 text-[12px] text-slate-200 placeholder:text-slate-500"
                      />
                    </div>
                  </div>
                  {filtered.length === 0 ? (
                    <div className="px-3 py-2 text-[12px] text-slate-500">
                      No tables match &ldquo;{filter.trim()}&rdquo;
                    </div>
                  ) : null}
                  {filtered.map((t) => {
                    const Icon = TABLE_ICONS[t.name] ?? Table2;
                    const active = pathname === `/tables/${t.name}`;
                    const bold = TABLES_BOLD.has(t.name);
                    return (
                      <Link
                        key={t.name}
                        href={`/tables/${t.name}`}
                        className={cn(
                          "flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] transition-all",
                          active
                            ? "bg-sidebar-accent text-white font-medium"
                            : "text-slate-400 hover:bg-sidebar-accent/60 hover:text-slate-200",
                        )}
                      >
                        <Icon className="h-3.5 w-3.5 shrink-0" />
                        <span
                          className={cn(
                            "flex-1 truncate",
                            bold &&
                              (active
                                ? "font-bold text-emerald-300"
                                : "font-bold text-emerald-400"),
                          )}
                        >
                          {t.name}
                        </span>
                        <span className={cn("text-[11px] tabular-nums", active ? "text-slate-300" : "text-slate-500")}>
                          {t.rowCount.toLocaleString()}
                        </span>
                      </Link>
                    );
                  })}
                </>
              )}
            </div>
          )}
        </div>
      </nav>

      <Separator className="bg-slate-700/50" />

      <div className="flex items-center gap-3 px-5 py-3">
        <UserButton appearance={{ elements: { avatarBox: "h-8 w-8" } }} />
        <button
          onClick={handleLogout}
          className="flex flex-1 items-center gap-3 rounded-lg px-2 py-2 text-sm text-slate-400 transition-all hover:bg-red-500/10 hover:text-red-400 cursor-pointer"
        >
          <LogOut className="h-4 w-4" />
          Sign Out
        </button>
      </div>
    </aside>
  );
}

interface SideLinkProps {
  href: string;
  icon: React.ElementType;
  active: boolean;
  children: React.ReactNode;
  disabled?: boolean;
}

function SideLink({ href, icon: Icon, active, children, disabled }: SideLinkProps) {
  if (disabled) {
    return (
      <div className="flex items-center gap-2 rounded-lg px-3 py-2 text-[13px] text-slate-600 cursor-not-allowed select-none">
        <Icon className="h-4 w-4" />
        {children}
        <Flag className="ml-auto h-3 w-3 text-slate-700" />
      </div>
    );
  }
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-2 rounded-lg px-3 py-2 text-[13px] transition-all",
        active
          ? "bg-sidebar-accent text-white font-medium"
          : "text-slate-300 hover:bg-sidebar-accent/60 hover:text-white",
      )}
    >
      <Icon className="h-4 w-4" />
      {children}
      {active ? <Activity className="ml-auto h-3 w-3 text-emerald-400" /> : null}
    </Link>
  );
}
