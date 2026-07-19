"use client";

import { motion } from "framer-motion";
import { ChevronUp } from "lucide-react";
import { useState } from "react";
import { BottomPanelResizeHandle } from "@/components/workspace-panels/bottom-resize-handle";
import {
  PanelRailCenter,
  PanelRailGrip,
  PanelRailStatusDot,
} from "@/components/workspace-panels/rail-chrome";
import { useFintrkPanelActionTitle } from "@/components/workspace-panels/shortcuts";
import {
  FINTRK_BOTTOM_PANEL_DEFAULT_H_PX,
  FINTRK_BOTTOM_PANEL_RAIL_H_PX,
} from "@/lib/workspace-panels/layout";
import { cn } from "@/lib/utils";

export function EmptyBottomDrawer({
  label = "Bottom",
  open,
  onOpen,
  onClose,
  panelHeightPx = FINTRK_BOTTOM_PANEL_DEFAULT_H_PX,
  onPanelHeightChange,
  overlay = false,
}: {
  label?: string;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  panelHeightPx?: number;
  onPanelHeightChange?: (heightPx: number) => void;
  /** When true, drawer floats over the main stage instead of pushing it. */
  overlay?: boolean;
}) {
  const [isResizing, setIsResizing] = useState(false);
  const toggleTitle = useFintrkPanelActionTitle(
    open ? `Minimize ${label}` : `Open ${label}`,
    "down",
  );

  return (
    <div
      className={cn(
        "fintrk-bottom-drawer z-40 flex min-w-0 flex-col",
        overlay
          ? "absolute inset-x-0 bottom-0"
          : "relative shrink-0",
      )}
      style={{
        height: open
          ? FINTRK_BOTTOM_PANEL_RAIL_H_PX + panelHeightPx
          : FINTRK_BOTTOM_PANEL_RAIL_H_PX,
      }}
    >
      <motion.div
        animate={{ height: open ? panelHeightPx : 0 }}
        transition={{ duration: 0.18, ease: [0.32, 0.72, 0, 1] }}
        className={cn(
          "relative min-h-0 overflow-hidden bg-chart-surface",
          open && "border-t border-[#0BC18D]/25 shadow-[0_-8px_32px_rgba(0,0,0,0.45)]",
          isResizing && "fintrk-bottom-panel-resizing",
        )}
      >
        {open ? (
          <>
            <BottomPanelResizeHandle
              heightPx={panelHeightPx}
              onHeightChange={(h) => onPanelHeightChange?.(h)}
              onDraggingChange={setIsResizing}
              disabled={!onPanelHeightChange}
              ariaLabel={`Resize ${label} panel`}
            />
            <div className="flex h-full min-h-0 flex-col bg-app-canvas pt-1.5">
              <div className="shrink-0 border-b border-chart-border px-4 py-2">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#34E6B0]">
                  {label}
                </p>
              </div>
              <div className="flex min-h-0 flex-1 items-center justify-center px-6 text-center">
                <p className="max-w-[16rem] text-sm text-muted-foreground">
                  Empty for now. Content goes here later.
                </p>
              </div>
            </div>
          </>
        ) : null}
      </motion.div>

      <button
        type="button"
        onClick={() => (open ? onClose() : onOpen())}
        title={toggleTitle}
        aria-expanded={open}
        aria-label={toggleTitle}
        className={cn(
          "group relative flex w-full shrink-0 items-center justify-center border-t border-chart-border bg-chart-surface/95 backdrop-blur-md",
          "transition-colors hover:bg-[#0BC18D]/[0.08]",
          open && "border-[#0BC18D]/40 bg-[#0BC18D]/[0.08]",
        )}
        style={{ height: FINTRK_BOTTOM_PANEL_RAIL_H_PX }}
      >
        <PanelRailStatusDot active={open} className="left-3 top-1/2 -translate-y-1/2" />
        <PanelRailCenter label={label} arrow="down" layout="horizontal" />
        <span className="absolute right-3 flex items-center gap-1.5">
          <PanelRailGrip orientation="horizontal" />
          <ChevronUp
            className={cn(
              "h-3.5 w-3.5 text-muted-foreground transition group-hover:text-[#34E6B0]",
              !open && "rotate-180",
            )}
            aria-hidden
          />
        </span>
      </button>
    </div>
  );
}
