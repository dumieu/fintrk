/**
 * Migration: categories → system_categories + user_categories
 *
 * 1. Rename the existing `categories` table to `system_categories` (drop is_system, user_id cols)
 * 2. Create `user_categories` table
 * 3. For each distinct userId in transactions, clone system_categories → user_categories
 * 4. Re-map transactions.category_id, merchants.category_id, category_rules.category_id,
 *    recurring_patterns.category_id, budgets.category_id to point to user_categories rows
 *
 * Run: npx tsx scripts/migrate-to-user-categories.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

async function migrate() {
  console.log("=== Step 1: Create system_categories from existing categories ===");

  await sql`
    CREATE TABLE IF NOT EXISTS system_categories (
      id SERIAL PRIMARY KEY,
      name VARCHAR(128) NOT NULL,
      slug VARCHAR(128) NOT NULL UNIQUE,
      parent_id INTEGER,
      icon VARCHAR(64),
      color VARCHAR(7),
      sort_order INTEGER NOT NULL DEFAULT 0
    )
  `;

  // Copy existing categories into system_categories (if not already done)
  const sysCount = await sql`SELECT count(*) AS cnt FROM system_categories`;
  if (Number(sysCount[0].cnt) === 0) {
    await sql`
      INSERT INTO system_categories (id, name, slug, parent_id, icon, color, sort_order)
      SELECT id, name, slug, parent_id, icon, color, sort_order
      FROM categories
      ORDER BY sort_order
    `;
    // Reset sequence
    await sql`SELECT setval('system_categories_id_seq', (SELECT COALESCE(MAX(id), 0) FROM system_categories))`;
    console.log("  Copied categories → system_categories");
  } else {
    console.log("  system_categories already populated, skipping");
  }

  console.log("\n=== Step 2: Create user_categories table ===");

  await sql`
    CREATE TABLE IF NOT EXISTS user_categories (
      id SERIAL PRIMARY KEY,
      user_id VARCHAR(255) NOT NULL,
      name VARCHAR(128) NOT NULL,
      slug VARCHAR(128) NOT NULL,
      parent_id INTEGER,
      icon VARCHAR(64),
      color VARCHAR(7),
      sort_order INTEGER NOT NULL DEFAULT 0,
      system_category_id INTEGER REFERENCES system_categories(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

  // Create indexes
  await sql`CREATE INDEX IF NOT EXISTS user_categories_user_idx ON user_categories(user_id)`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS user_categories_user_slug_idx ON user_categories(user_id, slug)`;

  console.log("  user_categories table ready");

  console.log("\n=== Step 3: Find distinct users and clone categories ===");

  const users = await sql`
    SELECT DISTINCT user_id FROM transactions WHERE user_id IS NOT NULL
  `;
  console.log(`  Found ${users.length} distinct user(s)`);

  for (const row of users) {
    const userId = row.user_id as string;

    // Check if already cloned
    const existing = await sql`SELECT id FROM user_categories WHERE user_id = ${userId} LIMIT 1`;
    if (existing.length > 0) {
      console.log(`  User ${userId}: already has user_categories, skipping clone`);
      continue;
    }

    // Clone system categories for this user — two passes for parent/child
    const sysCats = await sql`SELECT * FROM system_categories ORDER BY sort_order`;
    const sysIdToUserIdMap = new Map<number, number>();

    // Pass 1: top-level (parent_id IS NULL)
    for (const cat of sysCats) {
      if (cat.parent_id != null) continue;
      const [inserted] = await sql`
        INSERT INTO user_categories (user_id, name, slug, parent_id, icon, color, sort_order, system_category_id)
        VALUES (${userId}, ${cat.name}, ${cat.slug}, NULL, ${cat.icon}, ${cat.color}, ${cat.sort_order}, ${cat.id})
        RETURNING id
      `;
      sysIdToUserIdMap.set(cat.id as number, inserted.id as number);
    }

    // Pass 2: children
    for (const cat of sysCats) {
      if (cat.parent_id == null) continue;
      const userParentId = sysIdToUserIdMap.get(cat.parent_id as number);
      if (userParentId == null) continue;
      const [inserted] = await sql`
        INSERT INTO user_categories (user_id, name, slug, parent_id, icon, color, sort_order, system_category_id)
        VALUES (${userId}, ${cat.name}, ${cat.slug}, ${userParentId}, ${cat.icon}, ${cat.color}, ${cat.sort_order}, ${cat.id})
        RETURNING id
      `;
      sysIdToUserIdMap.set(cat.id as number, inserted.id as number);
    }

    console.log(`  User ${userId}: cloned ${sysIdToUserIdMap.size} categories`);

    // Re-map transactions.category_id for this user
    let txnRemapped = 0;
    for (const [sysId, userCatId] of sysIdToUserIdMap) {
      const result = await sql`
        UPDATE transactions
        SET category_id = ${userCatId}
        WHERE user_id = ${userId} AND category_id = ${sysId}
      `;
      txnRemapped += (result as any).length ?? 0;
    }
    console.log(`    Remapped transactions.category_id`);

    // Re-map merchants.category_id (merchants are global, but we remap those linked to this user's transactions)
    // Note: merchants table doesn't have user_id, so we remap based on the system category mappings
    for (const [sysId, userCatId] of sysIdToUserIdMap) {
      await sql`
        UPDATE merchants SET category_id = ${userCatId}
        WHERE category_id = ${sysId}
        AND id IN (SELECT DISTINCT merchant_id FROM transactions WHERE user_id = ${userId} AND merchant_id IS NOT NULL)
      `;
    }
    console.log(`    Remapped merchants.category_id`);

    // Re-map category_rules
    for (const [sysId, userCatId] of sysIdToUserIdMap) {
      await sql`
        UPDATE category_rules SET category_id = ${userCatId}
        WHERE user_id = ${userId} AND category_id = ${sysId}
      `;
    }

    // Re-map recurring_patterns
    for (const [sysId, userCatId] of sysIdToUserIdMap) {
      await sql`
        UPDATE recurring_patterns SET category_id = ${userCatId}
        WHERE user_id = ${userId} AND category_id = ${sysId}
      `;
    }

    // Re-map budgets
    for (const [sysId, userCatId] of sysIdToUserIdMap) {
      await sql`
        UPDATE budgets SET category_id = ${userCatId}
        WHERE user_id = ${userId} AND category_id = ${sysId}
      `;
    }

    console.log(`    Remapped all FK references for user ${userId}`);
  }

  console.log("\n=== Step 4: Update FK constraints ===");
  // Drop old FK on transactions.category_id → categories, add new FK → user_categories
  // (We do this carefully — the old constraint name may vary)

  try {
    await sql`ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_category_id_categories_id_fk`;
    await sql`ALTER TABLE transactions ADD CONSTRAINT transactions_category_id_user_categories_id_fk
      FOREIGN KEY (category_id) REFERENCES user_categories(id)`;
    console.log("  Updated transactions FK");
  } catch (e) {
    console.log("  transactions FK update skipped (may already be correct):", (e as Error).message);
  }

  try {
    await sql`ALTER TABLE merchants DROP CONSTRAINT IF EXISTS merchants_category_id_categories_id_fk`;
    await sql`ALTER TABLE merchants ADD CONSTRAINT merchants_category_id_user_categories_id_fk
      FOREIGN KEY (category_id) REFERENCES user_categories(id)`;
    console.log("  Updated merchants FK");
  } catch (e) {
    console.log("  merchants FK update skipped:", (e as Error).message);
  }

  try {
    await sql`ALTER TABLE category_rules DROP CONSTRAINT IF EXISTS category_rules_category_id_categories_id_fk`;
    await sql`ALTER TABLE category_rules ADD CONSTRAINT category_rules_category_id_user_categories_id_fk
      FOREIGN KEY (category_id) REFERENCES user_categories(id)`;
    console.log("  Updated category_rules FK");
  } catch (e) {
    console.log("  category_rules FK update skipped:", (e as Error).message);
  }

  try {
    await sql`ALTER TABLE recurring_patterns DROP CONSTRAINT IF EXISTS recurring_patterns_category_id_categories_id_fk`;
    await sql`ALTER TABLE recurring_patterns ADD CONSTRAINT recurring_patterns_category_id_user_categories_id_fk
      FOREIGN KEY (category_id) REFERENCES user_categories(id)`;
    console.log("  Updated recurring_patterns FK");
  } catch (e) {
    console.log("  recurring_patterns FK update skipped:", (e as Error).message);
  }

  try {
    await sql`ALTER TABLE budgets DROP CONSTRAINT IF EXISTS budgets_category_id_categories_id_fk`;
    await sql`ALTER TABLE budgets ADD CONSTRAINT budgets_category_id_user_categories_id_fk
      FOREIGN KEY (category_id) REFERENCES user_categories(id)`;
    console.log("  Updated budgets FK");
  } catch (e) {
    console.log("  budgets FK update skipped:", (e as Error).message);
  }

  console.log("\n=== Migration complete ===");
  console.log("The old 'categories' table is preserved as a backup.");
  console.log("Once verified, you can drop it with: DROP TABLE categories;");
}

migrate()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  });
