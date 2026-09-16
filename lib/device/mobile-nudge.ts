/**
 * Phone-only desktop-nudge interstitial.
 *
 * Displayed countdown starts at 5 seconds (the copy on screen).
 * The handoff to the mobile app is hard-locked at 7 seconds so it
 * cannot stall behind React, a throttled tab, or a skipped interval.
 */

export const MOBILE_NUDGE_COUNTDOWN_SEC = 5;
export const MOBILE_NUDGE_REDIRECT_MS = 7000;
export const MOBILE_NUDGE_ROOT_ATTR = "data-mobile-nudge";
export const MOBILE_NUDGE_START_ATTR = "data-nudge-start";
export const MOBILE_NUDGE_EL_ID = "fintrk-mobile-nudge";

export const MOBILE_NUDGE_SKIP_PREFIXES = [
  "/auth",
  "/privacy",
  "/terms",
  "/sign-out",
] as const;

export const MOBILE_NUDGE_HEADLINE =
  "Please consider using FinTRK on a desktop due to the dense cashflow maps, statements, and net-worth views.";

export function isMobileNudgeSkippedPath(pathname: string): boolean {
  return MOBILE_NUDGE_SKIP_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

export function mobileNudgeCountdownSeconds(elapsedMs: number): number {
  const elapsed = Math.max(0, elapsedMs);
  return Math.max(0, MOBILE_NUDGE_COUNTDOWN_SEC - Math.floor(elapsed / 1000));
}

export function mobileNudgeShouldHandoff(elapsedMs: number): boolean {
  return elapsedMs >= MOBILE_NUDGE_REDIRECT_MS;
}

export function mobileNudgeRedirectCopy(secondsLeft: number): string {
  if (secondsLeft <= 0) return "Redirecting you to the mobile app...";
  const unit = secondsLeft === 1 ? "second" : "seconds";
  return `Redirecting you to the mobile app in ${secondsLeft} ${unit}...`;
}

const FAILSAFE_SKIP_JS = MOBILE_NUDGE_SKIP_PREFIXES.map(
  (prefix) => `p==="${prefix}"||p.indexOf("${prefix}/")===0`
).join("||");

/**
 * Native failsafe: starts on first HTML for phones (layout injects this).
 * Marks html[data-mobile-nudge="done"] at 7s even if React never hydrates.
 * Auth / legal routes never lock the page.
 */
export const MOBILE_NUDGE_FAILSAFE_SCRIPT = `(function(){try{var r=document.documentElement;if(r.getAttribute("data-device")!=="phone")return;var p=location.pathname;if(${FAILSAFE_SKIP_JS}){r.removeAttribute("${MOBILE_NUDGE_ROOT_ATTR}");return;}if(r.getAttribute("${MOBILE_NUDGE_ROOT_ATTR}")==="done")return;r.setAttribute("${MOBILE_NUDGE_ROOT_ATTR}","open");if(!r.getAttribute("${MOBILE_NUDGE_START_ATTR}"))r.setAttribute("${MOBILE_NUDGE_START_ATTR}",String(Date.now()));var t0=Date.now();function go(){r.setAttribute("${MOBILE_NUDGE_ROOT_ATTR}","done");}setTimeout(go,${MOBILE_NUDGE_REDIRECT_MS});setInterval(function(){if(Date.now()-t0>=${MOBILE_NUDGE_REDIRECT_MS})go();},250);document.addEventListener("visibilitychange",function(){if(Date.now()-t0>=${MOBILE_NUDGE_REDIRECT_MS})go();});window.addEventListener("pageshow",function(){if(Date.now()-t0>=${MOBILE_NUDGE_REDIRECT_MS})go();});}catch(e){}})();`;
