import { sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { userCategories } from "@/lib/db/schema";

/** Leaf row on `transactions.categoryId` */
export const leafCategory = alias(userCategories, "leaf_cat");

/** Parent row when `leaf_cat.parent_id` is set */
export const parentCategory = alias(userCategories, "parent_cat");

/**
 * Display label for analytics: **parent category** when `transactions.category_id` points at a
 * subcategory row (`leaf_cat.parent_id` set); otherwise the top-level leaf name.
 * Use the same expression in SELECT and GROUP BY.
 */
export const categoryRollupLabelSql = sql<string>`COALESCE(${parentCategory.name}, ${leafCategory.name}, 'Uncategorized')`;
