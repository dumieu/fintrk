import { NextRequest, NextResponse } from "next/server";
import { resilientAuth, unauthorizedResponse } from "@/lib/auth-resilient";
import { db, resilientQuery } from "@/lib/db";
import { transactions, userCategories } from "@/lib/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { ai, GEMINI_MODEL } from "@/lib/gemini";
import { logAiCost } from "@/lib/ai-cost";
import { logServerError } from "@/lib/safe-error";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const NO_STORE = { "Cache-Control": "no-store" } as const;

const inputSchema = z.object({
  transactionIds: z.array(z.string().uuid()).min(1).max(50),
});

export async function POST(request: NextRequest) {
  try {
    const { userId } = await resilientAuth();
    if (!userId) return unauthorizedResponse();

    const body = await request.json();
    const parsed = inputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400, headers: NO_STORE });
    }

    const txns = await resilientQuery(() =>
      db.select({
        id: transactions.id,
        rawDescription: transactions.rawDescription,
        merchantName: transactions.merchantName,
      }).from(transactions).where(
        and(eq(transactions.userId, userId), inArray(transactions.id, parsed.data.transactionIds)),
      ),
    );

    if (txns.length === 0) {
      return NextResponse.json({ error: "No transactions found" }, { status: 404, headers: NO_STORE });
    }

    const allCategories = await resilientQuery(() =>
      db
        .select({ id: userCategories.id, name: userCategories.name, slug: userCategories.slug })
        .from(userCategories)
        .where(eq(userCategories.userId, userId)),
    );
    const categoryList = allCategories.map((c) => c.name).join(", ");

    const txnList = txns.map((t) => `ID: ${t.id} | Description: ${t.rawDescription} | Merchant: ${t.merchantName ?? "unknown"}`).join("\n");

    const prompt = `Categorize each transaction into exactly one category from this list:
${categoryList}

Transactions:
${txnList}

Return a JSON array of objects: [{"id": "uuid", "category": "Category Name", "confidence": 0.0-1.0}]`;

    const result = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: { responseMimeType: "application/json", temperature: 0.1 },
    });

    const aiText = result.text ?? "[]";
    await logAiCost({
      userId,
      model: GEMINI_MODEL,
      query: "categorize",
      inputTokens: result.usageMetadata?.promptTokenCount ?? 0,
      outputTokens: result.usageMetadata?.candidatesTokenCount ?? 0,
    });

    let assignments: { id: string; category: string; confidence: number }[];
    try { assignments = JSON.parse(aiText); } catch { assignments = []; }

    const categoryMap = new Map(allCategories.map((c) => [c.name.toLowerCase(), c.id]));
    let updated = 0;

    for (const assignment of assignments) {
      const catId = categoryMap.get(assignment.category.toLowerCase());
      if (!catId) continue;

      await resilientQuery(() =>
        db.update(transactions).set({
          categoryId: catId,
          categorySuggestion: assignment.category,
          categoryConfidence: assignment.confidence.toString(),
          updatedAt: new Date(),
        }).where(and(eq(transactions.id, assignment.id), eq(transactions.userId, userId))),
      );
      updated++;
    }

    return NextResponse.json({ updated, total: assignments.length }, { headers: NO_STORE });
  } catch (err) {
    logServerError("api/ai/categorize", err);
    return NextResponse.json({ error: "Failed to categorize" }, { status: 500, headers: NO_STORE });
  }
}
