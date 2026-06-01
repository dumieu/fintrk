import "server-only";
import {
  getCashflowSummary,
  getProfile,
  getSpendingBreakdown,
  getTopMerchants,
  listAccounts,
  listTransactions,
} from "@/lib/mcp/data";

export interface McpToolDef {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export const TOOL_DEFS: McpToolDef[] = [
  {
    name: "get_financial_profile",
    title: "Get financial profile",
    description:
      "Get the user's FinTRK profile: name, email, main currency, and travel detection preference. Call this first to ground any money guidance.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "list_accounts",
    title: "List accounts",
    description: "List every bank, card, and investment account the user tracks in FinTRK.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "list_transactions",
    title: "List transactions",
    description:
      "List recent transactions with date, merchant, amount, category, and country. Optional filters: search text, from/to dates (YYYY-MM-DD), limit (max 200).",
    inputSchema: {
      type: "object",
      properties: {
        search: { type: "string", description: "Filter by description, merchant, or note." },
        from: { type: "string", description: "Start date YYYY-MM-DD." },
        to: { type: "string", description: "End date YYYY-MM-DD." },
        limit: { type: "integer", minimum: 1, maximum: 200 },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_cashflow_summary",
    title: "Get cashflow summary",
    description:
      "Average monthly income, expenses, and savings gap over recent months (filters out low-activity months).",
    inputSchema: {
      type: "object",
      properties: {
        months: { type: "integer", minimum: 1, maximum: 24, description: "Lookback window (default 12)." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_spending_breakdown",
    title: "Get spending breakdown",
    description: "Top spending categories with totals and transaction counts.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_top_merchants",
    title: "Get top merchants",
    description: "Highest-spend merchants ranked by total outflow.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "integer", minimum: 1, maximum: 50 },
      },
      additionalProperties: false,
    },
  },
];

export interface ToolMeta {
  ipAddress: string;
  userAgent: string;
}

function asString(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v : undefined;
}

function asInt(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return Math.floor(v);
  return undefined;
}

export async function runTool(
  name: string,
  args: Record<string, unknown>,
  userId: string,
  meta: ToolMeta,
): Promise<unknown> {
  switch (name) {
    case "get_financial_profile":
      return getProfile(userId, meta);
    case "list_accounts":
      return listAccounts(userId, meta);
    case "list_transactions":
      return listTransactions(userId, meta, {
        search: asString(args.search),
        from: asString(args.from),
        to: asString(args.to),
        limit: asInt(args.limit),
      });
    case "get_cashflow_summary":
      return getCashflowSummary(userId, meta, asInt(args.months) ?? 12);
    case "get_spending_breakdown":
      return getSpendingBreakdown(userId, meta);
    case "get_top_merchants":
      return getTopMerchants(userId, meta, asInt(args.limit) ?? 20);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
