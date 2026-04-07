import { NextResponse } from "next/server";
import { db, resilientQuery } from "@/lib/db";
import { fxRates } from "@/lib/db/schema";
import { logServerError } from "@/lib/safe-error";

export const dynamic = "force-dynamic";

const FRANKFURTER_API = "https://api.frankfurter.dev";

const MAJOR_CURRENCIES = ["USD", "EUR", "GBP", "CHF", "JPY", "CAD", "AUD", "NZD", "SEK", "NOK", "DKK", "PLN", "CZK", "HUF", "RON", "BGN", "HRK", "TRY", "ZAR", "BRL", "MXN", "INR", "CNY", "HKD", "SGD", "KRW", "THB", "MYR", "PHP", "IDR", "AED", "SAR", "ILS"];

export async function GET() {
  try {
    const today = new Date().toISOString().split("T")[0];
    let inserted = 0;

    for (const base of ["USD", "EUR", "GBP"]) {
      try {
        const res = await fetch(`${FRANKFURTER_API}/v1/latest?base=${base}`);
        if (!res.ok) continue;

        const data = await res.json();
        const rates: Record<string, number> = data.rates ?? {};
        const rateDate = data.date ?? today;

        for (const [quote, rate] of Object.entries(rates)) {
          if (!MAJOR_CURRENCIES.includes(quote)) continue;
          await resilientQuery(() =>
            db
              .insert(fxRates)
              .values({
                baseCurrency: base,
                quoteCurrency: quote,
                rateDate,
                midRate: rate.toString(),
                source: "frankfurter",
              })
              .onConflictDoNothing(),
          );
          inserted++;
        }
      } catch (err) {
        logServerError(`fx-rates/${base}`, err);
      }
    }

    return NextResponse.json({ success: true, inserted, date: today });
  } catch (err) {
    logServerError("api/enrich/fx-rates", err);
    return NextResponse.json({ error: "Failed to fetch FX rates" }, { status: 500 });
  }
}
