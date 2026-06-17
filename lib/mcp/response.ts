import "server-only";
import type { McpContext } from "@/lib/mcp/context";

export interface LlmContext {
  summary_sentence: string;
  key_numbers: Array<{ label: string; value: number | string; status?: string }>;
  suggested_follow_ups: string[];
  cautions: string[];
}

export interface McpResponseEnvelope<T> {
  data: T;
  metadata: {
    generated_at: string;
    scope: string;
    data_freshness: {
      latest_transaction_date: string | null;
      days_since_latest: number | null;
    };
  };
  llm_context: LlmContext;
}

export function daysSince(dateIso: string | null): number | null {
  if (!dateIso) return null;
  const d = new Date(dateIso.slice(0, 10));
  if (Number.isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
}

export function wrapMcpResponse<T>(
  ctx: McpContext,
  data: T,
  llm_context: Partial<LlmContext> & { summary_sentence: string },
  latestTransactionDate?: string | null,
): McpResponseEnvelope<T> {
  const latest = latestTransactionDate ?? null;
  return {
    data,
    metadata: {
      generated_at: new Date().toISOString(),
      scope: ctx.scope || SCOPE_FALLBACK,
      data_freshness: {
        latest_transaction_date: latest,
        days_since_latest: daysSince(latest),
      },
    },
    llm_context: {
      summary_sentence: llm_context.summary_sentence,
      key_numbers: llm_context.key_numbers ?? [],
      suggested_follow_ups: llm_context.suggested_follow_ups ?? [],
      cautions: llm_context.cautions ?? [],
    },
  };
}

const SCOPE_FALLBACK = "fintrk.read";

export function mcpErrorPayload(
  code: string,
  message: string,
  extra?: Record<string, unknown>,
): { error: { code: string; message: string } & Record<string, unknown> } {
  return { error: { code, message, ...extra } };
}
