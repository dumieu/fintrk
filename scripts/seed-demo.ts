/**
 * Seed the FinTRK demo dataset - "The Sterling Family".
 *
 *   npm run seed:demo
 *
 * Generates FIVE YEARS (60 months) of richly detailed, accurate financial
 * activity for an upper-middle-class Austin, TX household with three
 * school-aged kids (Ava 14, Noah 11, Mia 7) under clerk_user_id = "demo".
 *
 * The simulation models:
 *   - Two professional incomes (biweekly payroll) with annual raises + bonuses
 *   - A real mortgage, escrow, property tax, HOA, full utility stack
 *   - Two financed cars, fuel, insurance, maintenance
 *   - Groceries / dining scaled for a family of five, with weekday/weekend bias
 *   - Three kids' worth of school, aftercare, sports, music, tutoring, camps,
 *     birthdays, orthodontics, pediatric visits and back-to-school spikes
 *   - A streaming + subscription stack that grows over time
 *   - Annual family vacations (domestic + international, with real FX)
 *   - Recurring 401(k), brokerage and 3x 529 college contributions
 *   - Holiday spending bursts, tax season, dividends, refunds
 *   - A full net-worth balance sheet + retirement settings for the Atlas
 *
 * Idempotent: every run wipes existing demo rows then re-creates them, so the
 * data always matches whatever the demo UI expects. Deterministic RNG seed
 * means the dataset is identical on every run.
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
const YEARS = 5;

// ─── Deterministic RNG (Mulberry32) ──────────────────────────────────────────
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
const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)]!;
const chance = (p: number) => rand() < p;

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
START.setUTCFullYear(START.getUTCFullYear() - YEARS);

/** 0-based index of how many full years after START a date falls (for raises/inflation). */
function yearsSinceStart(d: Date): number {
  return (d.getTime() - START.getTime()) / (365.25 * 24 * 3600 * 1000);
}

// ─── Accounts ─────────────────────────────────────────────────────────────────
interface AccountSeed {
  key: string;
  name: string;
  institution: string;
  type: "checking" | "savings" | "credit" | "investment" | "loan";
  cardNetwork: string | null;
  mask: string;
  currency: string;
}
const ACCOUNT_SEEDS: AccountSeed[] = [
  { key: "checking",  name: "Sterling Joint Checking", institution: "Chase",         type: "checking",   cardNetwork: null,         mask: "4421", currency: "USD" },
  { key: "savings",   name: "Emergency Fund (HYSA)",   institution: "Ally Bank",     type: "savings",    cardNetwork: null,         mask: "9087", currency: "USD" },
  { key: "sapphire",  name: "Sapphire Reserve",        institution: "Chase",         type: "credit",     cardNetwork: "Visa",       mask: "1180", currency: "USD" },
  { key: "citi",      name: "Double Cash",             institution: "Citi",          type: "credit",     cardNetwork: "Mastercard", mask: "5538", currency: "USD" },
  { key: "amex",      name: "Blue Cash Everyday",      institution: "American Express", type: "credit",  cardNetwork: "Amex",       mask: "3009", currency: "USD" },
  { key: "brokerage", name: "Vanguard Brokerage",      institution: "Vanguard",      type: "investment", cardNetwork: null,         mask: "7741", currency: "USD" },
  { key: "k401",      name: "Fidelity 401(k)",         institution: "Fidelity",      type: "investment", cardNetwork: null,         mask: "4010", currency: "USD" },
  { key: "ava_529",   name: "Ava - 529 College",  institution: "Fidelity",      type: "investment", cardNetwork: null,         mask: "2210", currency: "USD" },
  { key: "noah_529",  name: "Noah - 529 College", institution: "Fidelity",      type: "investment", cardNetwork: null,         mask: "2211", currency: "USD" },
  { key: "mia_529",   name: "Mia - 529 College",  institution: "Fidelity",      type: "investment", cardNetwork: null,         mask: "2212", currency: "USD" },
];

// ─── Merchant catalog ─────────────────────────────────────────────────────────
interface MerchantSeed {
  name: string;
  slug: string;                      // canonical user_categories.slug
  account: string;                   // account key the charge posts to
  country?: string;                  // ISO, defaults US
  amount?: [number, number];         // outflow magnitude range (non-recurring)
  recurring?: { intervalDays: number; intervalLabel: string; amount: number; variance?: number };
  dailyProb?: number;                // per-day chance for everyday merchants
  weekendBoost?: number;             // multiplier on Sat/Sun
  inflation?: number;                // extra annual price drift (default 0.03)
  holiday?: boolean;                 // gets a December boost
  backToSchool?: boolean;            // gets an August boost
  note?: string;
}

// flow_type is resolved from the category at insert time; sign is set per-merchant below.
const MERCHANTS: MerchantSeed[] = [
  // ─── Income (inflow, to checking) ───
  { name: "Apex Semiconductor Payroll", slug: "salary", account: "checking", recurring: { intervalDays: 14, intervalLabel: "biweekly", amount: 5400, variance: 40 }, note: "Marcus - Engineering Manager" },
  { name: "Brightwave Media Payroll",   slug: "salary", account: "checking", recurring: { intervalDays: 14, intervalLabel: "biweekly", amount: 3900, variance: 35 }, note: "Elena - Marketing Director" },
  { name: "Elena - Freelance Consulting", slug: "side-income", account: "checking", amount: [600, 2400], dailyProb: 0.018 },
  { name: "Ally Savings Interest",      slug: "investment-returns", account: "savings" },
  { name: "Vanguard Dividend",          slug: "investment-returns", account: "brokerage" },
  { name: "Chase Cashback Redemption",  slug: "refunds", account: "checking", amount: [40, 320], dailyProb: 0.01 },
  { name: "IRS Tax Refund",             slug: "refunds", account: "checking" },

  // ─── Housing (checking) ───
  { name: "Rocket Mortgage",            slug: "rent-mortgage", account: "checking", recurring: { intervalDays: 30, intervalLabel: "monthly", amount: 4650, variance: 0 }, note: "P&I + escrow" },
  { name: "Westlake Hills HOA",         slug: "other-household", account: "checking", recurring: { intervalDays: 30, intervalLabel: "monthly", amount: 195 } },
  { name: "Austin Energy",              slug: "utilities", account: "checking", recurring: { intervalDays: 30, intervalLabel: "monthly", amount: 168, variance: 64 }, note: "summer AC spikes" },
  { name: "Texas Gas Service",          slug: "utilities", account: "checking", recurring: { intervalDays: 30, intervalLabel: "monthly", amount: 44, variance: 18 } },
  { name: "City of Austin Water",       slug: "utilities", account: "checking", recurring: { intervalDays: 30, intervalLabel: "monthly", amount: 78, variance: 14 } },
  { name: "Spectrum Internet",          slug: "utilities", account: "checking", recurring: { intervalDays: 30, intervalLabel: "monthly", amount: 94 } },
  { name: "Texas Disposal Systems",     slug: "utilities", account: "checking", recurring: { intervalDays: 30, intervalLabel: "monthly", amount: 41 } },
  { name: "Allstate Home Insurance",    slug: "insurance-housing", account: "checking", recurring: { intervalDays: 30, intervalLabel: "monthly", amount: 178 } },
  { name: "Maid Brigade",               slug: "domestic-help", account: "checking", recurring: { intervalDays: 14, intervalLabel: "biweekly", amount: 240 } },
  { name: "TruGreen Lawn Care",         slug: "maintenance", account: "amex", recurring: { intervalDays: 30, intervalLabel: "monthly", amount: 92 } },
  { name: "ABC Home & Commercial Pest", slug: "maintenance", account: "amex", recurring: { intervalDays: 90, intervalLabel: "quarterly", amount: 135 } },
  { name: "Home Depot",                 slug: "maintenance", account: "amex", amount: [24, 420], dailyProb: 0.05, weekendBoost: 1.5 },
  { name: "Lowe's",                     slug: "maintenance", account: "amex", amount: [22, 360], dailyProb: 0.03, weekendBoost: 1.5 },
  { name: "ADT Security",               slug: "other-household", account: "checking", recurring: { intervalDays: 30, intervalLabel: "monthly", amount: 52 } },

  // ─── Transportation ───
  { name: "Shell",                      slug: "fuel", account: "sapphire", amount: [44, 82], dailyProb: 0.16 },
  { name: "Chevron",                    slug: "fuel", account: "citi", amount: [42, 78], dailyProb: 0.12 },
  { name: "Costco Gas",                 slug: "fuel", account: "amex", amount: [58, 96], dailyProb: 0.10 },
  { name: "Toyota Financial",           slug: "car-payment", account: "checking", recurring: { intervalDays: 30, intervalLabel: "monthly", amount: 612 }, note: "Highlander" },
  { name: "Honda Financial Services",   slug: "car-payment", account: "checking", recurring: { intervalDays: 30, intervalLabel: "monthly", amount: 398 }, note: "CR-V" },
  { name: "State Farm Auto",            slug: "car-insurance", account: "checking", recurring: { intervalDays: 30, intervalLabel: "monthly", amount: 286 }, note: "two vehicles + teen permit" },
  { name: "Toyota of Austin Service",   slug: "car-maintenance", account: "sapphire", amount: [120, 720], dailyProb: 0.012 },
  { name: "Discount Tire",              slug: "car-maintenance", account: "sapphire", amount: [180, 980], dailyProb: 0.006 },
  { name: "Jiffy Lube",                 slug: "car-maintenance", account: "citi", amount: [62, 130], dailyProb: 0.01 },
  { name: "Uber",                       slug: "ride-share", account: "citi", amount: [9, 42], dailyProb: 0.14 },
  { name: "Lyft",                       slug: "ride-share", account: "citi", amount: [8, 34], dailyProb: 0.08 },
  { name: "TxTag Tolls",                slug: "other-transport", account: "checking", recurring: { intervalDays: 30, intervalLabel: "monthly", amount: 38, variance: 14 } },
  { name: "Austin Airport Parking",     slug: "parking", account: "sapphire", amount: [24, 96], dailyProb: 0.015 },

  // ─── Groceries & shopping ───
  { name: "H-E-B",                      slug: "groceries-food-drink", account: "amex", amount: [95, 320], dailyProb: 0.5, weekendBoost: 1.5 },
  { name: "Costco Wholesale",           slug: "groceries-food-drink", account: "amex", amount: [210, 560], dailyProb: 0.12, weekendBoost: 1.8 },
  { name: "Whole Foods Market",         slug: "groceries-food-drink", account: "sapphire", amount: [68, 195], dailyProb: 0.18 },
  { name: "Trader Joe's",               slug: "groceries-food-drink", account: "citi", amount: [55, 145], dailyProb: 0.14 },
  { name: "Sprouts Farmers Market",     slug: "groceries-food-drink", account: "citi", amount: [40, 120], dailyProb: 0.08 },
  { name: "Target",                     slug: "online-shopping", account: "citi", amount: [28, 240], dailyProb: 0.28, weekendBoost: 1.3, backToSchool: true, holiday: true },
  { name: "Amazon.com",                 slug: "online-shopping", account: "citi", amount: [12, 190], dailyProb: 0.5, holiday: true, backToSchool: true },
  { name: "Walmart",                    slug: "online-shopping", account: "amex", amount: [22, 165], dailyProb: 0.14 },
  { name: "Apple Store",                slug: "technology", account: "sapphire", amount: [29, 1399], dailyProb: 0.02, holiday: true },
  { name: "Best Buy",                   slug: "technology", account: "sapphire", amount: [39, 880], dailyProb: 0.02, holiday: true },
  { name: "IKEA",                       slug: "electronics", account: "amex", amount: [45, 520], dailyProb: 0.02, weekendBoost: 1.6 },
  { name: "Wayfair",                    slug: "electronics", account: "citi", amount: [60, 640], dailyProb: 0.012 },
  { name: "The Home Depot Garden",      slug: "electronics", account: "amex", amount: [25, 220], dailyProb: 0.02 },
  { name: "Lululemon",                  slug: "apparel", account: "sapphire", amount: [78, 268], dailyProb: 0.03 },
  { name: "Nike",                       slug: "apparel", account: "sapphire", amount: [55, 210], dailyProb: 0.04, backToSchool: true },
  { name: "Old Navy",                   slug: "apparel", account: "citi", amount: [28, 145], dailyProb: 0.05, backToSchool: true },
  { name: "Carter's / OshKosh",         slug: "apparel", account: "citi", amount: [32, 130], dailyProb: 0.03, backToSchool: true, note: "Mia's clothes" },
  { name: "Nordstrom",                  slug: "apparel", account: "sapphire", amount: [90, 420], dailyProb: 0.015, holiday: true },
  { name: "Sephora",                    slug: "personal-care", account: "citi", amount: [38, 188], dailyProb: 0.03 },
  { name: "Ulta Beauty",                slug: "personal-care", account: "citi", amount: [28, 120], dailyProb: 0.025 },
  { name: "Sport Clips",                slug: "personal-care", account: "amex", amount: [22, 38], dailyProb: 0.04, note: "Marcus + boys" },
  { name: "Bird's Barbershop",          slug: "personal-care", account: "citi", amount: [60, 180], dailyProb: 0.02, note: "Elena + Mia" },
  { name: "Chewy",                      slug: "other-shopping", account: "amex", recurring: { intervalDays: 30, intervalLabel: "monthly", amount: 96 }, note: "dog - food + meds" },
  { name: "PetSmart",                   slug: "other-shopping", account: "citi", amount: [24, 120], dailyProb: 0.03 },

  // ─── Dining & entertainment ───
  { name: "Starbucks",                  slug: "restaurants-delivery", account: "citi", amount: [5, 16], dailyProb: 0.42 },
  { name: "Chick-fil-A",                slug: "restaurants-delivery", account: "amex", amount: [18, 48], dailyProb: 0.3, weekendBoost: 1.4 },
  { name: "Torchy's Tacos",             slug: "restaurants-delivery", account: "citi", amount: [24, 62], dailyProb: 0.18, weekendBoost: 1.5 },
  { name: "Chipotle",                   slug: "restaurants-delivery", account: "amex", amount: [22, 58], dailyProb: 0.2 },
  { name: "P. Terry's Burger Stand",    slug: "restaurants-delivery", account: "citi", amount: [16, 44], dailyProb: 0.16 },
  { name: "Whataburger",                slug: "restaurants-delivery", account: "amex", amount: [14, 42], dailyProb: 0.14, weekendBoost: 1.3 },
  { name: "DoorDash",                   slug: "restaurants-delivery", account: "citi", amount: [28, 92], dailyProb: 0.22, weekendBoost: 1.4 },
  { name: "Uchi Austin",                slug: "restaurants-delivery", account: "sapphire", amount: [140, 360], dailyProb: 0.012, weekendBoost: 2.0, note: "date night" },
  { name: "Franklin Barbecue",          slug: "restaurants-delivery", account: "sapphire", amount: [55, 150], dailyProb: 0.01, weekendBoost: 1.8 },
  { name: "Netflix",                    slug: "streaming", account: "sapphire", recurring: { intervalDays: 30, intervalLabel: "monthly", amount: 24.99 } },
  { name: "Disney+ Bundle",             slug: "streaming", account: "sapphire", recurring: { intervalDays: 30, intervalLabel: "monthly", amount: 19.99 } },
  { name: "Max",                        slug: "streaming", account: "sapphire", recurring: { intervalDays: 30, intervalLabel: "monthly", amount: 16.99 } },
  { name: "Spotify Family",             slug: "streaming", account: "sapphire", recurring: { intervalDays: 30, intervalLabel: "monthly", amount: 19.99 } },
  { name: "YouTube TV",                 slug: "streaming", account: "sapphire", recurring: { intervalDays: 30, intervalLabel: "monthly", amount: 82.99 } },
  { name: "Amazon Prime",               slug: "streaming", account: "citi", recurring: { intervalDays: 365, intervalLabel: "yearly", amount: 139 } },
  { name: "Apple One",                  slug: "streaming", account: "sapphire", recurring: { intervalDays: 30, intervalLabel: "monthly", amount: 25.95 } },
  { name: "Roblox",                     slug: "gaming", account: "citi", amount: [10, 50], dailyProb: 0.1, note: "kids" },
  { name: "Nintendo eShop",             slug: "gaming", account: "sapphire", amount: [9, 70], dailyProb: 0.05 },
  { name: "PlayStation Store",          slug: "gaming", account: "sapphire", amount: [10, 70], dailyProb: 0.04 },
  { name: "Alamo Drafthouse",           slug: "events-concerts", account: "citi", amount: [42, 110], dailyProb: 0.04, weekendBoost: 2.2 },
  { name: "Main Event",                 slug: "events-concerts", account: "citi", amount: [60, 160], dailyProb: 0.03, weekendBoost: 2.0, note: "kids' outings" },
  { name: "Live Nation",                slug: "events-concerts", account: "sapphire", amount: [120, 540], dailyProb: 0.008 },
  { name: "Michaels",                   slug: "hobbies", account: "citi", amount: [18, 95], dailyProb: 0.04, note: "crafts" },
  { name: "The Driskill Bar",           slug: "bars-nightlife-ent", account: "sapphire", amount: [48, 165], dailyProb: 0.025, weekendBoost: 2.2 },

  // ─── Health & fitness ───
  { name: "Blue Cross Blue Shield TX",  slug: "health-insurance", account: "checking", recurring: { intervalDays: 30, intervalLabel: "monthly", amount: 468 }, note: "family HDHP premium share" },
  { name: "CVS Pharmacy",               slug: "medical", account: "citi", amount: [12, 110], dailyProb: 0.08 },
  { name: "Austin Regional Clinic",     slug: "medical", account: "checking", amount: [40, 280], dailyProb: 0.02, note: "copays" },
  { name: "Dell Children's Pediatrics", slug: "medical", account: "checking", amount: [35, 220], dailyProb: 0.02 },
  { name: "Westlake Dental",            slug: "medical", account: "sapphire", amount: [90, 380], dailyProb: 0.01 },
  { name: "Austin Orthodontics",        slug: "medical", account: "checking", recurring: { intervalDays: 30, intervalLabel: "monthly", amount: 265 }, note: "Ava's braces - 24mo plan" },
  { name: "Lifetime Fitness",           slug: "fitness", account: "sapphire", recurring: { intervalDays: 30, intervalLabel: "monthly", amount: 229 }, note: "family membership" },
  { name: "Orangetheory Fitness",       slug: "fitness", account: "citi", recurring: { intervalDays: 30, intervalLabel: "monthly", amount: 159 }, note: "Elena" },

  // ─── Kids: education & activities ───
  { name: "Eanes ISD Aftercare",        slug: "school", account: "checking", recurring: { intervalDays: 30, intervalLabel: "monthly", amount: 540 }, note: "Noah + Mia" },
  { name: "Eanes ISD Lunch Account",    slug: "school", account: "checking", recurring: { intervalDays: 30, intervalLabel: "monthly", amount: 180 } },
  { name: "Lonestar SC Soccer",         slug: "extracurricular", account: "checking", recurring: { intervalDays: 30, intervalLabel: "monthly", amount: 195 }, note: "Noah - club soccer" },
  { name: "Austin Piano Academy",       slug: "extracurricular", account: "checking", recurring: { intervalDays: 30, intervalLabel: "monthly", amount: 220 }, note: "Ava" },
  { name: "Ballet Austin",              slug: "extracurricular", account: "checking", recurring: { intervalDays: 30, intervalLabel: "monthly", amount: 165 }, note: "Mia" },
  { name: "Kumon Math & Reading",       slug: "extracurricular", account: "checking", recurring: { intervalDays: 30, intervalLabel: "monthly", amount: 320 }, note: "Noah + Mia tutoring" },
  { name: "Nitro Swim School",          slug: "extracurricular", account: "citi", amount: [60, 140], dailyProb: 0.02 },
  { name: "Scholastic Book Fair",       slug: "books-media-edu", account: "citi", amount: [18, 78], dailyProb: 0.03, backToSchool: true },
  { name: "Audible",                    slug: "books-media-edu", account: "sapphire", recurring: { intervalDays: 30, intervalLabel: "monthly", amount: 14.95 } },
  { name: "The New York Times",         slug: "books-media-edu", account: "sapphire", recurring: { intervalDays: 30, intervalLabel: "monthly", amount: 17 } },
  { name: "Coursera Plus",              slug: "courses", account: "sapphire", recurring: { intervalDays: 365, intervalLabel: "yearly", amount: 399 }, note: "Marcus - upskilling" },

  // ─── Financial fees ───
  { name: "Chase Monthly Service Fee",  slug: "bank-fees", account: "checking", amount: [12, 35], dailyProb: 0.012 },
  { name: "Vanguard Advisory Fee",      slug: "investment-fees", account: "brokerage", amount: [40, 120], dailyProb: 0.01 },
  { name: "ATM Withdrawal",             slug: "atm-withdrawal-outflow", account: "checking", amount: [40, 200], dailyProb: 0.06 },
  { name: "Out-of-Network ATM Fee",     slug: "atm-fees", account: "checking", amount: [3, 5], dailyProb: 0.01 },

  // ─── Gifts & charity ───
  { name: "World Central Kitchen",      slug: "charity", account: "sapphire", recurring: { intervalDays: 30, intervalLabel: "monthly", amount: 100 } },
  { name: "St. Jude Children's",        slug: "charity", account: "citi", recurring: { intervalDays: 30, intervalLabel: "monthly", amount: 75 } },
  { name: "Amazon - Gifts",        slug: "gifts", account: "citi", amount: [25, 220], dailyProb: 0.05, holiday: true },
  { name: "Tiff's Treats",              slug: "gifts", account: "citi", amount: [28, 75], dailyProb: 0.03, note: "kids' birthday parties" },

  // ─── Travel (populated by the vacation engine; defined for catalog) ───
  { name: "United Airlines",            slug: "flights", account: "sapphire", amount: [320, 1850] },
  { name: "Southwest Airlines",         slug: "flights", account: "sapphire", amount: [260, 1280] },
  { name: "Delta Air Lines",            slug: "flights", account: "sapphire", amount: [340, 1720] },
  { name: "Marriott Bonvoy",            slug: "accommodation", account: "sapphire", amount: [240, 720] },
  { name: "Airbnb",                     slug: "accommodation", account: "sapphire", amount: [180, 940] },
  { name: "Hilton Hotels",              slug: "accommodation", account: "sapphire", amount: [210, 680] },
  { name: "Hertz",                      slug: "car-rental", account: "sapphire", amount: [140, 520] },
  { name: "Enterprise Rent-A-Car",      slug: "car-rental", account: "sapphire", amount: [120, 480] },
  { name: "Walt Disney World",          slug: "travel-activities", account: "sapphire", amount: [220, 1240], country: "US" },
  { name: "Vail Resorts",               slug: "travel-activities", account: "sapphire", amount: [180, 980], country: "US" },
  { name: "Allianz Travel Insurance",   slug: "travel-insurance", account: "sapphire", amount: [90, 280] },
  { name: "Trattoria al Moro",          slug: "travel-meals", account: "sapphire", amount: [60, 220], country: "IT" },
  { name: "Caf\u00e9 de Flore",         slug: "travel-meals", account: "sapphire", amount: [45, 160], country: "FR" },
  { name: "El Tigre Restaurante",       slug: "travel-meals", account: "sapphire", amount: [38, 140], country: "MX" },

  // ─── Taxes ───
  { name: "Travis County Tax Office",   slug: "property-tax-2", account: "checking" },
  { name: "IRS Estimated Tax",          slug: "income-tax", account: "checking" },

  // ─── Transfers / savings (savings flow, from checking) ───
  { name: "Vanguard Auto-Invest",       slug: "internal-transfer", account: "checking", recurring: { intervalDays: 30, intervalLabel: "monthly", amount: 2000 }, note: "taxable brokerage" },
  { name: "Fidelity 401(k) Contribution", slug: "internal-transfer", account: "checking", recurring: { intervalDays: 14, intervalLabel: "biweekly", amount: 900 }, note: "Marcus - pre-tax" },
  { name: "529 Contribution - Ava",  slug: "internal-transfer", account: "checking", recurring: { intervalDays: 30, intervalLabel: "monthly", amount: 400 } },
  { name: "529 Contribution - Noah", slug: "internal-transfer", account: "checking", recurring: { intervalDays: 30, intervalLabel: "monthly", amount: 350 } },
  { name: "529 Contribution - Mia",  slug: "internal-transfer", account: "checking", recurring: { intervalDays: 30, intervalLabel: "monthly", amount: 350 } },
  { name: "Emergency Fund Transfer",    slug: "internal-transfer", account: "checking", recurring: { intervalDays: 30, intervalLabel: "monthly", amount: 600 } },

  // ─── Card payments (misc, from checking) ───
  { name: "Payment - Sapphire Reserve", slug: "card-payments", account: "checking" },
  { name: "Payment - Citi Double Cash", slug: "card-payments", account: "checking" },
  { name: "Payment - Amex Blue Cash",   slug: "card-payments", account: "checking" },
];

const INFLOW_SLUGS = new Set(["salary", "side-income", "investment-returns", "refunds", "freelance"]);

// ─── Clone system categories into user_categories ────────────────────────────
async function ensureUserCategories(): Promise<{ slugToId: Map<string, number>; slugToFlow: Map<string, string> }> {
  // The global `merchants` table can hold FK references to this demo user's
  // categories from a previous seed. Null them out before deleting categories.
  await sql`
    UPDATE merchants SET category_id = NULL
    WHERE category_id IN (SELECT id FROM user_categories WHERE user_id = ${DEMO_USER_ID})
  `;
  await sql`DELETE FROM user_categories WHERE user_id = ${DEMO_USER_ID}`;

  const sysRows = (await sql`
    SELECT id, name, slug, parent_id, icon, color, sort_order, subcategory_type, flow_type
    FROM system_categories ORDER BY parent_id NULLS FIRST, sort_order, id
  `) as Array<{
    id: number; name: string; slug: string; parent_id: number | null;
    icon: string | null; color: string | null; sort_order: number;
    subcategory_type: string | null; flow_type: string;
  }>;

  const sysIdToUserId = new Map<number, number>();
  for (const r of sysRows.filter((s) => s.parent_id === null)) {
    const inserted = (await sql`
      INSERT INTO user_categories (user_id, name, slug, parent_id, icon, color, sort_order, subcategory_type, flow_type, system_category_id)
      VALUES (${DEMO_USER_ID}, ${r.name}, ${r.slug}, NULL, ${r.icon}, ${r.color}, ${r.sort_order}, ${r.subcategory_type as string | null}, ${r.flow_type as string}, ${r.id})
      RETURNING id
    `) as Array<{ id: number }>;
    sysIdToUserId.set(r.id, inserted[0]!.id);
  }
  for (const r of sysRows.filter((s) => s.parent_id !== null)) {
    const parentUserId = sysIdToUserId.get(r.parent_id!);
    const inserted = (await sql`
      INSERT INTO user_categories (user_id, name, slug, parent_id, icon, color, sort_order, subcategory_type, flow_type, system_category_id)
      VALUES (${DEMO_USER_ID}, ${r.name}, ${r.slug}, ${parentUserId ?? null}, ${r.icon}, ${r.color}, ${r.sort_order}, ${r.subcategory_type as string | null}, ${r.flow_type as string}, ${r.id})
      RETURNING id
    `) as Array<{ id: number }>;
    sysIdToUserId.set(r.id, inserted[0]!.id);
  }

  const slugToId = new Map<string, number>();
  const slugToFlow = new Map<string, string>();
  const all = (await sql`SELECT id, slug, flow_type FROM user_categories WHERE user_id = ${DEMO_USER_ID}`) as Array<{ id: number; slug: string; flow_type: string }>;
  for (const r of all) { slugToId.set(r.slug, r.id); slugToFlow.set(r.slug, r.flow_type); }
  return { slugToId, slugToFlow };
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
  await sql`DELETE FROM net_worth_items WHERE user_id = ${DEMO_USER_ID}`;
  await sql`DELETE FROM net_worth_settings WHERE user_id = ${DEMO_USER_ID}`;
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

async function ensureMerchant(name: string, categoryId: number | null): Promise<number> {
  const existing = (await sql`SELECT id FROM merchants WHERE canonical_name = ${name} LIMIT 1`) as Array<{ id: number }>;
  if (existing[0]) return existing[0].id;
  const inserted = (await sql`
    INSERT INTO merchants (canonical_name, category_id, country_iso, transaction_count)
    VALUES (${name}, ${categoryId}, 'US', 0) RETURNING id
  `) as Array<{ id: number }>;
  return inserted[0]!.id;
}

interface TxnDraft {
  accountId: string;
  postedDate: string;
  rawDescription: string;
  merchantId: number;
  merchantName: string;
  categoryId: number;
  baseAmount: number; // signed: negative outflow, positive inflow
  baseCurrency: string;
  foreignAmount?: number | null;
  foreignCurrency?: string | null;
  implicitFxRate?: number | null;
  countryIso?: string | null;
  isRecurring: boolean;
}

async function bulkInsertTransactions(rows: TxnDraft[]): Promise<void> {
  const CHUNK = 250;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
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

// ─── Generation ──────────────────────────────────────────────────────────────
async function generateTransactions(
  accountIds: Map<string, string>,
  slugToId: Map<string, number>,
): Promise<{ drafts: TxnDraft[]; merchantIdByName: Map<string, number> }> {
  const drafts: TxnDraft[] = [];

  const merchantIdByName = new Map<string, number>();
  for (const m of MERCHANTS) {
    const catId = slugToId.get(m.slug) ?? null;
    merchantIdByName.set(m.name, await ensureMerchant(m.name, catId));
  }

  const push = (
    m: MerchantSeed,
    date: Date,
    signedAmount: number,
    foreign?: { amount: number; currency: string; rate: number; country: string },
  ) => {
    const accountId = accountIds.get(m.account)!;
    const merchantId = merchantIdByName.get(m.name)!;
    const categoryId = slugToId.get(m.slug);
    if (!categoryId || !accountId) return; // skip anything unmapped
    const country = foreign?.country ?? m.country ?? "US";
    const desc = foreign
      ? `${m.name.toUpperCase()} ${foreign.currency} ${country}`
      : signedAmount > 0
        ? `ACH CREDIT - ${m.name.toUpperCase()}`
        : `${m.name.toUpperCase()}`;
    drafts.push({
      accountId,
      postedDate: ymd(date),
      rawDescription: desc,
      merchantId,
      merchantName: m.name,
      categoryId,
      baseAmount: +signedAmount.toFixed(2),
      baseCurrency: HOME_CURRENCY,
      foreignAmount: foreign ? +foreign.amount.toFixed(2) : null,
      foreignCurrency: foreign ? foreign.currency : null,
      implicitFxRate: foreign ? foreign.rate : null,
      countryIso: country,
      isRecurring: !!m.recurring,
    });
  };

  const sign = (m: MerchantSeed) => (INFLOW_SLUGS.has(m.slug) ? 1 : -1);

  // 1. Recurring merchants on a fixed cadence, with raises (salary) + drift.
  for (const m of MERCHANTS.filter((x) => x.recurring)) {
    const r = m.recurring!;
    const offset = Math.abs((m.name.charCodeAt(0) + m.name.charCodeAt(m.name.length - 1)) % 27);
    let cur = addDays(START, offset);
    let guard = 0;
    while (cur <= END && guard++ < 400) {
      const variance = r.variance ?? 0;
      let amt = r.amount + (variance > 0 ? (rand() * 2 - 1) * variance : 0);
      const yrs = yearsSinceStart(cur);
      if (m.slug === "salary" || m.slug === "side-income") {
        amt *= 1 + 0.035 * yrs; // annual raises
      } else if (!INFLOW_SLUGS.has(m.slug) && m.slug !== "rent-mortgage" && m.slug !== "card-payments") {
        amt *= 1 + (m.inflation ?? 0.028) * yrs; // bills drift up modestly
      }
      push(m, cur, amt * sign(m));
      cur = addDays(cur, r.intervalDays);
    }
  }

  // 2. Everyday probabilistic spend.
  const everyday = MERCHANTS.filter((m) => !m.recurring && m.amount && m.dailyProb);
  let day = new Date(START);
  while (day <= END) {
    const mo = day.getUTCMonth();
    const yrs = yearsSinceStart(day);
    for (const m of everyday) {
      let prob = m.dailyProb!;
      if (m.holiday && mo === 11) prob *= 1.7;
      if (m.backToSchool && mo === 7) prob *= 1.8;
      if (dayOfWeek(day) === 0 && (m.slug === "technology" || m.slug === "electronics")) prob *= 0.4;
      if (!chance(prob)) continue;
      const [lo, hi] = m.amount!;
      let amt = randFloat(lo, hi);
      if (m.weekendBoost && isWeekend(day)) amt *= m.weekendBoost;
      amt *= 1 + (m.inflation ?? 0.03) * yrs;
      push(m, day, amt * sign(m));
    }
    day = addDays(day, 1);
  }

  // 3. Annual events per calendar year in range.
  for (let yr = START.getUTCFullYear(); yr <= END.getUTCFullYear(); yr++) {
    const within = (d: Date) => d >= START && d <= END;
    const yrs = (d: Date) => yearsSinceStart(d);

    // Property tax (escrowed elsewhere but a direct supplemental payment each Jan)
    const propTax = MERCHANTS.find((x) => x.name === "Travis County Tax Office")!;
    const propDate = new Date(Date.UTC(yr, 0, 28));
    if (within(propDate)) push(propTax, propDate, -(12800 + randFloat(-400, 900)) * (1 + 0.04 * yrs(propDate)));

    // Tax season: refund (~60%) or estimated payment.
    const aprDate = new Date(Date.UTC(yr, 3, 14));
    if (within(aprDate)) {
      if (chance(0.6)) {
        const refund = MERCHANTS.find((x) => x.name === "IRS Tax Refund")!;
        push(refund, aprDate, +(3200 + randFloat(200, 5200)));
      } else {
        const irs = MERCHANTS.find((x) => x.name === "IRS Estimated Tax")!;
        push(irs, aprDate, -(2600 + randFloat(0, 4200)));
      }
    }

    // Annual bonus (Marcus) mid-February.
    const bonusDate = new Date(Date.UTC(yr, 1, 15));
    if (within(bonusDate)) {
      const payroll = MERCHANTS.find((x) => x.name === "Apex Semiconductor Payroll")!;
      push(payroll, bonusDate, +(28000 + randFloat(0, 16000)) * (1 + 0.04 * yrs(bonusDate)));
    }

    // Quarterly brokerage dividends.
    for (const month of [2, 5, 8, 11]) {
      const d = new Date(Date.UTC(yr, month, 14));
      if (!within(d)) continue;
      const div = MERCHANTS.find((x) => x.name === "Vanguard Dividend")!;
      push(div, d, +(520 + randFloat(40, 460)) * (1 + 0.05 * yrs(d)));
    }

    // Monthly HYSA interest.
    for (let month = 0; month < 12; month++) {
      const d = new Date(Date.UTC(yr, month, 1));
      if (!within(d)) continue;
      const interest = MERCHANTS.find((x) => x.name === "Ally Savings Interest")!;
      push(interest, d, +(140 + randFloat(20, 120)));
    }

    // Back-to-school burst (mid-August): supplies, clothes, electronics for 3 kids.
    for (let i = 0; i < 10; i++) {
      const d = new Date(Date.UTC(yr, 7, 8 + i));
      if (!within(d)) continue;
      if (chance(0.55)) {
        const m = pick(MERCHANTS.filter((x) => x.backToSchool));
        const [lo, hi] = x_amount(m);
        push(m, d, -(randFloat(lo, hi) * randFloat(1.2, 1.9)));
      }
    }

    // Summer camps (June-July), one cluster per kid.
    const campNames = ["Camp Champions", "iD Tech Camp", "YMCA Summer Camp"];
    for (let k = 0; k < 3; k++) {
      const campDate = new Date(Date.UTC(yr, 5, 5 + k * 9));
      if (!within(campDate)) continue;
      // Represent camps as Education/school spend on checking.
      const school = MERCHANTS.find((x) => x.name === "Eanes ISD Aftercare")!;
      const draftMerchant: MerchantSeed = { ...school, name: campNames[k]!, slug: "school", account: "checking" };
      merchantIdByName.set(draftMerchant.name, await ensureMerchant(draftMerchant.name, slugToId.get("school") ?? null));
      push(draftMerchant, campDate, -(randFloat(950, 1850)));
    }

    // Holiday gift spree (Dec 6-22).
    for (let i = 0; i < 16; i++) {
      const d = new Date(Date.UTC(yr, 11, 6 + i));
      if (!within(d)) break;
      if (chance(0.5)) {
        const m = pick(MERCHANTS.filter((x) => x.holiday || x.slug === "gifts" || x.slug === "technology"));
        const [lo, hi] = x_amount(m);
        push(m, d, -(randFloat(lo, hi) * randFloat(1.3, 2.4)));
      }
    }

    // Kids' birthday parties: Ava (Mar), Noah (Sep), Mia (Jun).
    for (const bMonth of [2, 8, 5]) {
      const d = new Date(Date.UTC(yr, bMonth, randInt(8, 22)));
      if (!within(d)) continue;
      const party = MERCHANTS.find((x) => x.name === "Main Event")!;
      push(party, d, -(randFloat(380, 920)));
      const gifts = MERCHANTS.find((x) => x.name === "Amazon - Gifts")!;
      push(gifts, d, -(randFloat(120, 360)));
    }
  }

  // 4. Vacations.
  for (const v of buildVacationCalendar()) {
    if (v.start > END || v.start < START) continue;
    const trip = (name: string) => MERCHANTS.find((m) => m.name === name);
    const flight = trip(pick(["United Airlines", "Southwest Airlines", "Delta Air Lines"]))!;
    push(flight, v.start, -(randFloat(900, 2600) * (v.country === "US" ? 1 : 1.7)));
    const lodge = trip(v.country === "US" ? pick(["Marriott Bonvoy", "Hilton Hotels", "Airbnb"]) : "Airbnb")!;
    for (let n = 0; n < Math.ceil(v.days / 2); n++) push(lodge, addDays(v.start, n * 2), -(randFloat(260, 720)));
    const rental = trip(pick(["Hertz", "Enterprise Rent-A-Car"]))!;
    push(rental, v.start, -(randFloat(180, 520)));
    if (v.insurance) push(trip("Allianz Travel Insurance")!, addDays(v.start, -7), -(randFloat(90, 240)));

    for (let i = 0; i < v.days; i++) {
      const d = addDays(v.start, i);
      if (d > END) break;
      if (v.activity && chance(0.5)) push(trip(v.activity)!, d, -(randFloat(180, 980)));
      if (chance(0.85)) {
        const baseAmt = randFloat(48, 240);
        if (v.country !== "US" && v.fx) {
          const meals = trip(v.fxMerchant!)!;
          const foreignAmt = baseAmt * v.fx.rate;
          push(meals, d, -baseAmt, { amount: foreignAmt, currency: v.fx.currency, rate: v.fx.rate, country: v.country });
        } else {
          const dom = trip("DoorDash")!;
          push(dom, d, -baseAmt);
        }
      }
    }
  }

  // 5. Card payment transfers (settle each card monthly from checking).
  for (const cardPay of ["Payment - Sapphire Reserve", "Payment - Citi Double Cash", "Payment - Amex Blue Cash"]) {
    const m = MERCHANTS.find((x) => x.name === cardPay)!;
    let cur = addDays(START, 23 + Math.abs(cardPay.length % 6));
    while (cur <= END) {
      push(m, cur, -(randFloat(1800, 4400)));
      cur = addDays(cur, 30);
    }
  }

  drafts.sort((a, b) => a.postedDate.localeCompare(b.postedDate));
  return { drafts, merchantIdByName };
}

function x_amount(m: MerchantSeed): [number, number] {
  return m.amount ?? [40, 200];
}

interface VacationPlan {
  start: Date;
  days: number;
  country: string;
  activity?: string;
  insurance?: boolean;
  fx?: { rate: number; currency: string };
  fxMerchant?: string;
}
function buildVacationCalendar(): VacationPlan[] {
  // ~1.5 trips/year over 5 years: alternate a summer trip and a winter/spring trip.
  const trips: VacationPlan[] = [];
  const startYr = START.getUTCFullYear();
  const plans: Array<Omit<VacationPlan, "start">> = [
    { days: 8, country: "US", activity: "Walt Disney World" },
    { days: 6, country: "US", activity: "Vail Resorts" },
    { days: 9, country: "IT", insurance: true, fx: { rate: 0.92, currency: "EUR" }, fxMerchant: "Trattoria al Moro" },
    { days: 5, country: "MX", fx: { rate: 17.2, currency: "MXN" }, fxMerchant: "El Tigre Restaurante" },
    { days: 7, country: "US", activity: "Vail Resorts" },
    { days: 10, country: "FR", insurance: true, fx: { rate: 0.92, currency: "EUR" }, fxMerchant: "Caf\u00e9 de Flore" },
    { days: 8, country: "US", activity: "Walt Disney World" },
    { days: 6, country: "US" },
  ];
  let pi = 0;
  for (let y = 0; y <= YEARS; y++) {
    const yr = startYr + y;
    // Summer trip (July)
    trips.push({ ...plans[pi % plans.length]!, start: new Date(Date.UTC(yr, 6, randInt(6, 20))) });
    pi++;
    // Spring/winter trip in odd cadence
    if (y % 1 === 0) {
      trips.push({ ...plans[pi % plans.length]!, start: new Date(Date.UTC(yr, pick([2, 11]), randInt(15, 26))) });
      pi++;
    }
  }
  return trips;
}

// ─── Recurring patterns mirror ────────────────────────────────────────────────
async function seedRecurringPatterns(slugToId: Map<string, number>, merchantIdByName: Map<string, number>) {
  for (const m of MERCHANTS.filter((x) => x.recurring)) {
    const r = m.recurring!;
    const merchantId = merchantIdByName.get(m.name);
    const categoryId = slugToId.get(m.slug);
    if (!merchantId || !categoryId) continue;
    const expected = +(r.amount * (INFLOW_SLUGS.has(m.slug) ? 1 : -1)).toFixed(2);
    const next = addDays(END, randInt(2, r.intervalDays));
    const last = addDays(END, -randInt(1, r.intervalDays));
    await sql`
      INSERT INTO recurring_patterns
        (user_id, merchant_name, merchant_id, category_id, interval_days, interval_label, expected_amount, amount_variance, currency, next_expected_date, last_seen_date, occurrence_count, is_active)
      VALUES
        (${DEMO_USER_ID}, ${m.name}, ${merchantId}, ${categoryId}, ${r.intervalDays}, ${r.intervalLabel}, ${expected}, ${r.variance ?? 0}, ${HOME_CURRENCY}, ${ymd(next)}, ${ymd(last)}, ${Math.max(1, Math.floor((YEARS * 365) / r.intervalDays))}, true)
      ON CONFLICT (user_id, merchant_name, interval_label) DO NOTHING
    `;
  }
}

// ─── Goals ─────────────────────────────────────────────────────────────────────
async function seedGoals(accountIds: Map<string, string>) {
  const items: Array<{ name: string; target: number; current: number; years: number; account: string }> = [
    { name: "Emergency Fund \u00b7 6 months",  target: 90000,  current: 58000, years: 1,  account: "savings" },
    { name: "Ava - College (529)",         target: 200000, current: 52000, years: 4,  account: "ava_529" },
    { name: "Noah - College (529)",        target: 200000, current: 39000, years: 7,  account: "noah_529" },
    { name: "Mia - College (529)",         target: 200000, current: 28000, years: 11, account: "mia_529" },
    { name: "Kitchen Remodel",                  target: 65000,  current: 21500, years: 2,  account: "savings" },
    { name: "Tesla Model Y (cash)",             target: 52000,  current: 14800, years: 2,  account: "brokerage" },
  ];
  for (const g of items) {
    const targetDate = ymd(new Date(Date.UTC(END.getUTCFullYear() + g.years, 5, 1)));
    await sql`
      INSERT INTO goals (user_id, name, target_amount, current_amount, currency, target_date, linked_account_ids, is_completed)
      VALUES (${DEMO_USER_ID}, ${g.name}, ${g.target}, ${g.current}, ${HOME_CURRENCY}, ${targetDate}, ${JSON.stringify([accountIds.get(g.account)])}::jsonb, false)
    `;
  }
}

// ─── Budgets ─────────────────────────────────────────────────────────────────
async function seedBudgets(slugToId: Map<string, number>) {
  const items: Array<{ name: string; slug: string; amount: number; threshold?: string }> = [
    { name: "Groceries",              slug: "groceries-food-drink", amount: 2200, threshold: "0.85" },
    { name: "Restaurants & Takeout",  slug: "restaurants-delivery", amount: 1100, threshold: "0.80" },
    { name: "Fuel",                   slug: "fuel",                 amount:  520, threshold: "0.85" },
    { name: "Online Shopping",        slug: "online-shopping",      amount:  800, threshold: "0.75" },
    { name: "Kids - Activities", slug: "extracurricular",      amount: 1200, threshold: "0.90" },
    { name: "Streaming",              slug: "streaming",            amount:  220, threshold: "0.90" },
    { name: "Travel",                 slug: "accommodation",        amount: 2400, threshold: "0.70" },
  ];
  for (const b of items) {
    const catId = slugToId.get(b.slug);
    if (!catId) continue;
    await sql`
      INSERT INTO budgets (user_id, category_id, name, amount, currency, period, rollover, alert_threshold, is_active)
      VALUES (${DEMO_USER_ID}, ${catId}, ${b.name}, ${b.amount}, ${HOME_CURRENCY}, 'monthly', false, ${b.threshold ?? "0.80"}, true)
    `;
  }
}

// ─── AI insights ───────────────────────────────────────────────────────────────
async function seedInsights() {
  const insights = [
    { type: "leak",     severity: "high",   title: "Streaming stack hit $190/mo",        body: "You now carry 7 streaming subscriptions totaling $190/mo - up from $98/mo two years ago. Rotating Max and Disney+ seasonally would save about $440/yr." },
    { type: "leak",     severity: "medium", title: "Delivery spend creeping up",          body: "DoorDash + Uber Eats reached $420 last month vs a $260 trailing average. That is roughly one extra family takeout night per week." },
    { type: "win",      severity: "info",   title: "Mortgage is 23% of take-home",        body: "Your $4,650 housing payment sits at a healthy 23% of after-tax income - comfortably inside the 28% guideline for Austin." },
    { type: "alert",    severity: "high",   title: "Three card payments due this week",   body: "$8,200 across Sapphire, Citi and Amex is due in 6 days. Checking has ample balance - clear to autopay in full and avoid interest." },
    { type: "behavior", severity: "info",   title: "Weekend grocery clustering",          body: "78% of grocery runs happen Sat/Sun at H-E-B and Costco. A midweek H-E-B run could trim impulse buys by an estimated 12%." },
    { type: "kids",     severity: "info",   title: "Ava's 529 is slightly behind",        body: "To reach $200k by age 18 at 6% you would need to raise Ava's monthly contribution from $400 to about $560." },
    { type: "kids",     severity: "medium", title: "Orthodontics adds $265/mo",           body: "Ava's braces plan runs through next spring. After it ends, redirecting that $265 to the kitchen-remodel goal hits the target 4 months sooner." },
    { type: "fx",       severity: "low",    title: "Foreign card spread on Italy trip",   body: "Your Sapphire absorbed about 1.3% FX spread abroad - within Visa norms, but a no-FX card would have saved roughly $74 on the trip." },
    { type: "tax",      severity: "medium", title: "Property tax due January 28",         body: "Travis County supplemental looks like ~$13,200 this year, up 4%. Setting aside $1,100/mo smooths the January hit." },
    { type: "savings",  severity: "info",   title: "Savings rate holding at 22%",         body: "Across 401(k), brokerage and three 529s you are investing about 22% of gross income - strong for a household of five." },
    { type: "win",      severity: "info",   title: "Net worth up 14% year over year",     body: "Combined balances grew from $1.18M to $1.34M, led by brokerage gains and steady 529 deposits." },
    { type: "alert",    severity: "low",    title: "Possible duplicate charge",           body: "Two $82.40 Shell charges posted within 9 minutes on the same card. Likely a re-swipe - worth a quick check." },
  ];
  for (let i = 0; i < insights.length; i++) {
    const generated = addDays(END, -(i * 3 + randInt(0, 2)));
    const it = insights[i]!;
    await sql`
      INSERT INTO ai_insights (user_id, insight_type, title, body, severity, metadata, is_read, is_dismissed, generated_at)
      VALUES (${DEMO_USER_ID}, ${it.type}, ${it.title}, ${it.body}, ${it.severity}, '{}'::jsonb, false, false, ${generated.toISOString()})
    `;
  }
}

// ─── Statements ─────────────────────────────────────────────────────────────────
async function seedStatements(accountIds: Map<string, string>) {
  const keys = ["checking", "sapphire", "citi", "amex"];
  for (let i = 0; i < 24; i++) {
    const d = new Date(END);
    d.setUTCMonth(d.getUTCMonth() - (i + 1));
    const periodStart = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
    const periodEnd = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
    for (const k of keys) {
      const fileName = `${k}_${ymd(periodStart).slice(0, 7)}.pdf`;
      const sizeKb = randInt(180, 980);
      await sql`
        INSERT INTO statements (user_id, account_id, file_name, file_size, file_mime_type, file_hash, status, ai_model, ai_processed_at, transactions_imported, transactions_duplicate, period_start, period_end)
        VALUES (${DEMO_USER_ID}, ${accountIds.get(k)}, ${fileName}, ${sizeKb * 1024}, 'application/pdf', ${`hash_demo_${k}_${ymd(periodStart)}`}, 'completed', 'gemini-2.0-flash', ${addDays(periodEnd, 2).toISOString()}, ${randInt(40, 220)}, ${randInt(0, 6)}, ${ymd(periodStart)}, ${ymd(periodEnd)})
      `;
    }
  }
}

async function seedAiCosts() {
  for (let i = 0; i < 36; i++) {
    const d = addDays(END, -randInt(1, YEARS * 365));
    await sql`
      INSERT INTO ai_costs (user_id, ai_model_id, ai_query, input_tokens, input_cost, output_tokens, output_cost, total_cost, created_at)
      VALUES (${DEMO_USER_ID}, 'gemini-2.0-flash', 'statement_categorize', ${randInt(2400, 9800)}, ${randFloat(0.0008, 0.004).toFixed(6)}, ${randInt(800, 2200)}, ${randFloat(0.001, 0.006).toFixed(6)}, ${randFloat(0.002, 0.012).toFixed(6)}, ${d.toISOString()})
    `;
  }
}

// ─── Net worth balance sheet + retirement settings ───────────────────────────
async function seedNetWorth() {
  const marcusAge = 43;
  const birthYear = END.getUTCFullYear() - marcusAge;
  await sql`
    INSERT INTO net_worth_settings
      (user_id, currency, default_growth_rate, monthly_contribution, monthly_contribution_post, inflation_rate,
       current_age, retirement_age, birth_month, birth_year, annual_drawdown, annual_drawdown_pre, show_inflation_adjusted,
       annual_income, income_growth_rate, post_retirement_income, post_retirement_income_start_age)
    VALUES
      (${DEMO_USER_ID}, 'USD', '0.0700', '5600.00', '0.00', '0.0300',
       ${marcusAge}, 62, '5', ${String(birthYear)}, '150000.00', '0.00', false,
       '320000.00', '0.0350', '52000.00', 67)
  `;

  const assets: Array<[string, string, number, number]> = [
    // [category, label, amount, growthRate] - category keys match lib/net-worth.ts catalog
    ["real_estate", "Primary Residence - Westlake Hills", 935000, 0.04],
    ["retirement", "Fidelity 401(k) - Marcus", 438000, 0.07],
    ["investments", "Vanguard Taxable Brokerage", 312000, 0.07],
    ["savings", "Ally Emergency Fund (HYSA)", 58000, 0.045],
    ["investments", "Ava - 529 College", 52000, 0.06],
    ["investments", "Noah - 529 College", 39000, 0.06],
    ["investments", "Mia - 529 College", 28000, 0.06],
    ["cash", "Fidelity HSA", 22000, 0.05],
    ["vehicles", "2022 Toyota Highlander", 31000, -0.08],
    ["vehicles", "2021 Honda CR-V", 23000, -0.08],
  ];
  const liabilities: Array<[string, string, number, number]> = [
    ["mortgage", "Rocket Mortgage - Primary Home", 548000, 0.062],
    ["auto_loan", "Toyota Financial - Highlander", 24500, 0.049],
    ["auto_loan", "Honda Financial - CR-V", 14200, 0.044],
    ["credit_card", "Cards (paid in full monthly)", 6800, 0.219],
  ];

  let order = 0;
  for (const [category, label, amount, growth] of assets) {
    await sql`
      INSERT INTO net_worth_items (user_id, kind, category, label, amount, currency, growth_rate, notes, display_order, is_active)
      VALUES (${DEMO_USER_ID}, 'asset', ${category}, ${label}, ${amount}, 'USD', ${growth.toFixed(4)}, NULL, ${order++}, true)
    `;
  }
  order = 0;
  for (const [category, label, amount, rate] of liabilities) {
    await sql`
      INSERT INTO net_worth_items (user_id, kind, category, label, amount, currency, growth_rate, notes, display_order, is_active)
      VALUES (${DEMO_USER_ID}, 'liability', ${category}, ${label}, ${amount}, 'USD', ${rate.toFixed(4)}, NULL, ${order++}, true)
    `;
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log("\u23f3 Wiping previous demo dataset...");
  await wipeDemo();

  console.log("\ud83d\udc64 Creating demo user...");
  await ensureUser();

  console.log("\ud83c\udfe6 Creating demo accounts...");
  const accountIds = await ensureAccounts();
  console.log("   \u2192", accountIds.size, "accounts");

  console.log("\ud83d\uddc2\ufe0f  Cloning system categories...");
  const { slugToId } = await ensureUserCategories();
  console.log("   \u2192", slugToId.size, "categories");

  console.log(`\ud83d\udcc8 Generating ${YEARS} years of transactions...`);
  const { drafts, merchantIdByName } = await generateTransactions(accountIds, slugToId);
  console.log("   \u2192", drafts.length, "transactions");

  console.log("\ud83d\udcbe Inserting transactions...");
  await bulkInsertTransactions(drafts);

  console.log("\ud83d\udd01 Seeding recurring patterns...");
  await seedRecurringPatterns(slugToId, merchantIdByName);

  console.log("\ud83c\udfaf Seeding goals...");
  await seedGoals(accountIds);

  console.log("\ud83d\udcca Seeding budgets...");
  await seedBudgets(slugToId);

  console.log("\ud83e\udde0 Seeding AI insights...");
  await seedInsights();

  console.log("\ud83d\udcc4 Seeding statements...");
  await seedStatements(accountIds);

  console.log("\ud83d\udcb8 Seeding AI cost rows...");
  await seedAiCosts();

  console.log("\ud83c\udfe0 Seeding net-worth balance sheet + retirement plan...");
  await seedNetWorth();

  console.log("");
  console.log("\u2705 Demo dataset ready (clerk_user_id = 'demo')");

  const stats = (await sql`
    SELECT
      (SELECT COUNT(*) FROM transactions WHERE user_id = ${DEMO_USER_ID})::int AS txns,
      (SELECT COUNT(*) FROM accounts WHERE user_id = ${DEMO_USER_ID})::int AS accts,
      (SELECT COUNT(*) FROM recurring_patterns WHERE user_id = ${DEMO_USER_ID})::int AS recur,
      (SELECT COUNT(*) FROM goals WHERE user_id = ${DEMO_USER_ID})::int AS goals,
      (SELECT COUNT(*) FROM budgets WHERE user_id = ${DEMO_USER_ID})::int AS budgets,
      (SELECT COUNT(*) FROM ai_insights WHERE user_id = ${DEMO_USER_ID})::int AS insights,
      (SELECT COUNT(*) FROM statements WHERE user_id = ${DEMO_USER_ID})::int AS stmts,
      (SELECT COUNT(*) FROM net_worth_items WHERE user_id = ${DEMO_USER_ID})::int AS nw_items,
      (SELECT MIN(posted_date) FROM transactions WHERE user_id = ${DEMO_USER_ID}) AS first_txn,
      (SELECT MAX(posted_date) FROM transactions WHERE user_id = ${DEMO_USER_ID}) AS last_txn
  `) as Array<Record<string, unknown>>;
  console.log("   ", stats[0]);
}

main().catch((e) => {
  console.error("\u274c Demo seed failed:", e);
  process.exit(1);
});




