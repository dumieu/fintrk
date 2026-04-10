/**
 * Maps raw transaction labels (DB category names + AI category_suggestion strings)
 * to FinTRK mind-map parent category names (exact strings used in default-categories).
 *
 * Keys MUST be lowercase trimmed. Values are exact mind-map category `name` fields.
 */

export const MIND_MAP_OUTFLOW_PARENTS = [
  "Education",
  "Health & Fitness",
  "Domestic Help",
  "Household",
  "Restaurant & Entertainment",
  "School & Extracurricular",
  "Shopping",
  "Tax",
  "Transport",
  "Travel",
  "Debt Repayment",
  "Insurance",
  "Giving",
  "Personal Care",
  "Financial Fees",
  "Pets",
  "Family & Kids",
  "Other",
] as const;

export const MIND_MAP_INFLOW_PARENTS = ["Employment", "Investment", "Other Income"] as const;

export const MIND_MAP_SAVINGS_PARENTS = ["Retirement", "Investments", "Cash Savings"] as const;

const outflowParentLower = new Map(MIND_MAP_OUTFLOW_PARENTS.map((n) => [n.toLowerCase(), n]));
const inflowParentLower = new Map(MIND_MAP_INFLOW_PARENTS.map((n) => [n.toLowerCase(), n]));
const savingsParentLower = new Map(MIND_MAP_SAVINGS_PARENTS.map((n) => [n.toLowerCase(), n]));

/** AI / common DB labels → Outflow parent (from process-statement category list + typical DB names). */
const OUTFLOW_LABEL_ROLLUP: Record<string, string> = {
  // Household
  "rent / mortgage": "Household",
  housing: "Household",
  rent: "Household",
  mortgage: "Household",
  household: "Household",
  utilities: "Household",
  maintenance: "Household",
  "property tax": "Tax",
  subscriptions: "Household",
  subscription: "Household",
  furnishings: "Household",
  condo: "Household",
  hoa: "Household",
  // Tax also gets income/property variants
  "home & garden": "Household",
  // Education
  tuition: "Education",
  "books & supplies": "Education",
  "courses & certifications": "Education",
  "books & media": "Education",
  // Health & Fitness
  health: "Health & Fitness",
  medical: "Health & Fitness",
  pharmacy: "Health & Fitness",
  fitness: "Health & Fitness",
  "health insurance": "Health & Fitness",
  "mental health": "Health & Fitness",
  // Restaurant & Entertainment
  "food & drink": "Restaurant & Entertainment",
  entertainment: "Restaurant & Entertainment",
  restaurants: "Restaurant & Entertainment",
  coffee: "Restaurant & Entertainment",
  delivery: "Restaurant & Entertainment",
  "bars & nightlife": "Restaurant & Entertainment",
  streaming: "Restaurant & Entertainment",
  gaming: "Restaurant & Entertainment",
  "events & concerts": "Restaurant & Entertainment",
  // Shopping
  groceries: "Shopping",
  clothing: "Shopping",
  electronics: "Shopping",
  "online shopping": "Shopping",
  hobbies: "Shopping",
  // Tax
  "income tax": "Tax",
  // Transport
  transportation: "Transport",
  fuel: "Transport",
  "public transit": "Transport",
  "ride share": "Transport",
  parking: "Transport",
  "car payment": "Transport",
  "car insurance": "Transport",
  // Travel
  flights: "Travel",
  hotels: "Travel",
  activities: "Travel",
  "travel insurance": "Travel",
  "car rental": "Travel",
  // Debt
  "loan payment": "Debt Repayment",
  "credit card payment": "Debt Repayment",
  // Insurance (general — not health/car/travel)
  insurance: "Insurance",
  // Giving
  "gifts & donations": "Giving",
  charity: "Giving",
  gifts: "Giving",
  religious: "Giving",
  // Personal care
  "personal care": "Personal Care",
  // Fees
  financial: "Financial Fees",
  "bank fees": "Financial Fees",
  "interest charges": "Financial Fees",
  "fx fees": "Financial Fees",
  "investment fees": "Financial Fees",
  "atm fees": "Financial Fees",
  // Pets / family — often misc in AI list
  // Domestic
  // School (extracurricular overlap with tuition — user map has School & Extracurricular)
  "school & extracurricular": "School & Extracurricular",
  extracurricular: "School & Extracurricular",
  "meal plan": "School & Extracurricular",
  // Pets / family
  "pet supplies": "Pets",
  veterinary: "Pets",
  vet: "Pets",
  childcare: "Family & Kids",
  babysitting: "Family & Kids",
  toys: "Family & Kids",
  // Domestic
  "domestic help": "Domestic Help",
  "helper salary": "Domestic Help",
  // Misc outflow
  miscellaneous: "Other",
  uncategorized: "Other",
  "atm withdrawal": "Other",
  cash: "Other",
};

const INFLOW_LABEL_ROLLUP: Record<string, string> = {
  income: "Other Income",
  salary: "Employment",
  freelance: "Employment",
  "investment returns": "Investment",
  dividends: "Investment",
  interest: "Investment",
  refunds: "Other Income",
  "side income": "Other Income",
  "government payouts": "Other Income",
  "gifts received": "Other Income",
};

/** Positive amounts with these labels are not allocated to Inflow/Savings bubbles (transfers/noise). */
const EXCLUDE_POSITIVE_ROLLUP = new Set([
  "internal transfer",
  "atm withdrawal",
  "cash",
]);

const SAVINGS_LABEL_ROLLUP: Record<string, string> = {
  "savings transfer": "Cash Savings",
  "emergency fund": "Cash Savings",
  "sinking funds": "Cash Savings",
  brokerage: "Investments",
  crypto: "Investments",
  "real estate equity": "Investments",
  cpf: "Retirement",
  srs: "Retirement",
  "retirement contribution": "Retirement",
};

function resolveParent(
  raw: string,
  parentLower: Map<string, string>,
  rollup: Record<string, string>,
): string | null {
  const k = raw.trim().toLowerCase();
  if (!k) return null;
  const direct = parentLower.get(k);
  if (direct) return direct;
  return rollup[k] ?? null;
}

/** Route expense volume (debit) to an Outflow mind-map parent. */
export function rollupOutflowLabel(rawLabel: string): string | null {
  return resolveParent(rawLabel, outflowParentLower, OUTFLOW_LABEL_ROLLUP);
}

/** Route income volume (credit) to an Inflow mind-map parent. */
export function rollupInflowLabel(rawLabel: string): string | null {
  return resolveParent(rawLabel, inflowParentLower, INFLOW_LABEL_ROLLUP);
}

/** Route positive savings-related labels to Savings mind-map parent. */
export function rollupSavingsLabel(rawLabel: string): string | null {
  return resolveParent(rawLabel, savingsParentLower, SAVINGS_LABEL_ROLLUP);
}

export function shouldExcludePositiveCredit(rawLabel: string): boolean {
  return EXCLUDE_POSITIVE_ROLLUP.has(rawLabel.trim().toLowerCase());
}
