import { sql, type SQL } from "drizzle-orm";
import { recurringPatterns, transactions } from "@/lib/db/schema";

/**
 * Restrict an aggregation to a single currency.
 *
 * `transactions.base_amount` is denominated in `transactions.base_currency`
 * (the account's currency at ingestion). Summing `base_amount` across rows with
 * DIFFERENT `base_currency` values adds, e.g., USD and SGD at face value, which
 * massively inflates totals. Every spend/income chart MUST scope its sum to one
 * currency so the bar totals match the drill-down lists and tooltips, which all
 * filter by `base_currency = <primary currency>` (see analytics/detail and
 * cashflow/category-transactions). Pass the user's primary currency.
 */
export function primaryCurrencyOnlySql(currency: string) {
  return sql`${transactions.baseCurrency} = ${currency}`;
}

/**
 * Investment category match on leaf/parent category rows (same rules as cashflow sankey).
 * Pass Drizzle column refs for leaf and parent aliases when joining categories.
 */
export function investmentCategoryMatchSql(
  leafName: SQL | SQL.Aliased,
  leafSlug: SQL | SQL.Aliased,
  parentName: SQL | SQL.Aliased,
  parentSlug: SQL | SQL.Aliased,
) {
  return sql`
    (
      lower(coalesce(${leafName}, '')) IN ('investment', 'investments')
      OR lower(coalesce(${leafSlug}, '')) IN ('investment', 'investments')
      OR lower(coalesce(${leafSlug}, '')) LIKE 'investment-%'
      OR lower(coalesce(${leafSlug}, '')) LIKE '%-investment'
      OR lower(coalesce(${parentName}, '')) IN ('investment', 'investments')
      OR lower(coalesce(${parentSlug}, '')) IN ('investment', 'investments')
      OR lower(coalesce(${parentSlug}, '')) LIKE 'investment-%'
      OR lower(coalesce(${parentSlug}, '')) LIKE '%-investment'
    )
  `;
}

/**
 * Spending Intelligence includes only inflow/outflow activity.
 * Savings, misc, and investment categories are excluded.
 * Uncategorized rows remain eligible and are split by amount sign downstream.
 */
export function spendingIntelligenceOnlySql() {
  return sql`
    (
      ${transactions.categoryId} IS NULL
      OR EXISTS (
        SELECT 1
        FROM user_categories si_leaf
        WHERE si_leaf.id = ${transactions.categoryId}
          AND si_leaf.user_id = ${transactions.userId}
          AND si_leaf.flow_type IN ('inflow', 'outflow')
      )
    )
    AND NOT EXISTS (
      SELECT 1
      FROM user_categories si_leaf
      LEFT JOIN user_categories si_parent
        ON si_parent.id = si_leaf.parent_id
       AND si_parent.user_id = si_leaf.user_id
      WHERE si_leaf.id = ${transactions.categoryId}
        AND si_leaf.user_id = ${transactions.userId}
        AND ${investmentCategoryMatchSql(
          sql`si_leaf.name`,
          sql`si_leaf.slug`,
          sql`si_parent.name`,
          sql`si_parent.slug`,
        )}
    )
  `;
}

/** Outflow-side Spending Intelligence rows (expenses / spend charts). */
export function spendingIntelligenceOutflowSql() {
  return sql`
    ${spendingIntelligenceOnlySql()}
    AND (
      (
        ${transactions.categoryId} IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM user_categories si_leaf
          WHERE si_leaf.id = ${transactions.categoryId}
            AND si_leaf.user_id = ${transactions.userId}
            AND si_leaf.flow_type = 'outflow'
        )
      )
      OR (
        ${transactions.categoryId} IS NULL
        AND CAST(${transactions.baseAmount} AS numeric) < 0
      )
    )
  `;
}

/** Inflow-side Spending Intelligence rows (income / cashflow averages). */
export function spendingIntelligenceInflowSql() {
  return sql`
    ${spendingIntelligenceOnlySql()}
    AND (
      (
        ${transactions.categoryId} IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM user_categories si_leaf
          WHERE si_leaf.id = ${transactions.categoryId}
            AND si_leaf.user_id = ${transactions.userId}
            AND si_leaf.flow_type = 'inflow'
        )
        AND CAST(${transactions.baseAmount} AS numeric) > 0
      )
      OR (
        ${transactions.categoryId} IS NULL
        AND CAST(${transactions.baseAmount} AS numeric) > 0
      )
    )
  `;
}

/**
 * Plain SQL predicate for raw queries against the `transactions` table.
 * Pair with card-payments exclusion and `excludeCardPaymentsSql` semantics.
 */
export const SPENDING_INTELLIGENCE_OUTFLOW_RAW = sql`
  (
    (
      transactions.category_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM user_categories si_leaf
        WHERE si_leaf.id = transactions.category_id
          AND si_leaf.user_id = transactions.user_id
          AND si_leaf.flow_type = 'outflow'
      )
    )
    OR (
      transactions.category_id IS NULL
      AND CAST(transactions.base_amount AS numeric) < 0
    )
  )
  AND (
    transactions.category_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM user_categories si_leaf
      WHERE si_leaf.id = transactions.category_id
        AND si_leaf.user_id = transactions.user_id
        AND si_leaf.flow_type IN ('inflow', 'outflow')
    )
  )
  AND NOT EXISTS (
    SELECT 1
    FROM user_categories si_leaf
    LEFT JOIN user_categories si_parent
      ON si_parent.id = si_leaf.parent_id
     AND si_parent.user_id = si_leaf.user_id
    WHERE si_leaf.id = transactions.category_id
      AND si_leaf.user_id = transactions.user_id
      AND (
        lower(coalesce(si_leaf.name, '')) IN ('investment', 'investments')
        OR lower(coalesce(si_leaf.slug, '')) IN ('investment', 'investments')
        OR lower(coalesce(si_leaf.slug, '')) LIKE 'investment-%'
        OR lower(coalesce(si_leaf.slug, '')) LIKE '%-investment'
        OR lower(coalesce(si_parent.name, '')) IN ('investment', 'investments')
        OR lower(coalesce(si_parent.slug, '')) IN ('investment', 'investments')
        OR lower(coalesce(si_parent.slug, '')) LIKE 'investment-%'
        OR lower(coalesce(si_parent.slug, '')) LIKE '%-investment'
      )
  )
`;

/**
 * Ledger-neutral card-balance payments should remain visible in the
 * Transactions table, but must never feed totals, charts, budgets, analytics,
 * or other derived calculations.
 */
export function excludeCardPaymentsSql() {
  return sql`
    NOT EXISTS (
      SELECT 1
      FROM user_categories card_payment_category
      WHERE card_payment_category.id = ${transactions.categoryId}
        AND card_payment_category.user_id = ${transactions.userId}
        AND card_payment_category.slug = 'card-payments'
    )
  `;
}

/**
 * Normalized key for a transaction's display name, matching the SQL used in
 * {@link excludeIgnoredSql}. A "name" ignore hides every transaction whose
 * `coalesce(merchant_name, raw_description)` matches this key.
 */
export function ignoreNameKey(
  merchantName: string | null | undefined,
  rawDescription: string | null | undefined,
): string {
  const source = merchantName ?? rawDescription ?? "";
  return source.trim().toLowerCase().slice(0, 255);
}

/**
 * Hides user-ignored transactions from EVERY read (lists, totals, analytics,
 * charts, cashflow, MCP, exports). Matches an ignore row by either the exact
 * transaction id (scope 'item') or the normalized display name (scope 'name').
 * Add to any `.where(and(...))` over the `transactions` table.
 */
export function excludeIgnoredSql() {
  return sql`
    NOT EXISTS (
      SELECT 1
      FROM transaction_ignores txn_ignore
      WHERE txn_ignore.user_id = ${transactions.userId}
        AND (
          txn_ignore.transaction_id = ${transactions.id}
          OR txn_ignore.name_key = lower(btrim(coalesce(${transactions.merchantName}, ${transactions.rawDescription})))
        )
    )
  `;
}

/**
 * Raw-SQL variant of {@link excludeIgnoredSql} for queries that reference the
 * `transactions` table by name (not via Drizzle column refs). Requires the
 * table to be addressable as `transactions` (or aliased to it) in the query.
 */
export const EXCLUDE_IGNORED_RAW = sql`
  NOT EXISTS (
    SELECT 1
    FROM transaction_ignores txn_ignore
    WHERE txn_ignore.user_id = transactions.user_id
      AND (
        txn_ignore.transaction_id = transactions.id
        OR txn_ignore.name_key = lower(btrim(coalesce(transactions.merchant_name, transactions.raw_description)))
      )
  )
`;

/**
 * Recurring-pattern variant: hides a recurring pattern when its merchant name
 * has been ignored at the name scope for the same user.
 */
export function excludeRecurringIgnoredSql() {
  return sql`
    NOT EXISTS (
      SELECT 1
      FROM transaction_ignores txn_ignore
      WHERE txn_ignore.user_id = ${recurringPatterns.userId}
        AND txn_ignore.name_key = lower(btrim(${recurringPatterns.merchantName}))
    )
  `;
}

export function excludeRecurringCardPaymentsSql() {
  return sql`
    NOT EXISTS (
      SELECT 1
      FROM user_categories card_payment_category
      WHERE card_payment_category.id = ${recurringPatterns.categoryId}
        AND card_payment_category.user_id = ${recurringPatterns.userId}
        AND card_payment_category.slug = 'card-payments'
    )
    AND NOT EXISTS (
      SELECT 1
      FROM transactions recurring_match
      INNER JOIN user_categories recurring_match_category
        ON recurring_match_category.id = recurring_match.category_id
       AND recurring_match_category.user_id = recurring_match.user_id
      WHERE recurring_match.user_id = ${recurringPatterns.userId}
        AND recurring_match_category.slug = 'card-payments'
        AND lower(trim(recurring_match.merchant_name)) = lower(trim(${recurringPatterns.merchantName}))
    )
  `;
}
