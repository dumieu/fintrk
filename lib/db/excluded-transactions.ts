import { sql } from "drizzle-orm";
import { recurringPatterns, transactions } from "@/lib/db/schema";

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
