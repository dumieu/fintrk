"use client";

/**
 * DeviceProvider - the single source of truth for phone vs desktop.
 *
 * SSR: the root layout detects the device from request headers and passes
 * `initialIsPhone`, so the first paint is already correct on real phones.
 * After mount, runtime signals (UA, pointer type, viewport, screen size)
 * continuously refine the decision - rotating, resizing, or attaching a
 * keyboard all re-evaluate live with zero reloads.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  DEVICE_OVERRIDE_STORAGE_KEY,
  isPhoneUserAgent,
  type DeviceOverride,
} from "@/lib/device/detect";

type DeviceContextValue = {
  /** True when the phone interstitial / small-screen path should run. */
  isPhone: boolean;
  /** True once runtime (client) signals have been evaluated at least once. */
  ready: boolean;
  /** Manual override: "phone", "desktop", or null to return to auto. */
  override: DeviceOverride;
  setOverride: (value: DeviceOverride) => void;
};

const DeviceContext = createContext<DeviceContextValue | null>(null);

/** Viewport width at or below which a touch device is treated as a phone. */
const PHONE_VIEWPORT_MAX_PX = 767;
/** Hardware screens whose short edge is this small are phones regardless. */
const PHONE_SCREEN_SHORT_EDGE_PX = 500;

function readStoredOverride(): DeviceOverride {
  try {
    const v = window.localStorage.getItem(DEVICE_OVERRIDE_STORAGE_KEY);
    return v === "phone" || v === "desktop" ? v : null;
  } catch {
    return null;
  }
}

/** `?device=phone|desktop|auto` in the URL persists an override (dev + support). */
function consumeQueryOverride(): DeviceOverride | "auto" | undefined {
  try {
    const q = new URLSearchParams(window.location.search).get("device");
    if (q === "phone" || q === "desktop" || q === "auto") return q;
  } catch {
    /* ignore */
  }
  return undefined;
}

function evaluateRuntimeIsPhone(): boolean {
  const uaData = (
    navigator as Navigator & { userAgentData?: { mobile?: boolean } }
  ).userAgentData;
  const uaPhone =
    uaData?.mobile === true || isPhoneUserAgent(navigator.userAgent);

  if (uaPhone) return true;

  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const noHover = window.matchMedia("(hover: none)").matches;
  const narrow = window.innerWidth <= PHONE_VIEWPORT_MAX_PX;
  const smallScreen =
    Math.min(window.screen.width, window.screen.height) <=
    PHONE_SCREEN_SHORT_EDGE_PX;

  return narrow && ((coarse && noHover) || smallScreen);
}

export function DeviceProvider({
  initialIsPhone,
  children,
}: {
  initialIsPhone: boolean;
  children: ReactNode;
}) {
  const [autoIsPhone, setAutoIsPhone] = useState(initialIsPhone);
  const [override, setOverrideState] = useState<DeviceOverride>(null);
  const [ready, setReady] = useState(false);

  const setOverride = useCallback((value: DeviceOverride) => {
    setOverrideState(value);
    try {
      if (value) window.localStorage.setItem(DEVICE_OVERRIDE_STORAGE_KEY, value);
      else window.localStorage.removeItem(DEVICE_OVERRIDE_STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const q = consumeQueryOverride();
    if (q === "auto") setOverride(null);
    else if (q) setOverride(q);
    else setOverrideState(readStoredOverride());

    const update = () => setAutoIsPhone(evaluateRuntimeIsPhone());
    update();
    setReady(true);

    const narrowMq = window.matchMedia(
      `(max-width: ${PHONE_VIEWPORT_MAX_PX}px)`
    );
    const pointerMq = window.matchMedia("(pointer: coarse)");
    narrowMq.addEventListener("change", update);
    pointerMq.addEventListener("change", update);
    window.addEventListener("orientationchange", update);
    return () => {
      narrowMq.removeEventListener("change", update);
      pointerMq.removeEventListener("change", update);
      window.removeEventListener("orientationchange", update);
    };
  }, [setOverride]);

  const isPhone = override ? override === "phone" : autoIsPhone;

  useEffect(() => {
    document.documentElement.dataset.device = isPhone ? "phone" : "desktop";
  }, [isPhone]);

  const value = useMemo(
    () => ({ isPhone, ready, override, setOverride }),
    [isPhone, ready, override, setOverride]
  );

  return (
    <DeviceContext.Provider value={value}>{children}</DeviceContext.Provider>
  );
}

export function useDevice(): DeviceContextValue {
  const ctx = useContext(DeviceContext);
  if (!ctx) throw new Error("useDevice must be used within DeviceProvider");
  return ctx;
}
