/** Shared layout constants for FinTRK left / right / bottom workspace panels (BullTRK-inspired). */

export const FINTRK_SIDE_PANEL_RAIL_W_PX = 20;
export const FINTRK_BOTTOM_PANEL_RAIL_H_PX = 30;

/** SSR-safe fallback (~30% of 1920). */
export const FINTRK_SIDE_PANEL_W_PX = 576;

export const FINTRK_SIDE_PANEL_DEFAULT_VIEWPORT_RATIO = 0.3;
export const FINTRK_SIDE_PANEL_MIN_VIEWPORT_RATIO = 0.22;
export const FINTRK_SIDE_PANEL_MAX_VIEWPORT_RATIO = 0.7;

export const FINTRK_BOTTOM_PANEL_DEFAULT_H_PX = 280;
export const FINTRK_BOTTOM_PANEL_MIN_H_PX = 120;
export const FINTRK_BOTTOM_PANEL_MAX_VIEWPORT_RATIO = 0.55;

export function getFintrkSidePanelDefaultWidthPx(): number {
  if (typeof window === "undefined") return FINTRK_SIDE_PANEL_W_PX;
  return Math.floor(window.innerWidth * FINTRK_SIDE_PANEL_DEFAULT_VIEWPORT_RATIO);
}

export function getFintrkSidePanelMinWidthPx(): number {
  if (typeof window === "undefined") {
    return Math.floor(FINTRK_SIDE_PANEL_W_PX * FINTRK_SIDE_PANEL_MIN_VIEWPORT_RATIO);
  }
  return Math.floor(window.innerWidth * FINTRK_SIDE_PANEL_MIN_VIEWPORT_RATIO);
}

export function getFintrkSidePanelMaxWidthPx(): number {
  if (typeof window === "undefined") return FINTRK_SIDE_PANEL_W_PX;
  return Math.floor(window.innerWidth * FINTRK_SIDE_PANEL_MAX_VIEWPORT_RATIO);
}

export function clampFintrkSidePanelWidthPx(next: number): number {
  const max = getFintrkSidePanelMaxWidthPx();
  const min = getFintrkSidePanelMinWidthPx();
  return Math.min(max, Math.max(min, Math.round(next)));
}

export function getFintrkBottomPanelMaxHeightPx(): number {
  if (typeof window === "undefined") return FINTRK_BOTTOM_PANEL_DEFAULT_H_PX;
  const viewportCap = Math.floor(
    window.innerHeight * FINTRK_BOTTOM_PANEL_MAX_VIEWPORT_RATIO,
  );
  return Math.max(FINTRK_BOTTOM_PANEL_DEFAULT_H_PX, viewportCap);
}

export function clampFintrkBottomPanelHeightPx(next: number): number {
  const max = getFintrkBottomPanelMaxHeightPx();
  return Math.min(max, Math.max(FINTRK_BOTTOM_PANEL_MIN_H_PX, Math.round(next)));
}

export function fintrkBottomPanelOccupiedHeightPx(
  open: boolean,
  panelHeightPx: number = FINTRK_BOTTOM_PANEL_DEFAULT_H_PX,
): number {
  return open
    ? FINTRK_BOTTOM_PANEL_RAIL_H_PX + panelHeightPx
    : FINTRK_BOTTOM_PANEL_RAIL_H_PX;
}

export type FintrkSidePanelKnock =
  | "charge"
  | "retreat-left"
  | "retreat-right"
  | null;
