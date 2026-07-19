"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useState, type ReactNode } from "react";
import {
  PanelRailCenter,
  PanelRailFooter,
  PanelRailGrip,
  PanelRailStatusDot,
} from "@/components/workspace-panels/rail-chrome";
import { SidePanelResizeHandle } from "@/components/workspace-panels/side-resize-handle";
import { useFintrkPanelActionTitle } from "@/components/workspace-panels/shortcuts";
import {
  FINTRK_SIDE_PANEL_RAIL_W_PX,
  FINTRK_SIDE_PANEL_W_PX,
  type FintrkSidePanelKnock,
} from "@/lib/workspace-panels/layout";
import { cn } from "@/lib/utils";

export function EmptySidePanel({
  side,
  label,
  expanded,
  onExpandedChange,
  panelWidthPx = FINTRK_SIDE_PANEL_W_PX,
  onPanelWidthChange,
  knock = null,
  overlay = false,
  bottomInsetPx = 0,
  children,
}: {
  side: "left" | "right";
  label: string;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  panelWidthPx?: number;
  onPanelWidthChange?: (widthPx: number) => void;
  knock?: FintrkSidePanelKnock;
  /** When true, panel floats over the main stage instead of pushing it. */
  overlay?: boolean;
  /** Reserve space above the bottom drawer rail / panel. */
  bottomInsetPx?: number;
  children?: ReactNode;
}) {
  const [isResizing, setIsResizing] = useState(false);
  const arrow = side === "left" ? "left" : "right";
  const toggleTitle = useFintrkPanelActionTitle(
    expanded ? `Minimize ${label}` : `Open ${label}`,
    arrow,
  );
  const open = expanded;

  const toggleOpen = useCallback(() => {
    onExpandedChange(!expanded);
  }, [expanded, onExpandedChange]);

  const Chevron = side === "left" ? ChevronRight : ChevronLeft;
  const chevronDir = open
    ? side === "left"
      ? "left"
      : "right"
    : side === "left"
      ? "right"
      : "left";

  return (
    <aside
      role="complementary"
      aria-label={label}
      data-fintrk-side-panel={side}
      data-knock={knock || undefined}
      className={cn(
        "fintrk-side-panel z-30 flex flex-row",
        overlay
          ? cn(
              "absolute top-0",
              side === "left" ? "left-0" : "right-0",
            )
          : "relative shrink-0 self-start",
        side === "left" ? "fintrk-side-panel--left" : "fintrk-side-panel--right",
        isResizing && "fintrk-side-panel-resizing",
      )}
      style={{
        width: open
          ? FINTRK_SIDE_PANEL_RAIL_W_PX + panelWidthPx
          : FINTRK_SIDE_PANEL_RAIL_W_PX,
        ...(overlay
          ? { top: 0, bottom: bottomInsetPx, height: "auto" }
          : {}),
      }}
    >
      {side === "left" ? (
        <>
          <button
            type="button"
            onClick={toggleOpen}
            title={toggleTitle}
            aria-expanded={open}
            aria-label={toggleTitle}
            className={cn(
              "group relative flex h-full shrink-0 flex-col items-center border-r border-chart-border bg-chart-surface/95 backdrop-blur-md",
              "transition-colors hover:bg-[#0BC18D]/[0.08]",
              open && "border-[#0BC18D]/40 bg-[#0BC18D]/[0.08]",
            )}
            style={{ width: FINTRK_SIDE_PANEL_RAIL_W_PX }}
          >
            <PanelRailStatusDot active={open} className="left-1/2 top-2 -translate-x-1/2" />
            <PanelRailCenter label={label} arrow="left" layout="vertical" />
            <PanelRailFooter className="mt-auto pb-2">
              <PanelRailGrip orientation="vertical" />
              <Chevron
                className={cn(
                  "h-3.5 w-3.5 text-muted-foreground transition group-hover:text-[#34E6B0]",
                  chevronDir === "left" && "rotate-180",
                )}
                aria-hidden
              />
            </PanelRailFooter>
          </button>
          <div
            aria-hidden={!open}
            className={cn(
              "relative min-w-0 overflow-hidden border-r border-[#0BC18D]/40 bg-chart-surface",
              open
                ? "shadow-[4px_0_56px_rgba(0,0,0,0.55)]"
                : "pointer-events-none border-transparent shadow-none",
            )}
            style={{ width: open ? panelWidthPx : 0 }}
          >
            {open ? (
              <>
                <SidePanelResizeHandle
                  widthPx={panelWidthPx}
                  onWidthChange={(w) => onPanelWidthChange?.(w)}
                  onDraggingChange={setIsResizing}
                  edge="right"
                  ariaLabel={`Resize ${label} panel`}
                  disabled={!onPanelWidthChange}
                />
                <PanelBody label={label}>{children}</PanelBody>
              </>
            ) : null}
          </div>
        </>
      ) : (
        <>
          <div
            aria-hidden={!open}
            className={cn(
              "relative min-w-0 overflow-hidden border-l border-[#0BC18D]/40 bg-chart-surface",
              open
                ? "shadow-[-16px_0_56px_rgba(0,0,0,0.55)]"
                : "pointer-events-none border-transparent shadow-none",
            )}
            style={{ width: open ? panelWidthPx : 0 }}
          >
            {open ? (
              <>
                <SidePanelResizeHandle
                  widthPx={panelWidthPx}
                  onWidthChange={(w) => onPanelWidthChange?.(w)}
                  onDraggingChange={setIsResizing}
                  edge="left"
                  ariaLabel={`Resize ${label} panel`}
                  disabled={!onPanelWidthChange}
                />
                <PanelBody label={label}>{children}</PanelBody>
              </>
            ) : null}
          </div>
          <button
            type="button"
            onClick={toggleOpen}
            title={toggleTitle}
            aria-expanded={open}
            aria-label={toggleTitle}
            className={cn(
              "group relative flex h-full shrink-0 flex-col items-center border-l border-chart-border bg-chart-surface/95 backdrop-blur-md",
              "transition-colors hover:bg-[#0BC18D]/[0.08]",
              open && "border-[#0BC18D]/40 bg-[#0BC18D]/[0.08]",
            )}
            style={{ width: FINTRK_SIDE_PANEL_RAIL_W_PX }}
          >
            <PanelRailStatusDot active={open} className="left-1/2 top-2 -translate-x-1/2" />
            <PanelRailCenter label={label} arrow="right" layout="vertical" />
            <PanelRailFooter className="mt-auto pb-2">
              <PanelRailGrip orientation="vertical" />
              <Chevron
                className={cn(
                  "h-3.5 w-3.5 text-muted-foreground transition group-hover:text-[#34E6B0]",
                  chevronDir === "right" && "rotate-180",
                )}
                aria-hidden
              />
            </PanelRailFooter>
          </button>
        </>
      )}
    </aside>
  );
}

function PanelBody({ label, children }: { label: string; children?: ReactNode }) {
  if (children) {
    return (
      <div className="flex h-full min-h-0 flex-col overflow-hidden bg-app-canvas">
        {children}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-app-canvas">
      <div className="shrink-0 border-b border-chart-border px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#34E6B0]">
          {label}
        </p>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center px-6 text-center">
        <p className="max-w-[14rem] text-sm text-muted-foreground">
          Empty for now. Content goes here later.
        </p>
      </div>
    </div>
  );
}
