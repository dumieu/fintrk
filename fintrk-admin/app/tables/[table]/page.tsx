"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowUp, ChevronLeft, ChevronRight, Pencil, Plus, RefreshCcw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatNumber, truncate } from "@/lib/utils";
import { RowEditorDialog, ColumnDef } from "@/components/row-editor-dialog";

interface IntrospectTable {
  name: string;
  rowCount: number | null;
  columns: Array<{ name: string; type: string; nullable: boolean; default: string | null }>;
  primaryKey: string | null;
  foreignKeys: Array<{ column: string; targetTable: string; targetColumn: string }>;
}

interface RowsResponse {
  rows: Array<Record<string, unknown>>;
  pagination: { page: number; limit: number; totalRows: number; totalPages: number };
}

const PAGE_SIZE = 50;

function fmtCell(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "object") {
    try { return truncate(JSON.stringify(v), 80); } catch { return "[object]"; }
  }
  return truncate(String(v), 80);
}

export default function TableDetailPage({ params }: { params: Promise<{ table: string }> }) {
  const { table } = use(params);
  const tableName = decodeURIComponent(table);
  const [meta, setMeta] = useState<IntrospectTable | null>(null);
  const [rows, setRows] = useState<RowsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<{ col: string; dir: "asc" | "desc" } | null>(null);
  const [editing, setEditing] = useState<{ row: Record<string, unknown> | null } | null>(null);
  const debounceRef = useRef<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        table: tableName,
        limit: String(PAGE_SIZE),
        page: String(page + 1),
      });
      if (q.trim()) params.set("search", q.trim());
      if (sort) {
        params.set("sort", sort.col);
        params.set("order", sort.dir);
      }
      const r = await fetch(`/api/rows?${params.toString()}`, { cache: "no-store" });
      const body = (await r.json()) as RowsResponse;
      setRows(body);
    } finally {
      setLoading(false);
    }
  }, [tableName, page, q, sort]);

  useEffect(() => {
    fetch("/api/introspect", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { tables?: IntrospectTable[] } | IntrospectTable[]) => {
        const list = Array.isArray(d) ? d : (d.tables ?? []);
        const t = list.find((x) => x.name === tableName);
        setMeta(t ?? null);
      })
      .catch(() => setMeta(null));
  }, [tableName]);

  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      load();
    }, 200);
  }, [load]);

  const total = rows?.pagination?.totalRows ?? 0;
  const totalPages = rows?.pagination?.totalPages ?? Math.max(1, Math.ceil(total / PAGE_SIZE));

  const columns: ColumnDef[] = useMemo(
    () => meta?.columns.map((c) => ({ name: c.name, type: c.type, default: c.default })) ?? [],
    [meta?.columns]
  );

  function toggleSort(col: string) {
    setSort((cur) => {
      if (!cur || cur.col !== col) return { col, dir: "desc" };
      if (cur.dir === "desc") return { col, dir: "asc" };
      return null;
    });
    setPage(0);
  }

  return (
    <div className="mx-auto max-w-[100rem] px-4 py-6 sm:px-6 lg:px-8">
      <Link href="/tables" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary">
        <ArrowLeft className="h-3.5 w-3.5" /> All tables
      </Link>

      {/* Header */}
      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-mono text-2xl font-bold tracking-tight">{tableName}</h1>
          <p className="text-sm text-muted-foreground">
            {meta ? (
              <>
                {meta.columns.length} columns · PK:{" "}
                <span className="font-mono">{meta.primaryKey ?? "—"}</span> ·{" "}
                {formatNumber(meta.rowCount ?? 0)} rows
              </>
            ) : (
              "Loading schema…"
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative w-72">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => { setQ(e.target.value); setPage(0); }}
              placeholder="Search visible columns…"
              className="pl-8"
            />
          </div>
          <Button variant="ghost" onClick={load} className="gap-2" disabled={loading}>
            <RefreshCcw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button onClick={() => setEditing({ row: null })} className="gap-2">
            <Plus className="h-4 w-4" /> Insert
          </Button>
        </div>
      </div>

      {/* Foreign keys hint */}
      {meta?.foreignKeys?.length ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="font-medium uppercase tracking-wider">Foreign keys:</span>
          {meta.foreignKeys.map((fk) => (
            <Badge key={`${fk.column}-${fk.targetTable}`} variant="info" className="font-mono text-[10px]">
              {fk.column} → {fk.targetTable}.{fk.targetColumn}
            </Badge>
          ))}
        </div>
      ) : null}

      {/* Data table */}
      <Card className="mt-4 overflow-hidden p-0">
        <div className="max-h-[70vh] overflow-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-10 bg-secondary/95 backdrop-blur">
              <tr>
                {meta?.columns.map((c) => {
                  const active = sort?.col === c.name;
                  return (
                    <th
                      key={c.name}
                      onClick={() => toggleSort(c.name)}
                      className="cursor-pointer select-none px-3 py-2 text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground hover:text-primary"
                    >
                      <span className="inline-flex items-center gap-1">
                        {c.name}
                        {active ? (
                          sort.dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                        ) : null}
                      </span>
                      <div className="text-[9px] font-normal text-muted-foreground/70">{c.type}</div>
                    </th>
                  );
                })}
                <th className="sticky right-0 bg-secondary/95 px-3 py-2 text-right text-[10px] uppercase tracking-wider text-muted-foreground">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading && (rows?.rows?.length ?? 0) === 0 ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>
                    {meta?.columns.map((c) => (
                      <td key={c.name} className="px-3 py-2">
                        <div className="h-3 w-24 animate-pulse rounded bg-secondary" />
                      </td>
                    ))}
                    <td />
                  </tr>
                ))
              ) : (rows?.rows?.length ?? 0) === 0 ? (
                <tr>
                  <td colSpan={(meta?.columns.length ?? 0) + 1} className="px-3 py-12 text-center text-sm text-muted-foreground">
                    No rows match this query.
                  </td>
                </tr>
              ) : (
                rows!.rows.map((r, i) => (
                  <tr key={i} className="hover:bg-accent/30">
                    {meta?.columns.map((c) => (
                      <td key={c.name} className="whitespace-nowrap px-3 py-2 align-top tabular-nums" title={r[c.name] == null ? "" : String(r[c.name])}>
                        {fmtCell(r[c.name])}
                      </td>
                    ))}
                    <td className="sticky right-0 bg-card/95 px-2 py-1 text-right backdrop-blur">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => setEditing({ row: r })}
                        title="Edit row"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between gap-2 border-t border-border bg-secondary/40 px-3 py-2 text-xs">
          <span className="text-muted-foreground">
            Showing{" "}
            <span className="font-semibold text-foreground">
              {total === 0 ? 0 : page * PAGE_SIZE + 1}
              {" – "}
              {Math.min(total, (page + 1) * PAGE_SIZE)}
            </span>{" "}
            of <span className="font-semibold text-foreground">{formatNumber(total)}</span>
          </span>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0 || loading}
              className="gap-1"
            >
              <ChevronLeft className="h-4 w-4" /> Prev
            </Button>
            <span className="text-muted-foreground">
              {page + 1} / {totalPages}
            </span>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page + 1 >= totalPages || loading}
              className="gap-1"
            >
              Next <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </Card>

      <RowEditorDialog
        open={!!editing}
        onOpenChange={(v) => !v && setEditing(null)}
        table={tableName}
        columns={columns}
        primaryKey={meta?.primaryKey ?? null}
        row={editing?.row ?? null}
        onSaved={() => load()}
      />
    </div>
  );
}
