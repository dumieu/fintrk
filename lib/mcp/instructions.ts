import "server-only";

export const MCP_INSTRUCTIONS = `FinTRK is the user's personal finance tracker. Use these tools to read their accounts, transactions, cashflow, spending, net worth, and recurring charges so you can answer money questions with their real numbers.

## Mandatory first call
Always start with **get_context_brief** to learn currency, account count, transaction date range, monthly cashflow gap, top spending category, and suggested follow-ups.

## Tool graph
- get_context_brief → get_cashflow_summary → get_cashflow_sankey (where money flows)
- get_context_brief → get_spending_breakdown → get_spending_by_month (trends)
- get_context_brief → list_transactions (search / date filters) → get_top_merchants
- get_context_brief → get_net_worth_summary (balance sheet)
- get_context_brief → list_recurring_charges (subscriptions and bills)
- list_categories (reference labels before filtering transactions by category name)

## Data conventions
- Amounts are in the user's main currency unless a tool returns a per-row currency field.
- Card payment transfers between the user's own accounts are excluded from spending intelligence (same as the FinTRK app).
- Dates use YYYY-MM-DD. Month keys use YYYY-MM.
- All tools are read-only; FinTRK MCP cannot move money or edit data.

## Response envelope
Every tool returns \`data\`, \`metadata\` (generated_at, scope, data_freshness), and \`llm_context\` (summary_sentence, key_numbers, suggested_follow_ups, cautions). Prefer llm_context for narration; cite specific amounts and dates from data.

## Disclaimer
You are not a substitute for a licensed financial advisor. Do not invent numbers not present in tool responses.`;
