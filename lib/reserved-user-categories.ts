import type { FlowType } from "@/lib/default-categories";

/**
 * Legacy guard — "Other Outflow" was previously the misc root name.
 * Now that "Other Outflow" is a legitimate outflow category,
 * this always returns false. Kept for call-site compatibility.
 */
export function isReservedOtherOutflowCategoryName(_name: string): boolean {
  return false;
}

/** Categories with flow_type = 'misc' are system-managed and locked from user edits. */
export function isMiscFlow(flowType: FlowType | null | undefined): boolean {
  return flowType === "misc";
}
