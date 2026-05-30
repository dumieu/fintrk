"use client";

import { TimeSlicer } from "@/components/time-slicer";
import type { TimePresetId } from "@/lib/time-range-presets";

export function CashflowToolbar({
  activePreset,
  onTimePreset,
}: {
  activePreset: TimePresetId | null;
  onTimePreset: (preset: TimePresetId) => void;
}) {
  return <TimeSlicer activePreset={activePreset} onSelect={onTimePreset} />;
}
