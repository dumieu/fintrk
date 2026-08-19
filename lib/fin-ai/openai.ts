import "server-only";

import { FIN_AI_MAX_OUTPUT_TOKENS, FIN_AI_MODEL } from "@/lib/fin-ai/constants";

/**
 * Minimal OpenAI Chat Completions client for the FinTRK AI chat. No SDK,
 * streaming only.
 *
 * Cost posture (mirrors the previous Gemini client, mapped onto GPT-5.6 Luna):
 *  - reasoning_effort "none". Reasoning tokens bill at the output rate; "none"
 *    is the Luna equivalent of thinkingBudget 0. Do not raise this without
 *    measuring the extra output spend.
 *  - max_completion_tokens caps the expensive side of every turn.
 *  - No tools. The model cannot call anything, which is both the read-only
 *    guarantee and the reason a turn costs exactly one model call.
 *  - store: false so a user's ledger is not retained in the OpenAI dashboard.
 *  - temperature is omitted: GPT-5.6 rejects sampling params with a 400.
 *
 * Caching (GPT-5.6 is breakpoint-based, not "longest unmarked prefix"):
 *  - An explicit breakpoint sits at the end of the financial digest, so the
 *    stable prefix (system instruction + digest) can be reused when today's
 *    date or the user's question changes.
 *  - Implicit mode stays on, so follow-up turns in the same conversation also
 *    cache the growing history.
 *  - prompt_cache_key is the Clerk user id, which OpenAI uses to route related
 *    requests onto the same cache. Required for reliable GPT-5.6 matching.
 *
 * For cache hits the request prefix through the breakpoint must be
 * byte-stable. That is enforced upstream: lib/fin-ai/prompt.ts never
 * interpolates per-request values, and lib/fin-ai/digest.ts renders
 * deterministically. Do not add a timestamp, a request id, or a random nonce
 * anywhere ahead of the digest breakpoint.
 */

const BASE = "https://api.openai.com/v1/chat/completions";

const DIGEST_ACK =
  "Understood. I have this user's financial record loaded and I will answer only from it.";
const TODAY_ACK = "Noted.";

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface ChatUsage {
  promptTokenCount: number;
  cachedContentTokenCount: number;
  cacheWriteTokenCount: number;
  candidatesTokenCount: number;
  thoughtsTokenCount: number;
}

export interface StreamResult {
  text: string;
  usage: ChatUsage;
  finishReason: string | null;
}

export class OpenAiApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "OpenAiApiError";
  }
}

function apiKey(): string {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) throw new OpenAiApiError(503, "OPENAI_API_KEY is not configured.");
  return key;
}

/**
 * Consecutive whitespace characters tolerated before the stream is abandoned.
 *
 * Observed in testing (Gemini era): the model occasionally fell into a
 * degenerate loop emitting table-alignment spaces and produced tens of
 * thousands of whitespace characters, spending the entire output budget.
 * Prompting against it was not reliable. Cutting the stream turns a wasted,
 * truncated, full-price turn into a short one. Kept for Luna.
 */
const MAX_WHITESPACE_RUN = 240;

export interface StreamInput {
  systemInstruction: string;
  /** Byte-stable financial digest. An explicit cache breakpoint is placed here. */
  digest: string;
  /** UTC calendar day, YYYY-MM-DD. Lives AFTER the digest breakpoint. */
  today: string;
  history: ChatTurn[];
  /** Stable per-user key so GPT-5.6 routes this user's turns to one cache. */
  promptCacheKey: string;
  signal?: AbortSignal;
}

interface ContentPart {
  type: "text";
  text: string;
  prompt_cache_breakpoint?: { mode: "explicit" };
}

interface OpenAiMessage {
  role: "system" | "user" | "assistant";
  content: string | ContentPart[];
}

function buildMessages(input: StreamInput): OpenAiMessage[] {
  return [
    { role: "system", content: input.systemInstruction },
    {
      role: "user",
      content: [
        {
          type: "text",
          text: input.digest,
          prompt_cache_breakpoint: { mode: "explicit" },
        },
      ],
    },
    { role: "assistant", content: DIGEST_ACK },
    { role: "user", content: `<today>${input.today}</today>` },
    { role: "assistant", content: TODAY_ACK },
    ...input.history.map((m) => ({ role: m.role, content: m.content })),
  ];
}

interface StreamChunk {
  choices?: Array<{
    delta?: { content?: string | null; refusal?: string | null };
    finish_reason?: string | null;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    prompt_tokens_details?: {
      cached_tokens?: number;
      cache_write_tokens?: number;
    };
    completion_tokens_details?: {
      reasoning_tokens?: number;
    };
  };
}

/**
 * One streaming chat.completions call. Text deltas are forwarded to `onText`
 * as they arrive; the assembled text and final usage are returned at the end.
 */
export async function streamGenerateContent(
  input: StreamInput,
  onText: (delta: string) => void,
): Promise<StreamResult> {
  const controller = new AbortController();
  const onCallerAbort = () => controller.abort();
  if (input.signal) {
    if (input.signal.aborted) controller.abort();
    else input.signal.addEventListener("abort", onCallerAbort, { once: true });
  }

  const res = await fetch(BASE, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey()}`,
    },
    body: JSON.stringify({
      model: FIN_AI_MODEL,
      messages: buildMessages(input),
      stream: true,
      stream_options: { include_usage: true },
      max_completion_tokens: FIN_AI_MAX_OUTPUT_TOKENS,
      reasoning_effort: "none",
      store: false,
      prompt_cache_key: input.promptCacheKey,
    }),
    signal: controller.signal,
  }).catch((err) => {
    input.signal?.removeEventListener("abort", onCallerAbort);
    throw err;
  });

  if (!res.ok || !res.body) {
    input.signal?.removeEventListener("abort", onCallerAbort);
    const detail = await res.text().catch(() => "");
    throw new OpenAiApiError(
      res.status,
      `OpenAI request failed (${res.status}): ${detail.slice(0, 500)}`,
    );
  }

  try {
    return await readSseStream(res.body, onText, controller);
  } finally {
    input.signal?.removeEventListener("abort", onCallerAbort);
  }
}

async function readSseStream(
  body: ReadableStream<Uint8Array>,
  onText: (delta: string) => void,
  controller: AbortController,
): Promise<StreamResult> {
  const usage: ChatUsage = {
    promptTokenCount: 0,
    cachedContentTokenCount: 0,
    cacheWriteTokenCount: 0,
    candidatesTokenCount: 0,
    thoughtsTokenCount: 0,
  };
  let text = "";
  let finishReason: string | null = null;
  let whitespaceRun = 0;
  let runaway = false;

  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  const handleChunk = (chunk: StreamChunk) => {
    const cand = chunk.choices?.[0];
    const delta = cand?.delta?.content;
    if (typeof delta === "string" && delta) {
      for (const ch of delta) {
        whitespaceRun = ch === " " || ch === "\t" ? whitespaceRun + 1 : 0;
        if (whitespaceRun > MAX_WHITESPACE_RUN) {
          runaway = true;
          break;
        }
      }
      if (runaway) {
        const trimmed = delta.replace(/[ \t]+$/, "");
        if (trimmed) {
          text += trimmed;
          onText(trimmed);
        }
      } else {
        text += delta;
        onText(delta);
      }
    }
    if (cand?.finish_reason) finishReason = cand.finish_reason;
    const u = chunk.usage;
    if (u) {
      usage.promptTokenCount = u.prompt_tokens ?? usage.promptTokenCount;
      usage.candidatesTokenCount = u.completion_tokens ?? usage.candidatesTokenCount;
      const cached = u.prompt_tokens_details?.cached_tokens;
      if (cached !== undefined) usage.cachedContentTokenCount = cached;
      const written = u.prompt_tokens_details?.cache_write_tokens;
      if (written !== undefined) usage.cacheWriteTokenCount = written;
      const thoughts = u.completion_tokens_details?.reasoning_tokens;
      if (thoughts !== undefined) usage.thoughtsTokenCount = thoughts;
    }
  };

  try {
    while (!runaway) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          handleChunk(JSON.parse(payload) as StreamChunk);
        } catch {
          /* partial or malformed frame - skip */
        }
        if (runaway) break;
      }
    }
  } finally {
    if (runaway) {
      finishReason = "RUNAWAY_WHITESPACE";
      controller.abort();
    }
    await reader.cancel().catch(() => {});
  }

  return { text, usage, finishReason };
}
