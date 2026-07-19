import { NextRequest, NextResponse } from "next/server";
import { db, resilientQuery } from "@/lib/db";
import { fxRates } from "@/lib/db/schema";
import { authorizeCron } from "@/lib/cron-auth";
import { logServerError } from "@/lib/safe-error";
import { recordCronFailure, recordCronRun } from "@/lib/cron-run";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CRON_PATH = "/api/cron/fx-rates";
const FRANKFURTER_API = "https://api.frankfurter.dev";
const MAJOR_CURRENCIES = ["USD", "EUR", "GBP", "CHF", "JPY", "CAD", "AUD", "NZD", "SEK", "NOK", "DKK", "PLN", "CZK", "HUF", "RON", "BGN", "TRY", "ZAR", "BRL", "MXN", "INR", "CNY", "HKD", "SGD", "KRW", "THB", "MYR", "PHP", "IDR", "AED", "SAR", "ILS"];

export async function GET(request: NextRequest) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const started = Date.now();

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
            db.insert(fxRates).values({
              baseCurrency: base,
              quoteCurrency: quote,
              rateDate,
              midRate: rate.toString(),
              source: "frankfurter",
            }).onConflictDoNothing(),
          );
          inserted++;
        }
      } catch (err) {
        logServerError(`cron/fx-rates/${base}`, err);
      }
    }

    const summary = { success: true, inserted, date: today };
    await recordCronRun(CRON_PATH, Date.now() - started, summary);
    return NextResponse.json(summary);
  } catch (err) {
    logServerError("cron/fx-rates", err);
    await recordCronFailure(CRON_PATH, Date.now() - started, {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
