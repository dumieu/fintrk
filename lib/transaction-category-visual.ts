import type { LucideIcon } from "lucide-react";
import {
  ArrowLeftRight,
  Banknote,
  BookOpen,
  Briefcase,
  Bus,
  Car,
  CircleDot,
  Coffee,
  Film,
  Fuel,
  Gamepad2,
  GraduationCap,
  HeartPulse,
  Home,
  Landmark,
  Layers,
  PawPrint,
  PiggyBank,
  Plane,
  Receipt,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  Stethoscope,
  Ticket,
  Train,
  Tv,
  UtensilsCrossed,
  Wallet,
  Wifi,
} from "lucide-react";

export type CategoryVisualVariant =
  | "violet"
  | "emerald"
  | "cyan"
  | "amber"
  | "rose"
  | "sky"
  | "fuchsia"
  | "orange"
  | "lime"
  | "slate";

export interface TransactionCategoryVisual {
  Icon: LucideIcon;
  variant: CategoryVisualVariant;
}

function norm(s: string | null | undefined): string {
  return (s ?? "").toLowerCase().trim();
}

/** Resolve icon + color variant from hierarchy labels or AI suggestion text. */
export function getTransactionCategoryVisual(
  categoryName: string | null,
  subcategoryName: string | null,
  categorySuggestion: string | null,
): TransactionCategoryVisual {
  const cat = norm(categoryName) || norm(categorySuggestion);
  const sub = norm(subcategoryName);
  const h = `${cat} ${sub}`;

  const pick = (Icon: LucideIcon, variant: CategoryVisualVariant): TransactionCategoryVisual => ({
    Icon,
    variant,
  });

  // Subcategory-first hints (more specific)
  if (/\b(streaming|netflix|spotify|disney|hulu)\b/.test(h)) return pick(Tv, "violet");
  if (/\b(ride\s*share|uber|grab|lyft|taxi)\b/.test(h)) return pick(Car, "orange");
  if (/\b(public\s*transit|mrt|bus|train|metro)\b/.test(h)) return pick(Train, "sky");
  if (/\b(grocer|supermarket|cold storage|fairprice)\b/.test(h)) return pick(ShoppingCart, "emerald");
  if (/\b(restaurant|dining|food court|café|cafe)\b/.test(h)) return pick(UtensilsCrossed, "amber");
  if (/\b(pharmacy|drugstore)\b/.test(h)) return pick(HeartPulse, "rose");
  if (/\b(medical|clinic|hospital|dental)\b/.test(h)) return pick(Stethoscope, "rose");
  if (/\b(book|media|kindle)\b/.test(h)) return pick(BookOpen, "fuchsia");
  if (/\b(concert|event|ticket)\b/.test(h)) return pick(Ticket, "fuchsia");
  if (/\b(clothing|apparel|fashion)\b/.test(h)) return pick(ShoppingBag, "fuchsia");
  if (/\b(online|e-?commerce|amazon|shopee)\b/.test(h)) return pick(ShoppingBag, "violet");
  if (/\b(internal\s*transfer|xfer|between accounts)\b/.test(h)) return pick(ArrowLeftRight, "cyan");
  if (/\b(salary|payroll|employment)\b/.test(h)) return pick(Briefcase, "emerald");
  if (/\b(dividend|interest|investment)\b/.test(h)) return pick(PiggyBank, "lime");
  if (/\b(rent|mortgage|utilities)\b/.test(h)) return pick(Home, "sky");
  if (/\b(fee|bank fee|atm)\b/.test(h)) return pick(Receipt, "slate");
  if (/\b(pet|vet)\b/.test(h)) return pick(PawPrint, "orange");
  if (/\b(travel|flight|hotel|accommodation)\b/.test(h)) return pick(Plane, "cyan");
  if (/\b(gas|petrol|fuel)\b/.test(h)) return pick(Fuel, "amber");
  if (/\b(education|school|tuition|course)\b/.test(h)) return pick(GraduationCap, "sky");
  if (/\b(insurance)\b/.test(h)) return pick(Landmark, "slate");
  if (/\b(charity|donation|giving)\b/.test(h)) return pick(HeartPulse, "rose");

  // Category-level (broader)
  if (/\btransfer\b/.test(cat) || h.includes("internal transfer")) return pick(ArrowLeftRight, "cyan");
  if (/\bshopping\b/.test(cat)) return pick(ShoppingBag, "violet");
  if (/\bfood\b/.test(cat) || /\bdrink\b/.test(cat) || cat.includes("restaurant")) return pick(UtensilsCrossed, "amber");
  if (/\bentertainment\b/.test(cat)) return pick(Film, "fuchsia");
  if (/\bhealth\b/.test(cat) || /\bfitness\b/.test(cat)) return pick(HeartPulse, "rose");
  if (/\btransport/.test(cat) || /\btransit\b/.test(cat)) return pick(Bus, "sky");
  if (/\bgrocer/.test(cat)) return pick(ShoppingCart, "emerald");
  if (/\btravel\b/.test(cat)) return pick(Plane, "cyan");
  if (/\beducation\b/.test(cat)) return pick(GraduationCap, "sky");
  if (/\bhousehold\b/.test(cat) || /\bdomestic\b/.test(cat)) return pick(Home, "sky");
  if (/\bincome\b/.test(cat) || /\binflow\b/.test(cat)) return pick(Banknote, "emerald");
  if (/\bsavings\b/.test(cat) || /\binvest/.test(cat)) return pick(PiggyBank, "lime");
  if (/\binsurance\b/.test(cat)) return pick(Landmark, "slate");
  if (/\btax\b/.test(cat)) return pick(Receipt, "slate");
  if (/\bdebt\b/.test(cat)) return pick(Wallet, "slate");
  if (/\bgiving\b/.test(cat) || /\bcharity\b/.test(cat)) return pick(HeartPulse, "rose");
  if (/\bpersonal care\b/.test(cat)) return pick(Sparkles, "fuchsia");
  if (/\bpets?\b/.test(cat)) return pick(PawPrint, "orange");
  if (/\bfamily\b/.test(cat) || /\bkids\b/.test(cat)) return pick(Home, "orange");
  if (/\bother\b/.test(cat) || /\bmiscellaneous\b/.test(cat)) return pick(Layers, "slate");
  if (/\bsubscription\b/.test(h)) return pick(Wifi, "violet");
  if (/\bcoffee\b/.test(h)) return pick(Coffee, "amber");
  if (/\bgaming\b/.test(h)) return pick(Gamepad2, "fuchsia");

  return pick(CircleDot, "slate");
}
