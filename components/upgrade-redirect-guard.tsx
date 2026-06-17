"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

/**
 * Middleware returns HTTP 402 on every authenticated API call once a user's
 * FinTRK Pro trial/subscription lapses. A full page navigation is already
 * redirected to the paywall by middleware; this catches the in-page case
 * (an open tab whose trial expires) by routing any 402 to the upgrade page.
 * 402 is used exclusively for the paywall, so no body inspection is needed.
 */
export function UpgradeRedirectGuard() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (typeof window === "undefined" || !window.fetch) return;
    const original = window.fetch;

    const patched: typeof window.fetch = async (...args) => {
      const res = await original(...args);
      if (res.status === 402 && !window.location.pathname.startsWith("/dashboard/upgrade")) {
        router.push("/dashboard/upgrade");
      }
      return res;
    };

    window.fetch = patched;
    return () => {
      if (window.fetch === patched) window.fetch = original;
    };
  }, [router, pathname]);

  return null;
}
