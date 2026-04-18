"use client";

import { useState, useCallback, useEffect } from "react";
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
import { Trash2, Loader2, CheckCircle2, AlertTriangle, Info } from "lucide-react";

const DETECT_TRAVEL_CURRENCY_HELP =
  "When this is on, spending in another currency is sorted into Travel so you can spot trip-related purchases at a glance.";

type ResetState = "idle" | "confirming" | "loading" | "done" | "error";
type DetectTravel = "Yes" | "No";

export default function ProfilePage() {
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

  const handleReset = useCallback(async () => {
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
  }, []);

  const handleOpenChange = useCallback((open: boolean) => {
    setDialogOpen(open);
    if (!open) {
      if (state === "done") window.location.href = "/dashboard";
      setState("idle");
      setConfirmText("");
      setErrorMsg("");
      setDeletedCounts(null);
    }
  }, [state]);

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

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
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

      <Card className="mt-6 border-destructive/30">
        <CardHeader>
          <CardTitle className="text-base text-destructive flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            Danger Zone
          </CardTitle>
        </CardHeader>
        <CardContent>
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
                      statements, accounts, upload history, budgets, goals, and AI insights.
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
        </CardContent>
      </Card>
    </div>
  );
}
