"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Info, Loader2, Upload } from "lucide-react";

const DETECT_TRAVEL_CURRENCY_HELP =
  "When this is on, spending in another currency is sorted into Travel so you can spot trip-related purchases at a glance.";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  formatExportFilename,
  isFintrkDataExport,
  type FintrkImportMode,
} from "@/lib/data-transfer";
import { cn } from "@/lib/utils";

type DetectTravel = "Yes" | "No";

type ImportResult = {
  mode: FintrkImportMode;
  accountsCreated: number;
  accountsReused: number;
  categoriesCreated: number;
  categoriesReused: number;
  transactionsImported: number;
  transactionsSkipped: number;
  ignoresImported: number;
  warningRulesImported: number;
  labelRulesImported: number;
};

export default function MyProfilePage() {
  const [detectTravel, setDetectTravel] = useState<DetectTravel>("Yes");
  const [initialValue, setInitialValue] = useState<DetectTravel>("Yes");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importMode, setImportMode] = useState<FintrkImportMode>("merge");
  const [dataMessage, setDataMessage] = useState<string | null>(null);
  const [dataError, setDataError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch("/api/user/profile")
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const value: DetectTravel = data.detectTravel === "No" ? "No" : "Yes";
        setDetectTravel(value);
        setInitialValue(value);
      })
      .catch(() => {
        if (cancelled) return;
        setError("Failed to load profile settings.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const hasChanges = detectTravel !== initialValue;

  async function save() {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const res = await fetch("/api/user/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ detectTravel }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(typeof json.error === "string" ? json.error : "Failed to save settings.");
      }
      setInitialValue(detectTravel);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save settings.");
    } finally {
      setSaving(false);
    }
  }

  const exportData = useCallback(async () => {
    setExporting(true);
    setDataError(null);
    setDataMessage(null);
    try {
      const res = await fetch("/api/user/data-export", { cache: "no-store" });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(typeof json.error === "string" ? json.error : "Export failed.");
      }
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const match = /filename="([^"]+)"/.exec(disposition);
      const filename = match?.[1] ?? formatExportFilename("user");
      const countHeader = res.headers.get("X-FinTRK-Export-Transactions");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setDataMessage(
        countHeader
          ? `Exported ${Number(countHeader).toLocaleString()} transactions to ${filename}.`
          : `Exported to ${filename}.`,
      );
    } catch (err) {
      setDataError(err instanceof Error ? err.message : "Export failed.");
    } finally {
      setExporting(false);
    }
  }, []);

  const importFile = useCallback(
    async (file: File) => {
      setImporting(true);
      setDataError(null);
      setDataMessage(null);
      try {
        const text = await file.text();
        let parsed: unknown;
        try {
          parsed = JSON.parse(text);
        } catch {
          throw new Error("That file is not valid JSON.");
        }
        if (!isFintrkDataExport(parsed)) {
          throw new Error("Not a FinTRK export file (missing format or transactions).");
        }

        if (importMode === "replace") {
          const ok = window.confirm(
            `Replace ALL FinTRK data for this account with this export?\n\n` +
              `${parsed.counts.transactions.toLocaleString()} transactions will be imported.\n` +
              `Existing accounts, transactions, and related data will be deleted first.`,
          );
          if (!ok) {
            setImporting(false);
            return;
          }
        }

        const form = new FormData();
        form.append("mode", importMode);
        form.append("file", file, file.name);
        const res = await fetch("/api/user/data-import", {
          method: "POST",
          body: form,
        });
        const json = (await res.json().catch(() => ({}))) as {
          error?: string;
          result?: ImportResult;
        };
        if (!res.ok) {
          throw new Error(json.error ?? "Import failed.");
        }
        const r = json.result!;
        setDataMessage(
          `Import complete (${r.mode}): ${r.transactionsImported.toLocaleString()} transactions added` +
            (r.transactionsSkipped
              ? `, ${r.transactionsSkipped.toLocaleString()} skipped as duplicates`
              : "") +
            `. Accounts +${r.accountsCreated} / reused ${r.accountsReused}.`,
        );
      } catch (err) {
        setDataError(err instanceof Error ? err.message : "Import failed.");
      } finally {
        setImporting(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    [importMode],
  );

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-app-canvas">
      <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col gap-4 overflow-y-auto px-4 py-5 sm:px-6 sm:py-6">
        <div className="flex items-center justify-end">
          <Link href="/dashboard/transactions">
            <Button variant="ghost" className="text-foreground hover:bg-chart-hover">
              Back
            </Button>
          </Link>
        </div>

        <Card className="border-chart-border bg-chart-muted text-foreground">
          <CardHeader>
            <CardTitle className="text-lg">AI Travel Detection</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Control whether FX/main-currency travel override rules are applied during AI transaction categorization.
            </p>

            {loading ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading settings...
              </div>
            ) : (
              <div className="max-w-xs space-y-2">
                <div className="flex items-center gap-1.5">
                  <label
                    htmlFor="detect-travel"
                    className="text-sm font-medium text-foreground"
                  >
                    Detect Travel from Currency
                  </label>
                  <button
                    type="button"
                    className="inline-flex size-5 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-chart-hover hover:text-foreground focus-visible:outline focus-visible:ring-2 focus-visible:ring-[#0BC18D]/40"
                    title={DETECT_TRAVEL_CURRENCY_HELP}
                    aria-label={DETECT_TRAVEL_CURRENCY_HELP}
                  >
                    <Info className="size-3.5" strokeWidth={2} aria-hidden />
                  </button>
                </div>
                <select
                  id="detect-travel"
                  value={detectTravel}
                  onChange={(e) => setDetectTravel(e.target.value === "No" ? "No" : "Yes")}
                  className="w-full rounded-md border border-chart-border bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-[#0BC18D]/50 focus:ring-1 focus:ring-[#0BC18D]/30"
                >
                  <option value="Yes">Yes</option>
                  <option value="No">No</option>
                </select>
              </div>
            )}

            <div className="flex items-center gap-3">
              <Button
                type="button"
                onClick={() => void save()}
                disabled={loading || saving || !hasChanges}
                className="bg-[#0BC18D] text-white hover:bg-[#0BC18D]/90 disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save"}
              </Button>
              {saved ? <span className="text-sm text-[#0BC18D]">Saved</span> : null}
            </div>

            {error ? <p className="text-sm text-red-400">{error}</p> : null}
          </CardContent>
        </Card>

        <Card className="border-chart-border bg-chart-muted text-foreground">
          <CardHeader>
            <CardTitle className="text-lg">Data backup</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Download every transaction (plus accounts and categories needed to restore them) as a
              JSON file, or upload a previous export to merge into this account or rebuild it from
              scratch.
            </p>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                onClick={() => void exportData()}
                disabled={exporting || importing}
                className="bg-[#0BC18D] text-white hover:bg-[#0BC18D]/90 disabled:opacity-50"
              >
                {exporting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Exporting…
                  </>
                ) : (
                  <>
                    <Download className="mr-2 h-4 w-4" />
                    Data Export
                  </>
                )}
              </Button>

              <input
                ref={fileInputRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void importFile(f);
                }}
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={exporting || importing}
                className="border-chart-border bg-card text-foreground hover:bg-chart-hover disabled:opacity-50"
              >
                {importing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Importing…
                  </>
                ) : (
                  <>
                    <Upload className="mr-2 h-4 w-4" />
                    Data Import
                  </>
                )}
              </Button>
            </div>

            <div className="flex flex-wrap gap-3 text-sm">
              <label className="inline-flex cursor-pointer items-center gap-2 text-foreground">
                <input
                  type="radio"
                  name="import-mode"
                  checked={importMode === "merge"}
                  onChange={() => setImportMode("merge")}
                  className="accent-[#0BC18D]"
                />
                Merge (keep existing, add missing)
              </label>
              <label className="inline-flex cursor-pointer items-center gap-2 text-foreground">
                <input
                  type="radio"
                  name="import-mode"
                  checked={importMode === "replace"}
                  onChange={() => setImportMode("replace")}
                  className="accent-[#0BC18D]"
                />
                Replace all (wipe, then restore)
              </label>
            </div>

            <p className="text-[11px] text-muted-foreground">
              Filename pattern:{" "}
              <code className={cn("rounded bg-muted px-1 py-0.5 text-[11px] text-foreground")}>
                fintrk_&#123;name&#125;_&#123;YYYY-MM-DD&#125;.json
              </code>
            </p>

            {dataMessage ? <p className="text-sm text-[#0BC18D]">{dataMessage}</p> : null}
            {dataError ? <p className="text-sm text-red-400">{dataError}</p> : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
