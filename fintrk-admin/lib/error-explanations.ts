/**
 * Lightweight friendly explanations for the most common FinTRK error surfaces.
 * Pure data — no side effects. Add cases as new failure modes appear.
 */

export interface Explanation {
  title: string;
  reason: string;
  fix: string;
  severity: "low" | "medium" | "high";
}

const FALLBACK: Explanation = {
  title: "Unexpected error",
  reason: "An unhandled exception was logged.",
  fix: "Open the row, copy the message, and grep the codebase for the failing context.",
  severity: "medium",
};

export function explainError(
  context: string | null | undefined,
  message: string | null | undefined,
  code?: string | null,
): Explanation {
  const ctx = (context ?? "").toLowerCase();
  const msg = (message ?? "").toLowerCase();
  const cod = (code ?? "").toLowerCase();

  // ── Statement / file ingestion ─────────────────────────────────────────
  if (ctx.includes("ingest") || ctx.includes("statement") || ctx.includes("process-statement")) {
    if (msg.includes("duplicate") || msg.includes("already")) {
      return {
        title: "Duplicate statement",
        reason: "User uploaded a file whose hash matches a previously processed statement.",
        fix: "No action needed — this is expected behaviour. Confirm the duplicate guard fired correctly.",
        severity: "low",
      };
    }
    if (msg.includes("ai") || msg.includes("gemini") || msg.includes("model")) {
      return {
        title: "AI extraction failed",
        reason: "Gemini either timed out, refused, or returned malformed JSON for this statement.",
        fix: "Inspect statements.ai_error for the model output, then retry with a smaller batch or different model.",
        severity: "high",
      };
    }
    if (msg.includes("pdf") || msg.includes("parse") || msg.includes("decode")) {
      return {
        title: "Could not parse file",
        reason: "The uploaded file could not be decoded into text/pages.",
        fix: "Ask the user to re-export the statement (PDF/CSV) and re-upload.",
        severity: "medium",
      };
    }
    return {
      title: "Statement ingest failure",
      reason: "Statement processing pipeline raised before completion.",
      fix: "Open the statement row, look at status + ai_error, then re-run the ingest worker.",
      severity: "high",
    };
  }

  // ── Auth / Clerk ───────────────────────────────────────────────────────
  if (ctx.includes("clerk") || ctx.includes("auth") || msg.includes("unauthorized")) {
    return {
      title: "Authentication problem",
      reason: "Clerk session was missing or rejected.",
      fix: "Check Clerk publishable/secret keys and that the user's session cookie is valid.",
      severity: "medium",
    };
  }

  // ── DB / Neon ──────────────────────────────────────────────────────────
  if (
    cod.includes("connect") ||
    msg.includes("neon") ||
    msg.includes("connection") ||
    msg.includes("econnreset") ||
    msg.includes("etimedout")
  ) {
    return {
      title: "Database connectivity",
      reason: "Neon serverless connection dropped or timed out (often a cold-start).",
      fix: "Mostly transient — confirm with retries. If sustained, check Neon dashboard for branch health.",
      severity: "medium",
    };
  }

  // ── FX / network APIs ──────────────────────────────────────────────────
  if (ctx.includes("fx") || ctx.includes("rate") || ctx.includes("webhook")) {
    return {
      title: "External API failure",
      reason: "An outbound call (FX rate provider, webhook endpoint) returned non-2xx.",
      fix: "Check provider status pages and replay the request with a higher timeout.",
      severity: "medium",
    };
  }

  // ── AI / cost ──────────────────────────────────────────────────────────
  if (ctx.includes("ai") || ctx.includes("insight")) {
    return {
      title: "AI insight generation",
      reason: "An AI route raised before producing an insight.",
      fix: "Inspect the prompt / completion in ai_costs and rerun. Check provider quota.",
      severity: "low",
    };
  }

  return FALLBACK;
}
