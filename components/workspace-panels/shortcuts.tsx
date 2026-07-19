"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export type FintrkPanelArrow = "left" | "down" | "right" | "up";

export function detectMacOs(): boolean {
  if (typeof navigator === "undefined") return false;
  const uaData = (
    navigator as Navigator & { userAgentData?: { platform?: string } }
  ).userAgentData;
  if (uaData?.platform) return /mac/i.test(uaData.platform);
  return (
    /Mac|iPhone|iPad|iPod/.test(navigator.platform) ||
    /Mac OS|Macintosh/.test(navigator.userAgent)
  );
}

export function getModKeyGlyph(isMac: boolean): string {
  return isMac ? "\u2318" : "Ctrl";
}

export function getArrowGlyph(arrow: FintrkPanelArrow): string {
  if (arrow === "left") return "\u2190";
  if (arrow === "down") return "\u2193";
  if (arrow === "up") return "\u2191";
  return "\u2192";
}

export function formatFintrkPanelShortcut(
  arrow: FintrkPanelArrow,
  isMac = detectMacOs(),
): string {
  return `${getModKeyGlyph(isMac)}${getArrowGlyph(arrow)}`;
}

export function useFintrkModKey(): {
  isMac: boolean;
  glyph: string;
  ready: boolean;
} {
  const [state, setState] = useState(() => ({
    isMac: typeof navigator !== "undefined" ? detectMacOs() : false,
    ready: typeof navigator !== "undefined",
  }));

  useEffect(() => {
    setState({ isMac: detectMacOs(), ready: true });
  }, []);

  return {
    isMac: state.isMac,
    glyph: getModKeyGlyph(state.isMac),
    ready: state.ready,
  };
}

export function useFintrkPanelActionTitle(
  action: string,
  arrow: FintrkPanelArrow,
): string {
  const { isMac, ready } = useFintrkModKey();
  if (!ready) return action;
  return `${action} (${formatFintrkPanelShortcut(arrow, isMac)})`;
}

/** OS-aware shortcut chip for panel rails. */
export function PanelShortcutHint({
  arrow,
  label,
  className,
  compact = false,
  orientation = "horizontal",
}: {
  arrow: FintrkPanelArrow;
  label?: string;
  className?: string;
  compact?: boolean;
  orientation?: "horizontal" | "vertical";
}) {
  const { isMac, glyph, ready } = useFintrkModKey();
  const arrowChar = getArrowGlyph(arrow);
  const combo = ready ? formatFintrkPanelShortcut(arrow, isMac) : arrowChar;
  const aria = label ? `${label} (${combo})` : `Toggle (${combo})`;

  const chip = (
    <kbd
      className={cn(
        "fintrk-panel-kbd",
        orientation === "vertical"
          ? "fintrk-panel-kbd--stack"
          : compact
            ? "fintrk-panel-kbd--compact"
            : "fintrk-panel-kbd--rail",
        !ready && "fintrk-panel-kbd--pending",
      )}
      suppressHydrationWarning
    >
      <span
        className={cn(
          "fintrk-panel-kbd-mod",
          isMac && "fintrk-panel-kbd-mod--mac",
        )}
        suppressHydrationWarning
      >
        {ready ? glyph : "\u00A0"}
      </span>
      {orientation === "horizontal" ? (
        <span className="fintrk-panel-kbd-sep" aria-hidden>
          {isMac ? "" : "+"}
        </span>
      ) : null}
      <span className="fintrk-panel-kbd-arrow">{arrowChar}</span>
    </kbd>
  );

  return (
    <span
      className={cn(
        "inline-flex select-none items-center text-muted-foreground",
        compact ? "gap-1" : "gap-1.5",
        className,
      )}
      aria-label={aria}
      title={aria}
    >
      {!compact && label ? (
        <span className="text-[10px] uppercase tracking-[0.14em]">{label}</span>
      ) : null}
      {!compact && label ? (
        <span className="text-[10px] text-muted-foreground/50" aria-hidden>
          &middot;
        </span>
      ) : null}
      {chip}
    </span>
  );
}

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return target.isContentEditable;
}

/** Cmd/Ctrl + arrow (no Alt/Shift), not while typing. */
export function isFintrkPanelShortcut(e: KeyboardEvent): boolean {
  if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return false;
  if (isEditableTarget(e.target)) return false;
  return (
    e.key === "ArrowLeft" ||
    e.key === "ArrowRight" ||
    e.key === "ArrowDown" ||
    e.key === "ArrowUp"
  );
}
