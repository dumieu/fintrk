/** Leaf subcategory discretionary type (DB enum ↔ chart labels). */

export type DiscretionaryTypeSlug =
  | "non-discretionary"
  | "semi-discretionary"
  | "discretionary";

export const DISCRETIONARY_TYPE_SLUGS: DiscretionaryTypeSlug[] = [
  "non-discretionary",
  "semi-discretionary",
  "discretionary",
];

export const DISCRETIONARY_TYPE_LABEL: Record<DiscretionaryTypeSlug, string> = {
  "non-discretionary": "Non-discretionary",
  "semi-discretionary": "Semi-discretionary",
  discretionary: "Discretionary",
};

const LABEL_TO_SLUG = Object.fromEntries(
  DISCRETIONARY_TYPE_SLUGS.map((s) => [DISCRETIONARY_TYPE_LABEL[s].toLowerCase(), s]),
) as Record<string, DiscretionaryTypeSlug>;

/** Accept display label or DB slug. */
export function parseDiscretionaryType(
  raw: string | null | undefined,
): DiscretionaryTypeSlug | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if ((DISCRETIONARY_TYPE_SLUGS as string[]).includes(trimmed)) {
    return trimmed as DiscretionaryTypeSlug;
  }
  return LABEL_TO_SLUG[trimmed.toLowerCase()] ?? null;
}
