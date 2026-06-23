"use client";

import { useCallback, useEffect, useState } from "react";
import { EyeOff, Loader2, RotateCcw, Tag, Receipt } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface IgnoreRule {
  id: number;
  scope: "name" | "item";
  displayName: string;
  createdAt: string;
  affectedCount: number;
}

export function IgnoredTransactionsPanel() {
  const [rules, setRules] = useState<IgnoreRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/transactions/ignore", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : "Failed to load.");
      setRules(Array.isArray(data.ignores) ? data.ignores : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const restore = useCallback(async (id: number) => {
    setRemovingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/transactions/ignore?id=${id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : "Failed to restore.");
      setRules((prev) => prev.filter((r) => r.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to restore.");
    } finally {
      setRemovingId(null);
    }
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <EyeOff className="h-4 w-4 text-[#2CA2FF]" />
          Ignored transactions
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Ignored items are hidden from every chart, total, table, and AI insight. Restore one to
          bring it (and all matching transactions) back everywhere.
        </p>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading ignored items...
          </div>
        ) : error ? (
          <div className="space-y-3">
            <p className="text-sm text-destructive">{error}</p>
            <Button variant="outline" size="sm" onClick={() => void load()}>
              Try again
            </Button>
          </div>
        ) : rules.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
            Nothing ignored yet. Use the eye-off icon on any transaction to hide it from your
            analytics.
          </div>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {rules.map((rule) => (
              <li key={rule.id} className="flex items-center gap-3 px-4 py-3">
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                  style={{ background: "rgba(44,162,255,0.12)", color: "#2CA2FF" }}
                  aria-hidden
                >
                  {rule.scope === "name" ? (
                    <Tag className="h-4 w-4" />
                  ) : (
                    <Receipt className="h-4 w-4" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{rule.displayName}</p>
                  <p className="text-xs text-muted-foreground">
                    {rule.scope === "name"
                      ? `All with this name · ${rule.affectedCount} transaction${rule.affectedCount === 1 ? "" : "s"} hidden`
                      : "Single transaction hidden"}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  disabled={removingId === rule.id}
                  onClick={() => void restore(rule.id)}
                >
                  {removingId === rule.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RotateCcw className="h-3.5 w-3.5" />
                  )}
                  Restore
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
