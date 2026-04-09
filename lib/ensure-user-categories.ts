import "server-only";
import { db, resilientQuery } from "@/lib/db";
import { systemCategories, userCategories } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

/**
 * Ensures this user has their own category hierarchy in `user_categories`.
 * If they have none yet, clones every row from `system_categories`,
 * preserving the parent→child hierarchy via a two-pass insert.
 *
 * Safe to call multiple times — no-ops if rows already exist.
 */
export async function ensureUserCategories(userId: string): Promise<void> {
  const existing = await resilientQuery(() =>
    db
      .select({ id: userCategories.id })
      .from(userCategories)
      .where(eq(userCategories.userId, userId))
      .limit(1),
  );
  if (existing.length > 0) return;

  const sysCats = await resilientQuery(() =>
    db
      .select()
      .from(systemCategories)
      .orderBy(systemCategories.sortOrder),
  );
  if (sysCats.length === 0) return;

  // Pass 1: insert top-level categories (parentId == null)
  const sysIdToUserIdMap = new Map<number, number>();

  const topLevel = sysCats.filter((c) => c.parentId == null);
  for (const cat of topLevel) {
    const [inserted] = await resilientQuery(() =>
      db
        .insert(userCategories)
        .values({
          userId,
          name: cat.name,
          slug: cat.slug,
          icon: cat.icon,
          color: cat.color,
          sortOrder: cat.sortOrder,
          systemCategoryId: cat.id,
        })
        .returning({ id: userCategories.id }),
    );
    sysIdToUserIdMap.set(cat.id, inserted.id);
  }

  // Pass 2: insert children with mapped parentId
  const children = sysCats.filter((c) => c.parentId != null);
  for (const cat of children) {
    const userParentId = sysIdToUserIdMap.get(cat.parentId!);
    if (userParentId == null) continue;

    const [inserted] = await resilientQuery(() =>
      db
        .insert(userCategories)
        .values({
          userId,
          name: cat.name,
          slug: cat.slug,
          parentId: userParentId,
          icon: cat.icon,
          color: cat.color,
          sortOrder: cat.sortOrder,
          systemCategoryId: cat.id,
        })
        .returning({ id: userCategories.id }),
    );
    sysIdToUserIdMap.set(cat.id, inserted.id);
  }
}
