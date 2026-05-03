import { NextRequest, NextResponse } from "next/server";
import { resilientAuth, unauthorizedResponse } from "@/lib/auth-resilient";
import { db, resilientQuery } from "@/lib/db";
import { transactions } from "@/lib/db/schema";
import { excludeCardPaymentsSql } from "@/lib/db/excluded-transactions";
import { eq, and, sql } from "drizzle-orm";
import { logServerError } from "@/lib/safe-error";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

const TOP = 10;

function normalizeCountry(raw: string | null): string | null {
  if (!raw) return null;
  const t = raw.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(t)) return null;
  return t;
}

/**
 * Top merchants for a country (by absolute spend), ranked descending.
 * Grouped by merchant name + base currency.
 */
export async function GET(request: NextRequest) {
  try {
    const { userId } = await resilientAuth();
    if (!userId) return unauthorizedResponse();

    const country = normalizeCountry(request.nextUrl.searchParams.get("country"));
    if (!country) {
      return NextResponse.json(
        { error: "Invalid or missing country (use ISO 3166-1 alpha-2)" },
        { status: 400, headers: NO_STORE },
      );
    }

    const rows = await resilientQuery(() =>
      db
        .select({
          name: transactions.merchantName,
          total: sql<string>`SUM(ABS(CAST(${transactions.baseAmount} AS numeric)))`,
          count: sql<number>`COUNT(*)::int`,
          currency: transactions.baseCurrency,
        })
        .from(transactions)
        .where(
          and(
            eq(transactions.userId, userId),
            excludeCardPaymentsSql(),
            eq(transactions.countryIso, country),
            sql`${transactions.merchantName} IS NOT NULL`,
          ),
        )
        .groupBy(transactions.merchantName, transactions.baseCurrency)
        .orderBy(sql`SUM(ABS(CAST(${transactions.baseAmount} AS numeric))) DESC`)
        .limit(TOP),
    );

    const merchants = rows.map((m) => ({
      name: m.name ?? "Unknown",
      total: parseFloat(m.total ?? "0"),
      count: m.count,
      currency: m.currency,
    }));

    return NextResponse.json({ country, merchants }, { headers: NO_STORE });
  } catch (err) {
    logServerError("api/analytics/country-merchants", err);
    return NextResponse.json(
      { error: "Failed to load country merchants" },
      { status: 500, headers: NO_STORE },
    );
  }
}
