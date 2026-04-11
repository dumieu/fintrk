import "server-only";
import { db, resilientQuery } from "@/lib/db";
import { categoryRules, userCategories } from "@/lib/db/schema";
import { eq, and, or, isNull, desc } from "drizzle-orm";

/**
 * Multi-signal category resolution:
 * 1. User-defined rules for this merchant (highest priority)
 * 2. Global AI-learned rules
 * 3. Fallback to category suggestion from the AI
 */
export async function matchCategory(
  userId: string,
  merchantName: string | null,
  aiSuggestion: string | null,
): Promise<number | null> {
  if (!merchantName && !aiSuggestion) return null;

  if (merchantName) {
    const rules = await resilientQuery(() =>
      db
        .select({ categoryId: categoryRules.categoryId, confidence: categoryRules.confidence })
        .from(categoryRules)
        .where(
          and(
            eq(categoryRules.merchantPattern, merchantName.toLowerCase()),
            or(eq(categoryRules.userId, userId), isNull(categoryRules.userId)),
          ),
        )
        .orderBy(desc(categoryRules.confidence))
        .limit(1),
    );

    if (rules.length > 0) return rules[0].categoryId;
  }

  if (aiSuggestion) {
    const cats = await resilientQuery(() =>
      db
        .select({ id: userCategories.id })
        .from(userCategories)
        .where(eq(userCategories.name, aiSuggestion))
        .limit(1),
    );
    if (cats.length > 0) return cats[0].id;
  }

  return null;
}

/**
 * Learn from a user's category correction — store as a user-defined rule.
 */
export async function learnCategoryRule(
  userId: string,
  merchantName: string,
  categoryId: number,
): Promise<void> {
  await resilientQuery(() =>
    db
      .insert(categoryRules)
      .values({
        userId,
        merchantPattern: merchantName.toLowerCase(),
        categoryId,
        confidence: "1.00",
        source: "user",
      })
      .onConflictDoNothing(),
  );
}
