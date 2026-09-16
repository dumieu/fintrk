"use client";

/**
 * Temporary phone-only landing: desktop recommendation, then the app.
 * Handoff is hard-locked at 7s (native script + this component).
 */

import { usePathname } from "next/navigation";
import { useEffect, useId, useState } from "react";

import { useDevice } from "@/components/device/device-context";
import {
  MOBILE_NUDGE_COUNTDOWN_SEC,
  MOBILE_NUDGE_EL_ID,
  MOBILE_NUDGE_HEADLINE,
  MOBILE_NUDGE_REDIRECT_MS,
  MOBILE_NUDGE_ROOT_ATTR,
  MOBILE_NUDGE_START_ATTR,
  isMobileNudgeSkippedPath,
  mobileNudgeCountdownSeconds,
  mobileNudgeRedirectCopy,
  mobileNudgeShouldHandoff,
} from "@/lib/device/mobile-nudge";

function readNudgeStart(): number {
  try {
    const raw = document.documentElement.getAttribute(MOBILE_NUDGE_START_ATTR);
    const n = raw ? Number(raw) : NaN;
    if (Number.isFinite(n) && n > 0) return n;
  } catch {
    /* ignore */
  }
  return Date.now();
}

function markHandoff(): void {
  try {
    document.documentElement.setAttribute(MOBILE_NUDGE_ROOT_ATTR, "done");
  } catch {
    /* ignore */
  }
}

/** Rising wealth curve - FinTRK's net-worth trajectory, not a generic spinner. */
function OrbitMark({ uid }: { uid: string }) {
  const fillId = `${uid}-spark-fill`;
  const lineId = `${uid}-spark-line`;
  return (
    <div className="m-nudge-orbit" aria-hidden="true">
      <span className="m-nudge-orbit-glow" />
      <span className="m-nudge-orbit-ring m-nudge-orbit-ring-a" />
      <span className="m-nudge-orbit-ring m-nudge-orbit-ring-b" />
      <span className="m-nudge-orbit-ring m-nudge-orbit-ring-c" />
      <span className="m-nudge-bead m-nudge-bead-a" />
      <span className="m-nudge-bead m-nudge-bead-b" />
      <span className="m-nudge-bead m-nudge-bead-c" />
      <svg className="m-nudge-progress" viewBox="0 0 120 120">
        <circle className="m-nudge-progress-track" cx="60" cy="60" r="54" />
        <circle className="m-nudge-progress-fill" cx="60" cy="60" r="54" />
      </svg>
      <svg className="m-nudge-spark" viewBox="0 0 72 40">
        <defs>
          <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0BC18D" stopOpacity="0.42" />
            <stop offset="100%" stopColor="#0BC18D" stopOpacity="0" />
          </linearGradient>
          <linearGradient id={lineId} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#0BC18D" stopOpacity="0.55" />
            <stop offset="55%" stopColor="#2CA2FF" />
            <stop offset="100%" stopColor="#AD74FF" />
          </linearGradient>
        </defs>
        <path
          className="m-nudge-spark-area"
          d="M3 31 C11 31 14 23 20 23 S31 11 39 14 S50 6 69 9 L69 36 L3 36 Z"
          fill={`url(#${fillId})`}
        />
        <path
          className="m-nudge-spark-line"
          d="M3 31 C11 31 14 23 20 23 S31 11 39 14 S50 6 69 9"
          fill="none"
          stroke={`url(#${lineId})`}
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="69" cy="9" r="2.6" fill="#ECAA0B" />
      </svg>
    </div>
  );
}

export function MobileDesktopNudge() {
  const { isPhone } = useDevice();
  const pathname = usePathname() ?? "";
  const skipped = isMobileNudgeSkippedPath(pathname);
  const sparkUid = `fintrk-nudge${useId().replace(/:/g, "")}`;
  const [secondsLeft, setSecondsLeft] = useState(MOBILE_NUDGE_COUNTDOWN_SEC);
  const [gone, setGone] = useState(false);

  const visible = isPhone && !skipped && !gone;

  useEffect(() => {
    if (!isPhone || skipped) {
      if (skipped) {
        try {
          document.documentElement.removeAttribute(MOBILE_NUDGE_ROOT_ATTR);
        } catch {
          /* ignore */
        }
      }
      return;
    }

    const started = readNudgeStart();
    try {
      if (!document.documentElement.getAttribute(MOBILE_NUDGE_START_ATTR)) {
        document.documentElement.setAttribute(
          MOBILE_NUDGE_START_ATTR,
          String(started)
        );
      }
      if (
        document.documentElement.getAttribute(MOBILE_NUDGE_ROOT_ATTR) !== "done"
      ) {
        document.documentElement.setAttribute(MOBILE_NUDGE_ROOT_ATTR, "open");
      }
    } catch {
      /* ignore */
    }

    let finished = false;
    let fadeTimer = 0;
    const handoff = () => {
      if (finished) return;
      finished = true;
      markHandoff();
      fadeTimer = window.setTimeout(() => setGone(true), 480);
    };

    const tick = () => {
      const elapsed = Date.now() - started;
      setSecondsLeft(mobileNudgeCountdownSeconds(elapsed));
      if (mobileNudgeShouldHandoff(elapsed)) handoff();
    };

    tick();
    const remain = Math.max(0, MOBILE_NUDGE_REDIRECT_MS - (Date.now() - started));
    const interval = window.setInterval(tick, 200);
    const timeout = window.setTimeout(handoff, remain);

    const obs = new MutationObserver(() => {
      if (document.documentElement.getAttribute(MOBILE_NUDGE_ROOT_ATTR) === "done") {
        handoff();
      }
    });
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: [MOBILE_NUDGE_ROOT_ATTR],
    });
    document.addEventListener("visibilitychange", tick);
    window.addEventListener("pageshow", tick);

    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timeout);
      window.clearTimeout(fadeTimer);
      obs.disconnect();
      document.removeEventListener("visibilitychange", tick);
      window.removeEventListener("pageshow", tick);
    };
  }, [isPhone, skipped]);

  if (!visible) return null;

  return (
    <div
      id={MOBILE_NUDGE_EL_ID}
      className="m-nudge"
      role="dialog"
      aria-modal="true"
      aria-labelledby="m-nudge-title"
      aria-describedby="m-nudge-redirect"
    >
      <div className="m-nudge-veil" aria-hidden="true" />
      <div className="m-nudge-card">
        <p className="m-nudge-kicker">FinTRK</p>
        <p id="m-nudge-title" className="m-nudge-title">
          {MOBILE_NUDGE_HEADLINE}
        </p>
        <p id="m-nudge-redirect" className="m-nudge-redirect" aria-live="polite">
          {mobileNudgeRedirectCopy(secondsLeft)}
        </p>
        <OrbitMark uid={sparkUid} />
      </div>
    </div>
  );
}
