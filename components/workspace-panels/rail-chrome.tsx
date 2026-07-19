"use client";

import type { ReactNode } from "react";
import {
  PanelShortcutHint,
  type FintrkPanelArrow,
} from "@/components/workspace-panels/shortcuts";
import { cn } from "@/lib/utils";

export const FINTRK_PANEL_RAIL_LABEL_CLASS =
  "font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-[#34E6B0]";

export const FINTRK_PANEL_RAIL_DETAIL_CLASS =
  "font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-foreground";

export const FINTRK_PANEL_RAIL_CENTER_GAP_CLASS = "gap-2.5";

export function PanelRailGrip({
  orientation = "vertical",
  className,
}: {
  orientation?: "vertical" | "horizontal";
  className?: string;
}) {
  const vertical = orientation === "vertical";
  return (
    <span
      className={cn(
        "flex rounded-sm",
        vertical
          ? "flex-col items-center gap-[3px] py-1"
          : "items-center gap-px px-0.5",
        className,
      )}
      aria-hidden
    >
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={cn(
            "rounded-full bg-muted-foreground/50 transition group-hover:bg-[#34E6B0]",
            vertical ? "h-[2px] w-[7px]" : "h-px w-[2px]",
          )}
        />
      ))}
    </span>
  );
}

export function PanelRailStatusDot({
  active,
  className,
}: {
  active?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "absolute h-1.5 w-1.5 rounded-full",
        active ? "bg-[#0BC18D]" : "bg-chart-border",
        className,
      )}
      aria-hidden
    />
  );
}

export function PanelRailLabel({
  label,
  detail,
  orientation = "horizontal",
  className,
}: {
  label: string;
  detail?: string | null;
  orientation?: "horizontal" | "vertical";
  className?: string;
}) {
  if (orientation === "vertical") {
    return (
      <span
        className={cn(
          "max-h-[min(6rem,28vh)] truncate text-center [writing-mode:vertical-rl] rotate-180",
          FINTRK_PANEL_RAIL_LABEL_CLASS,
          className,
        )}
        aria-hidden
      >
        {label}
        {detail ? (
          <>
            <span className="text-muted-foreground/40"> &middot; </span>
            <span className={FINTRK_PANEL_RAIL_DETAIL_CLASS}>{detail}</span>
          </>
        ) : null}
      </span>
    );
  }

  return (
    <span className={cn(FINTRK_PANEL_RAIL_LABEL_CLASS, "text-center", className)} aria-hidden>
      {label}
      {detail ? (
        <span className={cn("ml-2", FINTRK_PANEL_RAIL_DETAIL_CLASS)}>{detail}</span>
      ) : null}
    </span>
  );
}

export function PanelRailCenter({
  label,
  detail,
  arrow,
  showShortcut = true,
  layout = "vertical",
  className,
}: {
  label: string;
  detail?: string | null;
  arrow: FintrkPanelArrow;
  showShortcut?: boolean;
  layout?: "vertical" | "horizontal";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-0 flex items-center justify-center",
        layout === "vertical"
          ? cn("flex-col", FINTRK_PANEL_RAIL_CENTER_GAP_CLASS)
          : cn("flex-row", FINTRK_PANEL_RAIL_CENTER_GAP_CLASS),
        className,
      )}
    >
      <PanelRailLabel label={label} detail={detail} orientation={layout} />
      {showShortcut ? (
        <PanelShortcutHint
          arrow={arrow}
          orientation={layout === "vertical" ? "vertical" : "horizontal"}
          compact={layout === "horizontal"}
        />
      ) : null}
    </div>
  );
}

export function PanelRailFooter({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center gap-1.5", className)}>{children}</div>
  );
}
