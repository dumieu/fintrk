"use client";

import { useState, useCallback, useEffect, useRef, Suspense } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import {
  Trash2,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Info,
  Download,
  Upload,
  Landmark,
  Network,
  Settings2,
  EyeOff,
} from "lucide-react";
import { IgnoredTransactionsPanel } from "@/components/ignored-transactions-panel";
import { AccountsPanel } from "@/components/accounts-panel";
import { CategoryTableManager } from "@/components/category-table-manager";
import {
  formatExportFilename,
  isFintrkDataExport,
  type FintrkImportMode,
} from "@/lib/data-transfer";
import { chartControlClass } from "@/lib/chart-ui";
import { cn } from "@/lib/utils";
import { useAppHref, useAppBasePath } from "@/lib/app-base-path";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type ProfileTab = "settings" | "accounts" | "categories" | "ignored";

const PROFILE_TABS: Array<{
  id: ProfileTab;
  label: string;
  icon: typeof Settings2;
}> = [
  { id: "settings", label: "Settings", icon: Settings2 },
  { id: "accounts", label: "Accounts", icon: Landmark },
  { id: "categories", label: "Category Mapping", icon: Network },
  { id: "ignored", label: "Ignored", icon: EyeOff },
];

function parseProfileTab(value: string | null): ProfileTab {
  if (value === "accounts" || value === "categories" || value === "ignored" || value === "settings") {
    return value;
  }
  return "settings";
}

const DETECT_TRAVEL_CURRENCY_HELP =
  "When this is on, spending in another currency is sorted into Travel so you can spot trip-related purchases at a glance.";

type ResetState = "idle" | "confirming" | "loading" | "done" | "error";
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

export default function ProfilePage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto flex max-w-7xl items-center justify-center px-4 py-16 text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Loading…
        </div>
      }
    >
      <ProfilePageInner />
    </Suspense>
  );
}

function ProfilePageInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const cashflowHref = useAppHref("/cashflow");
  const isDemo = useAppBasePath() === "/demo";
  const activeTab = parseProfileTab(searchParams.get("tab"));

  const setActiveTab = useCallback(
    (tab: ProfileTab) => {
      const params = new URLSearchParams(searchParams.toString());
      if (tab === "settings") params.delete("tab");
      else params.set("tab", tab);
      const q = params.toString();
      router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const [state, setState] = useState<ResetState>("idle");
  const [deletedCounts, setDeletedCounts] = useState<Record<string, number> | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [detectTravel, setDetectTravel] = useState<DetectTravel>("Yes");
  const [initialDetectTravel, setInitialDetectTravel] = useState<DetectTravel>("Yes");
  const [loadingDetectTravel, setLoadingDetectTravel] = useState(true);
  const [savingDetectTravel, setSavingDetectTravel] = useState(false);
  const [detectTravelError, setDetectTravelError] = useState<string | null>(null);
  const [detectTravelSaved, setDetectTravelSaved] = useState(false);

  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importMode, setImportMode] = useState<FintrkImportMode>("merge");
  const [dataMessage, setDataMessage] = useState<string | null>(null);
  const [dataError, setDataError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const handleReset = useCallback(async () => {
    if (isDemo) return;
    setState("loading");
    try {
      const res = await fetch("/api/user/reset-data", { method: "DELETE" });
      const body = await res.json();
      if (!res.ok) {
        setErrorMsg(body.error ?? "Something went wrong");
        setState("error");
        return;
      }
      setDeletedCounts(body.deleted);
      setState("done");
    } catch {
      setErrorMsg("Network error. Please try again.");
      setState("error");
    }
  }, [isDemo]);

  const handleOpenChange = useCallback((open: boolean) => {
    setDialogOpen(open);
    if (!open) {
      if (state === "done") window.location.href = cashflowHref;
      setState("idle");
      setConfirmText("");
      setErrorMsg("");
      setDeletedCounts(null);
    }
  }, [state, cashflowHref]);

  const canConfirm = confirmText.toLowerCase() === "delete all";
  const hasDetectTravelChanges = detectTravel !== initialDetectTravel;

  useEffect(() => {
    let cancelled = false;
    setLoadingDetectTravel(true);
    fetch("/api/user/profile")
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const value: DetectTravel = data.detectTravel === "No" ? "No" : "Yes";
        setDetectTravel(value);
        setInitialDetectTravel(value);
      })
      .catch(() => {
        if (cancelled) return;
        setDetectTravelError("Failed to load profile settings.");
      })
      .finally(() => {
        if (!cancelled) setLoadingDetectTravel(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const saveDetectTravel = useCallback(async () => {
    setSavingDetectTravel(true);
    setDetectTravelSaved(false);
    setDetectTravelError(null);
    try {
      const res = await fetch("/api/user/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ detectTravel }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(typeof body.error === "string" ? body.error : "Failed to save profile settings.");
      }
      setInitialDetectTravel(detectTravel);
      setDetectTravelSaved(true);
      window.setTimeout(() => setDetectTravelSaved(false), 1600);
    } catch (err) {
      setDetectTravelError(err instanceof Error ? err.message : "Failed to save profile settings.");
    } finally {
      setSavingDetectTravel(false);
    }
  }, [detectTravel]);

  const exportData = useCallback(async () => {
    if (isDemo) return;
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
  }, [isDemo]);

  const importFile = useCallback(
    async (file: File) => {
      if (isDemo) return;
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
    [importMode, isDemo],
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-6 flex justify-center">
        <div
          role="tablist"
          aria-label="My Profile sections"
          className={cn(
            "inline-flex max-w-full items-center gap-0.5 overflow-x-auto p-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
            chartControlClass,
            "h-auto min-h-7",
          )}
        >
          {PROFILE_TABS.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-all duration-200 sm:text-sm",
                  active
                    ? "bg-[#0BC18D]/15 text-[#0BC18D] shadow-[0_0_12px_-4px_rgba(11,193,141,0.35)] dark:bg-[#0BC18D]/18"
                    : "text-muted-foreground hover:bg-chart-hover hover:text-foreground",
                )}
              >
                <Icon className="h-3.5 w-3.5 shrink-0 opacity-90" aria-hidden />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {activeTab === "ignored" ? (
        <IgnoredTransactionsPanel />
      ) : activeTab === "accounts" ? (
        <AccountsPanel />
      ) : activeTab === "categories" ? (
        <CategoryTableManager embedded />
      ) : (
      <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Personal Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Configure how AI categorization handles travel detection.
          </p>

          {loadingDetectTravel ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading profile settings...
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
                  className="inline-flex size-5 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline focus-visible:ring-2 focus-visible:ring-ring/50"
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
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring/50"
              >
                <option value="Yes">Yes</option>
                <option value="No">No</option>
              </select>
            </div>
          )}

          <div className="flex items-center gap-3">
            <Button
              type="button"
              onClick={() => void saveDetectTravel()}
              disabled={loadingDetectTravel || savingDetectTravel || !hasDetectTravelChanges}
            >
              {savingDetectTravel ? "Saving..." : "Save"}
            </Button>
            {detectTravelSaved ? <span className="text-sm text-green-600 dark:text-green-400">Saved</span> : null}
          </div>

          {detectTravelError ? (
            <p className="text-sm text-destructive">{detectTravelError}</p>
          ) : null}
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Data backup</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {isDemo ? (
            <p className="text-sm text-muted-foreground">
              Export, import, and wipe are disabled in the public demo so the Sterling Family
              dataset stays intact for every visitor. Create a free account to back up your own
              data.
            </p>
          ) : (
            <>
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
              className="gap-2"
            >
              {exporting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Exporting…
                </>
              ) : (
                <>
                  <Download className="h-4 w-4" />
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
              className="gap-2"
            >
              {importing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Importing…
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4" />
                  Data Import
                </>
              )}
            </Button>
          </div>

          <div className="flex flex-wrap gap-4 text-sm">
            <label className="inline-flex cursor-pointer items-center gap-2">
              <input
                type="radio"
                name="import-mode"
                checked={importMode === "merge"}
                onChange={() => setImportMode("merge")}
              />
              Merge (keep existing, add missing)
            </label>
            <label className="inline-flex cursor-pointer items-center gap-2">
              <input
                type="radio"
                name="import-mode"
                checked={importMode === "replace"}
                onChange={() => setImportMode("replace")}
              />
              Replace all (wipe, then restore)
            </label>
          </div>

          <p className="text-xs text-muted-foreground">
            Filename:{" "}
            <code className="rounded bg-muted px-1 py-0.5">
              fintrk_&#123;name&#125;_&#123;YYYY-MM-DD&#125;.json
            </code>
          </p>

          {dataMessage ? (
            <p className="text-sm text-green-600 dark:text-green-400">{dataMessage}</p>
          ) : null}
          {dataError ? <p className="text-sm text-destructive">{dataError}</p> : null}
            </>
          )}
        </CardContent>
      </Card>

      <Card className="mt-6 border-destructive/30">
        <CardHeader>
          <CardTitle className="text-base text-destructive flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            Danger Zone
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isDemo ? (
            <p className="text-sm text-muted-foreground">
              Reset is disabled in the public demo. Refresh the page anytime to restore the
              original Sterling Family dataset.
            </p>
          ) : (
            <>
          <p className="text-sm text-muted-foreground mb-4">
            Delete all your transactions, statements, accounts, upload history, and analytics.
            This lets you re-upload the same files without them being flagged as duplicates.
            This action cannot be undone.
          </p>

          <Dialog open={dialogOpen} onOpenChange={handleOpenChange}>
            <DialogTrigger
              render={
                <Button variant="destructive" size="lg" className="gap-2">
                  <Trash2 className="w-4 h-4" />
                  Reset All Data
                </Button>
              }
            />
            <DialogContent showCloseButton={state !== "loading"}>
              {state === "done" ? (
                <>
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-green-600 dark:text-green-400">
                      <CheckCircle2 className="w-5 h-5" />
                      Data Deleted
                    </DialogTitle>
                    <DialogDescription>
                      All your data has been removed. You can now re-upload your statements.
                    </DialogDescription>
                  </DialogHeader>
                  {deletedCounts && (
                    <ul className="text-xs text-muted-foreground space-y-0.5 pl-1">
                      {Object.entries(deletedCounts)
                        .filter(([, v]) => v > 0)
                        .map(([k, v]) => (
                          <li key={k}>
                            {k}: {v} removed
                          </li>
                        ))}
                    </ul>
                  )}
                  <DialogFooter>
                    <DialogClose
                      render={<Button variant="default" />}
                    >
                      Go to Dashboard
                    </DialogClose>
                  </DialogFooter>
                </>
              ) : (
                <>
                  <DialogHeader>
                    <DialogTitle className="text-destructive">
                      Are you absolutely sure?
                    </DialogTitle>
                    <DialogDescription>
                      This will permanently delete <strong>all</strong> your transactions,
                      statements, accounts, upload history, and AI insights.
                      You cannot undo this.
                    </DialogDescription>
                  </DialogHeader>

                  <div className="space-y-2">
                    <label htmlFor="confirm-input" className="text-xs text-muted-foreground">
                      Type <span className="font-mono font-semibold text-destructive">delete all</span> to confirm
                    </label>
                    <input
                      id="confirm-input"
                      type="text"
                      autoComplete="off"
                      autoCorrect="off"
                      spellCheck={false}
                      value={confirmText}
                      onChange={(e) => setConfirmText(e.target.value)}
                      disabled={state === "loading"}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-destructive/40"
                      placeholder="delete all"
                    />
                  </div>

                  {state === "error" && (
                    <p className="text-sm text-destructive">{errorMsg}</p>
                  )}

                  <DialogFooter>
                    <DialogClose
                      render={<Button variant="outline" disabled={state === "loading"} />}
                    >
                      Cancel
                    </DialogClose>
                    <Button
                      variant="destructive"
                      disabled={!canConfirm || state === "loading"}
                      onClick={handleReset}
                      className="gap-2"
                    >
                      {state === "loading" ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Deleting…
                        </>
                      ) : (
                        <>
                          <Trash2 className="w-4 h-4" />
                          Delete Everything
                        </>
                      )}
                    </Button>
                  </DialogFooter>
                </>
              )}
            </DialogContent>
          </Dialog>
            </>
          )}
        </CardContent>
      </Card>
      </>
      )}
    </div>
  );
}
