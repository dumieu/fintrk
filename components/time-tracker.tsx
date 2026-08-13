"use client";

import { useEffect, useRef, useCallback } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@clerk/nextjs";

const IDLE_TIMEOUT_MS = 5 * 60 * 1000;
const MIN_DURATION_MS = 500;

export function TimeTracker() {
  const pathname = usePathname();
  const { userId } = useAuth();

  const startRef = useRef(0);
  const accumulatedRef = useRef(0);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isIdleRef = useRef(false);
  const pathnameRef = useRef(pathname);

  const flush = useCallback(
    (targetPathname: string) => {
      if (!userId) return;

      let elapsed = accumulatedRef.current;
      if (!isIdleRef.current && startRef.current > 0) {
        elapsed += Date.now() - startRef.current;
      }

      if (elapsed >= MIN_DURATION_MS) {
        const payload = JSON.stringify({
          pathname: targetPathname,
          durationMs: elapsed,
        });
        navigator.sendBeacon("/api/track-time", new Blob([payload], { type: "application/json" }));
      }

      accumulatedRef.current = 0;
      startRef.current = document.hidden ? 0 : Date.now();
      isIdleRef.current = false;
    },
    [userId]
  );

  useEffect(() => {
    if (!userId) return;

    const previousPathname = pathnameRef.current;
    if (previousPathname !== pathname) {
      flush(previousPathname);
    }
    pathnameRef.current = pathname;

    startRef.current = document.hidden ? 0 : Date.now();
    accumulatedRef.current = 0;
    isIdleRef.current = false;

    const resetIdleTimer = () => {
      if (document.hidden) return;
      if (isIdleRef.current) {
        isIdleRef.current = false;
        startRef.current = Date.now();
      }
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      idleTimerRef.current = setTimeout(() => {
        if (!document.hidden && startRef.current > 0) {
          accumulatedRef.current += Date.now() - startRef.current;
          startRef.current = 0;
        }
        isIdleRef.current = true;
      }, IDLE_TIMEOUT_MS);
    };

    const onVisibilityChange = () => {
      if (document.hidden) {
        flush(pathnameRef.current);
      } else {
        if (!isIdleRef.current) {
          startRef.current = Date.now();
        }
        resetIdleTimer();
      }
    };

    const onBeforeUnload = () => {
      flush(pathnameRef.current);
    };

    const ACTIVITY_EVENTS = ["mousemove", "mousedown", "keydown", "touchstart", "scroll"] as const;

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("beforeunload", onBeforeUnload);
    ACTIVITY_EVENTS.forEach((evt) => window.addEventListener(evt, resetIdleTimer, { passive: true }));

    resetIdleTimer();

    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("beforeunload", onBeforeUnload);
      ACTIVITY_EVENTS.forEach((evt) => window.removeEventListener(evt, resetIdleTimer));
    };
  }, [pathname, userId, flush]);

  return null;
}
