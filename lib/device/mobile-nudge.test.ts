import assert from "node:assert/strict";
import test from "node:test";

import {
  MOBILE_NUDGE_COUNTDOWN_SEC,
  MOBILE_NUDGE_FAILSAFE_SCRIPT,
  MOBILE_NUDGE_HEADLINE,
  MOBILE_NUDGE_REDIRECT_MS,
  isMobileNudgeSkippedPath,
  mobileNudgeCountdownSeconds,
  mobileNudgeRedirectCopy,
  mobileNudgeShouldHandoff,
} from "./mobile-nudge";

test("countdown starts at 5 and reaches 0 before the 7s handoff", () => {
  assert.equal(MOBILE_NUDGE_COUNTDOWN_SEC, 5);
  assert.equal(MOBILE_NUDGE_REDIRECT_MS, 7000);
  assert.equal(mobileNudgeCountdownSeconds(0), 5);
  assert.equal(mobileNudgeCountdownSeconds(999), 5);
  assert.equal(mobileNudgeCountdownSeconds(1000), 4);
  assert.equal(mobileNudgeCountdownSeconds(4000), 1);
  assert.equal(mobileNudgeCountdownSeconds(5000), 0);
  assert.equal(mobileNudgeCountdownSeconds(6999), 0);
});

test("handoff is locked at 7 seconds no matter the countdown", () => {
  assert.equal(mobileNudgeShouldHandoff(0), false);
  assert.equal(mobileNudgeShouldHandoff(5000), false);
  assert.equal(mobileNudgeShouldHandoff(6999), false);
  assert.equal(mobileNudgeShouldHandoff(7000), true);
  assert.equal(mobileNudgeShouldHandoff(12000), true);
});

test("redirect copy matches the landing sentence", () => {
  assert.equal(
    mobileNudgeRedirectCopy(5),
    "Redirecting you to the mobile app in 5 seconds..."
  );
  assert.equal(
    mobileNudgeRedirectCopy(1),
    "Redirecting you to the mobile app in 1 second..."
  );
  assert.equal(mobileNudgeRedirectCopy(0), "Redirecting you to the mobile app...");
  assert.match(MOBILE_NUDGE_HEADLINE, /FinTRK/);
  assert.match(MOBILE_NUDGE_HEADLINE, /desktop/);
  assert.doesNotMatch(MOBILE_NUDGE_HEADLINE, /\u2014/);
});

test("auth and legal paths skip the phone interstitial", () => {
  assert.equal(isMobileNudgeSkippedPath("/auth"), true);
  assert.equal(isMobileNudgeSkippedPath("/auth/sign-up"), true);
  assert.equal(isMobileNudgeSkippedPath("/privacy"), true);
  assert.equal(isMobileNudgeSkippedPath("/terms"), true);
  assert.equal(isMobileNudgeSkippedPath("/sign-out"), true);
  assert.equal(isMobileNudgeSkippedPath("/unauth1"), false);
  assert.equal(isMobileNudgeSkippedPath("/dashboard"), false);
  assert.equal(isMobileNudgeSkippedPath("/demo"), false);
  assert.equal(isMobileNudgeSkippedPath("/author"), false);
  assert.match(MOBILE_NUDGE_FAILSAFE_SCRIPT, /\/auth/);
});
