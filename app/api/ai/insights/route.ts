import { NextResponse } from "next/server";
import { resilientAuth, unauthorizedResponse } from "@/lib/auth-resilient";
import { db, resilientQuery } from "@/lib/db";
import { transactions, aiInsights, recurringPatterns, userCategories } from "@/lib/db/schema";
import { excludeCardPaymentsSql, excludeRecurringCardPaymentsSql } from "@/lib/db/excluded-transactions";
import { eq, and, gte, sql, desc } from "drizzle-orm";
import { ai, GEMINI_MODEL } from "@/lib/gemini";
import { logAiCost } from "@/lib/ai-cost";
import { logServerError } from "@/lib/safe-error";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const NO_STORE = { "Cache-Control": "no-store" } as const;

export async function POST() {
  try {
    const { userId } = await resilientAuth();
    if (!userId) return unauthorizedResponse();

    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    const dateFrom = threeMonthsAgo.toISOString().split("T")[0];

    const [categoryTotals, recurring, txnCount] = await Promise.all([
      resilientQuery(() =>
        db.select({
          category: userCategories.name,
          total: sql<string>`SUM(ABS(CAST(${transactions.baseAmount} AS numeric)))`,
          count: sql<number>`COUNT(*)::int`,
        }).from(transactions)
          .leftJoin(userCategories, eq(transactions.categoryId, userCategories.id))
          .where(
            and(eq(transactions.userId, userId), excludeCardPaymentsSql(), gte(transactions.postedDate, dateFrom), sql`CAST(${transactions.baseAmount} AS numeric) < 0`),
          ).groupBy(userCategories.name).orderBy(sql`SUM(ABS(CAST(${transactions.baseAmount} AS numeric))) DESC`).limit(15),
      ),
      resilientQuery(() =>
        db.select().from(recurringPatterns).where(
          and(
            eq(recurringPatterns.userId, userId),
            excludeRecurringCardPaymentsSql(),
            eq(recurringPatterns.isActive, true),
          ),
        ),
      ),
      resilientQuery(() =>
        db.select({ count: sql<number>`COUNT(*)::int` }).from(transactions).where(and(eq(transactions.userId, userId), excludeCardPaymentsSql())),
      ),
    ]);

    if ((txnCount[0]?.count ?? 0) < 5) {
      return NextResponse.json({ error: "Need at least 5 transactions for insights" }, { status: 400, headers: NO_STORE });
    }

    const spendingSummary = categoryTotals.map((c) => `${c.category ?? "Uncategorized"}: $${parseFloat(c.total).toFixed(0)} (${c.count} txns)`).join("\n");
    const recurringSummary = recurring.map((r) => `${r.merchantName}: $${Math.abs(parseFloat(r.expectedAmount)).toFixed(0)}/${r.intervalLabel}`).join("\n");

    const prompt = `Analyze this user's spending data from the last 3 months and provide actionable financial insights.

SPENDING BY CATEGORY (last 3 months):
${spendingSummary}

RECURRING COMMITMENTS:
${recurringSummary || "None detected yet"}

Return a JSON object with:
{
  "summary": "2-3 sentence executive summary of their financial health",
  "anomalies": [{"title": "string", "description": "string", "severity": "info|warning|alert"}],
  "savings_opportunities": [{"title": "string", "description": "string", "potential_monthly_savings": number}],
  "prediction": {"next_month_spend": number, "trend": "increasing|stable|decreasing", "key_driver": "string"}
}`;

    const result = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: { responseMimeType: "application/json", temperature: 0.3 },
    });

    const aiText = result.text ?? "{}";
    const inputTokens = result.usageMetadata?.promptTokenCount ?? 0;
    const outputTokens = result.usageMetadata?.candidatesTokenCount ?? 0;

    await logAiCost({ userId, model: GEMINI_MODEL, query: "insights", inputTokens, outputTokens });

    let parsed;
    try { parsed = JSON.parse(aiText); } catch { parsed = { summary: "Unable to generate insights at this time." }; }

    if (parsed.summary) {
      await resilientQuery(() =>
        db.insert(aiInsights).values({
          userId,
          insightType: "monthly_summary",
          title: "Monthly Financial Summary",
          body: parsed.summary,
          severity: "info",
          metadata: parsed,
        }),
      );
    }

    if (parsed.anomalies) {
      for (const anomaly of parsed.anomalies) {
        await resilientQuery(() =>
          db.insert(aiInsights).values({
            userId,
            insightType: "anomaly",
            title: anomaly.title,
            body: anomaly.description,
            severity: anomaly.severity ?? "info",
          }),
        );
      }
    }

    if (parsed.savings_opportunities) {
      for (const opp of parsed.savings_opportunities) {
        await resilientQuery(() =>
          db.insert(aiInsights).values({
            userId,
            insightType: "savings_opportunity",
            title: opp.title,
            body: opp.description,
            severity: "positive",
            metadata: { potential_monthly_savings: opp.potential_monthly_savings },
          }),
        );
      }
    }

    return NextResponse.json({ success: true, insights: parsed }, { headers: NO_STORE });
  } catch (err) {
    logServerError("api/ai/insights", err);
    return NextResponse.json({ error: "Failed to generate insights" }, { status: 500, headers: NO_STORE });
  }
}
