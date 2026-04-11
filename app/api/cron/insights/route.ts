import { NextRequest, NextResponse } from "next/server";
import { db, resilientQuery } from "@/lib/db";
import { accounts, transactions, recurringPatterns, aiInsights, userCategories } from "@/lib/db/schema";
import { ai, GEMINI_MODEL } from "@/lib/gemini";
import { logAiCost } from "@/lib/ai-cost";
import { logServerError } from "@/lib/safe-error";
import { eq, and, gte, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

function verifyCronSecret(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const userIds = await resilientQuery(() =>
      db.selectDistinct({ userId: accounts.userId }).from(accounts),
    );

    let generated = 0;
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    const dateFrom = threeMonthsAgo.toISOString().split("T")[0];

    for (const { userId } of userIds) {
      try {
        const [categoryTotals, recurring, txnCount] = await Promise.all([
          resilientQuery(() =>
            db.select({
              category: userCategories.name,
              total: sql<string>`SUM(ABS(CAST(${transactions.baseAmount} AS numeric)))`,
              count: sql<number>`COUNT(*)::int`,
            }).from(transactions)
              .leftJoin(userCategories, eq(transactions.categoryId, userCategories.id))
              .where(
                and(eq(transactions.userId, userId), gte(transactions.postedDate, dateFrom), sql`CAST(${transactions.baseAmount} AS numeric) < 0`),
              ).groupBy(userCategories.name).orderBy(sql`SUM(ABS(CAST(${transactions.baseAmount} AS numeric))) DESC`).limit(15),
          ),
          resilientQuery(() =>
            db.select().from(recurringPatterns).where(and(eq(recurringPatterns.userId, userId), eq(recurringPatterns.isActive, true))),
          ),
          resilientQuery(() =>
            db.select({ count: sql<number>`COUNT(*)::int` }).from(transactions).where(eq(transactions.userId, userId)),
          ),
        ]);

        if ((txnCount[0]?.count ?? 0) < 5) continue;

        const spendingSummary = categoryTotals.map((c) =>
          `${c.category ?? "Uncategorized"}: $${parseFloat(c.total).toFixed(0)} (${c.count} txns)`
        ).join("\n");
        const recurringSummary = recurring.map((r) =>
          `${r.merchantName}: $${Math.abs(parseFloat(r.expectedAmount)).toFixed(0)}/${r.intervalLabel}`
        ).join("\n");

        const prompt = `Analyze this user's spending from the last 3 months. Provide a concise weekly insight.

SPENDING BY CATEGORY:
${spendingSummary}

RECURRING:
${recurringSummary || "None detected"}

Return JSON: {"summary":"string","tip":"string","anomaly":{"title":"string","description":"string"}|null}`;

        const result = await ai.models.generateContent({
          model: GEMINI_MODEL,
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          config: { responseMimeType: "application/json", temperature: 0.3 },
        });

        await logAiCost({
          userId,
          model: GEMINI_MODEL,
          query: "cron_insights",
          inputTokens: result.usageMetadata?.promptTokenCount ?? 0,
          outputTokens: result.usageMetadata?.candidatesTokenCount ?? 0,
        });

        let parsed;
        try { parsed = JSON.parse(result.text ?? "{}"); } catch { continue; }

        if (parsed.summary) {
          await resilientQuery(() =>
            db.insert(aiInsights).values({
              userId,
              insightType: "weekly_summary",
              title: "Weekly Financial Summary",
              body: parsed.summary,
              severity: "info",
              metadata: parsed,
            }),
          );
          generated++;
        }
      } catch (err) {
        logServerError(`cron/insights/${userId}`, err);
      }
    }

    return NextResponse.json({ success: true, usersProcessed: userIds.length, insightsGenerated: generated });
  } catch (err) {
    logServerError("cron/insights", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
