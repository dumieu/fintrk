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
  /** @deprecated use avoidRects */
  avoidRect?: RectLike | null;
  avoidRects?: RectLike[];
  margin?: number;
  /** Minimum gap between the cursor and the tooltip edge. */
  cursorGap?: number;
  viewportWidth?: number;
  viewportHeight?: number;
}

export interface SmartTooltipPlacement {
  left: number;
  top: number;
}

type Side = "right" | "left" | "bottom" | "top";

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

function availableSpace(
  side: Side,
  cx: number,
  cy: number,
  margin: number,
  winW: number,
  winH: number,
): number {
  switch (side) {
    case "right":
      return winW - margin - cx;
    case "left":
      return cx - margin;
    case "bottom":
      return winH - margin - cy;
    case "top":
      return cy - margin;
  }
}

function positionForSide(
  side: Side,
  cx: number,
  cy: number,
  w: number,
  h: number,
  gap: number,
): { left: number; top: number } {
  switch (side) {
    case "right":
      return { left: cx + gap, top: cy - h / 2 };
    case "left":
      return { left: cx - gap - w, top: cy - h / 2 };
    case "bottom":
      return { left: cx - w / 2, top: cy + gap };
    case "top":
      return { left: cx - w / 2, top: cy - gap - h };
  }
}

function cursorForbiddenZone(cx: number, cy: number, gap: number): RectLike {
  return {
    left: cx - gap,
    top: cy - gap,
    right: cx + gap,
    bottom: cy + gap,
  };
}

function overlapsCursor(rect: RectLike, cx: number, cy: number, gap: number): boolean {
  return overlapArea(rect, cursorForbiddenZone(cx, cy, gap)) > 0;
}

function totalAvoidOverlap(rect: RectLike, avoidRects: RectLike[]): number {
  return avoidRects.reduce((sum, zone) => sum + overlapArea(rect, zone, 4), 0);
}

/**
 * Place a tooltip beside the cursor on the side with the most room.
 * The panel never overlaps the pointer or the forbidden zone around it.
 */
export function computeSmartTooltipPlacement(input: SmartTooltipPlacementInput): SmartTooltipPlacement {
  const margin = input.margin ?? 10;
  const gap = input.cursorGap ?? 16;
  const winW = input.viewportWidth ?? (typeof window !== "undefined" ? window.innerWidth : 1280);
  const winH = input.viewportHeight ?? (typeof window !== "undefined" ? window.innerHeight : 800);
  const { clientX: cx, clientY: cy, tooltipWidth: w, tooltipHeight: h } = input;

  const avoidRects = [
    ...(input.avoidRects ?? []),
    ...(input.avoidRect ? [input.avoidRect] : []),
  ];

  const sides: Side[] = ["right", "left", "bottom", "top"];
  sides.sort((a, b) => availableSpace(b, cx, cy, margin, winW, winH) - availableSpace(a, cx, cy, margin, winW, winH));

  let best: SmartTooltipPlacement | null = null;
  let bestScore = -Infinity;

  for (const side of sides) {
    const raw = positionForSide(side, cx, cy, w, h, gap);
    const clamped = clampToViewport(raw.left, raw.top, w, h, margin, winW, winH);
    const rect = toRect(clamped.left, clamped.top, w, h);

    if (overlapsCursor(rect, cx, cy, gap)) continue;

    const avoidOverlap = totalAvoidOverlap(rect, avoidRects);
    if (avoidOverlap > 0) continue;

    const space = availableSpace(side, cx, cy, margin, winW, winH);
    const clampPenalty =
      (clamped.left !== raw.left ? 200 : 0) + (clamped.top !== raw.top ? 200 : 0);
    const score = space - clampPenalty;

    if (score > bestScore) {
      bestScore = score;
      best = clamped;
    }
  }

  if (best) return best;

  /** Soft fallback: keep cursor clear, minimize host overlap. */
  for (const side of sides) {
    const raw = positionForSide(side, cx, cy, w, h, gap);
    const clamped = clampToViewport(raw.left, raw.top, w, h, margin, winW, winH);
    const rect = toRect(clamped.left, clamped.top, w, h);

    if (overlapsCursor(rect, cx, cy, gap)) continue;

    const avoidOverlap = totalAvoidOverlap(rect, avoidRects);
    const clampPenalty =
      (clamped.left !== raw.left ? 200 : 0) + (clamped.top !== raw.top ? 200 : 0);
    const score =
      availableSpace(side, cx, cy, margin, winW, winH) -
      avoidOverlap * 30 -
      clampPenalty;

    if (score > bestScore) {
      bestScore = score;
      best = clamped;
    }
  }

  if (best) return best;

  /** Last resort: park in the corner farthest from the cursor. */
  const corners = [
    { left: margin, top: margin },
    { left: winW - margin - w, top: margin },
    { left: margin, top: winH - margin - h },
    { left: winW - margin - w, top: winH - margin - h },
  ];

  for (const corner of corners) {
    const rect = toRect(corner.left, corner.top, w, h);
    if (overlapsCursor(rect, cx, cy, gap)) continue;
    return corner;
  }

  return clampToViewport(cx + gap, cy + gap, w, h, margin, winW, winH);
}
