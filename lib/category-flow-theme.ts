import {
  MIND_MAP_INFLOW_PARENTS,
  MIND_MAP_OUTFLOW_PARENTS,
  MIND_MAP_SAVINGS_PARENTS,
  rollupInflowLabel,
  rollupOutflowLabel,
  rollupSavingsLabel,
} from "@/lib/mind-map-amount-rollup";

export type CategoryFlowTheme = "inflow" | "savings" | "outflow" | "unknown";

const inflow = new Set(MIND_MAP_INFLOW_PARENTS.map((s) => s.toLowerCase()));
const savings = new Set(MIND_MAP_SAVINGS_PARENTS.map((s) => s.toLowerCase()));
const outflow = new Set(MIND_MAP_OUTFLOW_PARENTS.map((s) => s.toLowerCase()));

/**
 * Maps a mind-map parent category name (top-level bucket in default taxonomy)
 * to Inflow / Savings & Investments / Outflow for UI theming.
 */
export function flowThemeForMindMapParentName(name: string): CategoryFlowTheme {
  const k = name.trim().toLowerCase();
  if (!k) return "unknown";
  if (inflow.has(k)) return "inflow";
  if (savings.has(k)) return "savings";
  if (outflow.has(k)) return "outflow";
  return "unknown";
}

/**
 * Resolve theme from a single label using the same rollups as the mind map
 * (AI names, DB leaf names, synonyms).
 */
function flowThemeForSingleLabel(raw: string): CategoryFlowTheme {
  const k = raw.trim();
  if (!k) return "unknown";
  // Savings first — narrow labels (brokerage, CPF, …) before broader "Investment" inflow.
  if (rollupSavingsLabel(k)) return "savings";
  if (rollupInflowLabel(k)) return "inflow";
  if (rollupOutflowLabel(k)) return "outflow";
  return flowThemeForMindMapParentName(k);
}

/**
 * Theme for a DB category row: tries leaf name, parent name, combined string,
 * then exact mind-map parent match. Matches how transactions are grouped in the mind map.
 */
export function flowThemeForCategoryNames(
  parentName: string | null | undefined,
  leafName: string,
): CategoryFlowTheme {
  const leaf = leafName.trim();
  if (!leaf) return "unknown";

  const parent = parentName?.trim() ?? "";

  const candidates: string[] = [leaf];
  if (parent) {
    candidates.push(parent);
    candidates.push(`${parent} ${leaf}`);
    candidates.push(`${parent} / ${leaf}`);
  }

  for (const c of candidates) {
    const t = flowThemeForSingleLabel(c);
    if (t !== "unknown") return t;
  }

  return "unknown";
}
