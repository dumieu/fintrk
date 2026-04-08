/** Regional indicator emoji from ISO 3166-1 alpha-2 (e.g. SG → 🇸🇬). */
export function flagEmoji(iso2: string | null | undefined): string {
  if (!iso2 || iso2.length !== 2) return "";
  const upper = iso2.toUpperCase();
  const base = 0x1f1e6;
  const chars: string[] = [];
  for (let i = 0; i < 2; i++) {
    const c = upper.charCodeAt(i);
    if (c < 65 || c > 90) return "";
    chars.push(String.fromCodePoint(base + (c - 65)));
  }
  return chars.join("");
}

export function countryDisplayName(iso2: string | null | undefined, locale = "en"): string {
  if (!iso2 || iso2.length !== 2) return "";
  try {
    const name = new Intl.DisplayNames([locale], { type: "region" }).of(iso2.toUpperCase());
    return name ?? iso2.toUpperCase();
  } catch {
    return iso2.toUpperCase();
  }
}

export function transactionTypeLabel(isRecurring: boolean, hasForeignCurrency: boolean): string {
  const parts: string[] = [];
  if (isRecurring) parts.push("Recurring");
  if (hasForeignCurrency) parts.push("Foreign currency");
  if (parts.length === 0) return "Standard";
  return parts.join(" · ");
}
