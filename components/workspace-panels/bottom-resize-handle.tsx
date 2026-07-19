"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  FINTRK_BOTTOM_PANEL_MIN_H_PX,
  clampFintrkBottomPanelHeightPx,
  getFintrkBottomPanelMaxHeightPx,
} from "@/lib/workspace-panels/layout";
import { cn } from "@/lib/utils";

export function BottomPanelResizeHandle({
  heightPx,
  onHeightChange,
  onDraggingChange,
  disabled = false,
  ariaLabel = "Resize bottom panel",
}: {
  heightPx: number;
  onHeightChange: (heightPx: number) => void;
  onDraggingChange?: (dragging: boolean) => void;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  const [dragging, setDragging] = useState(false);
  const [maxHeight, setMaxHeight] = useState(FINTRK_BOTTOM_PANEL_MIN_H_PX);
  const dragRef = useRef<{ startY: number; startHeight: number } | null>(null);

  const endDrag = useCallback(() => {
    dragRef.current = null;
    setDragging(false);
    onDraggingChange?.(false);
    document.body.classList.remove("fintrk-bottom-panel-resizing");
  }, [onDraggingChange]);

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const delta = drag.startY - e.clientY;
      onHeightChange(clampFintrkBottomPanelHeightPx(drag.startHeight + delta));
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
  }, [dragging, onHeightChange, endDrag]);

  useEffect(() => {
    const onResize = () => {
      setMaxHeight(getFintrkBottomPanelMaxHeightPx());
      onHeightChange(clampFintrkBottomPanelHeightPx(heightPx));
    };
    setMaxHeight(getFintrkBottomPanelMaxHeightPx());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [heightPx, onHeightChange]);

  return (
    <div
      role="separator"
      aria-orientation="horizontal"
      aria-label={ariaLabel}
      aria-valuemin={FINTRK_BOTTOM_PANEL_MIN_H_PX}
      aria-valuemax={maxHeight}
      aria-valuenow={heightPx}
      tabIndex={disabled ? -1 : 0}
      onKeyDown={(e) => {
        if (disabled) return;
        const step = e.shiftKey ? 48 : 16;
        if (e.key === "ArrowUp") {
          e.preventDefault();
          onHeightChange(clampFintrkBottomPanelHeightPx(heightPx + step));
        } else if (e.key === "ArrowDown") {
          e.preventDefault();
          onHeightChange(clampFintrkBottomPanelHeightPx(heightPx - step));
        }
      }}
      onPointerDown={(e) => {
        if (disabled) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        dragRef.current = { startY: e.clientY, startHeight: heightPx };
        setDragging(true);
        onDraggingChange?.(true);
        document.body.classList.add("fintrk-bottom-panel-resizing");
      }}
      className={cn(
        "absolute left-0 right-0 top-0 z-20 h-1.5 cursor-ns-resize touch-none",
        "hover:bg-[#0BC18D]/25 active:bg-[#0BC18D]/40",
        dragging && "bg-[#0BC18D]/35",
        disabled && "pointer-events-none opacity-0",
      )}
    />
  );
}
