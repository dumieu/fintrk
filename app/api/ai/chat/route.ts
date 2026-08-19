import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAppAuth } from "@/lib/auth-resilient";
import { logServerError } from "@/lib/safe-error";
import { logAiCost } from "@/lib/ai-cost";
import { getDigest } from "@/lib/fin-ai/cache";
import { chatRateLimit } from "@/lib/fin-ai/guardrails";
import { OpenAiApiError, streamGenerateContent, type ChatTurn } from "@/lib/fin-ai/openai";
import { SYSTEM_INSTRUCTION } from "@/lib/fin-ai/prompt";
import { getDayUsage, recordTurnUsage } from "@/lib/fin-ai/usage";
import {
  FIN_AI_DAILY_BUDGET_MICRO_USD,
  FIN_AI_MAX_ASSISTANT_CHARS,
  FIN_AI_MAX_USER_CHARS,
  FIN_AI_MODEL,
  toPublicUsage,
} from "@/lib/fin-ai/constants";

/**
 * Streaming chat endpoint for "Fin", the in-app FinTRK advisor.
 *
 * Isolation: the Clerk session is the only source of identity. `userId` comes
 * from `requireAppAuth()` and is the sole key used to read financial data - the
 * request body cannot name a user, an account, or a date range, so there is no
 * parameter a caller could tamper with to reach someone else's ledger.
 *
 * Read-only: the model has no tools and no write path. Everything it knows
 * arrives as text built by lib/fin-ai/digest.ts, which issues SELECTs only.
 * The single write in this request is the per-day token meter.
 *
 * Cost: exactly one model call per turn, no tool loop, reasoning off, output
 * capped, and a byte-stable digest prefix so GPT-5.6 prompt caching discounts
 * the repeated bytes.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const NO_STORE = { "Cache-Control": "no-store" } as const;

/** Per-conversation cap: the input side of cost control. */
const MAX_HISTORY_TURNS = 16;

const BodySchema = z.object({
  messages: z
    .array(
      z.discriminatedUnion("role", [
        z.object({
          role: z.literal("user"),
          text: z.string().min(1).max(FIN_AI_MAX_USER_CHARS),
        }),
        z.object({
          role: z.literal("assistant"),
          text: z.string().min(1).max(FIN_AI_MAX_ASSISTANT_CHARS),
        }),
      ]),
    )
    .min(1)
    .max(60),
});

function sseHeaders() {
  return {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-store, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  };
}

/** Errors surfaced before the stream opens still arrive as SSE, so the client
 *  has exactly one response format to parse. */
function sseError(message: string, code: string, status = 200) {
  const body = `data: ${JSON.stringify({ type: "error", message, code })}\n\ndata: ${JSON.stringify({ type: "done" })}\n\n`;
  return new Response(body, { status, headers: sseHeaders() });
}

export async function POST(request: Request) {
  let userId: string | null = null;
  try {
    const gate = await requireAppAuth();
    if (!gate.ok) return gate.response;
    userId = gate.userId;

    const rate = chatRateLimit(userId);
    if (!rate.allowed) {
      return sseError(rate.reason ?? "Too many requests.", "rate_limited");
    }

    const parsed = BodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return sseError("That message could not be read. Try rephrasing it.", "bad_request");
    }

    // Budget gate before any model spend. The check is per UTC day and the user
    // only ever sees a percentage, never tokens or dollars.
    const before = await getDayUsage(userId);
    if (before.costMicroUsd >= FIN_AI_DAILY_BUDGET_MICRO_USD) {
      return sseError(
        "You've used today's chat allowance. It resets at midnight UTC.",
        "budget_exhausted",
      );
    }

    // Trim to the most recent turns: older context adds cost without adding
    // much value once the full financial record is already in the prompt.
    const trimmed = parsed.data.messages.slice(-MAX_HISTORY_TURNS);
    const history: ChatTurn[] = trimmed.map((m) => ({
      role: m.role,
      content: m.text.trim(),
    }));

    const digest = await getDigest(userId);

    // Prompt order matters for caching: the digest is the byte-stable prefix and
    // carries an explicit GPT-5.6 breakpoint. Volatile context (today's date)
    // is a separate later part so it can change daily without invalidating the
    // cached prefix.
    const today = new Date().toISOString().slice(0, 10);
    const encoder = new TextEncoder();
    const uid = userId;

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let closed = false;
        const send = (payload: unknown) => {
          if (closed) return;
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
          } catch {
            closed = true;
          }
        };

        try {
          const result = await streamGenerateContent(
            {
              systemInstruction: SYSTEM_INSTRUCTION,
              digest: digest.text,
              today,
              history,
              promptCacheKey: `fin-ai:${uid}`,
              signal: request.signal,
            },
            // Safety net for table-alignment padding. The prompt forbids it,
            // but a single padded table once produced 78k characters of spaces
            // and ate the whole output budget. Runs this long are never real
            // content in an advisor answer.
            (delta) => send({ type: "delta", text: delta.replace(/ {8,}/g, " ") }),
          );

          const cachedInput = result.usage.cachedContentTokenCount ?? 0;
          const cacheWrite = result.usage.cacheWriteTokenCount ?? 0;
          const prompt = result.usage.promptTokenCount ?? 0;
          const ordinaryInput = Math.max(0, prompt - cachedInput - cacheWrite);
          const outputTokens = Math.max(0, result.usage.candidatesTokenCount ?? 0);

          const usage = await recordTurnUsage(uid, {
            inputTokens: ordinaryInput,
            cachedInputTokens: cachedInput,
            cacheWriteTokens: cacheWrite,
            outputTokens,
          });

          // Mirror into the app-wide AI cost ledger so chat spend shows up in
          // the same place as categorisation and insights spend.
          await logAiCost({
            userId: uid,
            model: FIN_AI_MODEL,
            query: "fin_ai_chat",
            inputTokens: ordinaryInput,
            cachedInputTokens: cachedInput,
            cacheWriteTokens: cacheWrite,
            outputTokens,
          }).catch(() => {});

          if (result.finishReason === "length") {
            send({
              type: "notice",
              message: "Answer cut off at the length limit. Ask me to continue.",
            });
          }
          if (result.finishReason === "content_filter") {
            send({
              type: "error",
              message: "That answer could not be shown. Try rephrasing the question.",
              code: "filtered",
            });
          }
          if (!result.text.trim() && result.finishReason !== "content_filter") {
            send({
              type: "error",
              message: "No answer came back. Try asking again.",
              code: "empty_response",
            });
          }

          send({ type: "usage", usage: toPublicUsage(usage) });
          send({ type: "done" });
        } catch (err) {
          if (request.signal.aborted) {
            send({ type: "done" });
          } else {
            logServerError("api/ai/chat/stream", err);
            const status = err instanceof OpenAiApiError ? err.status : 500;
            send({
              type: "error",
              code: status === 429 ? "upstream_busy" : "upstream_error",
              message:
                status === 429
                  ? "The model is busy right now. Try again in a moment."
                  : "Something went wrong answering that. Try again.",
            });
            send({ type: "done" });
          }
        } finally {
          closed = true;
          try {
            controller.close();
          } catch {
            /* already closed by client disconnect */
          }
        }
      },
    });

    return new Response(stream, { headers: sseHeaders() });
  } catch (err) {
    logServerError("api/ai/chat/POST", err);
    return NextResponse.json(
      { error: "Chat is unavailable right now." },
      { status: 500, headers: NO_STORE },
    );
  }
}
