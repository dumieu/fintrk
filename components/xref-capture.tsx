"use client";

import { useEffect } from "react";

/**
 * Fires once per mount to attribute a referred signup to its seller link.
 * No-ops unless an `xref` cookie is present (set by middleware from `?xref=`).
 * Mounted inside the authenticated dashboard so it only runs for signed-in
 * users. Failures are silent - referral tracking must never affect the app.
 */
export function XrefCapture() {
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (!document.cookie.includes("xref=")) return;
    const controller = new AbortController();
    fetch("/api/xref/capture", { method: "POST", signal: controller.signal }).catch(
      () => {}
    );
    return () => controller.abort();
  }, []);
  return null;
}
