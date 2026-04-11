"use client";

import { useCallback } from "react";
import { CircleHelp } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import { countryDisplayName } from "@/lib/transaction-flags";
import { cn } from "@/lib/utils";

export interface GeminiMerchantQueryTxn {
  baseAmount: string;
  baseCurrency: string;
  countryIso: string | null;
  rawDescription: string;
}

export function buildGeminiMerchantQuery(txn: GeminiMerchantQueryTxn): string {
  const n = parseFloat(txn.baseAmount);
  const amt = Number.isFinite(n) ? Math.abs(n) : 0;
  const amountStr = formatCurrency(amt, txn.baseCurrency);
  const country =
    countryDisplayName(txn.countryIso) ||
    (txn.countryIso?.trim() ? txn.countryIso.toUpperCase() : "") ||
    "an unknown country";
  const details = txn.rawDescription?.trim() || "(no statement line detail)";
  return `I had a transaction of ${amountStr} on my card, charged in ${country}, with transaction details ${details}. Very briefly and based on the specific context I gave you, help me figure out who the merchant is, where from, and what do they sell.`;
}

/** Google Search AI / Gemini entry — pre-fills the query (gemini.google.com/app?q= is not honored). */
const GEMINI_SEARCH_ENTRY = "https://www.google.com/search?udm=50";

export function TransactionGeminiHintButton({ txn }: { txn: GeminiMerchantQueryTxn }) {
  const onClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.stopPropagation();
      const q = buildGeminiMerchantQuery(txn);
      const url = `${GEMINI_SEARCH_ENTRY}&q=${encodeURIComponent(q)}`;
      window.open(url, "_blank", "noopener,noreferrer");
    },
    [txn.baseAmount, txn.baseCurrency, txn.countryIso, txn.rawDescription],
  );

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group/gemini flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-transparent",
        "text-white/40 outline-none transition-[color,background,border-color,box-shadow] duration-200",
        "hover:bg-white/[0.06] hover:border-white/10 hover:text-[#0BC18D] hover:shadow-[0_0_20px_-8px_rgba(11,193,141,0.45)]",
        "focus-visible:ring-2 focus-visible:ring-[#0BC18D]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[#10082a]",
        "active:scale-95",
      )}
      aria-label="Open Gemini with a question about this transaction’s merchant"
    >
      <CircleHelp
        className="h-4 w-4 transition-transform duration-200 ease-out group-hover/gemini:scale-110 group-hover/gemini:-rotate-6"
        strokeWidth={2}
        aria-hidden
      />
    </button>
  );
}
