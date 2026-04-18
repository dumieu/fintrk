"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AnalyticsDetailResponse } from "@/app/api/analytics/detail/route";
import type { DetailEntity } from "@/components/analytics-detail-tooltip";

export interface DetailTipState {
  rect: DOMRect;
  entity: DetailEntity;
  value: string;
  label: string;
  accent: string;
  data: AnalyticsDetailResponse | null;
  loading: boolean;
  error: string | null;
}

/** Per-entity LRU-ish cache keyed by `${entity}|${value}|${currency ?? ''}|${month ?? ''}`. */
const CACHE = new Map<string, AnalyticsDetailResponse>();
function cacheKey(entity: DetailEntity, value: string, currency?: string, month?: string) {
  return `${entity}|${value}|${currency ?? ""}|${month ?? ""}`;
}

/**
 * Shared hover helper for chart rows: opens a tooltip, fetches detail with caching,
 * and exposes mouse handlers that prevent flicker (small leave delay; tooltip can keep itself open).
 */
export function useAnalyticsDetail() {
  const [tip, setTip] = useState<DetailTipState | null>(null);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fetchGen = useRef(0);

  const clearLeave = useCallback(() => {
    if (leaveTimer.current) {
      clearTimeout(leaveTimer.current);
      leaveTimer.current = null;
    }
  }, []);

  const scheduleClose = useCallback(() => {
    clearLeave();
    leaveTimer.current = setTimeout(() => setTip(null), 160);
  }, [clearLeave]);

  const open = useCallback(
    async (params: {
      rect: DOMRect;
      entity: DetailEntity;
      value: string;
      label: string;
      accent: string;
      currency?: string;
      month?: string;
    }) => {
      const { rect, entity, value, label, accent, currency, month } = params;
      clearLeave();

      const key = cacheKey(entity, value, currency, month);
      const cached = CACHE.get(key);

      const baseState: DetailTipState = {
        rect,
        entity,
        value,
        label,
        accent,
        data: cached ?? null,
        loading: !cached,
        error: null,
      };
      setTip(baseState);

      if (cached) return;

      const gen = ++fetchGen.current;
      try {
        const url =
          `/api/analytics/detail?entity=${encodeURIComponent(entity)}` +
          `&value=${encodeURIComponent(value)}` +
          (currency ? `&currency=${encodeURIComponent(currency)}` : "") +
          (month ? `&month=${encodeURIComponent(month)}` : "");
        const r = await fetch(url);
        const j = (await r.json()) as AnalyticsDetailResponse | { error: string };
        if (gen !== fetchGen.current) return;

        if ("error" in j || !r.ok) {
          setTip((prev) =>
            prev && prev.entity === entity && prev.value === value
              ? { ...prev, loading: false, error: ("error" in j && j.error) || "Failed to load" }
              : prev,
          );
          return;
        }
        CACHE.set(key, j);
        setTip((prev) =>
          prev && prev.entity === entity && prev.value === value
            ? { ...prev, data: j, loading: false, error: null }
            : prev,
        );
      } catch {
        if (gen !== fetchGen.current) return;
        setTip((prev) =>
          prev && prev.entity === entity && prev.value === value
            ? { ...prev, loading: false, error: "Network error" }
            : prev,
        );
      }
    },
    [clearLeave],
  );

  const close = useCallback(() => setTip(null), []);

  /** Auto-close on scroll/resize so the fixed-position panel doesn't drift away from its anchor. */
  useEffect(() => {
    if (!tip) return;
    const dismiss = () => setTip(null);
    window.addEventListener("scroll", dismiss, true);
    window.addEventListener("resize", dismiss);
    return () => {
      window.removeEventListener("scroll", dismiss, true);
      window.removeEventListener("resize", dismiss);
    };
  }, [tip]);

  return { tip, open, scheduleClose, clearLeave, close };
}
