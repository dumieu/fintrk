"use client";

import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";

type Tone = "dark" | "light";
type Align = "start" | "center" | "end";

type AdvantageValueLineProps = {
  tone?: Tone;
  align?: Align;
  className?: string;
  /** Compact line for tight nav bars */
  compact?: boolean;
};

const CHEAPER = "#0BC18D";
const ADVANCED = "#2CA2FF";

export function AdvantageValueLine({
  tone = "dark",
  align = "end",
  className = "",
  compact = false,
}: AdvantageValueLineProps) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const titleId = useId();
  const muted = tone === "dark" ? "rgba(255,255,255,0.55)" : "rgba(20,24,32,0.55)";
  const alignClass =
    align === "center"
      ? "text-center"
      : align === "start"
        ? "text-left"
        : "text-right";

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const dialog =
    open && mounted
      ? createPortal(
          <div
            className="fixed inset-0 z-[200] flex items-center justify-center p-4 sm:p-6"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
          >
            <button
              type="button"
              aria-label="Close"
              className="absolute inset-0 border-0"
              style={{
                background: "rgba(4, 6, 14, 0.72)",
                backdropFilter: "blur(10px)",
                WebkitBackdropFilter: "blur(10px)",
                cursor: "pointer",
              }}
              onClick={() => setOpen(false)}
            />
            <div
              className="relative w-full overflow-hidden"
              style={{
                maxWidth: 440,
                borderRadius: 20,
                boxShadow:
                  "0 0 0 1px rgba(255,255,255,0.08), 0 24px 64px rgba(0,0,0,0.45)",
                animation: "adv-pop-in 0.35s cubic-bezier(0.34, 1.4, 0.64, 1) both",
              }}
            >
              <div
                aria-hidden
                className="pointer-events-none absolute -inset-[1.5px] rounded-[21px] opacity-70"
                style={{
                  background: `conic-gradient(from 180deg, ${CHEAPER}, ${ADVANCED}, #AD74FF, #ECAA0B, ${CHEAPER})`,
                  animation: "adv-border-spin 8s linear infinite",
                }}
              />
              <div
                className="relative"
                style={{
                  margin: 1.5,
                  borderRadius: 18.5,
                  background:
                    "linear-gradient(165deg, #0f1220 0%, #12182c 48%, #0c101c 100%)",
                  padding: "22px 22px 20px",
                }}
              >
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close dialog"
                  className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full text-white/50 transition-colors hover:bg-white/10 hover:text-white"
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
                    <path
                      d="M3 3l8 8M11 3L3 11"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>

                <p
                  className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em]"
                  style={{ color: CHEAPER }}
                >
                  The xTRK difference
                </p>
                <h2
                  id={titleId}
                  className="pr-8 text-sm font-bold tracking-tight text-white sm:text-base"
                >
                  Why at least{" "}
                  <span style={{ color: CHEAPER }}>5x cheaper</span>
                  {" "}and{" "}
                  <span style={{ color: ADVANCED }}>more advanced</span>
                  {" "}than other solutions
                </h2>

                <div className="mt-5 space-y-4 text-[13.5px] leading-relaxed text-white/70">
                  <div
                    className="rounded-xl border border-white/[0.07] p-3.5"
                    style={{ background: "rgba(11,193,141,0.06)" }}
                  >
                    <p
                      className="mb-1.5 text-[11px] font-bold uppercase tracking-wider"
                      style={{ color: CHEAPER }}
                    >
                      5x cheaper
                    </p>
                    <p>
                      We are a small, technically astute, passionate team bootstrapping
                      our way forward - no giant investor paybacks baked into your bill.
                      Most competitors owe huge returns to investors, influencers, and
                      shareholders. That cost shows up in their pricing. Ours does not.
                    </p>
                  </div>
                  <div
                    className="rounded-xl border border-white/[0.07] p-3.5"
                    style={{ background: "rgba(44,162,255,0.06)" }}
                  >
                    <p
                      className="mb-1.5 text-[11px] font-bold uppercase tracking-wider"
                      style={{ color: ADVANCED }}
                    >
                      More advanced
                    </p>
                    <p>
                      We ship on the latest technologies and hunt for improvements every
                      week - modern AI pipelines, tighter data models, and product depth
                      that larger, slower orgs take years to match. Being nimble means we
                      adopt better tools the moment they appear, not after a board cycle.
                      You get capability that feels a generation ahead, without the
                      enterprise markup.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="mt-5 w-full rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-95"
                  style={{
                    background: `linear-gradient(90deg, ${CHEAPER}, ${ADVANCED})`,
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  Got it
                </button>
              </div>
            </div>
            <style>{`
              @keyframes adv-pop-in {
                from { opacity: 0; transform: translateY(16px) scale(0.96); }
                to { opacity: 1; transform: translateY(0) scale(1); }
              }
              @keyframes adv-border-spin {
                to { transform: rotate(360deg); }
              }
            `}</style>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <p
        className={`${alignClass} ${className}`}
        style={{
          margin: align === "center" ? "0 auto" : 0,
          fontSize: compact ? 10.5 : 11.5,
          lineHeight: 1.35,
          color: muted,
          letterSpacing: "0.01em",
          maxWidth: compact ? 220 : 280,
          textAlign: align === "center" ? "center" : align === "start" ? "left" : "right",
        }}
      >
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline underline decoration-from-font underline-offset-[3px] transition-opacity hover:opacity-80"
          style={{
            color: CHEAPER,
            fontWeight: 700,
            background: "none",
            border: "none",
            padding: 0,
            cursor: "pointer",
            font: "inherit",
          }}
        >
          5x+ cheaper
        </button>{" "}
        and{" "}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline underline decoration-from-font underline-offset-[3px] transition-opacity hover:opacity-80"
          style={{
            color: ADVANCED,
            fontWeight: 700,
            background: "none",
            border: "none",
            padding: 0,
            cursor: "pointer",
            font: "inherit",
          }}
        >
          more advanced
        </button>
      </p>
      {dialog}
    </>
  );
}
