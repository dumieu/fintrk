import type { FlowType } from "@/lib/default-categories";

/**
 * Reserved user category tree: top-level "Other Outflow" and all of its subcategories
 * are fixed (Category Mapping + API). Match is case-insensitive on trim.
 */
const RESERVED_OTHER_OUTFLOW_LC = "other outflow";

export function isReservedOtherOutflowCategoryName(name: string): boolean {
  return name.trim().toLowerCase() === RESERVED_OTHER_OUTFLOW_LC;
}

/** Categories with flow_type = 'misc' are system-managed and locked from user edits. */
export function isMiscFlow(flowType: FlowType | null | undefined): boolean {
  return flowType === "misc";
}
