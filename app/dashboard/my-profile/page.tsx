"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Info, Loader2 } from "lucide-react";

const DETECT_TRAVEL_CURRENCY_HELP =
  "When this is on, spending in another currency is sorted into Travel so you can spot trip-related purchases at a glance.";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type DetectTravel = "Yes" | "No";

export default function MyProfilePage() {
  const [detectTravel, setDetectTravel] = useState<DetectTravel>("Yes");
  const [initialValue, setInitialValue] = useState<DetectTravel>("Yes");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

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

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-gradient-to-b from-[#08051a] via-[#10082a] to-[#160e35]">
      <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col px-4 py-5 sm:px-6 sm:py-6">
        <div className="mb-4 flex items-center justify-end">
          <Link href="/dashboard/transactions">
            <Button variant="ghost" className="text-white/80 hover:bg-white/10">
              Back
            </Button>
          </Link>
        </div>

        <Card className="border-white/10 bg-white/[0.04] text-white">
          <CardHeader>
            <CardTitle className="text-lg">AI Travel Detection</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-white/65">
              Control whether FX/main-currency travel override rules are applied during AI transaction categorization.
            </p>

            {loading ? (
              <div className="flex items-center gap-2 text-white/60">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading settings...
              </div>
            ) : (
              <div className="max-w-xs space-y-2">
                <div className="flex items-center gap-1.5">
                  <label
                    htmlFor="detect-travel"
                    className="text-sm font-medium text-white/90"
                  >
                    Detect Travel from Currency
                  </label>
                  <button
                    type="button"
                    className="inline-flex size-5 shrink-0 items-center justify-center rounded-full text-white/45 transition-colors hover:bg-white/10 hover:text-white/80 focus-visible:outline focus-visible:ring-2 focus-visible:ring-[#0BC18D]/40"
                    title={DETECT_TRAVEL_CURRENCY_HELP}
                    aria-label={DETECT_TRAVEL_CURRENCY_HELP}
                  >
                    <Info className="size-3.5" strokeWidth={2} aria-hidden />
                  </button>
                </div>
                <select
                  id="detect-travel"
                  value={detectTravel}
                  onChange={(e) => setDetectTravel((e.target.value === "No" ? "No" : "Yes"))}
                  className="w-full rounded-md border border-white/15 bg-[#10082a] px-3 py-2 text-sm text-white outline-none focus:border-[#0BC18D]/50 focus:ring-1 focus:ring-[#0BC18D]/30"
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
      </div>
    </div>
  );
}
