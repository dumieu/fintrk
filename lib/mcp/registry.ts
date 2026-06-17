import "server-only";
import { SCOPE_READ } from "@/lib/mcp/config";
import { buildMcpContext, type McpContext, type ToolMeta } from "@/lib/mcp/context";
import { McpGuardError, requireReadScope } from "@/lib/mcp/guard";
import { wrapMcpResponse } from "@/lib/mcp/response";
import {
  getCashflowSankeySummary,
  getCashflowSummary,
  getContextBrief,
  getLatestTransactionDate,
  getNetWorthSummary,
  getProfile,
  getSpendingBreakdown,
  getSpendingByMonth,
  getTopMerchants,
  listAccounts,
  listCategories,
  listRecurringCharges,
  listTransactions,
} from "@/lib/mcp/data";

export type { ToolMeta } from "@/lib/mcp/context";

export interface McpToolDef {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  scopes: Array<typeof SCOPE_READ>;
}

type Handler = (ctx: McpContext, args: Record<string, unknown>) => Promise<unknown>;

const DATE_RANGE_SCHEMA = {
  type: "object",
  properties: {
    from: { type: "string", description: "Start date YYYY-MM-DD." },
    to: { type: "string", description: "End date YYYY-MM-DD." },
    months: {
      type: "integer",
      minimum: 1,
      maximum: 72,
      description: "Alternative to from/to: look back N months from today.",
    },
  },
  additionalProperties: false,
};

function asString(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function asInt(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return Math.floor(v);
  return undefined;
}

function asBool(v: unknown, fallback: boolean): boolean {
  return typeof v === "boolean" ? v : fallback;
}

function dateRangeFromArgs(args: Record<string, unknown>) {
  return {
    from: asString(args.from),
    to: asString(args.to),
    months: asInt(args.months),
  };
}

async function latestForUser(userId: string) {
  return getLatestTransactionDate(userId);
}

const TOOL_REGISTRY: Array<McpToolDef & { handler: Handler }> = [
  {
    name: "get_context_brief",
    title: "Get context brief",
    description:
      "Mandatory first call. Profile summary, account count, transaction date range, monthly cashflow gap, top spending category, net worth snapshot, recurring charge count, and suggested follow-ups.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    scopes: [SCOPE_READ],
    handler: async (ctx) => {
      const data = await getContextBrief(ctx.userId, ctx.meta);
      const latest = data.transactions.latest_date;
      const gap = data.cashflow.monthly_gap;
      return wrapMcpResponse(
        ctx,
        data,
        {
          summary_sentence: `${data.accounts.active} active account(s), ${data.transactions.count} transaction(s). Monthly gap ${gap >= 0 ? "+" : ""}${gap} ${data.cashflow.primary_currency}. Latest tx: ${latest ?? "none"}.`,
          key_numbers: [
            { label: "Monthly gap", value: gap },
            { label: "Net worth", value: data.net_worth.net_worth },
            { label: "Recurring (est/mo)", value: data.recurring.estimated_monthly_total },
          ],
          suggested_follow_ups: [
            gap < 0 ? "get_cashflow_summary" : "get_spending_breakdown",
            "get_cashflow_sankey",
            data.recurring.active_count > 0 ? "list_recurring_charges" : "get_top_merchants",
          ],
          cautions: data.transactions.count === 0
            ? ["No transactions on file yet; import statements in FinTRK first."]
            : [],
        },
        latest,
      );
    },
  },
  {
    name: "get_financial_profile",
    title: "Get financial profile",
    description:
      "User profile: name, email, main currency, and travel detection preference.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    scopes: [SCOPE_READ],
    handler: async (ctx) => {
      const data = await getProfile(ctx.userId, ctx.meta);
      return wrapMcpResponse(ctx, data, {
        summary_sentence: data.found
          ? `Profile for ${data.first_name ?? "user"}; currency ${data.main_currency}.`
          : "Profile not found.",
        suggested_follow_ups: ["get_context_brief", "list_accounts"],
      });
    },
  },
  {
    name: "list_accounts",
    title: "List accounts",
    description: "All bank, card, and investment accounts tracked in FinTRK.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    scopes: [SCOPE_READ],
    handler: async (ctx) => {
      const data = await listAccounts(ctx.userId, ctx.meta);
      return wrapMcpResponse(ctx, data, {
        summary_sentence: `${data.count} account(s) on file.`,
        suggested_follow_ups: ["list_transactions", "get_cashflow_summary"],
      });
    },
  },
  {
    name: "list_categories",
    title: "List categories",
    description:
      "User-defined spending/income category labels. Use before filtering list_transactions by category name.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    scopes: [SCOPE_READ],
    handler: async (ctx) => {
      const data = await listCategories(ctx.userId, ctx.meta);
      return wrapMcpResponse(ctx, data, {
        summary_sentence: `${data.count} categor(ies) defined.`,
        suggested_follow_ups: ["get_spending_breakdown", "list_transactions"],
      });
    },
  },
  {
    name: "list_transactions",
    title: "List transactions",
    description:
      "Recent transactions with date, merchant, amount, category, and country. Filters: search, from/to dates, account_id, category name (partial match), flow (inflow|outflow|all), limit (max 200).",
    inputSchema: {
      type: "object",
      properties: {
        search: { type: "string", description: "Filter by description, merchant, or note." },
        from: { type: "string", description: "Start date YYYY-MM-DD." },
        to: { type: "string", description: "End date YYYY-MM-DD." },
        account_id: { type: "string", description: "UUID of a FinTRK account." },
        category: { type: "string", description: "Parent category name (partial match)." },
        flow: { type: "string", enum: ["inflow", "outflow", "all"], default: "all" },
        limit: { type: "integer", minimum: 1, maximum: 200 },
      },
      additionalProperties: false,
    },
    scopes: [SCOPE_READ],
    handler: async (ctx, args) => {
      const flow = asString(args.flow);
      const data = await listTransactions(ctx.userId, ctx.meta, {
        search: asString(args.search),
        from: asString(args.from),
        to: asString(args.to),
        account_id: asString(args.account_id),
        category: asString(args.category),
        flow: flow === "inflow" || flow === "outflow" ? flow : "all",
        limit: asInt(args.limit),
      });
      const latest = data.transactions[0]?.posted_date ?? (await latestForUser(ctx.userId));
      return wrapMcpResponse(
        ctx,
        data,
        {
          summary_sentence: `${data.count} transaction(s) returned.`,
          suggested_follow_ups: ["get_top_merchants", "get_spending_breakdown"],
        },
        latest ?? null,
      );
    },
  },
  {
    name: "get_cashflow_summary",
    title: "Get cashflow summary",
    description:
      "Average monthly income, expenses, and savings gap over recent months (low-activity months filtered out).",
    inputSchema: {
      type: "object",
      properties: {
        months: { type: "integer", minimum: 1, maximum: 24, description: "Lookback window (default 12)." },
      },
      additionalProperties: false,
    },
    scopes: [SCOPE_READ],
    handler: async (ctx, args) => {
      const data = await getCashflowSummary(ctx.userId, ctx.meta, asInt(args.months) ?? 12);
      const latest = await latestForUser(ctx.userId);
      return wrapMcpResponse(
        ctx,
        data,
        {
          summary_sentence: `Avg income ${data.avg_monthly_income}, expenses ${data.avg_monthly_expenses}, gap ${data.gap} ${data.primary_currency} (${data.months_used} month(s) used).`,
          key_numbers: [
            { label: "Avg income", value: data.avg_monthly_income },
            { label: "Avg expenses", value: data.avg_monthly_expenses },
            { label: "Gap", value: data.gap },
          ],
          suggested_follow_ups: ["get_cashflow_sankey", "get_spending_by_month"],
        },
        latest,
      );
    },
  },
  {
    name: "get_cashflow_sankey",
    title: "Get cashflow sankey summary",
    description:
      "High-level money flows: inflow, outflow, and savings totals with top categories per flow. Optional date range or months lookback (default 12).",
    inputSchema: DATE_RANGE_SCHEMA,
    scopes: [SCOPE_READ],
    handler: async (ctx, args) => {
      const data = await getCashflowSankeySummary(ctx.userId, ctx.meta, dateRangeFromArgs(args));
      const latest = await latestForUser(ctx.userId);
      return wrapMcpResponse(
        ctx,
        data,
        {
          summary_sentence: `Inflow ${data.inflow.total}, outflow ${data.outflow.total}, savings ${data.savings.total}; net ${data.net}.`,
          key_numbers: [
            { label: "Inflow", value: data.inflow.total },
            { label: "Outflow", value: data.outflow.total },
            { label: "Net", value: data.net },
          ],
          suggested_follow_ups: ["get_spending_breakdown", "get_top_merchants"],
        },
        latest,
      );
    },
  },
  {
    name: "get_spending_breakdown",
    title: "Get spending breakdown",
    description: "Top spending categories with totals and transaction counts. Optional date range or months lookback.",
    inputSchema: DATE_RANGE_SCHEMA,
    scopes: [SCOPE_READ],
    handler: async (ctx, args) => {
      const data = await getSpendingBreakdown(ctx.userId, ctx.meta, dateRangeFromArgs(args));
      const latest = await latestForUser(ctx.userId);
      const top = data.categories[0];
      return wrapMcpResponse(
        ctx,
        data,
        {
          summary_sentence: top
            ? `Top category: ${top.category} (${top.total} of ${data.grand_total} total).`
            : "No outflow spending in range.",
          key_numbers: [{ label: "Grand total", value: data.grand_total }],
          suggested_follow_ups: ["get_spending_by_month", "get_top_merchants", "list_transactions"],
        },
        latest,
      );
    },
  },
  {
    name: "get_spending_by_month",
    title: "Get spending by month",
    description:
      "Monthly outflow totals with top categories per month. months parameter controls how many recent months (default 12, max 72).",
    inputSchema: {
      type: "object",
      properties: {
        months: { type: "integer", minimum: 1, maximum: 72, description: "Months to return (default 12)." },
      },
      additionalProperties: false,
    },
    scopes: [SCOPE_READ],
    handler: async (ctx, args) => {
      const data = await getSpendingByMonth(ctx.userId, ctx.meta, asInt(args.months) ?? 12);
      const latest = data.months[0]?.month ? `${data.months[0].month}-01` : await latestForUser(ctx.userId);
      return wrapMcpResponse(
        ctx,
        data,
        {
          summary_sentence: `${data.months_returned} month(s) of spending trends.`,
          suggested_follow_ups: ["get_spending_breakdown", "list_transactions"],
        },
        latest,
      );
    },
  },
  {
    name: "get_top_merchants",
    title: "Get top merchants",
    description: "Highest-spend merchants ranked by total outflow. Optional date range, months lookback, or limit (max 50).",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "integer", minimum: 1, maximum: 50 },
        from: { type: "string" },
        to: { type: "string" },
        months: { type: "integer", minimum: 1, maximum: 72 },
      },
      additionalProperties: false,
    },
    scopes: [SCOPE_READ],
    handler: async (ctx, args) => {
      const data = await getTopMerchants(
        ctx.userId,
        ctx.meta,
        asInt(args.limit) ?? 20,
        dateRangeFromArgs(args),
      );
      const latest = await latestForUser(ctx.userId);
      const top = data.merchants[0];
      return wrapMcpResponse(
        ctx,
        data,
        {
          summary_sentence: top
            ? `Top merchant: ${top.merchant} (${top.total}).`
            : "No merchant spending in range.",
          suggested_follow_ups: ["list_transactions", "list_recurring_charges"],
        },
        latest,
      );
    },
  },
  {
    name: "list_recurring_charges",
    title: "List recurring charges",
    description:
      "Detected subscriptions and recurring bills with interval, expected amount, and next expected date. active_only defaults to true.",
    inputSchema: {
      type: "object",
      properties: {
        active_only: { type: "boolean", default: true },
      },
      additionalProperties: false,
    },
    scopes: [SCOPE_READ],
    handler: async (ctx, args) => {
      const data = await listRecurringCharges(
        ctx.userId,
        ctx.meta,
        asBool(args.active_only, true),
      );
      const latest = await latestForUser(ctx.userId);
      return wrapMcpResponse(
        ctx,
        data,
        {
          summary_sentence: `${data.count} recurring charge(s); est. ${data.estimated_monthly_total}/month.`,
          key_numbers: [{ label: "Est. monthly", value: data.estimated_monthly_total }],
          suggested_follow_ups: ["get_top_merchants", "get_spending_breakdown"],
        },
        latest,
      );
    },
  },
  {
    name: "get_net_worth_summary",
    title: "Get net worth summary",
    description:
      "Balance sheet: total assets, liabilities, net worth, top line items, and projection settings.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    scopes: [SCOPE_READ],
    handler: async (ctx) => {
      const data = await getNetWorthSummary(ctx.userId, ctx.meta);
      const latest = await latestForUser(ctx.userId);
      return wrapMcpResponse(
        ctx,
        data,
        {
          summary_sentence: `Net worth ${data.net_worth} ${data.currency} (${data.asset_count} assets, ${data.liability_count} liabilities).`,
          key_numbers: [
            { label: "Net worth", value: data.net_worth },
            { label: "Assets", value: data.total_assets },
            { label: "Liabilities", value: data.total_liabilities },
          ],
          suggested_follow_ups: ["get_cashflow_summary", "get_context_brief"],
        },
        latest,
      );
    },
  },
];

export const TOOL_DEFS: McpToolDef[] = TOOL_REGISTRY.map(({ handler: _h, ...def }) => def);

const HANDLER_MAP = new Map(TOOL_REGISTRY.map((t) => [t.name, t]));

export async function runTool(
  name: string,
  args: Record<string, unknown>,
  userId: string,
  scope: string,
  meta: ToolMeta,
): Promise<unknown> {
  const tool = HANDLER_MAP.get(name);
  if (!tool) throw new Error(`Unknown tool: ${name}`);

  const ctx = buildMcpContext(userId, scope, meta);
  requireReadScope(ctx);

  try {
    return await tool.handler(ctx, args);
  } catch (err) {
    if (err instanceof McpGuardError) throw err;
    throw err;
  }
}
