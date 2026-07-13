"use client";

import { useEffect, useState, useCallback, use } from "react";
import Link from "next/link";
import { DataTable, type TableStats } from "@/components/data-table";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Database, Columns3, Rows3, KeyRound, Link2, Lock, Unlock } from "lucide-react";

interface Column {
  name: string;
  type: string;
  udtName: string;
  nullable: boolean;
  default: string | null;
  maxLength: number | null;
}

interface TableMeta {
  name: string;
  columns: Column[];
  primaryKey: string | null;
  foreignKeys: Array<{
    column: string;
    foreignTable: string;
    foreignColumn: string;
  }>;
  rowCount: number;
}

export default function TablePage({
  params,
}: {
  params: Promise<{ table: string }>;
}) {
  const { table } = use(params);
  const tableName = decodeURIComponent(table);
  const [tableMeta, setTableMeta] = useState<TableMeta | null>(null);
  const [liveRowCount, setLiveRowCount] = useState<number | null>(null);
  const [tableStats, setTableStats] = useState<TableStats | null>(null);
  const [encrypted, setEncrypted] = useState(false);
  const [decrypted, setDecrypted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const handleTotalRowsChange = useCallback((count: number) => {
    setLiveRowCount(count);
  }, []);

  const handleTableStatsChange = useCallback((stats: TableStats) => {
    setTableStats(stats);
  }, []);

  useEffect(() => {
    setLoading(true);
    setError("");
    fetch(`/api/introspect?table=${encodeURIComponent(tableName)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((payload) => {
        const tables = Array.isArray(payload) ? payload : (payload.tables ?? []);
        if (!Array.isArray(tables)) throw new Error("Invalid response");
        const found = tables.find((t: { name: string }) => t.name === tableName) as
          | (Omit<TableMeta, "foreignKeys" | "columns"> & {
              columns: Array<Partial<Column> & { name: string; type: string; nullable: boolean; default: string | null }>;
              foreignKeys: Array<{
                column: string;
                foreignTable?: string;
                foreignColumn?: string;
                targetTable?: string;
                targetColumn?: string;
              }>;
            })
          | undefined;
        if (!found) throw new Error(`Table "${tableName}" not found`);
        setTableMeta({
          name: found.name,
          primaryKey: found.primaryKey,
          rowCount: found.rowCount,
          columns: (found.columns ?? []).map((c) => ({
            name: c.name,
            type: c.type,
            udtName: c.udtName ?? c.type,
            nullable: c.nullable,
            default: c.default,
            maxLength: c.maxLength ?? null,
          })),
          foreignKeys: (found.foreignKeys ?? []).map((fk) => ({
            column: fk.column,
            foreignTable: fk.foreignTable ?? fk.targetTable ?? "",
            foreignColumn: fk.foreignColumn ?? fk.targetColumn ?? "",
          })),
        });
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, [tableName]);

  // Probe encryption status from a lightweight rows fetch
  useEffect(() => {
    if (!tableMeta) return;
    fetch(`/api/rows?table=${encodeURIComponent(tableName)}&limit=1&page=1`, {
      cache: "no-store",
    })
      .then((r) => r.json())
      .then((body) => {
        setEncrypted(Boolean(body.encrypted));
        setDecrypted(Boolean(body.decrypted));
      })
      .catch(() => {});
  }, [tableMeta, tableName]);

  return (
    <>
      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-6 w-96" />
          <Skeleton className="h-[400px] w-full rounded-xl" />
        </div>
      ) : error ? (
        <div className="flex h-[50vh] items-center justify-center">
          <div className="text-center">
            <Database className="mx-auto h-12 w-12 text-muted-foreground/40" />
            <p className="mt-4 text-lg font-medium text-muted-foreground">{error}</p>
            <Link href="/data" className="mt-3 inline-flex items-center gap-1 text-sm text-emerald-600 hover:underline">
              <ArrowLeft className="h-3.5 w-3.5" /> Back to Data
            </Link>
          </div>
        </div>
      ) : tableMeta ? (
        <>
          <div className="mb-6">
            <Link
              href="/data"
              className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-3 w-3" /> Data catalog
            </Link>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100">
                <Database className="h-5 w-5 text-emerald-700" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-900 font-mono">
                  {tableMeta.name}
                </h1>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Columns3 className="h-3 w-3" />
                    {tableMeta.columns.length} columns
                  </span>
                  <span className="flex items-center gap-1">
                    <Rows3 className="h-3 w-3" />
                    {(liveRowCount ?? tableMeta.rowCount).toLocaleString()} rows
                  </span>
                  {tableMeta.primaryKey && (
                    <span className="flex items-center gap-1">
                      <KeyRound className="h-3 w-3" />
                      PK: {tableMeta.primaryKey}
                    </span>
                  )}
                  {tableMeta.foreignKeys.length > 0 && (
                    <span className="flex items-center gap-1">
                      <Link2 className="h-3 w-3" />
                      {tableMeta.foreignKeys.length} FK
                      {tableMeta.foreignKeys.length > 1 ? "s" : ""}
                    </span>
                  )}
                  {encrypted ? (
                    decrypted ? (
                      <Badge className="gap-1 bg-emerald-600 text-white hover:bg-emerald-600">
                        <Unlock className="h-3 w-3" /> Decrypted session
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="gap-1">
                        <Lock className="h-3 w-3" /> Encrypted fields
                      </Badge>
                    )
                  ) : null}
                  {tableStats?.distinct_users != null && (
                    <>
                      <span className="mx-2 text-slate-300">|</span>
                      <span>Users: {tableStats.distinct_users}</span>
                    </>
                  )}
                </div>
              </div>
            </div>
            {tableMeta.foreignKeys.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {tableMeta.foreignKeys.map((fk) => (
                  <Badge key={`${fk.column}-${fk.foreignTable}`} variant="outline" className="font-mono text-[10px]">
                    {fk.column} → {fk.foreignTable}.{fk.foreignColumn}
                  </Badge>
                ))}
              </div>
            )}
          </div>
          <DataTable
            tableMeta={tableMeta}
            onTotalRowsChange={handleTotalRowsChange}
            onTableStatsChange={handleTableStatsChange}
          />
        </>
      ) : null}
    </>
  );
}
