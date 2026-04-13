"use client";

import { LayoutGrid } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getTransactionCategoryVisual,
  type CategoryVisualVariant,
} from "@/lib/transaction-category-visual";

const VARIANT: Record<
  CategoryVisualVariant,
  {
    ring: string;
    inner: string;
    icon: string;
    glow: string;
  }
> = {
  violet: {
    ring: "from-[#A78BFA]/55 via-[#7C3AED]/35 to-[#4C1D95]/40",
    inner: "bg-[#0c0a14]/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]",
    icon: "text-[#DDD6FE] drop-shadow-[0_0_10px_rgba(167,139,250,0.45)]",
    glow: "shadow-[0_0_22px_-6px_rgba(139,92,246,0.55)]",
  },
  emerald: {
    ring: "from-[#34D399]/50 via-[#059669]/35 to-[#064E3B]/45",
    inner: "bg-[#0a1412]/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]",
    icon: "text-[#A7F3D0] drop-shadow-[0_0_10px_rgba(52,211,153,0.4)]",
    glow: "shadow-[0_0_22px_-6px_rgba(16,185,129,0.45)]",
  },
  cyan: {
    ring: "from-[#22D3EE]/55 via-[#0891B2]/40 to-[#164E63]/45",
    inner: "bg-[#0a1214]/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]",
    icon: "text-[#A5F3FC] drop-shadow-[0_0_10px_rgba(34,211,238,0.45)]",
    glow: "shadow-[0_0_22px_-6px_rgba(6,182,212,0.5)]",
  },
  amber: {
    ring: "from-[#FBBF24]/50 via-[#D97706]/38 to-[#78350F]/42",
    inner: "bg-[#14100a]/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]",
    icon: "text-[#FDE68A] drop-shadow-[0_0_10px_rgba(251,191,36,0.4)]",
    glow: "shadow-[0_0_22px_-6px_rgba(245,158,11,0.45)]",
  },
  rose: {
    ring: "from-[#FB7185]/50 via-[#E11D48]/38 to-[#881337]/42",
    inner: "bg-[#140a10]/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]",
    icon: "text-[#FECDD3] drop-shadow-[0_0_10px_rgba(251,113,133,0.45)]",
    glow: "shadow-[0_0_22px_-6px_rgba(244,63,94,0.45)]",
  },
  sky: {
    ring: "from-[#38BDF8]/50 via-[#0284C7]/38 to-[#0C4A6E]/45",
    inner: "bg-[#0a1018]/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]",
    icon: "text-[#BAE6FD] drop-shadow-[0_0_10px_rgba(56,189,248,0.4)]",
    glow: "shadow-[0_0_22px_-6px_rgba(14,165,233,0.45)]",
  },
  fuchsia: {
    ring: "from-[#E879F9]/52 via-[#C026D3]/40 to-[#701A75]/42",
    inner: "bg-[#120a14]/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]",
    icon: "text-[#F5D0FE] drop-shadow-[0_0_10px_rgba(232,121,249,0.45)]",
    glow: "shadow-[0_0_22px_-6px_rgba(217,70,239,0.5)]",
  },
  orange: {
    ring: "from-[#FB923C]/52 via-[#EA580C]/40 to-[#7C2D12]/42",
    inner: "bg-[#140c08]/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]",
    icon: "text-[#FED7AA] drop-shadow-[0_0_10px_rgba(251,146,60,0.4)]",
    glow: "shadow-[0_0_22px_-6px_rgba(249,115,22,0.45)]",
  },
  lime: {
    ring: "from-[#A3E635]/48 via-[#65A30D]/38 to-[#365314]/42",
    inner: "bg-[#0f140a]/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]",
    icon: "text-[#D9F99D] drop-shadow-[0_0_10px_rgba(163,230,53,0.35)]",
    glow: "shadow-[0_0_22px_-6px_rgba(132,204,22,0.4)]",
  },
  slate: {
    ring: "from-white/25 via-white/12 to-white/[0.07]",
    inner: "bg-[#0b0d12]/92 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]",
    icon: "text-white/70 drop-shadow-[0_0_8px_rgba(255,255,255,0.15)]",
    glow: "shadow-[0_0_18px_-8px_rgba(148,163,184,0.35)]",
  },
};

type TransactionCategoryIconBase = {
  /** `md` = table cell; `sm` = compact row; `xs` = chip height (~h-6) with time-slicer row. */
  size?: "md" | "sm" | "xs";
  className?: string;
  /** Slate-only shell (e.g. neutral category slicer chips). */
  monochrome?: boolean;
};

export type TransactionCategoryIconProps =
  | (TransactionCategoryIconBase & {
      preset: "all";
    })
  | (TransactionCategoryIconBase & {
      categoryName: string | null;
      subcategoryName: string | null;
    });

function iconBoxClasses(size: "md" | "sm" | "xs" | undefined) {
  const s = size ?? "md";
  if (s === "xs") {
    return {
      outer: "h-5 w-5 rounded-lg",
      inner: "rounded-[7px]",
      icon: "h-3 w-3",
    };
  }
  if (s === "sm") {
    return {
      outer: "h-7 w-7 min-h-[1.75rem] rounded-xl",
      inner: "rounded-[9px]",
      icon: "h-3.5 w-3.5",
    };
  }
  return {
    outer: "h-[2.65rem] w-[2.65rem] rounded-xl",
    inner: "rounded-[11px]",
    icon: "h-[19px] w-[19px]",
  };
}

export function TransactionCategoryIcon(props: TransactionCategoryIconProps) {
  const className = props.className;
  const mono = props.monochrome === true;
  const box = iconBoxClasses(props.size);

  if ("preset" in props && props.preset === "all") {
    const v = VARIANT.slate;
    const Icon = LayoutGrid;
    return (
      <div
        className={cn(
          "flex shrink-0 bg-gradient-to-br p-px",
          box.outer,
          mono ? "from-white/20 via-white/10 to-white/[0.06] shadow-none" : v.ring,
          mono ? "" : v.glow,
          className,
        )}
        aria-hidden
      >
        <div
          className={cn(
            "flex h-full w-full items-center justify-center backdrop-blur-sm",
            box.inner,
            mono ? "bg-[#0b0d12]/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]" : v.inner,
          )}
        >
          <Icon
            className={cn(mono ? "text-white/55 drop-shadow-none" : v.icon, box.icon)}
            strokeWidth={2}
          />
        </div>
      </div>
    );
  }

  const {
    categoryName,
    subcategoryName,
  } = props as Extract<TransactionCategoryIconProps, { categoryName: string | null }>;
  const { Icon, variant } = getTransactionCategoryVisual(
    categoryName,
    subcategoryName,
  );
  const v = VARIANT[mono ? "slate" : variant];

  return (
    <div
      className={cn(
        "flex shrink-0 bg-gradient-to-br p-px",
        box.outer,
        mono ? "from-white/20 via-white/10 to-white/[0.06] shadow-none" : v.ring,
        mono ? "" : v.glow,
        className,
      )}
      aria-hidden
    >
      <div
        className={cn(
          "flex h-full w-full items-center justify-center backdrop-blur-sm",
          box.inner,
          mono ? "bg-[#0b0d12]/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]" : v.inner,
        )}
      >
        <Icon
          className={cn(mono ? "text-white/55 drop-shadow-none" : v.icon, box.icon)}
          strokeWidth={2}
        />
      </div>
    </div>
  );
}
