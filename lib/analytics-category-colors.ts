/**
 * Canonical rollup category colors for Spending Intelligence.
 * Monthly stacks, category breakdown, and merchant pills must all use this map.
 *
 * Each rollup gets a distinct jewel tone tuned for dark UI: high enough chroma
 * to read on #111 backgrounds, spaced across hue wheel to avoid collisions.
 */
export const ANALYTICS_CATEGORY_COLORS: Record<string, string> = {
  Income: "#34D399",
  Tax: "#F25555",
  Household: "#4A9EFF",
  Transportation: "#A67CFF",
  Shopping: "#40C4E0",
  Entertainment: "#FF5C8A",
  "Health & Fitness": "#3DDC97",
  Financial: "#708EFF",
  Travel: "#FFBE3D",
  Education: "#9575FF",
  "Gifts & Donations": "#FF9166",
  "Other Outflow": "#78909C",
  Transfers: "#64748B",
  "Other Misc": "#64748B",
  Uncategorized: "#64748B",
  /** Legacy / alias labels */
  Health: "#3DDC97",
  Housing: "#4A9EFF",
  Transport: "#A67CFF",
  "Food & Drink": "#FFA726",
  Groceries: "#FFA726",
  Restaurants: "#FFA726",
  "Restaurant & Entertain": "#FF5C8A",
  Helper: "#7ECEFD",
  "School & Extracur": "#9575FF",
  Other: "#64748B",
};

/** Deterministic fallback when a rollup name is not in the map. */
export function hashCategoryColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  const hue = (h * 137.508) % 360;
  return `hsl(${hue.toFixed(1)} 62% 58%)`;
}

/** Color for a rollup (parent) category name. */
export function analyticsCategoryColor(rollupName: string): string {
  return ANALYTICS_CATEGORY_COLORS[rollupName] ?? hashCategoryColor(rollupName);
}

/**
 * Color for a subcategory row in merchant pills and similar UI.
 * Subcategories inherit their parent rollup color when a parent exists.
 */
export function analyticsSubcategoryColor(
  parentName: string | null | undefined,
  subcategoryName: string,
): string {
  if (parentName) return analyticsCategoryColor(parentName);
  return analyticsCategoryColor(subcategoryName);
}

/** Distinct stack segment color per subcategory within a parent drill-down. */
export function analyticsSubcategoryStackColor(
  parentName: string,
  subcategoryName: string,
): string {
  return hashCategoryColor(`${parentName}::${subcategoryName}`);
}

function parseHexColor(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace("#", "");
  if (h.length !== 6) return { r: 128, g: 128, b: 128 };
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      default:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }
  return { h: h * 360, s: s * 100, l: l * 100 };
}

function hslToHex(h: number, s: number, l: number): string {
  const sat = s / 100;
  const lit = l / 100;
  const a = sat * Math.min(lit, 1 - lit);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = lit - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/**
 * Monochromatic drill-down palette for a parent category.
 * Highest average monthly subcategory spend gets the darkest hue; lighter steps
 * for smaller averages, all sharing the parent hue family.
 */
export function buildSubcategoryDrilldownColors(
  parentCategory: string,
  subcategoryTotals: Map<string, number>,
  monthCount: number,
): Map<string, string> {
  const { r, g, b } = parseHexColor(analyticsCategoryColor(parentCategory));
  const { h, s } = rgbToHsl(r, g, b);
  const months = Math.max(1, monthCount);

  const ranked = Array.from(subcategoryTotals.entries())
    .map(([name, total]) => ({ name, avgMonthly: total / months }))
    .sort((a, b) => b.avgMonthly - a.avgMonthly);

  const out = new Map<string, string>();
  const n = ranked.length;
  if (n === 0) return out;

  const minL = 28;
  const maxL = 74;

  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : i / (n - 1);
    const lightness = minL + t * (maxL - minL);
    const saturation = Math.min(90, Math.max(48, s + t * 10));
    out.set(ranked[i].name, hslToHex(h, saturation, lightness));
  }

  return out;
}

function slugCategory(name: string): string {
  return name.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase();
}

/** Stable SVG gradient id for a category fill. */
export function analyticsCategoryGradientId(name: string): string {
  return `fintrk-cat-${slugCategory(name)}`;
}

/** Lighter stop for vertical bar gradients on dark charts. */
export function analyticsCategoryGradientTop(base: string): string {
  if (base.startsWith("hsl")) {
    return base.replace(/(\d+(?:\.\d+)?)%\)/, (_, l) => `${Math.min(72, parseFloat(l) + 14)}%)`);
  }
  const hex = base.replace("#", "");
  if (hex.length !== 6) return base;
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const mix = (c: number) => Math.min(255, Math.round(c + (255 - c) * 0.28));
  return `#${mix(r).toString(16).padStart(2, "0")}${mix(g).toString(16).padStart(2, "0")}${mix(b).toString(16).padStart(2, "0")}`;
}

/** Soft glow for swatches and bar highlights. */
export function analyticsCategoryGlow(base: string, alpha = 0.45): string {
  if (base.startsWith("hsl")) return base.replace(")", ` / ${alpha})`).replace("hsl(", "hsla(");
  const hex = base.replace("#", "");
  if (hex.length !== 6) return `rgba(255,255,255,${alpha})`;
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Pick white or near-black label text for a solid category swatch. */
export function analyticsCategoryLabelTone(base: string): "light" | "dark" {
  if (base.startsWith("hsl")) return "light";
  const hex = base.replace("#", "");
  if (hex.length !== 6) return "light";
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const luminance = (r * 299 + g * 587 + b * 114) / 1000;
  return luminance > 168 ? "dark" : "light";
}
