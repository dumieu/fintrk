"use client";

import { useCallback, useEffect, useState } from "react";
import { Lock, LockOpen, ShieldAlert, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface SessionStatus {
  active: boolean;
  keyConfigured: boolean;
  session: { reason: string; admin: string; startedAt: string; expiresAt: string } | null;
  sessionHours: number;
}

function timeLeft(expiresAt: string): string {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return "expired";
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function DecryptionSessionBanner() {
  const [status, setStatus] = useState<SessionStatus | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/decryption-session", { cache: "no-store" });
      if (!r.ok) return;
      setStatus((await r.json()) as SessionStatus);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = window.setInterval(refresh, 60_000);
    return () => window.clearInterval(id);
  }, [refresh]);

  const enable = useCallback(async () => {
    if (reason.trim().length < 10) {
      toast.error("Enter a reason of at least 10 characters.");
      return;
    }
    setBusy(true);
    try {
      const r = await fetch("/api/decryption-session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() }),
      });
      const body = await r.json();
      if (!r.ok) {
        toast.error(body.error ?? "Failed to start session");
        return;
      }
      toast.success("Decrypted view enabled for this session.");
      setExpanded(false);
      setReason("");
      await refresh();
      // Reload so any open table/user view re-fetches decrypted rows.
      window.location.reload();
    } finally {
      setBusy(false);
    }
  }, [reason, refresh]);

  const disable = useCallback(async () => {
    setBusy(true);
    try {
      await fetch("/api/decryption-session", { method: "DELETE" });
      toast.success("Decrypted view disabled.");
      await refresh();
      window.location.reload();
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  if (!status) return null;

  if (!status.keyConfigured) {
    return (
      <div className="flex items-center gap-2 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs text-amber-300">
        <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
        <span>
          <span className="font-semibold">FINTRK_ENCRYPTION_KEY is not set</span> on the admin app -
          encrypted user data cannot be decrypted here. Add the same key the user app uses.
        </span>
      </div>
    );
  }

  if (status.active && status.session) {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-xs text-emerald-200">
        <LockOpen className="h-3.5 w-3.5 shrink-0" />
        <span className="font-semibold">Decrypted view ON</span>
        <span className="text-emerald-300/80">expires in {timeLeft(status.session.expiresAt)}</span>
        <span className="truncate text-emerald-300/60">reason: {status.session.reason}</span>
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto h-6 gap-1 px-2 text-xs text-emerald-200 hover:text-white"
          onClick={disable}
          disabled={busy}
        >
          <X className="h-3 w-3" /> Disable
        </Button>
      </div>
    );
  }

  return (
    <div className="border-b border-border bg-secondary/60 px-4 py-2 text-xs">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="text-muted-foreground">
          User data is <span className="font-semibold text-foreground">encrypted at rest</span>.
          Decrypted view is off.
        </span>
        {!expanded && (
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto h-6 px-2 text-xs"
            onClick={() => setExpanded(true)}
          >
            Enable decrypted view
          </Button>
        )}
      </div>
      {expanded && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Input
            autoFocus
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason for decryption (audited, min 10 chars)…"
            className="h-7 max-w-md flex-1 text-xs"
            onKeyDown={(e) => e.key === "Enter" && enable()}
          />
          <Button size="sm" className="h-7 px-3 text-xs" onClick={enable} disabled={busy}>
            Start {status.sessionHours}h session
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs"
            onClick={() => {
              setExpanded(false);
              setReason("");
            }}
            disabled={busy}
          >
            Cancel
          </Button>
        </div>
      )}
    </div>
  );
}
