"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AnalyticsDetailResponse } from "@/app/api/analytics/detail/route";
import type { DetailEntity } from "@/components/analytics-detail-tooltip";

export interface DetailTipState {
  rect: DOMRect;
  clientX: number;
  clientY: number;
  avoidRect: DOMRect | null;
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

export async function loadAnalyticsDetail(
  entity: DetailEntity,
  value: string,
  currency?: string,
  month?: string,
): Promise<{ data: AnalyticsDetailResponse | null; error: string | null }> {
  const key = cacheKey(entity, value, currency, month);
  const cached = CACHE.get(key);
  if (cached) return { data: cached, error: null };

  try {
    const url =
      `/api/analytics/detail?entity=${encodeURIComponent(entity)}` +
      `&value=${encodeURIComponent(value)}` +
      (currency ? `&currency=${encodeURIComponent(currency)}` : "") +
      (month ? `&month=${encodeURIComponent(month)}` : "");
    const r = await fetch(url);
    const j = (await r.json()) as AnalyticsDetailResponse | { error: string };
    if ("error" in j || !r.ok) {
      return {
        data: null,
        error: ("error" in j && j.error) || "Failed to load",
      };
    }
    CACHE.set(key, j);
    return { data: j, error: null };
  } catch {
    return { data: null, error: "Network error" };
  }
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
      clientX: number;
      clientY: number;
      avoidRect?: DOMRect | null;
      entity: DetailEntity;
      value: string;
      label: string;
      accent: string;
      currency?: string;
      month?: string;
    }) => {
      const { rect, clientX, clientY, avoidRect, entity, value, label, accent, currency, month } = params;
      clearLeave();

      const key = cacheKey(entity, value, currency, month);
      const cached = CACHE.get(key);

      const baseState: DetailTipState = {
        rect,
        clientX,
        clientY,
        avoidRect: avoidRect ?? null,
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
        const { data, error } = await loadAnalyticsDetail(entity, value, currency, month);
        if (gen !== fetchGen.current) return;

        if (error || !data) {
          setTip((prev) =>
            prev && prev.entity === entity && prev.value === value
              ? { ...prev, loading: false, error: error ?? "Failed to load" }
              : prev,
          );
          return;
        }
        setTip((prev) =>
          prev && prev.entity === entity && prev.value === value
            ? { ...prev, data, loading: false, error: null }
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
