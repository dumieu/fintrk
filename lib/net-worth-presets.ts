/**
 * Curated catalog of common assets & liabilities a household might own.
 *
 * Each preset carries a Lucide icon (crisp SVG, never an emoji), the
 * canonical asset/liability category it belongs to, and search keywords
 * so the user can find it by typing things like "vanguard", "stocks",
 * "tesla loan", "btc", etc.
 *
 * Goals:
 *   • Eliminate the "manually pick an icon" UX entirely.
 *   • Let the user start typing and add a fully-formed line in one click.
 *   • Keep the per-category aggregation in `lib/net-worth.ts` working —
 *     each preset just maps to one of the existing category ids.
 */

import {
  Wallet,
  Banknote,
  Coins,
  PiggyBank,
  Landmark,
  Vault,
  Shield,
  TrendingUp,
  LineChart,
  BarChart3,
  CandlestickChart,
  Crown,
  Award,
  HeartPulse,
  Home,
  Building2,
  Building,
  Hotel,
  TreePine,
  Car,
  Truck,
  Bike,
  Sailboat,
  Caravan,
  Plane,
  Briefcase,
  Rocket,
  Store,
  UtensilsCrossed,
  Wrench,
  Bitcoin,
  Hexagon,
  Gem,
  Palette,
  Watch,
  Wine,
  Music,
  FileText,
  Sparkles,
  CreditCard,
  GraduationCap,
  BookOpen,
  KeyRound,
  Users,
  Stethoscope,
  Clock,
  FileWarning,
  AlertCircle,
  Receipt,
  type LucideIcon,
} from "lucide-react";

import type { Kind } from "./net-worth";

export interface PresetItem {
  id: string;
  kind: Kind;
  /** Must match a category in ASSET_CATEGORIES / LIABILITY_CATEGORIES. */
  categoryId: string;
  label: string;
  icon: LucideIcon;
  /** Extra strings used by the searcher (lowercased before compare). */
  keywords?: string[];
  /** Optional growth/interest rate override (decimal). */
  growthRate?: number;
}

// ─── ASSET PRESETS ──────────────────────────────────────────────────────────
const ASSETS: PresetItem[] = [
  // Cash & checking ─────────────────────────────────────────────────────────
  { id: "checking",          kind: "asset", categoryId: "cash", label: "Checking account",  icon: Wallet,    keywords: ["bank", "chase", "wells", "boa"] },
  { id: "cash_on_hand",      kind: "asset", categoryId: "cash", label: "Cash on hand",      icon: Banknote,  keywords: ["physical", "wallet"] },
  { id: "paypal",            kind: "asset", categoryId: "cash", label: "PayPal balance",    icon: Wallet,    keywords: ["online"] },
  { id: "venmo",             kind: "asset", categoryId: "cash", label: "Venmo / Cash App",  icon: Wallet,    keywords: ["zelle", "p2p"] },
  { id: "foreign_currency",  kind: "asset", categoryId: "cash", label: "Foreign currency",  icon: Coins,     keywords: ["fx", "euro", "gbp", "yen"] },

  // Savings & HYSA ──────────────────────────────────────────────────────────
  { id: "hysa",              kind: "asset", categoryId: "savings", label: "High-yield savings",        icon: PiggyBank, keywords: ["hysa", "marcus", "ally", "sofi"] },
  { id: "emergency_fund",    kind: "asset", categoryId: "savings", label: "Emergency fund",            icon: Shield,    keywords: ["safety", "buffer", "rainy day"] },
  { id: "money_market",      kind: "asset", categoryId: "savings", label: "Money market account",      icon: Landmark,  keywords: ["mmf", "mma"] },
  { id: "cd",                kind: "asset", categoryId: "savings", label: "CD (certificate of deposit)", icon: Vault,   keywords: ["fixed", "term"] },
  { id: "treasuries",        kind: "asset", categoryId: "savings", label: "Treasury bills / I-bonds",  icon: Landmark,  keywords: ["t-bill", "tbills", "ibonds", "tips"] },

  // Investments / Stocks ────────────────────────────────────────────────────
  { id: "brokerage",         kind: "asset", categoryId: "investments", label: "Brokerage account",         icon: LineChart,        keywords: ["taxable", "investing"] },
  { id: "vanguard",          kind: "asset", categoryId: "investments", label: "Vanguard account",          icon: LineChart,        keywords: ["voo", "vti", "vtsax", "vfiax"] },
  { id: "fidelity",          kind: "asset", categoryId: "investments", label: "Fidelity account",          icon: LineChart,        keywords: ["fxaix", "fzrox"] },
  { id: "schwab",            kind: "asset", categoryId: "investments", label: "Schwab account",            icon: LineChart,        keywords: ["schb", "swppx"] },
  { id: "robinhood",         kind: "asset", categoryId: "investments", label: "Robinhood",                 icon: LineChart,        keywords: ["app", "trading"] },
  { id: "etrade",            kind: "asset", categoryId: "investments", label: "E*TRADE",                   icon: LineChart,        keywords: ["morgan stanley"] },
  { id: "sp500",             kind: "asset", categoryId: "investments", label: "S&P 500 index fund",        icon: TrendingUp,       keywords: ["voo", "spy", "ivv", "vfiax"] },
  { id: "total_market",      kind: "asset", categoryId: "investments", label: "Total market ETF",          icon: TrendingUp,       keywords: ["vti", "itot", "schb"] },
  { id: "international",     kind: "asset", categoryId: "investments", label: "International stock fund",  icon: TrendingUp,       keywords: ["vxus", "ixus", "developed", "emerging"] },
  { id: "dividend_stocks",   kind: "asset", categoryId: "investments", label: "Dividend stocks",           icon: BarChart3,        keywords: ["income", "yield"] },
  { id: "individual_stocks", kind: "asset", categoryId: "investments", label: "Individual stocks",         icon: CandlestickChart, keywords: ["aapl", "msft", "tsla", "googl", "amzn", "nvda"] },
  { id: "bond_fund",         kind: "asset", categoryId: "investments", label: "Bond fund",                 icon: BarChart3,        keywords: ["bnd", "agg", "tlt", "fixed income"] },
  { id: "reit_fund",         kind: "asset", categoryId: "investments", label: "REIT fund",                 icon: Building2,        keywords: ["vnq", "real estate"], growthRate: 0.08 },
  { id: "target_date",       kind: "asset", categoryId: "investments", label: "Target-date fund",          icon: TrendingUp,       keywords: ["vfifx", "blackrock", "lifecycle"] },
  { id: "529",               kind: "asset", categoryId: "investments", label: "529 college savings",       icon: GraduationCap,    keywords: ["college", "education", "kids"] },
  { id: "esop",              kind: "asset", categoryId: "investments", label: "Employee stock (ESPP/RSU)", icon: Briefcase,        keywords: ["espp", "rsu", "options"] },

  // Retirement ──────────────────────────────────────────────────────────────
  { id: "401k",              kind: "asset", categoryId: "retirement", label: "401(k)",                   icon: Crown,        keywords: ["work", "employer", "match"] },
  { id: "roth_ira",          kind: "asset", categoryId: "retirement", label: "Roth IRA",                 icon: Crown,        keywords: ["after-tax", "tax-free"] },
  { id: "traditional_ira",   kind: "asset", categoryId: "retirement", label: "Traditional IRA",          icon: Crown,        keywords: ["pre-tax"] },
  { id: "sep_ira",           kind: "asset", categoryId: "retirement", label: "SEP IRA",                  icon: Crown,        keywords: ["self-employed", "freelance"] },
  { id: "solo_401k",         kind: "asset", categoryId: "retirement", label: "Solo 401(k)",              icon: Crown,        keywords: ["self-employed", "owner"] },
  { id: "rollover_ira",      kind: "asset", categoryId: "retirement", label: "Rollover IRA",             icon: Crown,        keywords: ["old 401k"] },
  { id: "hsa",               kind: "asset", categoryId: "retirement", label: "HSA (health savings)",     icon: HeartPulse,   keywords: ["health", "triple tax"] },
  { id: "pension",           kind: "asset", categoryId: "retirement", label: "Pension (lump sum value)", icon: Award,        keywords: ["defined benefit"] },

  // Real estate ─────────────────────────────────────────────────────────────
  { id: "primary_home",      kind: "asset", categoryId: "real_estate", label: "Primary home",         icon: Home,     keywords: ["house", "residence"] },
  { id: "rental_property",   kind: "asset", categoryId: "real_estate", label: "Rental property",      icon: Building2, keywords: ["airbnb", "tenant", "income"] },
  { id: "vacation_home",     kind: "asset", categoryId: "real_estate", label: "Vacation home",        icon: Hotel,     keywords: ["second home", "beach", "cabin"] },
  { id: "land",              kind: "asset", categoryId: "real_estate", label: "Land",                 icon: TreePine,  keywords: ["lot", "acreage", "raw"] },
  { id: "commercial_re",     kind: "asset", categoryId: "real_estate", label: "Commercial property",  icon: Building,  keywords: ["office", "retail", "warehouse"] },
  { id: "home_equity",       kind: "asset", categoryId: "real_estate", label: "Home equity",          icon: Home,      keywords: ["value minus mortgage"] },

  // Vehicles ────────────────────────────────────────────────────────────────
  { id: "car",               kind: "asset", categoryId: "vehicles", label: "Car",          icon: Car,      keywords: ["auto", "sedan", "tesla", "honda", "toyota"] },
  { id: "truck",             kind: "asset", categoryId: "vehicles", label: "Truck / SUV",  icon: Truck,    keywords: ["pickup", "ford", "chevy", "ram"] },
  { id: "motorcycle",        kind: "asset", categoryId: "vehicles", label: "Motorcycle",   icon: Bike,     keywords: ["harley", "ducati", "moto"] },
  { id: "boat",              kind: "asset", categoryId: "vehicles", label: "Boat",         icon: Sailboat, keywords: ["yacht", "sailboat", "marine"] },
  { id: "rv",                kind: "asset", categoryId: "vehicles", label: "RV / camper",  icon: Caravan,  keywords: ["motorhome", "trailer"] },
  { id: "ebike",             kind: "asset", categoryId: "vehicles", label: "Bicycle / e-bike", icon: Bike, keywords: ["bike", "cycle"] },
  { id: "private_plane",     kind: "asset", categoryId: "vehicles", label: "Aircraft",     icon: Plane,    keywords: ["plane", "cessna"] },

  // Business / equity ───────────────────────────────────────────────────────
  { id: "private_business",  kind: "asset", categoryId: "business", label: "Private business",        icon: Briefcase,        keywords: ["llc", "s-corp", "owner"] },
  { id: "startup_equity",    kind: "asset", categoryId: "business", label: "Startup equity / options", icon: Rocket,          keywords: ["iso", "nso", "rsu", "vc"] },
  { id: "online_store",      kind: "asset", categoryId: "business", label: "Online store / e-comm",   icon: Store,            keywords: ["shopify", "amazon fba", "etsy"] },
  { id: "restaurant",        kind: "asset", categoryId: "business", label: "Restaurant / cafe",       icon: UtensilsCrossed,  keywords: ["food", "bar"] },
  { id: "side_hustle",       kind: "asset", categoryId: "business", label: "Side business",           icon: Wrench,           keywords: ["consulting", "freelance"] },

  // Crypto ──────────────────────────────────────────────────────────────────
  { id: "bitcoin",           kind: "asset", categoryId: "crypto", label: "Bitcoin (BTC)",     icon: Bitcoin, keywords: ["btc", "satoshi"] },
  { id: "ethereum",          kind: "asset", categoryId: "crypto", label: "Ethereum (ETH)",    icon: Hexagon, keywords: ["eth"] },
  { id: "stablecoin",        kind: "asset", categoryId: "crypto", label: "Stablecoin (USDC/USDT)", icon: Coins, keywords: ["usdc", "usdt", "dai"], growthRate: 0.05 },
  { id: "altcoin",           kind: "asset", categoryId: "crypto", label: "Other crypto",      icon: Coins,   keywords: ["sol", "ada", "doge", "matic"] },

  // Other ───────────────────────────────────────────────────────────────────
  { id: "jewelry",           kind: "asset", categoryId: "other", label: "Jewelry",              icon: Gem,     keywords: ["gold", "diamond", "ring"] },
  { id: "art",               kind: "asset", categoryId: "other", label: "Art / collectibles",   icon: Palette, keywords: ["painting", "nft", "sculpture"] },
  { id: "watch_collection",  kind: "asset", categoryId: "other", label: "Luxury watch",         icon: Watch,   keywords: ["rolex", "omega", "patek"] },
  { id: "wine",              kind: "asset", categoryId: "other", label: "Wine / whisky cellar", icon: Wine,    keywords: ["bordeaux", "scotch", "bourbon"] },
  { id: "trading_cards",     kind: "asset", categoryId: "other", label: "Trading cards",        icon: Sparkles,keywords: ["pokemon", "magic", "sports"] },
  { id: "royalties",         kind: "asset", categoryId: "other", label: "Royalties",            icon: Music,   keywords: ["music", "books", "patents"] },
  { id: "receivables",       kind: "asset", categoryId: "other", label: "Money owed to me",     icon: FileText,keywords: ["receivable", "loan out", "iou"] },
];

// ─── LIABILITY PRESETS ──────────────────────────────────────────────────────
const LIABILITIES: PresetItem[] = [
  // Mortgage ────────────────────────────────────────────────────────────────
  { id: "primary_mortgage",   kind: "liability", categoryId: "mortgage", label: "Primary mortgage",        icon: Home,      keywords: ["house", "30 year", "fixed"] },
  { id: "heloc",              kind: "liability", categoryId: "mortgage", label: "HELOC",                   icon: KeyRound,  keywords: ["line of credit", "second"], growthRate: 0.085 },
  { id: "second_mortgage",    kind: "liability", categoryId: "mortgage", label: "Second mortgage",         icon: Home,      keywords: ["junior"] },
  { id: "investment_mortgage",kind: "liability", categoryId: "mortgage", label: "Investment property loan", icon: Building2, keywords: ["rental", "landlord"], growthRate: 0.075 },

  // Credit cards ────────────────────────────────────────────────────────────
  { id: "credit_card_general", kind: "liability", categoryId: "credit_card", label: "Credit card balance", icon: CreditCard, keywords: ["visa", "mastercard", "amex", "chase", "discover"] },
  { id: "store_card",          kind: "liability", categoryId: "credit_card", label: "Store card",          icon: CreditCard, keywords: ["target", "amazon", "best buy"] },
  { id: "charge_card",         kind: "liability", categoryId: "credit_card", label: "Charge card",         icon: CreditCard, keywords: ["amex platinum", "centurion"] },

  // Student loans ───────────────────────────────────────────────────────────
  { id: "federal_student",    kind: "liability", categoryId: "student_loan", label: "Federal student loan",  icon: GraduationCap, keywords: ["fafsa", "subsidized", "stafford"] },
  { id: "private_student",    kind: "liability", categoryId: "student_loan", label: "Private student loan",  icon: BookOpen,      keywords: ["sallie mae", "sofi"], growthRate: 0.075 },
  { id: "parent_plus",        kind: "liability", categoryId: "student_loan", label: "Parent PLUS loan",      icon: GraduationCap, keywords: ["plus", "parent"], growthRate: 0.085 },

  // Auto loan ───────────────────────────────────────────────────────────────
  { id: "car_loan",           kind: "liability", categoryId: "auto_loan", label: "Car loan",         icon: Car,      keywords: ["auto", "vehicle finance"] },
  { id: "truck_loan",         kind: "liability", categoryId: "auto_loan", label: "Truck / SUV loan", icon: Truck,    keywords: ["pickup"] },
  { id: "motorcycle_loan",    kind: "liability", categoryId: "auto_loan", label: "Motorcycle loan",  icon: Bike,     keywords: ["moto"] },
  { id: "boat_loan",          kind: "liability", categoryId: "auto_loan", label: "Boat loan",        icon: Sailboat, keywords: ["marine"] },

  // Personal loan ───────────────────────────────────────────────────────────
  { id: "personal_loan",      kind: "liability", categoryId: "personal_loan", label: "Personal loan",     icon: Banknote,    keywords: ["sofi", "lightstream", "prosper"] },
  { id: "family_loan",        kind: "liability", categoryId: "personal_loan", label: "Family / friend loan", icon: Users,    keywords: ["mom", "dad", "iou"], growthRate: 0.0 },
  { id: "medical_debt",       kind: "liability", categoryId: "personal_loan", label: "Medical debt",      icon: Stethoscope, keywords: ["hospital", "bills"], growthRate: 0.0 },
  { id: "401k_loan",          kind: "liability", categoryId: "personal_loan", label: "401(k) loan",       icon: Crown,       keywords: ["self loan"] },
  { id: "bnpl",               kind: "liability", categoryId: "personal_loan", label: "Buy now, pay later", icon: Clock,      keywords: ["affirm", "klarna", "afterpay"] },

  // Other ───────────────────────────────────────────────────────────────────
  { id: "tax_debt",           kind: "liability", categoryId: "other", label: "Tax debt",        icon: FileWarning, keywords: ["irs", "back taxes"] },
  { id: "business_loan",      kind: "liability", categoryId: "other", label: "Business loan",   icon: Briefcase,   keywords: ["sba", "line of credit"] },
  { id: "lawsuit",            kind: "liability", categoryId: "other", label: "Legal judgment",  icon: AlertCircle, keywords: ["lawsuit", "settlement"] },
  { id: "unpaid_bills",       kind: "liability", categoryId: "other", label: "Unpaid bills",    icon: Receipt,     keywords: ["utilities", "rent"] },
];

export const PRESETS: PresetItem[] = [...ASSETS, ...LIABILITIES];

/** All asset presets, in catalog order. */
export const ASSET_PRESETS = ASSETS;
/** All liability presets, in catalog order. */
export const LIABILITY_PRESETS = LIABILITIES;

// ─── Icons fallback by category (used when an item has no preset match) ────
export const ASSET_CATEGORY_ICONS: Record<string, LucideIcon> = {
  cash: Wallet,
  savings: PiggyBank,
  investments: LineChart,
  retirement: Crown,
  real_estate: Home,
  vehicles: Car,
  business: Briefcase,
  crypto: Bitcoin,
  other: Sparkles,
};

export const LIABILITY_CATEGORY_ICONS: Record<string, LucideIcon> = {
  mortgage: Home,
  credit_card: CreditCard,
  student_loan: GraduationCap,
  auto_loan: Car,
  personal_loan: Banknote,
  other: FileText,
};

/**
 * Resolve the icon to display for an item, in priority order:
 *   1. Exact preset match (label or id)
 *   2. Category fallback
 *   3. Sparkles (asset) / FileText (liability) as last resort
 */
export function iconForItem(kind: Kind, categoryId: string, label: string): LucideIcon {
  const lc = label.trim().toLowerCase();
  if (lc) {
    const direct = PRESETS.find(
      (p) => p.kind === kind && (p.label.toLowerCase() === lc || p.id === lc),
    );
    if (direct) return direct.icon;
  }
  if (kind === "asset") return ASSET_CATEGORY_ICONS[categoryId] ?? Sparkles;
  return LIABILITY_CATEGORY_ICONS[categoryId] ?? FileText;
}

/**
 * Score a preset against a free-form query. 0 = no match, higher = better.
 * Lightweight in-memory search: prefix match on label > substring on label
 * > substring on keyword > category match.
 */
export function scorePreset(p: PresetItem, query: string): number {
  if (!query) return 1; // show everything when no query
  const q = query.trim().toLowerCase();
  if (!q) return 1;
  const label = p.label.toLowerCase();
  if (label.startsWith(q)) return 100;
  if (label.includes(q)) return 60;
  if (p.id.includes(q)) return 50;
  if (p.categoryId.replace(/_/g, " ").includes(q)) return 30;
  if (p.keywords?.some((k) => k.toLowerCase().includes(q))) return 25;
  return 0;
}
