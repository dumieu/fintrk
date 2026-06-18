"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

const ACCENT_HEX = "#0BC18D";

export function ManageBillingButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function openPortal() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.url) {
        throw new Error(
          typeof data?.error === "string" ? data.error : "Could not open billing portal.",
        );
      }
      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open billing portal.");
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-md text-center">
      <button
        type="button"
        onClick={openPortal}
        disabled={loading}
        className="inline-flex items-center justify-center gap-2 rounded-xl border px-5 py-3 text-sm font-semibold transition-colors hover:bg-muted/40 disabled:opacity-60"
        style={{ borderColor: `${ACCENT_HEX}66`, color: ACCENT_HEX }}
      >
        {loading ? <Loader2 className="size-4 animate-spin" /> : null}
        Manage subscription
      </button>
      <p className="mt-3 text-xs text-muted-foreground">
        Update your card, switch billing period, or cancel in the secure Stripe portal.
      </p>
      {error ? <p className="mt-2 text-sm text-red-400">{error}</p> : null}
    </div>
  );
}
