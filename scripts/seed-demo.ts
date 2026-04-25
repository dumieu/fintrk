/**
 * Seed the FinTRK demo dataset.
 *
 *   npm run seed:demo
 *
 * Generates 36 months of realistic financial activity for the Sterling family
 * (Marcus & Elena, Austin TX, two kids ages 8 & 12) under clerk_user_id = "demo".
 *
 * Idempotent: every run wipes existing demo rows then re-creates them so the
 * data stays in lock-step with whatever the demo UI expects.
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);

const DEMO_USER_ID = "demo";
const DEMO_EMAIL = "demo@fintrk.io";
const HOME_CURRENCY = "USD";

// ─── Deterministic RNG ────────────────────────────────────────────────────────
// Mulberry32 — small, fast, seeded so the dataset is reproducible.
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(0x5717_b104);
const rand = () => rng();
const randInt = (lo: number, hi: number) => Math.floor(rand() * (hi - lo + 1)) + lo;
const randFloat = (lo: number, hi: number) => rand() * (hi - lo) + lo;
const jitter = (base: number, pct: number) => base * (1 + (rand() * 2 - 1) * pct);
const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)]!;

// ─── Date helpers ─────────────────────────────────────────────────────────────
function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}
function dayOfWeek(d: Date): number {
  return d.getUTCDay(); // 0=Sun
}
function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function isWeekend(d: Date): boolean {
  const dow = dayOfWeek(d);
  return dow === 0 || dow === 6;
}

const TODAY = new Date();
const END = new Date(Date.UTC(TODAY.getUTCFullYear(), TODAY.getUTCMonth(), TODAY.getUTCDate()));
const START = new Date(END);
START.setUTCFullYear(START.getUTCFullYear() - 3);

// ─── Account definitions ──────────────────────────────────────────────────────
interface AccountSeed {
  key: string;
  name: string;
  institution: string;
  type: "checking" | "savings" | "credit" | "investment" | "loan";
  cardNetwork: string | null;
  mask: string;
  currency: string;
  startBalance: number;
}
const ACCOUNT_SEEDS: AccountSeed[] = [
  { key: "checking",   name: "Sterling Joint Checking", institution: "Chase",        type: "checking",  cardNetwork: null,         mask: "4421", currency: "USD", startBalance: 18_400 },
  { key: "savings",    name: "Emergency Fund Plus",     institution: "Capital One",  type: "savings",   cardNetwork: null,         mask: "9087", currency: "USD", startBalance: 32_500 },
  { key: "marcus_cc",  name: "Sapphire Reserve",        institution: "Chase",        type: "credit",    cardNetwork: "Visa",       mask: "1180", currency: "USD", startBalance: -1_200 },
  { key: "elena_cc",   name: "Double Cash",             institution: "Citi",         type: "credit",    cardNetwork: "Mastercard", mask: "5538", currency: "USD", startBalance: -780 },
  { key: "brokerage",  name: "Vanguard Brokerage",      institution: "Vanguard",     type: "investment",cardNetwork: null,         mask: "7741", currency: "USD", startBalance: 184_300 },
  { key: "ava_529",    name: "Ava — 529 College",       institution: "Fidelity",     type: "investment",cardNetwork: null,         mask: "2210", currency: "USD", startBalance: 42_000 },
  { key: "noah_529",   name: "Noah — 529 College",      institution: "Fidelity",     type: "investment",cardNetwork: null,         mask: "2211", currency: "USD", startBalance: 24_500 },
];

// ─── Merchant catalog ─────────────────────────────────────────────────────────
interface MerchantSeed {
  name: string;
  categorySlug: string;            // resolves to user_categories.slug
  countryIso?: string;
  mcc?: number;
  account?: string;                // preferred account key
  typicalAmount?: [number, number];// [low, high] outflow magnitude
  recurring?: { intervalDays: number; intervalLabel: string; amount: number; varianceAbs?: number };
  weekdayBias?: number[];          // higher numbers = more likely
  weekendBoost?: number;           // multiplier on weekends
  notes?: string;
}

const MERCHANTS: MerchantSeed[] = [
  // Income
  { name: "Tech Co. Payroll",           categorySlug: "salary", account: "checking", recurring: { intervalDays: 14, intervalLabel: "biweekly", amount: 4200, varianceAbs: 60 } },
  { name: "Local Co. Payroll",          categorySlug: "salary", account: "checking", recurring: { intervalDays: 14, intervalLabel: "biweekly", amount: 3500, varianceAbs: 45 } },
  { name: "IRS Tax Refund",             categorySlug: "refunds", account: "checking" },
  { name: "Vanguard Dividend",          categorySlug: "investment-returns", account: "brokerage" },
  // Housing
  { name: "Quicken Loans Mortgage",     categorySlug: "rent-mortgage", account: "checking", recurring: { intervalDays: 30, intervalLabel: "monthly", amount: 4150, varianceAbs: 0 } },
  { name: "Sterling HOA",               categorySlug: "other-household", account: "checking", recurring: { intervalDays: 30, intervalLabel: "monthly", amount: 185 } },
  { name: "Austin Energy",              categorySlug: "utilities", account: "checking", recurring: { intervalDays: 30, intervalLabel: "monthly", amount: 142, varianceAbs: 30 } },
  { name: "Texas Gas Service",          categorySlug: "utilities", account: "checking", recurring: { intervalDays: 30, intervalLabel: "monthly", amount: 38, varianceAbs: 12 } },
  { name: "City of Austin Water",       categorySlug: "utilities", account: "checking", recurring: { intervalDays: 30, intervalLabel: "monthly", amount: 64, varianceAbs: 8 } },
  { name: "Spectrum Internet",          categorySlug: "utilities", account: "checking", recurring: { intervalDays: 30, intervalLabel: "monthly", amount: 89 } },
  { name: "Geico Home Insurance",       categorySlug: "insurance-housing", account: "checking", recurring: { intervalDays: 30, intervalLabel: "monthly", amount: 162 } },
  { name: "Maria — House Cleaning",     categorySlug: "domestic-help", account: "checking", recurring: { intervalDays: 14, intervalLabel: "biweekly", amount: 220 } },
  { name: "Lawn Pros",                  categorySlug: "maintenance", typicalAmount: [85, 120], account: "marcus_cc" },
  { name: "Home Depot",                 categorySlug: "maintenance", typicalAmount: [22, 380], account: "marcus_cc" },
  // Transport
  { name: "Shell",                      categorySlug: "fuel", typicalAmount: [42, 78], account: "marcus_cc" },
  { name: "Chevron",                    categorySlug: "fuel", typicalAmount: [38, 72], account: "elena_cc" },
  { name: "Costco Gas",                 categorySlug: "fuel", typicalAmount: [55, 88], account: "marcus_cc" },
  { name: "Toyota Financial",           categorySlug: "car-payment", account: "checking", recurring: { intervalDays: 30, intervalLabel: "monthly", amount: 489 } },
  { name: "State Farm Auto",            categorySlug: "car-insurance", account: "checking", recurring: { intervalDays: 30, intervalLabel: "monthly", amount: 245 } },
  { name: "Toyota Service",             categorySlug: "car-maintenance", typicalAmount: [120, 680], account: "marcus_cc" },
  { name: "Discount Tire",              categorySlug: "car-maintenance", typicalAmount: [180, 920], account: "marcus_cc" },
  { name: "Uber",                       categorySlug: "ride-share", typicalAmount: [9, 38], account: "elena_cc" },
  { name: "Lyft",                       categorySlug: "ride-share", typicalAmount: [8, 29], account: "elena_cc" },
  { name: "Austin Airport Parking",     categorySlug: "parking", typicalAmount: [22, 84], account: "marcus_cc" },
  // Shopping / groceries
  { name: "H-E-B",                      categorySlug: "groceries-food-drink", typicalAmount: [85, 290], account: "elena_cc", weekendBoost: 1.6 },
  { name: "Whole Foods",                categorySlug: "groceries-food-drink", typicalAmount: [62, 180], account: "marcus_cc" },
  { name: "Costco Wholesale",           categorySlug: "groceries-food-drink", typicalAmount: [180, 520], account: "marcus_cc" },
  { name: "Trader Joe's",               categorySlug: "groceries-food-drink", typicalAmount: [55, 135], account: "elena_cc" },
  { name: "Target",                     categorySlug: "online-shopping", typicalAmount: [22, 220], account: "elena_cc" },
  { name: "Amazon.com",                 categorySlug: "online-shopping", typicalAmount: [12, 180], account: "elena_cc" },
  { name: "Apple Store",                categorySlug: "technology", typicalAmount: [29, 1299], account: "marcus_cc" },
  { name: "Best Buy",                   categorySlug: "technology", typicalAmount: [49, 850], account: "marcus_cc" },
  { name: "Lululemon",                  categorySlug: "apparel", typicalAmount: [78, 248], account: "elena_cc" },
  { name: "Nike",                       categorySlug: "apparel", typicalAmount: [55, 195], account: "marcus_cc" },
  { name: "Old Navy",                   categorySlug: "apparel", typicalAmount: [28, 145], account: "elena_cc" },
  { name: "Sephora",                    categorySlug: "personal-care", typicalAmount: [38, 188], account: "elena_cc" },
  { name: "Great Clips",                categorySlug: "personal-care", typicalAmount: [22, 32], account: "elena_cc" },
  { name: "IKEA",                       categorySlug: "electronics", typicalAmount: [55, 480], account: "marcus_cc" },
  // Entertainment
  { name: "Netflix",                    categorySlug: "streaming", account: "marcus_cc", recurring: { intervalDays: 30, intervalLabel: "monthly", amount: 22.99 } },
  { name: "Spotify Family",             categorySlug: "streaming", account: "marcus_cc", recurring: { intervalDays: 30, intervalLabel: "monthly", amount: 16.99 } },
  { name: "Disney+",                    categorySlug: "streaming", account: "marcus_cc", recurring: { intervalDays: 30, intervalLabel: "monthly", amount: 13.99 } },
  { name: "YouTube TV",                 categorySlug: "streaming", account: "marcus_cc", recurring: { intervalDays: 30, intervalLabel: "monthly", amount: 72.99 } },
  { name: "NYTimes",                    categorySlug: "books-media-edu", account: "marcus_cc", recurring: { intervalDays: 30, intervalLabel: "monthly", amount: 17 } },
  { name: "PlayStation Store",          categorySlug: "gaming", typicalAmount: [10, 69], account: "marcus_cc" },
  { name: "Steam",                      categorySlug: "gaming", typicalAmount: [9, 59], account: "marcus_cc" },
  { name: "AMC Theatres",               categorySlug: "events-concerts", typicalAmount: [38, 96], account: "elena_cc", weekendBoost: 2.4 },
  { name: "Live Nation",                categorySlug: "events-concerts", typicalAmount: [120, 480], account: "elena_cc" },
  // Restaurants
  { name: "Torchy's Tacos",             categorySlug: "restaurants-delivery", typicalAmount: [22, 58], account: "elena_cc", weekendBoost: 1.5 },
  { name: "P. Terry's",                 categorySlug: "restaurants-delivery", typicalAmount: [16, 42], account: "elena_cc" },
  { name: "Uchi",                       categorySlug: "restaurants-delivery", typicalAmount: [120, 320], account: "marcus_cc" },
  { name: "Franklin BBQ",               categorySlug: "restaurants-delivery", typicalAmount: [45, 135], account: "marcus_cc", weekendBoost: 1.8 },
  { name: "DoorDash",                   categorySlug: "restaurants-delivery", typicalAmount: [22, 88], account: "elena_cc" },
  { name: "Starbucks",                  categorySlug: "restaurants-delivery", typicalAmount: [5, 14], account: "elena_cc", weekendBoost: 0.9 },
  { name: "The Driskill Bar",           categorySlug: "bars-nightlife-ent", typicalAmount: [42, 165], account: "marcus_cc", weekendBoost: 2.2 },
  // Health
  { name: "CVS Pharmacy",               categorySlug: "medical", typicalAmount: [12, 95], account: "elena_cc" },
  { name: "Austin Pediatrics",          categorySlug: "medical", typicalAmount: [40, 260], account: "checking" },
  { name: "Aetna Premium",              categorySlug: "health-insurance", account: "checking", recurring: { intervalDays: 30, intervalLabel: "monthly", amount: 412 } },
  { name: "Equinox",                    categorySlug: "fitness", account: "marcus_cc", recurring: { intervalDays: 30, intervalLabel: "monthly", amount: 285 } },
  { name: "Black Swan Yoga",            categorySlug: "fitness", account: "elena_cc", recurring: { intervalDays: 30, intervalLabel: "monthly", amount: 130 } },
  // Education / Kids
  { name: "Austin Soccer Academy",      categorySlug: "extracurricular", account: "checking", recurring: { intervalDays: 30, intervalLabel: "monthly", amount: 180 } },
  { name: "Piano with Mr. Lee",         categorySlug: "extracurricular", account: "checking", recurring: { intervalDays: 30, intervalLabel: "monthly", amount: 200 } },
  { name: "Aftercare Westlake",         categorySlug: "school", account: "checking", recurring: { intervalDays: 30, intervalLabel: "monthly", amount: 425 } },
  { name: "Scholastic Books",           categorySlug: "books-media-edu", typicalAmount: [22, 74], account: "elena_cc" },
  { name: "Coursera",                   categorySlug: "courses", typicalAmount: [49, 79], account: "marcus_cc" },
  // Financial
  { name: "Chase Service Fee",          categorySlug: "bank-fees", typicalAmount: [5, 35], account: "checking" },
  { name: "Citi Late Fee",              categorySlug: "bank-fees", typicalAmount: [25, 39], account: "elena_cc" },
  { name: "Visa Foreign Tx Fee",        categorySlug: "interest-charges", typicalAmount: [3, 18], account: "marcus_cc" },
  // Travel — used for big-ticket annual events
  { name: "United Airlines",            categorySlug: "travel-transportation", typicalAmount: [380, 1850], account: "marcus_cc" },
  { name: "Delta Airlines",             categorySlug: "travel-transportation", typicalAmount: [320, 1620], account: "marcus_cc" },
  { name: "Marriott Bonvoy",            categorySlug: "travel-accommodation", typicalAmount: [240, 720], account: "marcus_cc" },
  { name: "Airbnb",                     categorySlug: "travel-accommodation", typicalAmount: [180, 920], account: "marcus_cc" },
  { name: "Hertz",                      categorySlug: "travel-transportation", typicalAmount: [140, 480], account: "marcus_cc" },
  { name: "Walt Disney World",          categorySlug: "travel-activities", typicalAmount: [220, 1240], account: "marcus_cc", countryIso: "US" },
  { name: "Trattoria al Cardinal",      categorySlug: "travel-meals", typicalAmount: [55, 180], account: "marcus_cc", countryIso: "IT" },
  { name: "Café de Flore",              categorySlug: "travel-meals", typicalAmount: [40, 120], account: "marcus_cc", countryIso: "FR" },
  // Gifts / charity
  { name: "Amazon Gift Cards",          categorySlug: "gifts", typicalAmount: [25, 200], account: "elena_cc" },
  { name: "Charity Water",              categorySlug: "charity", account: "marcus_cc", recurring: { intervalDays: 30, intervalLabel: "monthly", amount: 100 } },
  { name: "St. Jude",                   categorySlug: "charity", account: "elena_cc", recurring: { intervalDays: 30, intervalLabel: "monthly", amount: 75 } },
  // Savings / Investment transfers (categorized as savings flow)
  { name: "Vanguard Auto-Invest",       categorySlug: "investment", account: "checking", recurring: { intervalDays: 30, intervalLabel: "monthly", amount: 1500 } },
  { name: "Fidelity 529 — Ava",         categorySlug: "investment", account: "checking", recurring: { intervalDays: 30, intervalLabel: "monthly", amount: 400 } },
  { name: "Fidelity 529 — Noah",        categorySlug: "investment", account: "checking", recurring: { intervalDays: 30, intervalLabel: "monthly", amount: 400 } },
  // Card payments (misc — auto-transfers)
  { name: "Card Payment — Sapphire",    categorySlug: "card-payments", account: "checking" },
  { name: "Card Payment — Citi",        categorySlug: "card-payments", account: "checking" },
  // Tax (Apr only)
  { name: "IRS Estimated Tax",          categorySlug: "income-tax", account: "checking" },
  { name: "Travis County Property Tax", categorySlug: "property-tax-2", account: "checking" },
];

// ─── Helpers to insert categories cloned from system_categories ───────────────
async function ensureUserCategories(): Promise<Map<string, number>> {
  // Wipe any prior demo categories first.
  await sql`DELETE FROM user_categories WHERE user_id = ${DEMO_USER_ID}`;

  const sysRows = (await sql`
    SELECT id, name, slug, parent_id, icon, color, sort_order, subcategory_type, flow_type
    FROM system_categories ORDER BY parent_id NULLS FIRST, sort_order, id
  `) as Array<{
    id: number; name: string; slug: string; parent_id: number | null;
    icon: string | null; color: string | null; sort_order: number;
    subcategory_type: string | null; flow_type: string;
  }>;

  // First pass: parents (parent_id IS NULL).
  const sysIdToUserId = new Map<number, number>();
  for (const r of sysRows.filter((s) => s.parent_id === null)) {
    const inserted = (await sql`
      INSERT INTO user_categories (user_id, name, slug, parent_id, icon, color, sort_order, subcategory_type, flow_type, system_category_id)
      VALUES (${DEMO_USER_ID}, ${r.name}, ${r.slug}, NULL, ${r.icon}, ${r.color}, ${r.sort_order}, ${r.subcategory_type as string | null}, ${r.flow_type as string}, ${r.id})
      RETURNING id
    `) as Array<{ id: number }>;
    sysIdToUserId.set(r.id, inserted[0]!.id);
  }
  // Second pass: children.
  for (const r of sysRows.filter((s) => s.parent_id !== null)) {
    const parentUserId = sysIdToUserId.get(r.parent_id!);
    const inserted = (await sql`
      INSERT INTO user_categories (user_id, name, slug, parent_id, icon, color, sort_order, subcategory_type, flow_type, system_category_id)
      VALUES (${DEMO_USER_ID}, ${r.name}, ${r.slug}, ${parentUserId ?? null}, ${r.icon}, ${r.color}, ${r.sort_order}, ${r.subcategory_type as string | null}, ${r.flow_type as string}, ${r.id})
      RETURNING id
    `) as Array<{ id: number }>;
    sysIdToUserId.set(r.id, inserted[0]!.id);
  }

  // Map slug → user_categories.id for downstream lookups.
  const slugToId = new Map<string, number>();
  const all = (await sql`SELECT id, slug FROM user_categories WHERE user_id = ${DEMO_USER_ID}`) as Array<{ id: number; slug: string }>;
  for (const r of all) slugToId.set(r.slug, r.id);
  return slugToId;
}

async function wipeDemo(): Promise<void> {
  await sql`DELETE FROM transactions WHERE user_id = ${DEMO_USER_ID}`;
  await sql`DELETE FROM recurring_patterns WHERE user_id = ${DEMO_USER_ID}`;
  await sql`DELETE FROM file_upload_log WHERE user_id = ${DEMO_USER_ID}`;
  await sql`DELETE FROM statements WHERE user_id = ${DEMO_USER_ID}`;
  await sql`DELETE FROM ai_insights WHERE user_id = ${DEMO_USER_ID}`;
  await sql`DELETE FROM ai_costs WHERE user_id = ${DEMO_USER_ID}`;
  await sql`DELETE FROM goals WHERE user_id = ${DEMO_USER_ID}`;
  await sql`DELETE FROM budgets WHERE user_id = ${DEMO_USER_ID}`;
  await sql`DELETE FROM accounts WHERE user_id = ${DEMO_USER_ID}`;
  await sql`DELETE FROM users WHERE clerk_user_id = ${DEMO_USER_ID}`;
}

async function ensureUser(): Promise<void> {
  await sql`
    INSERT INTO users (clerk_user_id, primary_email, first_name, last_name, username, image_url, main_currency, main_currency_transactions, main_currency_percentage, detect_travel)
    VALUES (${DEMO_USER_ID}, ${DEMO_EMAIL}, 'Sterling', 'Family', 'demo', NULL, ${HOME_CURRENCY}, 0, '99.00', 'Yes')
  `;
}

async function ensureAccounts(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (const a of ACCOUNT_SEEDS) {
    const inserted = (await sql`
      INSERT INTO accounts (user_id, institution_name, account_name, account_type, card_network, masked_number, primary_currency, country_iso, is_active)
      VALUES (${DEMO_USER_ID}, ${a.institution}, ${a.name}, ${a.type}, ${a.cardNetwork}, ${a.mask}, ${a.currency}, 'US', true)
      RETURNING id
    `) as Array<{ id: string }>;
    map.set(a.key, inserted[0]!.id);
  }
  return map;
}

// ─── Merchant cache ───────────────────────────────────────────────────────────
async function ensureMerchant(name: string, categoryId: number | null): Promise<number> {
  const existing = (await sql`SELECT id FROM merchants WHERE canonical_name = ${name} LIMIT 1`) as Array<{ id: number }>;
  if (existing[0]) return existing[0].id;
  const inserted = (await sql`
    INSERT INTO merchants (canonical_name, category_id, country_iso, transaction_count)
    VALUES (${name}, ${categoryId}, 'US', 0) RETURNING id
  `) as Array<{ id: number }>;
  return inserted[0]!.id;
}

// ─── Transaction batch insert ────────────────────────────────────────────────
interface TxnDraft {
  accountId: string;
  postedDate: string;
  rawDescription: string;
  merchantId: number;
  merchantName: string;
  categoryId: number;
  baseAmount: number;     // signed: negative for outflow
  baseCurrency: string;
  foreignAmount?: number | null;
  foreignCurrency?: string | null;
  implicitFxRate?: number | null;
  countryIso?: string | null;
  isRecurring: boolean;
}

async function bulkInsertTransactions(rows: TxnDraft[]): Promise<void> {
  // Insert in chunks to avoid Neon HTTP payload limits.
  const CHUNK = 250;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    // Build dynamic VALUES clause with parameters.
    const values: unknown[] = [];
    const tuples: string[] = [];
    let p = 1;
    for (const r of slice) {
      tuples.push(
        `($${p++}, $${p++}::uuid, $${p++}::date, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}::numeric, $${p++}, $${p++}::numeric, $${p++}, $${p++}::numeric, $${p++}, $${p++}::boolean)`,
      );
      values.push(
        DEMO_USER_ID,
        r.accountId,
        r.postedDate,
        r.rawDescription,
        r.merchantId,
        r.merchantName,
        r.categoryId,
        r.baseAmount.toFixed(4),
        r.baseCurrency,
        r.foreignAmount != null ? r.foreignAmount.toFixed(4) : null,
        r.foreignCurrency ?? null,
        r.implicitFxRate != null ? r.implicitFxRate.toFixed(6) : null,
        r.countryIso ?? null,
        r.isRecurring,
      );
    }
    const q = `
      INSERT INTO transactions
        (user_id, account_id, posted_date, raw_description, merchant_id, merchant_name, category_id, base_amount, base_currency, foreign_amount, foreign_currency, implicit_fx_rate, country_iso, is_recurring)
      VALUES ${tuples.join(", ")}
      ON CONFLICT DO NOTHING
    `;
    await sql.query(q, values);
  }
}

// ─── Generate the dataset ─────────────────────────────────────────────────────
function decideMerchantAmount(m: MerchantSeed, date: Date, monthIdx: number): number {
  // For the typical-amount merchants, sample within range with mild seasonality.
  if (m.recurring) {
    const variance = m.recurring.varianceAbs ?? 0;
    const v = m.recurring.amount + (variance > 0 ? (rand() * 2 - 1) * variance : 0);
    return v;
  }
  if (!m.typicalAmount) return 0;
  const [lo, hi] = m.typicalAmount;
  let amt = randFloat(lo, hi);
  if (m.weekendBoost && isWeekend(date)) amt *= m.weekendBoost;
  // Monthly inflation drift across 36 months: + 0–9%.
  amt *= 1 + (monthIdx / 36) * 0.09;
  return amt;
}

function flowSign(slug: string, slugToFlow: Map<string, string>): 1 | -1 {
  const f = slugToFlow.get(slug);
  return f === "inflow" ? 1 : -1; // savings & misc usually treated as outflow from checking
}

interface VacationPlan {
  start: Date;
  days: number;
  destination: { name: string; country: string; merchants: string[] };
  budgetBase: number;
}

function buildVacationCalendar(): VacationPlan[] {
  // 2 vacations per year × 3 years = 6 trips.
  const trips: VacationPlan[] = [];
  const yrStart = START.getUTCFullYear();
  const destinations = [
    { name: "Disney World",       country: "US", merchants: ["Walt Disney World", "Marriott Bonvoy", "Delta Airlines", "Hertz"] },
    { name: "Italy — Rome",       country: "IT", merchants: ["United Airlines", "Airbnb", "Trattoria al Cardinal", "Hertz"] },
    { name: "Costa Rica",         country: "CR", merchants: ["United Airlines", "Marriott Bonvoy", "Hertz"] },
    { name: "Paris",              country: "FR", merchants: ["Delta Airlines", "Marriott Bonvoy", "Café de Flore"] },
    { name: "Lake Tahoe Ski",     country: "US", merchants: ["United Airlines", "Airbnb", "Hertz"] },
    { name: "Yellowstone",        country: "US", merchants: ["Delta Airlines", "Airbnb", "Hertz"] },
  ];
  for (let i = 0; i < 6; i++) {
    const yr = yrStart + Math.floor(i / 2);
    const month = i % 2 === 0 ? 6 /* July */ : 11 /* Dec */;
    const start = new Date(Date.UTC(yr, month, randInt(2, 22)));
    const days = i % 2 === 0 ? randInt(7, 10) : randInt(5, 8);
    trips.push({
      start,
      days,
      destination: destinations[i % destinations.length]!,
      budgetBase: 4500 + i * 300,
    });
  }
  return trips;
}

async function generateTransactions(
  accountIds: Map<string, string>,
  slugToCatId: Map<string, number>,
  slugToFlow: Map<string, string>,
): Promise<TxnDraft[]> {
  const drafts: TxnDraft[] = [];

  // Resolve merchant rows first so transactions can reference them.
  const merchantIdByName = new Map<string, number>();
  for (const m of MERCHANTS) {
    const catId = slugToCatId.get(m.categorySlug) ?? null;
    const id = await ensureMerchant(m.name, catId);
    merchantIdByName.set(m.name, id);
  }

  // Helper to push a draft.
  const push = (m: MerchantSeed, date: Date, signedAmount: number, foreign?: { amount: number; currency: string; rate: number; country: string }) => {
    const accountId = accountIds.get(m.account ?? "marcus_cc")!;
    const merchantId = merchantIdByName.get(m.name)!;
    const categoryId = slugToCatId.get(m.categorySlug)!;
    const desc = foreign
      ? `POS PURCHASE — ${m.name.toUpperCase()} ${foreign.country}`
      : `POS PURCHASE — ${m.name.toUpperCase()}`;
    drafts.push({
      accountId,
      postedDate: ymd(date),
      rawDescription: desc,
      merchantId,
      merchantName: m.name,
      categoryId,
      baseAmount: signedAmount,
      baseCurrency: HOME_CURRENCY,
      foreignAmount: foreign ? foreign.amount : null,
      foreignCurrency: foreign ? foreign.currency : null,
      implicitFxRate: foreign ? foreign.rate : null,
      countryIso: foreign?.country ?? m.countryIso ?? "US",
      isRecurring: !!m.recurring,
    });
  };

  // 1. Recurring merchants: emit on a precise schedule.
  for (const m of MERCHANTS.filter((x) => x.recurring)) {
    const r = m.recurring!;
    // Stagger first occurrence so they don't all land on day 1.
    const offset = Math.abs((m.name.charCodeAt(0) + m.name.charCodeAt(m.name.length - 1)) % 27);
    let cur = addDays(START, offset);
    let count = 0;
    while (cur <= END) {
      const variance = r.varianceAbs ?? 0;
      const amt = r.amount + (variance > 0 ? (rand() * 2 - 1) * variance : 0);
      const sign = flowSign(m.categorySlug, slugToFlow);
      // For "investment" + "card-payments" + "savings", treat as outflow from checking even though category flow_type might be savings/misc.
      const isCheckingDebit = ["investment", "card-payments"].includes(m.categorySlug);
      const finalSign = sign === 1 ? 1 : isCheckingDebit ? -1 : -1;
      push(m, cur, +(amt * finalSign).toFixed(2));
      cur = addDays(cur, r.intervalDays);
      count++;
      if (count > 200) break; // safety
    }
  }

  // 2. Non-recurring everyday spend: walk every day, sample merchants.
  const everyday = MERCHANTS.filter((m) => !m.recurring && m.typicalAmount);
  // Group by category slug for balanced sampling.
  const byCategory = new Map<string, MerchantSeed[]>();
  for (const m of everyday) {
    const arr = byCategory.get(m.categorySlug) ?? [];
    arr.push(m);
    byCategory.set(m.categorySlug, arr);
  }

  // Daily probability targets per category slug.
  const DAILY_PROB: Record<string, number> = {
    "groceries-food-drink": 0.55,
    "fuel": 0.18,
    "restaurants-delivery": 0.62,
    "online-shopping": 0.42,
    "ride-share": 0.18,
    "personal-care": 0.10,
    "apparel": 0.18,
    "technology": 0.06,
    "electronics": 0.07,
    "medical": 0.10,
    "gaming": 0.05,
    "events-concerts": 0.04,
    "bars-nightlife-ent": 0.05,
    "books-media-edu": 0.06,
    "courses": 0.02,
    "parking": 0.05,
    "car-maintenance": 0.014,
    "maintenance": 0.04,
    "bank-fees": 0.005,
    "interest-charges": 0.01,
    "gifts": 0.04,
  };

  let day = new Date(START);
  let monthIdx = 0;
  let prevMonth = day.getUTCMonth();
  while (day <= END) {
    const m = day.getUTCMonth();
    if (m !== prevMonth) { monthIdx++; prevMonth = m; }
    for (const [slug, merchants] of byCategory) {
      const baseProb = DAILY_PROB[slug] ?? 0.05;
      let prob = baseProb;
      // Holiday season: mild Dec boost on shopping/gifts/restaurants.
      if (m === 11 && ["online-shopping", "apparel", "gifts", "restaurants-delivery", "events-concerts"].includes(slug)) prob *= 1.5;
      // Back-to-school Aug
      if (m === 7 && ["online-shopping", "apparel", "books-media-edu"].includes(slug)) prob *= 1.4;
      // Fewer big purchases on Sunday
      if (dayOfWeek(day) === 0 && ["technology", "electronics"].includes(slug)) prob *= 0.4;
      if (rand() < prob) {
        const m2 = pick(merchants);
        const amt = decideMerchantAmount(m2, day, monthIdx);
        push(m2, day, +(amt * -1).toFixed(2));
      }
    }
    day = addDays(day, 1);
  }

  // 3. Big-ticket annual events: Christmas spending burst, school start, taxes.
  for (let yr = START.getUTCFullYear(); yr <= END.getUTCFullYear(); yr++) {
    // Christmas gift spree (Dec 8-22)
    for (let i = 0; i < 14; i++) {
      const d = new Date(Date.UTC(yr, 11, 8 + i));
      if (d > END) break;
      if (rand() < 0.45) {
        const m = pick(MERCHANTS.filter((x) => ["gifts", "online-shopping", "apparel", "technology", "electronics"].includes(x.categorySlug) && !x.recurring));
        const amt = decideMerchantAmount(m, d, monthIdx) * randFloat(1.3, 2.3);
        push(m, d, +(amt * -1).toFixed(2));
      }
    }
    // Property tax (Jan 25)
    const propTax = MERCHANTS.find((x) => x.name === "Travis County Property Tax")!;
    const propDate = new Date(Date.UTC(yr, 0, 25));
    if (propDate >= START && propDate <= END) {
      push(propTax, propDate, -(8400 + randFloat(-200, 400)));
    }
    // Tax estimated payments (Apr 15)
    const irs = MERCHANTS.find((x) => x.name === "IRS Estimated Tax")!;
    const irsDate = new Date(Date.UTC(yr, 3, 15));
    if (irsDate >= START && irsDate <= END) {
      // Sometimes a refund instead.
      if (rand() < 0.35) {
        const refund = MERCHANTS.find((x) => x.name === "IRS Tax Refund")!;
        push(refund, irsDate, +(2400 + randFloat(0, 3600)));
      } else {
        push(irs, irsDate, -(2800 + randFloat(0, 3400)));
      }
    }
    // Vanguard quarterly dividend
    for (const month of [2, 5, 8, 11]) {
      const d = new Date(Date.UTC(yr, month, 12));
      if (d < START || d > END) continue;
      const div = MERCHANTS.find((x) => x.name === "Vanguard Dividend")!;
      push(div, d, +(420 + randFloat(20, 280)).toFixed(2));
    }
  }

  // 4. Vacations: dense cluster of foreign + travel transactions.
  const vacations = buildVacationCalendar();
  for (const v of vacations) {
    if (v.start > END) continue;
    for (let i = 0; i < v.days; i++) {
      const d = addDays(v.start, i);
      if (d > END) break;
      const merchantsForTrip = v.destination.merchants
        .map((n) => MERCHANTS.find((m) => m.name === n))
        .filter(Boolean) as MerchantSeed[];
      // Major travel expense once at trip start
      if (i === 0) {
        const transport = merchantsForTrip.find((m) => m.categorySlug === "travel-transportation");
        if (transport) push(transport, d, -(randFloat(580, 1750) * (v.destination.country === "US" ? 1 : 1.6)));
        const lodging = merchantsForTrip.find((m) => m.categorySlug === "travel-accommodation");
        if (lodging) push(lodging, d, -(randFloat(280, 720)));
      }
      // Daily local meals/activities
      const local = merchantsForTrip.filter((m) => m.categorySlug === "travel-meals" || m.categorySlug === "travel-activities");
      for (const lm of local) {
        if (rand() < 0.7) {
          const baseAmt = randFloat(40, 220);
          if (v.destination.country !== "US") {
            const fxByCountry: Record<string, [number, string]> = {
              IT: [0.92, "EUR"],
              FR: [0.92, "EUR"],
              CR: [520, "CRC"],
            };
            const [rate, ccy] = fxByCountry[v.destination.country] ?? [1, "USD"];
            const foreignAmt = baseAmt * rate;
            push(lm, d, -baseAmt, { amount: foreignAmt, currency: ccy, rate, country: v.destination.country });
          } else {
            push(lm, d, -baseAmt);
          }
        }
      }
    }
  }

  // 5. Auto card-payment transfers (debit checking, credit card balance settlement)
  const cardPay1 = MERCHANTS.find((x) => x.name === "Card Payment — Sapphire")!;
  const cardPay2 = MERCHANTS.find((x) => x.name === "Card Payment — Citi")!;
  let cur = addDays(START, 23);
  while (cur <= END) {
    push(cardPay1, cur, -(randFloat(2400, 4200)));
    push(cardPay2, addDays(cur, 5), -(randFloat(900, 2200)));
    cur = addDays(cur, 30);
  }

  // Sort by date (most recent last).
  drafts.sort((a, b) => a.postedDate.localeCompare(b.postedDate));
  return drafts;
}

// ─── Recurring patterns mirror ────────────────────────────────────────────────
async function seedRecurringPatterns(slugToCatId: Map<string, number>, merchantIdByName: Map<string, number>) {
  for (const m of MERCHANTS.filter((x) => x.recurring)) {
    const r = m.recurring!;
    const merchantId = merchantIdByName.get(m.name)!;
    const categoryId = slugToCatId.get(m.categorySlug)!;
    const sign = m.categorySlug === "salary" || m.categorySlug === "investment-returns" || m.categorySlug === "refunds" ? 1 : -1;
    const expected = +(r.amount * sign).toFixed(2);
    const next = addDays(END, randInt(2, r.intervalDays));
    const last = addDays(END, -randInt(1, r.intervalDays));
    await sql`
      INSERT INTO recurring_patterns
        (user_id, merchant_name, merchant_id, category_id, interval_days, interval_label, expected_amount, amount_variance, currency, next_expected_date, last_seen_date, occurrence_count, is_active)
      VALUES
        (${DEMO_USER_ID}, ${m.name}, ${merchantId}, ${categoryId}, ${r.intervalDays}, ${r.intervalLabel}, ${expected}, ${r.varianceAbs ?? 0}, ${HOME_CURRENCY}, ${ymd(next)}, ${ymd(last)}, ${Math.floor((1095 / r.intervalDays))}, true)
      ON CONFLICT (user_id, merchant_name, interval_label) DO NOTHING
    `;
  }
}

// ─── Goals + Budgets + AI Insights ────────────────────────────────────────────
async function seedGoals(accountIds: Map<string, string>) {
  const items: Array<{ name: string; target: number; current: number; targetDate: string; account: string }> = [
    { name: "Emergency Fund · 6 months",     target: 60000, current: 32500, targetDate: ymd(addDays(END, 365)),  account: "savings" },
    { name: "Ava — College (529)",           target: 180000, current: 42000, targetDate: ymd(new Date(Date.UTC(END.getUTCFullYear() + 6, 5, 1))), account: "ava_529" },
    { name: "Noah — College (529)",          target: 180000, current: 24500, targetDate: ymd(new Date(Date.UTC(END.getUTCFullYear() + 10, 5, 1))), account: "noah_529" },
    { name: "Kitchen Renovation",            target: 45000, current: 11800, targetDate: ymd(addDays(END, 540)),  account: "savings" },
    { name: "Italy 2027 — Family Trip",      target: 12000, current:  3400, targetDate: ymd(addDays(END, 730)),  account: "savings" },
  ];
  for (const g of items) {
    await sql`
      INSERT INTO goals (user_id, name, target_amount, current_amount, currency, target_date, linked_account_ids, is_completed)
      VALUES (${DEMO_USER_ID}, ${g.name}, ${g.target}, ${g.current}, ${HOME_CURRENCY}, ${g.targetDate}, ${JSON.stringify([accountIds.get(g.account)])}::jsonb, false)
    `;
  }
}

async function seedBudgets(slugToCatId: Map<string, number>) {
  const items: Array<{ name: string; slug: string; amount: number; threshold?: string }> = [
    { name: "Groceries",             slug: "groceries-food-drink", amount: 1600, threshold: "0.85" },
    { name: "Restaurants & Takeout", slug: "restaurants-delivery", amount:  900, threshold: "0.80" },
    { name: "Fuel",                  slug: "fuel",                  amount:  420, threshold: "0.85" },
    { name: "Online Shopping",       slug: "online-shopping",       amount:  650, threshold: "0.75" },
    { name: "Kids — Activities",     slug: "extracurricular",       amount:  900, threshold: "0.90" },
    { name: "Travel",                slug: "travel-accommodation",  amount: 2000, threshold: "0.70" },
  ];
  for (const b of items) {
    const catId = slugToCatId.get(b.slug);
    if (!catId) continue;
    await sql`
      INSERT INTO budgets (user_id, category_id, name, amount, currency, period, rollover, alert_threshold, is_active)
      VALUES (${DEMO_USER_ID}, ${catId}, ${b.name}, ${b.amount}, ${HOME_CURRENCY}, 'monthly', false, ${b.threshold ?? "0.80"}, true)
    `;
  }
}

async function seedInsights() {
  const insights = [
    { type: "leak",       severity: "high",   title: "Subscription stack growing",      body: "You now spend $128/mo on streaming — up from $74/mo last year. Consider rotating Netflix and Disney+ instead of paying for both year-round." },
    { type: "leak",       severity: "medium", title: "DoorDash creeping up",            body: "Delivery spend hit $312 last month vs $190 average. That's the equivalent of one extra night out per week." },
    { type: "win",        severity: "info",   title: "Mortgage rate locked",            body: "Your $4,150 monthly mortgage is now 17% of after-tax income — a healthy ratio for Austin housing." },
    { type: "alert",      severity: "high",   title: "Card payment scheduled",          body: "$3,800 Sapphire balance due in 6 days. Checking has $14,200 — clear to autopay." },
    { type: "behavior",   severity: "info",   title: "Weekend grocery clustering",      body: "82% of grocery runs happen Sat/Sun at H-E-B and Costco — a midweek run could trim impulse buys by ~15%." },
    { type: "savings",    severity: "info",   title: "On track for emergency fund",     body: "At $500/mo + tax refund, you'll hit the $60k target by next August." },
    { type: "kids",       severity: "info",   title: "Ava's 529 needs +$220/mo",        body: "To hit $180k by age 18 at 6% return you need to step up monthly contributions from $400 to $620." },
    { type: "fx",         severity: "low",    title: "Foreign card spread detected",    body: "Your Sapphire absorbed ~1.4% spread on Italy meals — within Visa norms but worth a no-FX-fee alternative for trips longer than 7 days." },
    { type: "tax",        severity: "medium", title: "Quarterly tax due",               body: "April 15 estimated payment looks like ~$3,100 based on side income trend." },
    { type: "win",        severity: "info",   title: "Net worth up 11.2% YoY",          body: "Combined balances grew from $251k to $279k thanks to brokerage gains and 529 deposits." },
  ];
  for (let i = 0; i < insights.length; i++) {
    const days = i * 4 + randInt(0, 3);
    const generated = addDays(END, -days);
    const item = insights[i]!;
    await sql`
      INSERT INTO ai_insights (user_id, insight_type, title, body, severity, metadata, is_read, is_dismissed, generated_at)
      VALUES (${DEMO_USER_ID}, ${item.type}, ${item.title}, ${item.body}, ${item.severity}, '{}'::jsonb, false, false, ${generated.toISOString()})
    `;
  }
}

// ─── Statements (look real but no file_data) ─────────────────────────────────
async function seedStatements(accountIds: Map<string, string>) {
  for (let i = 0; i < 18; i++) {
    const monthsAgo = i + 1;
    const d = new Date(END);
    d.setUTCMonth(d.getUTCMonth() - monthsAgo);
    const periodStart = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
    const periodEnd = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
    const accountKeys = ["checking", "marcus_cc", "elena_cc"];
    for (const k of accountKeys) {
      const fileName = `${k}_${ymd(periodStart).slice(0, 7)}.pdf`;
      const sizeKb = randInt(180, 920);
      await sql`
        INSERT INTO statements (user_id, account_id, file_name, file_size, file_mime_type, file_hash, status, ai_model, ai_processed_at, transactions_imported, transactions_duplicate, period_start, period_end)
        VALUES (${DEMO_USER_ID}, ${accountIds.get(k)}, ${fileName}, ${sizeKb * 1024}, 'application/pdf', ${`hash_demo_${k}_${ymd(periodStart)}`}, 'completed', 'gemini-2.0-flash', ${addDays(periodEnd, 2).toISOString()}, ${randInt(40, 180)}, ${randInt(0, 6)}, ${ymd(periodStart)}, ${ymd(periodEnd)})
      `;
    }
  }
}

async function seedAiCosts() {
  for (let i = 0; i < 24; i++) {
    const d = addDays(END, -randInt(1, 720));
    await sql`
      INSERT INTO ai_costs (user_id, ai_model_id, ai_query, input_tokens, input_cost, output_tokens, output_cost, total_cost, created_at)
      VALUES (${DEMO_USER_ID}, 'gemini-2.0-flash', 'statement_categorize', ${randInt(2400, 9800)}, ${randFloat(0.0008, 0.004).toFixed(6)}, ${randInt(800, 2200)}, ${randFloat(0.001, 0.006).toFixed(6)}, ${randFloat(0.002, 0.012).toFixed(6)}, ${d.toISOString()})
    `;
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log("⏳ Wiping previous demo dataset...");
  await wipeDemo();

  console.log("👤 Creating demo user...");
  await ensureUser();

  console.log("🏦 Creating demo accounts...");
  const accountIds = await ensureAccounts();
  console.log("   →", accountIds.size, "accounts");

  console.log("🗂️  Cloning system categories into user_categories for demo...");
  const slugToCatId = await ensureUserCategories();
  console.log("   →", slugToCatId.size, "categories");
  // Build slug → flow map for sign decisions.
  const slugToFlow = new Map<string, string>();
  const flowRows = (await sql`SELECT slug, flow_type FROM user_categories WHERE user_id = ${DEMO_USER_ID}`) as Array<{ slug: string; flow_type: string }>;
  for (const r of flowRows) slugToFlow.set(r.slug, r.flow_type);

  console.log("📈 Generating 3 years of transactions...");
  const txns = await generateTransactions(accountIds, slugToCatId, slugToFlow);
  console.log("   →", txns.length, "transactions");

  console.log("💾 Inserting transactions...");
  await bulkInsertTransactions(txns);

  // Reload merchant id map for recurring patterns.
  const merchantIdByName = new Map<string, number>();
  for (const m of MERCHANTS) {
    const r = (await sql`SELECT id FROM merchants WHERE canonical_name = ${m.name} LIMIT 1`) as Array<{ id: number }>;
    if (r[0]) merchantIdByName.set(m.name, r[0].id);
  }

  console.log("🔁 Seeding recurring patterns...");
  await seedRecurringPatterns(slugToCatId, merchantIdByName);

  console.log("🎯 Seeding goals...");
  await seedGoals(accountIds);

  console.log("📊 Seeding budgets...");
  await seedBudgets(slugToCatId);

  console.log("🧠 Seeding AI insights...");
  await seedInsights();

  console.log("📄 Seeding statements...");
  await seedStatements(accountIds);

  console.log("💸 Seeding AI cost rows...");
  await seedAiCosts();

  console.log("");
  console.log("✅ Demo dataset ready (clerk_user_id = 'demo')");

  // Quick stats.
  const stats = (await sql`
    SELECT
      (SELECT COUNT(*) FROM transactions WHERE user_id = ${DEMO_USER_ID})::int AS txns,
      (SELECT COUNT(*) FROM accounts WHERE user_id = ${DEMO_USER_ID})::int AS accts,
      (SELECT COUNT(*) FROM recurring_patterns WHERE user_id = ${DEMO_USER_ID})::int AS recur,
      (SELECT COUNT(*) FROM goals WHERE user_id = ${DEMO_USER_ID})::int AS goals,
      (SELECT COUNT(*) FROM budgets WHERE user_id = ${DEMO_USER_ID})::int AS budgets,
      (SELECT COUNT(*) FROM ai_insights WHERE user_id = ${DEMO_USER_ID})::int AS insights,
      (SELECT COUNT(*) FROM statements WHERE user_id = ${DEMO_USER_ID})::int AS stmts
  `) as Array<Record<string, number>>;
  console.log("   ", stats[0]);
}

main().catch((e) => {
  console.error("❌ Demo seed failed:", e);
  process.exit(1);
});
