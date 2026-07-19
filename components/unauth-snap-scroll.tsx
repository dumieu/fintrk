"use client";

import { useEffect, useSyncExternalStore } from "react";
import { ChevronDown } from "lucide-react";

const SNAP_STYLE_ID = "fintrk-unauth-snap-scroll-styles";

function subscribeReducedMotion(onStoreChange: () => void) {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", onStoreChange);
  return () => mq.removeEventListener("change", onStoreChange);
}

function getReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function getReducedMotionServer() {
  return false;
}

const SNAP_CSS = `
  html.unauth-snap-scroll {
    scroll-behavior: smooth;
    scroll-padding-top: 3.25rem;
  }
  html.unauth-snap-scroll:not(.unauth-snap-reduced) {
    scroll-snap-type: y mandatory;
  }
  html.unauth-snap-scroll [data-unauth-snap="hero"] {
    scroll-snap-align: start;
    scroll-snap-stop: always;
  }
  html.unauth-snap-scroll [data-unauth-snap="landing"] {
    scroll-snap-align: start;
  }
  @keyframes unauth-cue-bob {
    0%, 100% { transform: translateY(0); opacity: 0.55; }
    50% { transform: translateY(6px); opacity: 1; }
  }
  @keyframes unauth-cue-ring {
    0%, 100% { box-shadow: 0 0 0 0 rgba(11, 193, 141, 0.35); }
    50% { box-shadow: 0 0 0 8px rgba(11, 193, 141, 0); }
  }
`;

/** Enables viewport scroll-snap for the unauth landing page only. */
export function UnauthSnapScrollInit() {
  useEffect(() => {
    if (!document.getElementById(SNAP_STYLE_ID)) {
      const style = document.createElement("style");
      style.id = SNAP_STYLE_ID;
      style.textContent = SNAP_CSS;
      document.head.appendChild(style);
    }
    const root = document.documentElement;
    root.classList.add("unauth-snap-scroll");
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncReduced = () => {
      root.classList.toggle("unauth-snap-reduced", mq.matches);
    };
    syncReduced();
    mq.addEventListener("change", syncReduced);
    return () => {
      mq.removeEventListener("change", syncReduced);
      root.classList.remove("unauth-snap-scroll", "unauth-snap-reduced");
    };
  }, []);
  return null;
}

export function UnauthScrollCue({ targetId }: { targetId: string }) {
  const reduceMotion = useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotion,
    getReducedMotionServer,
  );

  const scrollToTarget = () => {
    document.getElementById(targetId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="absolute bottom-6 left-1/2 z-30 -translate-x-1/2">
      <button
        type="button"
        onClick={scrollToTarget}
        className="flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-white/[0.06] text-white/80 backdrop-blur-sm transition-colors hover:border-white/35 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
        style={
          reduceMotion
            ? undefined
            : {
                animation:
                  "unauth-cue-bob 2.2s ease-in-out infinite, unauth-cue-ring 2.2s ease-in-out infinite",
              }
        }
        aria-label="Scroll to explore FinTRK"
      >
        <ChevronDown className="h-5 w-5" aria-hidden />
      </button>
    </div>
  );
}
