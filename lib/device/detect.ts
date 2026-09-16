/**
 * FinTRK device detection - server-safe helpers.
 *
 * "Phone" means a small handheld touch device. Tablets (iPad, Android tablets)
 * keep the full desktop app: cashflow maps, statements, and net-worth views
 * are built around that wider canvas.
 *
 * Detection layers (in priority order):
 *  1. Explicit user override (?device= query / localStorage) - client only.
 *  2. Client hints: `Sec-CH-UA-Mobile: ?1` is a definitive phone signal.
 *  3. User-Agent tokens: iPhone/iPod, Android + Mobile, and friends.
 *  4. Runtime signals (client): coarse pointer without hover + narrow viewport.
 */

/** Phone-only UA tokens. `Android` alone is a tablet; `Android ... Mobile` is a phone. */
const PHONE_UA_RE =
  /\b(iPhone|iPod|Windows Phone|IEMobile|BlackBerry|BB10|webOS|Opera Mini)\b/i;

const TABLET_UA_RE = /\b(iPad|Tablet|PlayBook|Silk|Kindle|Nexus 7|Nexus 10)\b/i;

export const DEVICE_OVERRIDE_STORAGE_KEY = "fintrk-device-override";

export type DeviceOverride = "phone" | "desktop" | null;

export function isPhoneUserAgent(ua: string | null | undefined): boolean {
  if (!ua) return false;
  if (TABLET_UA_RE.test(ua)) return false;
  if (PHONE_UA_RE.test(ua)) return true;
  // Android phones always carry the "Mobile" token; Android tablets do not.
  if (/\bAndroid\b/i.test(ua) && /\bMobile\b/i.test(ua)) return true;
  return false;
}

/**
 * Server-side phone detection from request headers. Runs during SSR so the
 * very first HTML paint already carries the correct experience (no flash).
 */
export function detectPhoneFromHeaders(headers: {
  get(name: string): string | null;
}): boolean {
  const chMobile = headers.get("sec-ch-ua-mobile");
  if (chMobile === "?1") return true;
  return isPhoneUserAgent(headers.get("user-agent"));
}
