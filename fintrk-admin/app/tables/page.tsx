"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Database, Search, Table as TableIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { formatNumber } from "@/lib/utils";

interface IntrospectTable {
  name: string;
  rowCount: number | null;
  columns: Array<{ name: string; type: string; nullable: boolean; default: string | null }>;
  primaryKey: string | null;
  foreignKeys: Array<{ column: string; targetTable: string; targetColumn: string }>;
}

export default function TablesIndexPage() {
  const [tables, setTables] = useState<IntrospectTable[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  useEffect(() => {
    fetch("/api/introspect", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setTables(Array.isArray(d) ? d : (d.tables ?? [])))
      .catch(() => setTables([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return tables;
    return tables.filter((x) => x.name.toLowerCase().includes(t));
  }, [tables, q]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Database className="h-6 w-6 text-primary" /> Tables
          </h1>
          <p className="text-sm text-muted-foreground">Live introspection of every public table in the FinTRK database.</p>
        </div>
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter tables…" className="pl-8" />
        </div>
      </div>

      {loading ? (
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl bg-secondary" />
          ))}
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((t) => (
            <Link key={t.name} href={`/tables/${encodeURIComponent(t.name)}`}>
              <Card className="group h-full p-4 transition hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <TableIcon className="h-4 w-4 text-primary" />
                      <span className="truncate font-mono text-sm font-semibold">{t.name}</span>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {t.columns.length} cols · PK: {t.primaryKey ?? "—"} · FK: {t.foreignKeys.length}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Rows</div>
                    <div className="text-base font-bold tabular-nums">{formatNumber(t.rowCount ?? 0)}</div>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-1">
                  {t.columns.slice(0, 6).map((c) => (
                    <Badge key={c.name} variant="outline" className="font-mono text-[10px]">{c.name}</Badge>
                  ))}
                  {t.columns.length > 6 ? (
                    <Badge variant="outline" className="text-[10px]">+{t.columns.length - 6}</Badge>
                  ) : null}
                </div>
                <div className="mt-3 flex items-center justify-end text-xs text-primary opacity-0 transition group-hover:opacity-100">
                  Open <ArrowRight className="ml-1 h-3 w-3" />
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
