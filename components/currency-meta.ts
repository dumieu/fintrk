/**
 * Currency presentation metadata: ISO 4217 code → human name, symbol, issuing
 * country flag (ISO-3166-1 alpha-2), and a deterministic gradient pair so
 * each currency badge gets a unique, beautiful tint.
 */

export interface CurrencyMeta {
  code: string;
  name: string;
  symbol: string;
  flag: string;
  /** Two hex colors used as the badge linear gradient. */
  gradient: [string, string];
}

const FLAG_OFFSET = 0x1f1e6;
function isoFlag(iso: string): string {
  if (!iso || iso.length !== 2) return "🌐";
  return String.fromCodePoint(
    iso.charCodeAt(0) - 65 + FLAG_OFFSET,
    iso.charCodeAt(1) - 65 + FLAG_OFFSET,
  );
}

interface CurrencyDef {
  name: string;
  symbol: string;
  countryIso: string;
  /** Optional explicit gradient; otherwise generated deterministically. */
  gradient?: [string, string];
}

/**
 * Hand-curated palette for the most common currencies — matched to issuer
 * brand colors (e.g. EUR blue, GBP red, JPY red, USD green, CHF red, etc.).
 */
const CURRENCY_DEFS: Record<string, CurrencyDef> = {
  USD: { name: "US Dollar", symbol: "$", countryIso: "US", gradient: ["#3FAA77", "#1F6C4B"] },
  EUR: { name: "Euro", symbol: "€", countryIso: "EU", gradient: ["#4F87E0", "#1B3A86"] },
  GBP: { name: "Pound Sterling", symbol: "£", countryIso: "GB", gradient: ["#D24A4A", "#7A1F1F"] },
  JPY: { name: "Japanese Yen", symbol: "¥", countryIso: "JP", gradient: ["#E4566B", "#8E1F30"] },
  CHF: { name: "Swiss Franc", symbol: "Fr", countryIso: "CH", gradient: ["#E16161", "#7A1F1F"] },
  AUD: { name: "Australian Dollar", symbol: "A$", countryIso: "AU", gradient: ["#5BA8E2", "#1E4F7E"] },
  CAD: { name: "Canadian Dollar", symbol: "C$", countryIso: "CA", gradient: ["#E36363", "#8C1F1F"] },
  NZD: { name: "NZ Dollar", symbol: "NZ$", countryIso: "NZ", gradient: ["#475A8C", "#16203F"] },
  SGD: { name: "Singapore Dollar", symbol: "S$", countryIso: "SG", gradient: ["#E14B5C", "#7E1A26"] },
  HKD: { name: "Hong Kong Dollar", symbol: "HK$", countryIso: "HK", gradient: ["#D9485A", "#7A1F2A"] },
  CNY: { name: "Chinese Yuan", symbol: "¥", countryIso: "CN", gradient: ["#D9485A", "#7A1F2A"] },
  INR: { name: "Indian Rupee", symbol: "₹", countryIso: "IN", gradient: ["#E08C3D", "#7E4717"] },
  KRW: { name: "Korean Won", symbol: "₩", countryIso: "KR", gradient: ["#3D78D9", "#16306B"] },
  THB: { name: "Thai Baht", symbol: "฿", countryIso: "TH", gradient: ["#3D78D9", "#16306B"] },
  IDR: { name: "Indonesian Rupiah", symbol: "Rp", countryIso: "ID", gradient: ["#E14B5C", "#7E1A26"] },
  PHP: { name: "Philippine Peso", symbol: "₱", countryIso: "PH", gradient: ["#3FAA77", "#1F6C4B"] },
  MYR: { name: "Malaysian Ringgit", symbol: "RM", countryIso: "MY", gradient: ["#3D78D9", "#16306B"] },
  VND: { name: "Vietnamese Dong", symbol: "₫", countryIso: "VN", gradient: ["#D9485A", "#7A1F2A"] },
  TWD: { name: "Taiwan Dollar", symbol: "NT$", countryIso: "TW", gradient: ["#3D78D9", "#16306B"] },
  BRL: { name: "Brazilian Real", symbol: "R$", countryIso: "BR", gradient: ["#3FAA77", "#1F6C4B"] },
  MXN: { name: "Mexican Peso", symbol: "$", countryIso: "MX", gradient: ["#3FAA77", "#1F6C4B"] },
  ARS: { name: "Argentine Peso", symbol: "$", countryIso: "AR", gradient: ["#5BA8E2", "#1E4F7E"] },
  CLP: { name: "Chilean Peso", symbol: "$", countryIso: "CL", gradient: ["#D24A4A", "#7A1F1F"] },
  COP: { name: "Colombian Peso", symbol: "$", countryIso: "CO", gradient: ["#E0B842", "#7E6314"] },
  PEN: { name: "Peruvian Sol", symbol: "S/.", countryIso: "PE", gradient: ["#D24A4A", "#7A1F1F"] },
  ZAR: { name: "South African Rand", symbol: "R", countryIso: "ZA", gradient: ["#3FAA77", "#1F6C4B"] },
  EGP: { name: "Egyptian Pound", symbol: "£", countryIso: "EG", gradient: ["#E0B842", "#7E6314"] },
  NGN: { name: "Nigerian Naira", symbol: "₦", countryIso: "NG", gradient: ["#3FAA77", "#1F6C4B"] },
  KES: { name: "Kenyan Shilling", symbol: "KSh", countryIso: "KE", gradient: ["#3FAA77", "#1F6C4B"] },
  TRY: { name: "Turkish Lira", symbol: "₺", countryIso: "TR", gradient: ["#D9485A", "#7A1F2A"] },
  AED: { name: "UAE Dirham", symbol: "د.إ", countryIso: "AE", gradient: ["#3FAA77", "#1F6C4B"] },
  SAR: { name: "Saudi Riyal", symbol: "﷼", countryIso: "SA", gradient: ["#3FAA77", "#1F6C4B"] },
  QAR: { name: "Qatari Riyal", symbol: "﷼", countryIso: "QA", gradient: ["#7A2747", "#3D0F22"] },
  KWD: { name: "Kuwaiti Dinar", symbol: "د.ك", countryIso: "KW", gradient: ["#3FAA77", "#1F6C4B"] },
  BHD: { name: "Bahraini Dinar", symbol: ".د.ب", countryIso: "BH", gradient: ["#D24A4A", "#7A1F1F"] },
  OMR: { name: "Omani Rial", symbol: "ر.ع.", countryIso: "OM", gradient: ["#D24A4A", "#7A1F1F"] },
  ILS: { name: "Israeli Shekel", symbol: "₪", countryIso: "IL", gradient: ["#5BA8E2", "#1E4F7E"] },
  RUB: { name: "Russian Ruble", symbol: "₽", countryIso: "RU", gradient: ["#5BA8E2", "#1E4F7E"] },
  UAH: { name: "Ukrainian Hryvnia", symbol: "₴", countryIso: "UA", gradient: ["#5BA8E2", "#E0B842"] },
  PLN: { name: "Polish Zloty", symbol: "zł", countryIso: "PL", gradient: ["#D24A4A", "#7A1F1F"] },
  SEK: { name: "Swedish Krona", symbol: "kr", countryIso: "SE", gradient: ["#5BA8E2", "#E0B842"] },
  NOK: { name: "Norwegian Krone", symbol: "kr", countryIso: "NO", gradient: ["#D24A4A", "#1E4F7E"] },
  DKK: { name: "Danish Krone", symbol: "kr", countryIso: "DK", gradient: ["#D24A4A", "#7A1F1F"] },
  ISK: { name: "Icelandic Króna", symbol: "kr", countryIso: "IS", gradient: ["#5BA8E2", "#1E4F7E"] },
  CZK: { name: "Czech Koruna", symbol: "Kč", countryIso: "CZ", gradient: ["#D24A4A", "#1E4F7E"] },
  HUF: { name: "Hungarian Forint", symbol: "Ft", countryIso: "HU", gradient: ["#3FAA77", "#1F6C4B"] },
  RON: { name: "Romanian Leu", symbol: "lei", countryIso: "RO", gradient: ["#5BA8E2", "#E0B842"] },
  BGN: { name: "Bulgarian Lev", symbol: "лв", countryIso: "BG", gradient: ["#3FAA77", "#1F6C4B"] },
  HRK: { name: "Croatian Kuna", symbol: "kn", countryIso: "HR", gradient: ["#D24A4A", "#1E4F7E"] },
  RSD: { name: "Serbian Dinar", symbol: "дин", countryIso: "RS", gradient: ["#D24A4A", "#1E4F7E"] },
  KZT: { name: "Kazakh Tenge", symbol: "₸", countryIso: "KZ", gradient: ["#5BA8E2", "#E0B842"] },
  GEL: { name: "Georgian Lari", symbol: "₾", countryIso: "GE", gradient: ["#D24A4A", "#7A1F1F"] },
  AMD: { name: "Armenian Dram", symbol: "֏", countryIso: "AM", gradient: ["#5BA8E2", "#E0B842"] },
  AZN: { name: "Azerbaijani Manat", symbol: "₼", countryIso: "AZ", gradient: ["#3FAA77", "#1F6C4B"] },
  PKR: { name: "Pakistani Rupee", symbol: "₨", countryIso: "PK", gradient: ["#3FAA77", "#1F6C4B"] },
  BDT: { name: "Bangladeshi Taka", symbol: "৳", countryIso: "BD", gradient: ["#3FAA77", "#D24A4A"] },
  LKR: { name: "Sri Lankan Rupee", symbol: "₨", countryIso: "LK", gradient: ["#E0B842", "#7E6314"] },
  NPR: { name: "Nepalese Rupee", symbol: "₨", countryIso: "NP", gradient: ["#D24A4A", "#7A1F1F"] },
  MMK: { name: "Myanmar Kyat", symbol: "K", countryIso: "MM", gradient: ["#E0B842", "#7E6314"] },
  KHR: { name: "Cambodian Riel", symbol: "៛", countryIso: "KH", gradient: ["#D24A4A", "#1E4F7E"] },
  LAK: { name: "Lao Kip", symbol: "₭", countryIso: "LA", gradient: ["#D24A4A", "#1E4F7E"] },
  MOP: { name: "Macanese Pataca", symbol: "MOP$", countryIso: "MO", gradient: ["#3FAA77", "#1F6C4B"] },
  MVR: { name: "Maldivian Rufiyaa", symbol: "Rf", countryIso: "MV", gradient: ["#D24A4A", "#3FAA77"] },
  /** EU-issued non-Eurozone state placeholders. */
  GIP: { name: "Gibraltar Pound", symbol: "£", countryIso: "GI", gradient: ["#D24A4A", "#7A1F1F"] },
  /** Crypto / metals. */
  BTC: { name: "Bitcoin", symbol: "₿", countryIso: "", gradient: ["#F7931A", "#7A4708"] },
  ETH: { name: "Ethereum", symbol: "Ξ", countryIso: "", gradient: ["#627EEA", "#222C5C"] },
  XAU: { name: "Gold", symbol: "Au", countryIso: "", gradient: ["#E5C046", "#7E6314"] },
  XAG: { name: "Silver", symbol: "Ag", countryIso: "", gradient: ["#C8C8D2", "#5C5C66"] },
};

/** Hash-based fallback gradient so unknown currencies still look intentional. */
function hashGradient(code: string): [string, string] {
  let h = 0;
  for (let i = 0; i < code.length; i++) h = (h * 31 + code.charCodeAt(i)) >>> 0;
  const hue1 = h % 360;
  const hue2 = (hue1 + 32) % 360;
  return [`hsl(${hue1} 60% 48%)`, `hsl(${hue2} 60% 28%)`];
}

export function currencyMeta(code: string): CurrencyMeta {
  const c = (code || "").toUpperCase().slice(0, 3);
  const def = CURRENCY_DEFS[c];
  return {
    code: c,
    name: def?.name ?? c,
    symbol: def?.symbol ?? c,
    flag: def?.countryIso ? isoFlag(def.countryIso) : "🌐",
    gradient: def?.gradient ?? hashGradient(c),
  };
}
