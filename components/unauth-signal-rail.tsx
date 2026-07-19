"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Upload,
  Layers,
  LineChart,
  Sparkles,
  Lock,
  ShieldCheck,
  Bot,
} from "lucide-react";

const GREEN = "#0BC18D";
const BLUE = "#2CA2FF";
const PURPLE = "#AD74FF";
const GOLD = "#ECAA0B";

const STAGES = [
  {
    id: "upload",
    label: "Statement",
    title: "Drop any statement",
    detail: "PDF or CSV · banks worldwide · no logins",
    icon: Upload,
    accent: GREEN,
  },
  {
    id: "organize",
    label: "Organize",
    title: "Your full financial picture",
    detail: "Cashflow, spending & net worth, automatic",
    icon: Layers,
    accent: BLUE,
  },
  {
    id: "project",
    label: "Project",
    title: "See out to age 100",
    detail: "Wealth, retirement & financial independence",
    icon: LineChart,
    accent: PURPLE,
  },
  {
    id: "act",
    label: "Act",
    title: "Moves that change the outcome",
    detail: "Which levers matter · no spreadsheets",
    icon: Sparkles,
    accent: GOLD,
  },
] as const;

const DEEPER = [
  { label: "No bank logins", icon: ShieldCheck },
  { label: "Encrypted at rest", icon: Lock },
  { label: "Connect your AI", icon: Bot },
] as const;

const HOLD_MS = 2600;
const MANUAL_HOLD_MS = 4800;
const SPECTRAL = `linear-gradient(90deg, ${GREEN} 0%, ${BLUE} 45%, ${PURPLE} 78%, ${GOLD} 100%)`;

export function UnauthSignalRail() {
  const reduce = useReducedMotion();
  const [active, setActive] = useState(0);
  const [deeperIn, setDeeperIn] = useState(false);
  const holdUntilRef = useRef(0);

  useEffect(() => {
    if (reduce) {
      setDeeperIn(true);
      return;
    }
    const t = window.setTimeout(() => setDeeperIn(true), 900);
    return () => window.clearTimeout(t);
  }, [reduce]);

  useEffect(() => {
    if (reduce) return;
    const t = window.setInterval(() => {
      if (Date.now() < holdUntilRef.current) return;
      setActive((i) => (i + 1) % STAGES.length);
    }, HOLD_MS);
    return () => window.clearInterval(t);
  }, [reduce]);

  const selectStage = useCallback((i: number) => {
    setActive(i);
    holdUntilRef.current = Date.now() + MANUAL_HOLD_MS;
  }, []);

  const stage = STAGES[active]!;
  const progress = active / (STAGES.length - 1);

  return (
    <div className="mx-auto mt-6 w-full max-w-2xl sm:mt-7" aria-live="polite">
      <p className="sr-only">
        FinTRK turns the statements you already have into your household&rsquo;s complete
        financial picture: cashflow, spending, and net worth, organized automatically.
        Then the Net Worth Atlas projects your wealth, retirement, and financial
        independence to age 100, and shows you which moves change the outcome. No bank
        logins. No spreadsheets.
      </p>

      <div className="relative px-1 sm:px-2">
        {/* Rail track */}
        <div
          className="absolute left-[12%] right-[12%] top-[18px] h-[2px] sm:top-[20px]"
          aria-hidden
        >
          <div className="h-full w-full rounded-full bg-white/10" />
          <motion.div
            className="absolute inset-y-0 left-0 origin-left rounded-full"
            style={{ background: SPECTRAL }}
            animate={{
              width: reduce ? "100%" : `${progress * 100}%`,
              opacity: reduce ? 0.55 : 0.85,
            }}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          />
          {!reduce && (
            <motion.span
              className="absolute top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full"
              style={{
                background: `radial-gradient(circle, #fff 0%, ${GREEN} 45%, transparent 75%)`,
                boxShadow: `0 0 12px ${GREEN}e6, 0 0 28px ${BLUE}8c`,
                left: `calc(${progress * 100}% - 5px)`,
              }}
              animate={{ scale: [0.85, 1.15, 0.9], opacity: [0.7, 1, 0.8] }}
              transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
            />
          )}
        </div>

        <ol className="relative grid grid-cols-4 gap-1 sm:gap-2">
          {STAGES.map((s, i) => {
            const Icon = s.icon;
            const isActive = reduce ? true : i === active;
            const isPast = reduce ? false : i < active;

            return (
              <li key={s.id} className="flex flex-col items-center">
                <button
                  type="button"
                  onClick={() => selectStage(i)}
                  className="group relative flex flex-col items-center rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#02110d]"
                  aria-current={i === active ? "step" : undefined}
                  aria-label={`${s.label}: ${s.title}`}
                >
                  <motion.span
                    className="relative flex h-9 w-9 items-center justify-center rounded-full sm:h-10 sm:w-10"
                    animate={
                      isActive
                        ? {
                            scale: reduce ? 1 : [1, 1.08, 1],
                            boxShadow: [
                              `0 0 0 1px ${s.accent}55, 0 0 18px ${s.accent}33`,
                              `0 0 0 1px ${s.accent}99, 0 0 28px ${s.accent}55`,
                              `0 0 0 1px ${s.accent}55, 0 0 18px ${s.accent}33`,
                            ],
                          }
                        : {
                            scale: 1,
                            boxShadow: isPast
                              ? `0 0 0 1px ${s.accent}40, 0 0 10px ${s.accent}18`
                              : "0 0 0 1px rgba(255,255,255,0.12)",
                          }
                    }
                    transition={
                      isActive && !reduce
                        ? { duration: 2.2, repeat: Infinity, ease: "easeInOut" }
                        : { duration: 0.35 }
                    }
                    style={{
                      background: isActive
                        ? `radial-gradient(circle at 35% 30%, ${s.accent}55, rgba(2,17,13,0.92) 70%)`
                        : isPast
                          ? `radial-gradient(circle at 35% 30%, ${s.accent}28, rgba(2,17,13,0.9) 72%)`
                          : "rgba(255,255,255,0.04)",
                    }}
                  >
                    {isActive && !reduce && (
                      <motion.span
                        aria-hidden
                        className="pointer-events-none absolute inset-[-3px] rounded-full"
                        style={{
                          background: `conic-gradient(from 0deg, transparent, ${s.accent}, transparent 40%)`,
                          opacity: 0.7,
                          maskImage:
                            "radial-gradient(farthest-side, transparent calc(100% - 2px), #000 calc(100% - 1px))",
                          WebkitMaskImage:
                            "radial-gradient(farthest-side, transparent calc(100% - 2px), #000 calc(100% - 1px))",
                        }}
                        animate={{ rotate: 360 }}
                        transition={{ duration: 3.2, repeat: Infinity, ease: "linear" }}
                      />
                    )}
                    <Icon
                      className="relative z-[1] h-3.5 w-3.5 sm:h-4 sm:w-4"
                      style={{
                        color: isActive || isPast ? "#fff" : "rgba(255,255,255,0.45)",
                      }}
                      aria-hidden
                    />
                  </motion.span>
                  <span
                    className="mt-2 max-w-[5.5rem] text-center text-[8px] font-bold uppercase leading-tight tracking-[0.06em] sm:max-w-[7.5rem] sm:text-[9px] sm:tracking-[0.08em]"
                    style={{
                      color: isActive
                        ? s.accent
                        : isPast
                          ? "rgba(255,255,255,0.55)"
                          : "rgba(255,255,255,0.28)",
                    }}
                  >
                    {s.label}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>

      <div className="relative mt-5 min-h-[4.5rem] sm:mt-6 sm:min-h-[4.75rem]">
        <AnimatePresence mode="wait">
          <motion.div
            key={stage.id}
            initial={reduce ? false : { opacity: 0, y: 10, filter: "blur(8px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={reduce ? undefined : { opacity: 0, y: -8, filter: "blur(6px)" }}
            transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
            className="text-center"
          >
            <div className="inline-flex items-center gap-2">
              <span
                className="h-1 w-1 rounded-full"
                style={{ background: stage.accent, boxShadow: `0 0 10px ${stage.accent}` }}
                aria-hidden
              />
              <p
                className="text-sm font-semibold tracking-tight sm:text-base"
                style={{
                  background: SPECTRAL,
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                {stage.title}
              </p>
            </div>
            <p className="mt-1.5 text-[13px] leading-snug text-white/70 sm:text-sm">
              {stage.detail}
            </p>
          </motion.div>
        </AnimatePresence>

        <div
          className="pointer-events-none absolute inset-x-[15%] top-1/2 -z-10 h-16 -translate-y-1/2 rounded-full opacity-40 blur-2xl transition-[background] duration-500"
          style={{
            background: `radial-gradient(ellipse at center, ${stage.accent}40, transparent 70%)`,
          }}
          aria-hidden
        />
      </div>

      <motion.div
        initial={false}
        animate={deeperIn ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        className="mt-4 border-t border-white/10 pt-4 sm:mt-5"
      >
        <p className="mb-2.5 text-center text-[10px] font-semibold uppercase tracking-[0.2em] text-white/35 sm:text-[11px]">
          Built for trust
        </p>
        <ul className="flex flex-wrap items-center justify-center gap-2 sm:gap-2.5">
          {DEEPER.map((item, i) => {
            const Icon = item.icon;
            return (
              <motion.li
                key={item.label}
                initial={reduce ? false : { opacity: 0, scale: 0.92 }}
                animate={deeperIn ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.92 }}
                transition={{ delay: reduce ? 0 : 0.15 + i * 0.08, duration: 0.35 }}
              >
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] text-white/75 backdrop-blur-sm sm:px-3 sm:text-xs">
                  <Icon className="h-3 w-3 text-emerald-300/80" aria-hidden />
                  {item.label}
                </span>
              </motion.li>
            );
          })}
        </ul>
      </motion.div>
    </div>
  );
}
