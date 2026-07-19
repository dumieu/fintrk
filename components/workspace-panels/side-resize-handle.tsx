"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  FINTRK_SIDE_PANEL_W_PX,
  clampFintrkSidePanelWidthPx,
  getFintrkSidePanelMaxWidthPx,
  getFintrkSidePanelMinWidthPx,
} from "@/lib/workspace-panels/layout";
import { cn } from "@/lib/utils";

export function SidePanelResizeHandle({
  widthPx,
  onWidthChange,
  onDraggingChange,
  disabled = false,
  edge = "left",
  ariaLabel = "Resize panel",
}: {
  widthPx: number;
  onWidthChange: (widthPx: number) => void;
  onDraggingChange?: (dragging: boolean) => void;
  disabled?: boolean;
  /** Inner edge of a right-docked panel ("left") or left-docked panel ("right"). */
  edge?: "left" | "right";
  ariaLabel?: string;
}) {
  const [dragging, setDragging] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [maxWidth, setMaxWidth] = useState(FINTRK_SIDE_PANEL_W_PX);
  const [minWidth, setMinWidth] = useState(FINTRK_SIDE_PANEL_W_PX);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);

  const endDrag = useCallback(() => {
    dragRef.current = null;
    setDragging(false);
    onDraggingChange?.(false);
    document.body.classList.remove("fintrk-side-panel-resizing");
  }, [onDraggingChange]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const delta =
        edge === "right" ? e.clientX - drag.startX : drag.startX - e.clientX;
      onWidthChange(clampFintrkSidePanelWidthPx(drag.startWidth + delta));
    };
    const onUp = () => endDrag();
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [dragging, onWidthChange, endDrag, edge]);

  useEffect(() => {
    const onResize = () => {
      setMaxWidth(getFintrkSidePanelMaxWidthPx());
      setMinWidth(getFintrkSidePanelMinWidthPx());
      onWidthChange(clampFintrkSidePanelWidthPx(widthPx));
    };
    setMaxWidth(getFintrkSidePanelMaxWidthPx());
    setMinWidth(getFintrkSidePanelMinWidthPx());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [widthPx, onWidthChange]);

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={ariaLabel}
      aria-valuemin={minWidth}
      aria-valuemax={maxWidth}
      aria-valuenow={mounted ? widthPx : FINTRK_SIDE_PANEL_W_PX}
      tabIndex={disabled ? -1 : 0}
      onKeyDown={(e) => {
        if (disabled) return;
        const step = e.shiftKey ? 48 : 16;
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          onWidthChange(
            clampFintrkSidePanelWidthPx(widthPx + (edge === "right" ? -step : step)),
          );
        } else if (e.key === "ArrowRight") {
          e.preventDefault();
          onWidthChange(
            clampFintrkSidePanelWidthPx(widthPx + (edge === "right" ? step : -step)),
          );
        }
      }}
      onPointerDown={(e) => {
        if (disabled) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        dragRef.current = { startX: e.clientX, startWidth: widthPx };
        setDragging(true);
        onDraggingChange?.(true);
        document.body.classList.add("fintrk-side-panel-resizing");
      }}
      className={cn(
        "absolute top-0 z-20 h-full w-1.5 cursor-ew-resize touch-none",
        "hover:bg-[#0BC18D]/25 active:bg-[#0BC18D]/40",
        edge === "left" ? "left-0" : "right-0",
        dragging && "bg-[#0BC18D]/35",
        disabled && "pointer-events-none opacity-0",
      )}
    />
  );
}
