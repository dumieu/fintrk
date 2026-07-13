"use client";

import { useEffect, useState, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { SearchableMultiSelect } from "@/components/searchable-multi-select";
import { cn } from "@/lib/utils";
import { Database, ArrowUpDown, ArrowUp, ArrowDown, Search } from "lucide-react";

interface NeonTableRow {
  name: string;
  size_mb: number;
  rows: number;
  columns: number;
  last_updated: string | null;
  column_names: string[];
}

type SortKey = "name" | "size_mb" | "rows" | "columns" | "column_names" | "last_updated";
type SortDir = "asc" | "desc";

function formatMbInteger(mb: number): string {
  const n = Math.round(Number.isFinite(mb) ? mb : 0);
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function formatLastUpdated(iso: string | null): string {
  if (!iso) return "-";
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffMs = now - then;
  const diffM = Math.floor(diffMs / 60_000);
  const diffH = Math.floor(diffMs / 3_600_000);
  const diffD = Math.floor(diffMs / 86_400_000);

  if (diffM < 60) return `${diffM}m`;
  if (diffH < 24) return `${diffH}h`;
  if (diffD < 30) return `${diffD}d`;
  return `${Math.floor(diffD / 30)}mo`;
}

function SortableHead({
  label,
  sortKey,
  currentSort,
  currentDir,
  onSort,
  className,
}: {
  label: string;
  sortKey: SortKey;
  currentSort: SortKey;
  currentDir: SortDir;
  onSort: (key: SortKey) => void;
  className?: string;
}) {
  const isActive = currentSort === sortKey;
  return (
    <TableHead className={className}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className="inline-flex items-center gap-1.5 font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
      >
        {label}
        {isActive ? (
          currentDir === "asc" ? (
            <ArrowUp className="h-3.5 w-3.5" />
          ) : (
            <ArrowDown className="h-3.5 w-3.5" />
          )
        ) : (
          <ArrowUpDown className="h-3.5 w-3.5 opacity-50" />
        )}
      </button>
    </TableHead>
  );
}

export default function DataPage() {
  const [tables, setTables] = useState<NeonTableRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [tableSearch, setTableSearch] = useState("");
  const [filterTableNames, setFilterTableNames] = useState<string[]>([]);
  const [filterColumnNames, setFilterColumnNames] = useState<string[]>([]);

  const tableNameOptions = useMemo(
    () => [...new Set(tables.map((t) => t.name))].sort((a, b) => a.localeCompare(b)),
    [tables]
  );

  const columnNameOptions = useMemo(() => {
    const s = new Set<string>();
    for (const t of tables) {
      for (const c of t.column_names) s.add(c);
    }
    return [...s].sort((a, b) => a.localeCompare(b));
  }, [tables]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/data/neon-tables")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        if (!cancelled && Array.isArray(data)) {
          setTables(
            data.map((row: NeonTableRow) => ({
              ...row,
              size_mb:
                typeof row.size_mb === "number" && Number.isFinite(row.size_mb)
                  ? row.size_mb
                  : 0,
              column_names: Array.isArray(row.column_names) ? row.column_names : [],
            }))
          );
        }
      })
      .catch(() => {
        if (!cancelled) setTables([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const filteredTables = useMemo(() => {
    let result = tables;

    const q = tableSearch.trim().toLowerCase();
    if (q) {
      result = result.filter((t) => {
        if (t.name.toLowerCase().includes(q)) return true;
        return t.column_names.some((col) => col.toLowerCase().includes(q));
      });
    }

    if (filterTableNames.length > 0) {
      const allowed = new Set(filterTableNames);
      result = result.filter((t) => allowed.has(t.name));
    }

    if (filterColumnNames.length > 0) {
      const colSet = new Set(filterColumnNames);
      result = result.filter((t) => t.column_names.some((c) => colSet.has(c)));
    }

    return result;
  }, [tables, tableSearch, filterTableNames, filterColumnNames]);

  const hasActiveFilters =
    tableSearch.trim() !== "" ||
    filterTableNames.length > 0 ||
    filterColumnNames.length > 0;

  const sortedTables = useMemo(() => {
    const arr = [...filteredTables];
    arr.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "name") {
        cmp = a.name.localeCompare(b.name);
      } else if (sortKey === "size_mb") {
        cmp = a.size_mb - b.size_mb;
      } else if (sortKey === "rows") {
        cmp = a.rows - b.rows;
      } else if (sortKey === "columns") {
        cmp = a.columns - b.columns;
      } else if (sortKey === "column_names") {
        cmp = a.column_names.join(",").localeCompare(b.column_names.join(","));
      } else {
        const ta = a.last_updated ? new Date(a.last_updated).getTime() : 0;
        const tb = b.last_updated ? new Date(b.last_updated).getTime() : 0;
        cmp = ta - tb;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [filteredTables, sortKey, sortDir]);

  return (
    <>
      <div className="flex items-start gap-2.5 mb-6">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 shadow-sm">
          <Database className="h-4 w-4 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Data</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Neon database tables overview
          </p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Neon Tables</CardTitle>
        </CardHeader>
        <CardContent className="min-w-0">
          {loading ? (
            <Skeleton className="h-[400px] w-full rounded-lg" />
          ) : (
            <>
              <div className="mb-4 min-w-0 space-y-2">
                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                  <div className="relative w-full min-w-0 sm:max-w-md sm:flex-1 sm:flex-none">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      type="search"
                      placeholder="Filter by table name or column name…"
                      value={tableSearch}
                      onChange={(e) => setTableSearch(e.target.value)}
                      className="h-9 pl-9"
                      autoComplete="off"
                      spellCheck={false}
                      aria-label="Filter tables by name or column"
                    />
                  </div>
                  <SearchableMultiSelect
                    options={tableNameOptions}
                    selected={filterTableNames}
                    onChange={setFilterTableNames}
                    label="Table names"
                    searchPlaceholder="Search tables…"
                  />
                  <SearchableMultiSelect
                    options={columnNameOptions}
                    selected={filterColumnNames}
                    onChange={setFilterColumnNames}
                    label="Column names"
                    searchPlaceholder="Search columns…"
                  />
                </div>
                {hasActiveFilters && (
                  <p className="text-xs text-muted-foreground">
                    Showing {sortedTables.length} of {tables.length} table
                    {tables.length === 1 ? "" : "s"}
                  </p>
                )}
              </div>
              <div className="overflow-x-auto min-w-0 -mx-1 px-1">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <SortableHead
                        label="Name"
                        sortKey="name"
                        currentSort={sortKey}
                        currentDir={sortDir}
                        onSort={handleSort}
                      />
                      <SortableHead
                        label="Size (MB)"
                        sortKey="size_mb"
                        currentSort={sortKey}
                        currentDir={sortDir}
                        onSort={handleSort}
                        className="text-right"
                      />
                      <SortableHead
                        label="Rows"
                        sortKey="rows"
                        currentSort={sortKey}
                        currentDir={sortDir}
                        onSort={handleSort}
                        className="text-right"
                      />
                      <SortableHead
                        label="Columns"
                        sortKey="columns"
                        currentSort={sortKey}
                        currentDir={sortDir}
                        onSort={handleSort}
                        className="text-right"
                      />
                      <SortableHead
                        label="All columns"
                        sortKey="column_names"
                        currentSort={sortKey}
                        currentDir={sortDir}
                        onSort={handleSort}
                        className="min-w-[24rem] max-w-5xl"
                      />
                      <SortableHead
                        label="Last updated"
                        sortKey="last_updated"
                        currentSort={sortKey}
                        currentDir={sortDir}
                        onSort={handleSort}
                        className="text-right"
                      />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedTables.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={6}
                          className="h-24 text-center text-sm text-muted-foreground"
                        >
                          {hasActiveFilters
                            ? "No tables match the current filters"
                            : "No tables"}
                        </TableCell>
                      </TableRow>
                    ) : null}
                    {sortedTables.map((t) => {
                      const colsJoined = t.column_names.join(", ");
                      return (
                        <TableRow key={t.name}>
                          <TableCell className="font-medium font-mono text-sm whitespace-nowrap">
                            <a
                              href={`/tables/${encodeURIComponent(t.name)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[#2CA2FF] hover:text-[#2CA2FF]/80 hover:underline underline-offset-2 dark:text-[#7cc4ff] dark:hover:text-[#7cc4ff]/90"
                            >
                              {t.name}
                            </a>
                          </TableCell>
                          <TableCell className="text-right tabular-nums whitespace-nowrap">
                            {formatMbInteger(t.size_mb)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums whitespace-nowrap">
                            {t.rows.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right tabular-nums whitespace-nowrap">
                            {t.columns}
                          </TableCell>
                          <TableCell className="min-w-[24rem] max-w-5xl align-top py-2.5">
                            {t.column_names.length === 0 ? (
                              <span className="text-muted-foreground text-xs">-</span>
                            ) : (
                              <div
                                className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto pr-0.5 [scrollbar-width:thin]"
                                title={colsJoined}
                              >
                                {t.column_names.map((col, idx) => (
                                  <Badge
                                    key={`${t.name}-${idx}-${col}`}
                                    variant="outline"
                                    className={cn(
                                      "h-auto max-w-full shrink-0 rounded-full border-[#2CA2FF]/45 bg-[#2CA2FF]/10 px-2.5 py-0.5 font-mono text-[11px] font-normal leading-tight",
                                      "text-slate-800 whitespace-normal break-all dark:border-[#2CA2FF]/35 dark:bg-[#2CA2FF]/14 dark:text-slate-100"
                                    )}
                                  >
                                    {col}
                                  </Badge>
                                ))}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="text-right text-muted-foreground whitespace-nowrap">
                            {formatLastUpdated(t.last_updated)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </>
  );
}
