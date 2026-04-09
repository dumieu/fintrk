"use client";

import { useState, useCallback } from "react";
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
import { Trash2, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";

type ResetState = "idle" | "confirming" | "loading" | "done" | "error";

export default function ProfilePage() {
  const [state, setState] = useState<ResetState>("idle");
  const [deletedCounts, setDeletedCounts] = useState<Record<string, number> | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");

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

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold sm:text-3xl">My Profile</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your personal information and preferences
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Personal Information</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-64 text-muted-foreground text-sm">
          Profile settings will appear here
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
