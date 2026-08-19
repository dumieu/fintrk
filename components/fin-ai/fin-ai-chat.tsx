"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowUp, RotateCcw, Sparkles, Square, X } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

import { FinMarkdown } from "@/components/fin-ai/fin-markdown";
import {
  FIN_AI_BUDGET_WARN_FRACTION,
  FIN_AI_MAX_ASSISTANT_CHARS,
  FIN_AI_MAX_USER_CHARS,
} from "@/lib/fin-ai/constants";
import { useAppBasePath, appHref } from "@/lib/app-base-path";
import { cn } from "@/lib/utils";

/**
 * "Fin" - the in-app financial advisor panel.
 *
 * Cost-aware by construction on the client too: only the trimmed message list
 * is sent (never the financial data, which the server assembles from the signed
 * -in session), the composer is disabled once the daily allowance is spent, and
 * an in-flight answer can be stopped, which ends the stream and stops billing
 * output tokens.
 */

const STORAGE_KEY = "fintrk-fin-ai-chat-v1";
/** Turns kept in local history. Older ones stop earning their input tokens. */
const MAX_STORED = 40;
const MAX_INPUT_CHARS = FIN_AI_MAX_USER_CHARS;

const AUTH_PATHS = ["/sign-in", "/sign-up", "/auth", "/unauth1", "/sign-out"];

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  error?: boolean;
}

const SUGGESTIONS = [
  "Where is my money actually going?",
  "Build me a realistic monthly budget",
  "Which subscriptions should I cancel?",
  "How long would my savings last if I lost my income?",
];

function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function loadMessages(): ChatMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (m): m is ChatMessage =>
          !!m &&
          typeof m === "object" &&
          typeof (m as ChatMessage).text === "string" &&
          ((m as ChatMessage).role === "user" || (m as ChatMessage).role === "assistant"),
      )
      .slice(-MAX_STORED);
  } catch {
    return [];
  }
}

function saveMessages(messages: ChatMessage[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-MAX_STORED)));
  } catch {
    /* private mode or quota - the conversation still works in memory */
  }
}

export function FinAiChat() {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const basePath = useAppBasePath();
  const reduceMotion = useReducedMotion();

  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [pct, setPct] = useState(0);
  const [exhausted, setExhausted] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const stickToBottom = useRef(true);

  useEffect(() => {
    setMounted(true);
    setMessages(loadMessages());
  }, []);

  useEffect(() => {
    if (mounted) saveMessages(messages);
  }, [messages, mounted]);

  // Allowance is only worth fetching when the panel is actually open.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/ai/chat/usage", { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const json = (await res.json()) as { usage?: { pct?: number } };
        if (cancelled) return;
        const next = json.usage?.pct ?? 0;
        setPct(next);
        setExhausted(next >= 100);
      } catch {
        /* the allowance bar is cosmetic; a failure must not block chatting */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!stickToBottom.current) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, streaming]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const navigate = useCallback(
    (path: string) => {
      setOpen(false);
      router.push(appHref(basePath, path));
    },
    [basePath, router],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStreaming(false);
  }, []);

  const reset = useCallback(() => {
    stop();
    setMessages([]);
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* nothing to clean up */
    }
  }, [stop]);

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim().slice(0, MAX_INPUT_CHARS);
      if (!text || streaming || exhausted) return;

      const userMsg: ChatMessage = { id: newId(), role: "user", text };
      const replyId = newId();
      // Only the conversation goes over the wire. The financial record is
      // assembled server-side from the session, so nothing sensitive is here.
      const payload = [...messages, userMsg]
        .filter((m) => m.text.trim().length > 0)
        .map((m) => ({
          role: m.role,
          text: m.text.slice(
            0,
            m.role === "assistant" ? FIN_AI_MAX_ASSISTANT_CHARS : MAX_INPUT_CHARS,
          ),
        }));

      setMessages((prev) => [...prev, userMsg, { id: replyId, role: "assistant", text: "" }]);
      setDraft("");
      setStreaming(true);
      stickToBottom.current = true;

      const controller = new AbortController();
      abortRef.current = controller;

      const appendToReply = (chunk: string) =>
        setMessages((prev) =>
          prev.map((m) => (m.id === replyId ? { ...m, text: m.text + chunk } : m)),
        );
      const failReply = (message: string) =>
        setMessages((prev) =>
          prev.map((m) => (m.id === replyId ? { ...m, text: message, error: true } : m)),
        );

      try {
        const res = await fetch("/api/ai/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: payload }),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          failReply(
            res.status === 401
              ? "Your session expired. Refresh the page and sign in again."
              : "Chat is unavailable right now. Try again in a moment.",
          );
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let idx: number;
          while ((idx = buffer.indexOf("\n\n")) >= 0) {
            const frame = buffer.slice(0, idx);
            buffer = buffer.slice(idx + 2);
            const line = frame.split("\n").find((l) => l.startsWith("data:"));
            if (!line) continue;
            let evt: {
              type?: string;
              text?: string;
              message?: string;
              code?: string;
              usage?: { pct?: number };
            };
            try {
              evt = JSON.parse(line.slice(5).trim());
            } catch {
              continue;
            }

            if (evt.type === "delta" && evt.text) appendToReply(evt.text);
            else if (evt.type === "notice" && evt.message) appendToReply(`\n\n_${evt.message}_`);
            else if (evt.type === "usage") {
              const next = evt.usage?.pct ?? 0;
              setPct(next);
              setExhausted(next >= 100);
            } else if (evt.type === "error") {
              if (evt.code === "budget_exhausted") setExhausted(true);
              failReply(evt.message ?? "Something went wrong. Try again.");
            }
          }
        }
      } catch (err) {
        if ((err as Error)?.name !== "AbortError") {
          failReply("The connection dropped before I finished. Try again.");
        }
      } finally {
        abortRef.current = null;
        setStreaming(false);
        // Drop an assistant bubble that never received a single token.
        setMessages((prev) =>
          prev.filter((m) => m.id !== replyId || m.text.trim().length > 0),
        );
      }
    },
    [exhausted, messages, streaming],
  );

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }, []);

  const onAuthPage = useMemo(
    () =>
      pathname === "/" ||
      AUTH_PATHS.some((p) => pathname.startsWith(p)) ||
      pathname.startsWith("/privacy") ||
      pathname.startsWith("/terms"),
    [pathname],
  );

  if (!mounted || onAuthPage) return null;

  // Same three-state treatment as the BioTRK and MindTRK allowance meters.
  const warn = !exhausted && pct >= FIN_AI_BUDGET_WARN_FRACTION * 100;
  const barColor = exhausted ? "#FF6F69" : warn ? "#ECAA0B" : "#0BC18D";

  const panel = (
    <>
      <motion.div
        key="fin-backdrop"
        className="fixed inset-0 z-[214] bg-black/25 backdrop-blur-[2px] md:bg-black/10 md:backdrop-blur-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: reduceMotion ? 0.1 : 0.2 }}
        onClick={() => setOpen(false)}
        aria-hidden
      />
      <motion.div
        key="fin-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Fin, your FinTRK financial advisor"
        className="fixed inset-x-0 bottom-0 top-0 z-[215] flex flex-col border-border bg-card shadow-2xl sm:inset-y-3 sm:right-3 sm:left-auto sm:w-[440px] sm:rounded-2xl sm:border"
        initial={reduceMotion ? { opacity: 0 } : { opacity: 0, x: 24, scale: 0.985 }}
        animate={reduceMotion ? { opacity: 1 } : { opacity: 1, x: 0, scale: 1 }}
        exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: 24, scale: 0.985 }}
        transition={
          reduceMotion ? { duration: 0.12 } : { type: "spring", stiffness: 330, damping: 32 }
        }
      >
        <header className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-400 to-teal-600 text-white">
            <Sparkles className="h-3.5 w-3.5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold leading-tight text-foreground">Fin</p>
            <p className="truncate text-[10.5px] leading-tight text-muted-foreground">
              Your financial advisor · reads your data, never changes it
            </p>
          </div>
          <button
            type="button"
            onClick={reset}
            disabled={messages.length === 0 || streaming}
            className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted disabled:opacity-30"
            aria-label="Start a new conversation"
            title="New conversation"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted"
            aria-label="Close chat"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div
          ref={scrollRef}
          onScroll={onScroll}
          className="flex-1 space-y-3 overflow-y-auto px-3 py-3 text-[13px] text-foreground"
        >
          {messages.length === 0 ? (
            <div className="pt-4">
              <p className="text-[13px] font-semibold text-foreground">
                Ask me anything about your money.
              </p>
              <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
                I can see your last 12 months of transactions, accounts, budgets, goals and net
                worth. I will write you a real plan with your own numbers in it.
              </p>
              <div className="mt-3 space-y-1.5">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => void send(s)}
                    disabled={exhausted}
                    className="w-full rounded-lg border border-border bg-background px-2.5 py-2 text-left text-[12px] text-foreground transition hover:border-emerald-500/50 hover:bg-emerald-500/5 disabled:opacity-40"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {messages.map((m) =>
            m.role === "user" ? (
              <div key={m.id} className="flex justify-end">
                <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-emerald-600 px-3 py-2 text-[12.5px] leading-relaxed text-white">
                  {m.text}
                </div>
              </div>
            ) : (
              <div
                key={m.id}
                className={cn(
                  "max-w-full text-[12.5px]",
                  m.error && "text-red-600 dark:text-red-400",
                )}
              >
                {m.text ? (
                  <FinMarkdown text={m.text} onNavigate={navigate} />
                ) : (
                  <span className="inline-flex gap-1 py-1" aria-label="Thinking">
                    {[0, 1, 2].map((d) => (
                      <span
                        key={d}
                        className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500"
                        style={{ animationDelay: `${d * 140}ms` }}
                      />
                    ))}
                  </span>
                )}
              </div>
            ),
          )}
        </div>

        <div className="shrink-0 border-t border-border px-3 pb-3 pt-2">
          {exhausted ? (
            <p className="mb-2 rounded-lg bg-[#FF6F69]/10 px-2.5 py-2 text-[11.5px] leading-snug text-[#FF6F69]">
              You&rsquo;ve used today&rsquo;s full allowance. It unlocks again at midnight UTC.
            </p>
          ) : warn ? (
            <p className="mb-2 rounded-lg bg-[#ECAA0B]/10 px-2.5 py-2 text-[11.5px] leading-snug text-[#ECAA0B]">
              You&rsquo;re past 80% of today&rsquo;s allowance.
            </p>
          ) : null}

          <div className="flex items-end gap-2 rounded-xl border border-border bg-background px-2.5 py-2 focus-within:border-emerald-500/60">
            <textarea
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value.slice(0, MAX_INPUT_CHARS))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send(draft);
                }
              }}
              rows={1}
              disabled={exhausted}
              placeholder={exhausted ? "Back tomorrow" : "Ask about your money…"}
              className="max-h-32 min-h-[20px] flex-1 resize-none bg-transparent text-[12.5px] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground disabled:opacity-50"
            />
            {streaming ? (
              <button
                type="button"
                onClick={stop}
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground transition hover:bg-muted/70"
                aria-label="Stop"
                title="Stop"
              >
                <Square className="h-3 w-3 fill-current" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void send(draft)}
                disabled={!draft.trim() || exhausted}
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-white transition hover:bg-emerald-700 disabled:opacity-30"
                aria-label="Send"
              >
                <ArrowUp className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="mt-2.5">
            <div
              className="h-2 overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-valuenow={Math.round(pct)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Daily AI allowance used"
            >
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, pct)}%`, background: barColor }}
              />
            </div>
            <div className="mt-1.5 flex items-center justify-between text-[10.5px]">
              <span className="text-muted-foreground">Resets at midnight UTC</span>
              <span className="font-medium tabular-nums" style={{ color: barColor }}>
                {Math.round(pct)}% to daily limit
              </span>
            </div>
          </div>
        </div>
      </motion.div>
    </>
  );

  return (
    <>
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open Fin, your financial advisor"
          className="fixed bottom-4 right-4 z-[205] inline-flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-teal-600 text-white shadow-lg shadow-emerald-900/25 transition hover:scale-105 hover:shadow-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 active:scale-95"
        >
          <Sparkles className="h-5 w-5" />
        </button>
      ) : null}
      {createPortal(<AnimatePresence>{open ? panel : null}</AnimatePresence>, document.body)}
    </>
  );
}
