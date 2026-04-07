"use client";

import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

interface KpiCardProps {
  label: string;
  value: string;
  delta?: string;
  deltaDirection?: "up" | "down" | "flat";
  icon: LucideIcon;
  accentColor: string;
  accentRgb: string;
  index?: number;
}

export function KpiCard({
  label,
  value,
  delta,
  deltaDirection = "flat",
  icon: Icon,
  accentColor,
  accentRgb,
  index = 0,
}: KpiCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.06 }}
      className="group relative rounded-xl border border-white/[0.10] bg-white/[0.04] p-3 sm:p-4 backdrop-blur-sm transition-all duration-300 hover:border-white/[0.18] hover:bg-white/[0.07]"
      style={{
        boxShadow: `0 0 30px rgba(${accentRgb}, 0.03)`,
      }}
    >
      <div className="absolute top-0 left-0 right-0 h-[1px] rounded-t-xl opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ background: `linear-gradient(90deg, transparent, ${accentColor}40, transparent)` }}
      />

      <div className="flex items-center gap-1.5 mb-2">
        <div
          className="w-5 h-5 rounded-md flex items-center justify-center shrink-0"
          style={{ backgroundColor: `rgba(${accentRgb}, 0.12)` }}
        >
          <Icon className="w-3 h-3" style={{ color: accentColor }} />
        </div>
        <span className="text-[10px] sm:text-[11px] font-medium text-white/60 truncate">
          {label}
        </span>
      </div>

      <div className="text-base sm:text-xl font-bold text-white tabular-nums">
        {value}
      </div>

      {delta && (
        <div className={cn(
          "text-[10px] sm:text-xs font-semibold mt-0.5 tabular-nums",
          deltaDirection === "up" && "text-[#0BC18D]",
          deltaDirection === "down" && "text-[#FF6F69]",
          deltaDirection === "flat" && "text-white/60",
        )}>
          {delta}
        </div>
      )}
    </motion.div>
  );
}
