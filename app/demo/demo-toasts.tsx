"use client";

import { useDemo } from "./demo-store";
import { CheckCircle2, AlertTriangle, Info } from "lucide-react";

export function DemoToasts() {
  const { toasts } = useDemo();
  if (toasts.length === 0) return null;
  return (
    <div className="pointer-events-none fixed bottom-4 left-1/2 z-50 flex w-full max-w-md -translate-x-1/2 flex-col items-center gap-2 px-4">
      {toasts.map((t) => {
        const Icon = t.tone === "ok" ? CheckCircle2 : t.tone === "warn" ? AlertTriangle : Info;
        const color =
          t.tone === "ok"
            ? "border-[#0BC18D]/30 bg-[#0BC18D]/10 text-[#0BC18D]"
            : t.tone === "warn"
              ? "border-[#ECAA0B]/30 bg-[#ECAA0B]/10 text-[#ECAA0B]"
              : "border-[#2CA2FF]/30 bg-[#2CA2FF]/10 text-[#2CA2FF]";
        return (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-medium shadow-2xl backdrop-blur-md ${color} animate-in fade-in slide-in-from-bottom-2`}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span>{t.text}</span>
          </div>
        );
      })}
    </div>
  );
}
