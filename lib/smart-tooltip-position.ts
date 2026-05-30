export interface RectLike {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface SmartTooltipPlacementInput {
  clientX: number;
  clientY: number;
  tooltipWidth: number;
  tooltipHeight: number;
  avoidRect?: RectLike | null;
  margin?: number;
  viewportWidth?: number;
  viewportHeight?: number;
}

export interface SmartTooltipPlacement {
  left: number;
  top: number;
}

type CornerAnchor = "top-left" | "top-right" | "bottom-left" | "bottom-right";

function toRect(left: number, top: number, w: number, h: number): RectLike {
  return { left, top, right: left + w, bottom: top + h };
}

function overlapArea(a: RectLike, b: RectLike, inset = 0): number {
  const x = Math.max(0, Math.min(a.right, b.right - inset) - Math.max(a.left, b.left + inset));
  const y = Math.max(0, Math.min(a.bottom, b.bottom - inset) - Math.max(a.top, b.top + inset));
  return x * y;
}

function fitsViewport(r: RectLike, margin: number, winW: number, winH: number): boolean {
  return r.left >= margin && r.top >= margin && r.right <= winW - margin && r.bottom <= winH - margin;
}

function clampToViewport(
  left: number,
  top: number,
  w: number,
  h: number,
  margin: number,
  winW: number,
  winH: number,
): { left: number; top: number } {
  return {
    left: Math.min(winW - margin - w, Math.max(margin, left)),
    top: Math.min(winH - margin - h, Math.max(margin, top)),
  };
}

function expansionSpace(anchor: CornerAnchor, cx: number, cy: number, margin: number, winW: number, winH: number): number {
  switch (anchor) {
    case "top-left":
      return winW - margin - cx + (winH - margin - cy);
    case "top-right":
      return cx - margin + (winH - margin - cy);
    case "bottom-left":
      return winW - margin - cx + (cy - margin);
    case "bottom-right":
      return cx - margin + (cy - margin);
  }
}

function cornerPosition(
  anchor: CornerAnchor,
  cx: number,
  cy: number,
  w: number,
  h: number,
): { left: number; top: number } {
  switch (anchor) {
    case "top-left":
      return { left: cx, top: cy };
    case "top-right":
      return { left: cx - w, top: cy };
    case "bottom-left":
      return { left: cx, top: cy - h };
    case "bottom-right":
      return { left: cx - w, top: cy - h };
  }
}

/**
 * Place a tooltip so one corner sits on the cursor and the panel grows into the
 * quadrant with the most room, without covering `avoidRect` when possible.
 */
export function computeSmartTooltipPlacement(input: SmartTooltipPlacementInput): SmartTooltipPlacement {
  const margin = input.margin ?? 10;
  const winW = input.viewportWidth ?? (typeof window !== "undefined" ? window.innerWidth : 1280);
  const winH = input.viewportHeight ?? (typeof window !== "undefined" ? window.innerHeight : 800);
  const { clientX: cx, clientY: cy, tooltipWidth: w, tooltipHeight: h } = input;
  const avoid = input.avoidRect ?? null;

  const anchors: CornerAnchor[] = ["top-left", "top-right", "bottom-left", "bottom-right"];

  let best: SmartTooltipPlacement | null = null;
  let bestScore = -Infinity;

  for (const anchor of anchors) {
    const { left, top } = cornerPosition(anchor, cx, cy, w, h);
    const rect = toRect(left, top, w, h);
    if (!fitsViewport(rect, margin, winW, winH)) continue;

    const cardOverlap = avoid ? overlapArea(rect, avoid, 6) : 0;
    if (cardOverlap > 0) continue;

    const score = expansionSpace(anchor, cx, cy, margin, winW, winH);
    if (score > bestScore) {
      bestScore = score;
      best = { left, top };
    }
  }

  if (best) return best;

  /** Soft fallback: allow viewport clamping, minimize card overlap. */
  for (const anchor of anchors) {
    const raw = cornerPosition(anchor, cx, cy, w, h);
    const clamped = clampToViewport(raw.left, raw.top, w, h, margin, winW, winH);
    const rect = toRect(clamped.left, clamped.top, w, h);
    const cardOverlap = avoid ? overlapArea(rect, avoid, 6) : 0;
    const viewportPenalty =
      (clamped.left !== raw.left ? 500 : 0) + (clamped.top !== raw.top ? 500 : 0);
    const score =
      expansionSpace(anchor, cx, cy, margin, winW, winH) -
      cardOverlap * 20 -
      viewportPenalty;
    if (score > bestScore) {
      bestScore = score;
      best = clamped;
    }
  }

  if (best) return best;

  return clampToViewport(cx, cy, w, h, margin, winW, winH);
}
