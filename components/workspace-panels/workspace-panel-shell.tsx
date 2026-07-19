"use client";

import {
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { EmptyBottomDrawer } from "@/components/workspace-panels/empty-bottom-drawer";
import { EmptySidePanel } from "@/components/workspace-panels/empty-side-panel";
import {
  isEditableTarget,
  isFintrkPanelShortcut,
} from "@/components/workspace-panels/shortcuts";
import {
  FINTRK_BOTTOM_PANEL_DEFAULT_H_PX,
  FINTRK_SIDE_PANEL_W_PX,
  clampFintrkBottomPanelHeightPx,
  clampFintrkSidePanelWidthPx,
  fintrkBottomPanelOccupiedHeightPx,
  getFintrkSidePanelDefaultWidthPx,
  type FintrkSidePanelKnock,
} from "@/lib/workspace-panels/layout";
import { cn } from "@/lib/utils";

const KNOCK_MS = 450;

/**
 * Workspace chrome: left / right / bottom panels overlay the main stage
 * (they do not push layout). No top panel.
 *
 * Shortcuts (capture phase, ignored while typing):
 * - Escape → minimize all
 * - Cmd/Ctrl+← → toggle left
 * - Cmd/Ctrl+→ → toggle right
 * - Cmd/Ctrl+↓ → toggle bottom
 */
export function WorkspacePanelShell({
  children,
  leftLabel = "Left",
  rightLabel = "Right",
  bottomLabel = "Bottom",
  leftContent,
  /** `scroll` for long pages (analytics); `fill` for viewport-locked pages (cashflow). */
  centerMode = "scroll",
  className,
}: {
  children: ReactNode;
  leftLabel?: string;
  rightLabel?: string;
  bottomLabel?: string;
  /** Optional body for the left panel (replaces empty placeholder). */
  leftContent?: ReactNode;
  centerMode?: "scroll" | "fill";
  className?: string;
}) {
  const [leftOpen, setLeftOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(false);
  const [bottomOpen, setBottomOpen] = useState(false);
  const [leftWidthPx, setLeftWidthPx] = useState(FINTRK_SIDE_PANEL_W_PX);
  const [rightWidthPx, setRightWidthPx] = useState(FINTRK_SIDE_PANEL_W_PX);
  const [bottomHeightPx, setBottomHeightPx] = useState(FINTRK_BOTTOM_PANEL_DEFAULT_H_PX);
  const [leftKnock, setLeftKnock] = useState<FintrkSidePanelKnock>(null);
  const [rightKnock, setRightKnock] = useState<FintrkSidePanelKnock>(null);

  useEffect(() => {
    setLeftWidthPx(getFintrkSidePanelDefaultWidthPx());
    setRightWidthPx(getFintrkSidePanelDefaultWidthPx());
  }, []);

  const clearKnockSoon = useCallback(() => {
    window.setTimeout(() => {
      setLeftKnock(null);
      setRightKnock(null);
    }, KNOCK_MS);
  }, []);

  const openLeftExclusive = useCallback(
    (next: boolean) => {
      if (next) {
        setLeftOpen(true);
        setLeftKnock("charge");
        if (rightOpen) {
          setRightOpen(false);
          setRightKnock("retreat-right");
        }
        clearKnockSoon();
        return;
      }
      setLeftOpen(false);
    },
    [rightOpen, clearKnockSoon],
  );

  const openRightExclusive = useCallback(
    (next: boolean) => {
      if (next) {
        setRightOpen(true);
        setRightKnock("charge");
        if (leftOpen) {
          setLeftOpen(false);
          setLeftKnock("retreat-left");
        }
        clearKnockSoon();
        return;
      }
      setRightOpen(false);
    },
    [leftOpen, clearKnockSoon],
  );

  const minimizeAll = useCallback(() => {
    setLeftOpen(false);
    setRightOpen(false);
    setBottomOpen(false);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (isEditableTarget(e.target)) return;
      e.preventDefault();
      minimizeAll();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [minimizeAll]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return;
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return;
      if (!isFintrkPanelShortcut(e)) return;
      if (e.key === "ArrowUp") return;
      e.preventDefault();
      switch (e.key) {
        case "ArrowLeft":
          openLeftExclusive(!leftOpen);
          break;
        case "ArrowRight":
          openRightExclusive(!rightOpen);
          break;
        case "ArrowDown":
          setBottomOpen((v) => !v);
          break;
        default:
          break;
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [leftOpen, rightOpen, openLeftExclusive, openRightExclusive]);

  useEffect(() => {
    if (!leftOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target;
      if (!(target instanceof Element)) return;
      if (target.closest('[data-fintrk-side-panel="left"]')) return;
      openLeftExclusive(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [leftOpen, openLeftExclusive]);

  const peg = leftOpen ? "left" : rightOpen ? "right" : undefined;
  const bottomInsetPx = fintrkBottomPanelOccupiedHeightPx(bottomOpen, bottomHeightPx);

  return (
    <div
      className={cn(
        "relative flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden bg-app-canvas",
        className,
      )}
    >
      {/* Main stage — full bleed; panels overlay on top */}
      <div
        className="fintrk-side-panel-stage absolute inset-0 z-0 flex min-h-0 min-w-0 flex-col overflow-hidden"
        data-peg={peg}
      >
        <div
          className={
            centerMode === "fill"
              ? "flex min-h-0 flex-1 flex-col overflow-hidden"
              : "min-h-0 flex-1 overflow-x-clip overflow-y-auto overscroll-y-contain"
          }
        >
          {children}
        </div>
      </div>

      <EmptySidePanel
        side="left"
        label={leftLabel}
        expanded={leftOpen}
        onExpandedChange={openLeftExclusive}
        panelWidthPx={leftWidthPx}
        onPanelWidthChange={(w) => setLeftWidthPx(clampFintrkSidePanelWidthPx(w))}
        knock={leftKnock}
        overlay
        bottomInsetPx={bottomInsetPx}
      >
        {leftContent}
      </EmptySidePanel>

      <EmptySidePanel
        side="right"
        label={rightLabel}
        expanded={rightOpen}
        onExpandedChange={openRightExclusive}
        panelWidthPx={rightWidthPx}
        onPanelWidthChange={(w) => setRightWidthPx(clampFintrkSidePanelWidthPx(w))}
        knock={rightKnock}
        overlay
        bottomInsetPx={bottomInsetPx}
      />

      <EmptyBottomDrawer
        label={bottomLabel}
        open={bottomOpen}
        onOpen={() => setBottomOpen(true)}
        onClose={() => setBottomOpen(false)}
        panelHeightPx={bottomHeightPx}
        onPanelHeightChange={(h) =>
          setBottomHeightPx(clampFintrkBottomPanelHeightPx(h))
        }
        overlay
      />
    </div>
  );
}
