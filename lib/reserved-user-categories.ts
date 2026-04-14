import type { FlowType } from "@/lib/default-categories";

/**
 * Legacy reserved misc root name (before it was renamed to "Other").
 * Still blocked for new top-level names and rename targets. Match is case-insensitive on trim.
 */
const RESERVED_LEGACY_MISC_ROOT_LC = "other outflow";

export function isReservedOtherOutflowCategoryName(name: string): boolean {
  return name.trim().toLowerCase() === RESERVED_LEGACY_MISC_ROOT_LC;
}

/** Categories with flow_type = 'misc' are system-managed and locked from user edits. */
export function isMiscFlow(flowType: FlowType | null | undefined): boolean {
  return flowType === "misc";
}
