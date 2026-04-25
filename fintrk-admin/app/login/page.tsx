"use client";

import { SignIn } from "@clerk/nextjs";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Banknote, ShieldOff } from "lucide-react";

function LoginInner() {
  const params = useSearchParams();
  const denied = params.get("denied") === "1";

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#04060d] text-slate-100">
      <div className="pointer-events-none absolute inset-0 brand-glow opacity-50" aria-hidden="true" />
      <div
        className="pointer-events-none absolute inset-0 opacity-20"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
        aria-hidden="true"
      />

      <div className="relative mx-auto flex min-h-screen max-w-7xl items-center justify-center px-4 py-10">
        <div className="grid w-full max-w-5xl grid-cols-1 gap-10 md:grid-cols-2 md:items-center">
          <div className="space-y-6">
            <div className="flex items-center gap-3">
              <div className="relative flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-emerald-400 via-teal-500 to-sky-500">
                <span className="absolute inset-0 brand-glow" aria-hidden="true" />
                <Banknote className="relative h-6 w-6 text-white" />
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-[0.3em] text-emerald-300/80">FinTRK</p>
                <h1 className="text-2xl font-bold leading-tight">Money Console</h1>
              </div>
            </div>
            <p className="max-w-md text-sm text-slate-400">
              Sign in with the Clerk account whose primary email is on the admin allow-list. This
              console reads and writes to the production database — handle with care.
            </p>

            {denied ? (
              <div className="flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
                <ShieldOff className="mt-0.5 h-5 w-5 shrink-0" />
                <div>
                  <p className="font-semibold text-red-100">Access denied</p>
                  <p className="text-red-200/80">
                    Your Clerk email isn&apos;t in <code className="rounded bg-black/30 px-1">ADMIN_EMAILS</code>.
                    Ask an existing admin to add it.
                  </p>
                </div>
              </div>
            ) : null}

            <ul className="grid grid-cols-1 gap-2 text-xs text-slate-500 sm:grid-cols-2">
              <li>• Real-time error monitor</li>
              <li>• Per-user behavior dossier</li>
              <li>• Direct table editing</li>
              <li>• Live KPIs &amp; trends</li>
            </ul>
          </div>

          <div className="flex justify-center">
            <SignIn
              routing="hash"
              signUpUrl="/login"
              forceRedirectUrl="/overview"
              fallbackRedirectUrl="/overview"
              appearance={{
                elements: {
                  rootBox: "w-full max-w-sm",
                  card: "bg-card text-foreground border border-border shadow-2xl rounded-2xl",
                },
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="grid min-h-screen place-items-center bg-[#04060d] text-slate-300">
          Loading…
        </div>
      }
    >
      <LoginInner />
    </Suspense>
  );
}
