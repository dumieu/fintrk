"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ProviderBrandIcon, PROVIDER_BRAND_COLOR, type AiProviderId } from "@/components/ai-provider-icons";
import {
  Sparkles,
  Copy,
  Check,
  ShieldCheck,
  Lock,
  Plus,
  Trash2,
  KeyRound,
  Eye,
  EyeOff,
  Landmark,
  ArrowLeftRight,
  Waves,
  BarChart3,
  UserRound,
  Loader2,
  Link2,
  WifiOff,
} from "lucide-react";

const GREEN = "#0BC18D";
const BLUE = "#2CA2FF";

interface Pat {
  id: number;
  label: string | null;
  last4: string | null;
  createdAt: string;
  lastUsedAt: string | null;
}

type ProviderId = AiProviderId;

interface Provider {
  id: ProviderId;
  name: string;
  blurb: string;
  steps: string[];
  needsToken?: boolean;
}

function buildProviders(appName: string): Provider[] {
  return [
    {
      id: "chatgpt",
      name: "ChatGPT",
      blurb: "Plus, Pro, or Business plan with connectors enabled.",
      steps: [
        "Open ChatGPT and go to Settings, then Connectors (or Apps & Connectors).",
        "Choose Create, then Add custom connector.",
        `Paste your private ${appName} link into the MCP server URL field.`,
        "Press Connect, sign in to FinTRK, and tap Allow access.",
        "Start a new chat and ask anything about your money.",
      ],
    },
    {
      id: "claude",
      name: "Claude",
      blurb: "Free, Pro, Max, Team, or Enterprise plan.",
      steps: [
        "Open Claude and go to Settings, then Connectors.",
        "Click Add custom connector.",
        `Paste your private ${appName} link and give it the name FinTRK.`,
        "Press Connect, sign in to FinTRK, and tap Allow access.",
        "Open a chat and ask Claude about your spending or cashflow.",
      ],
    },
    {
      id: "perplexity",
      name: "Perplexity",
      blurb: "Connectors available on Pro and Enterprise.",
      needsToken: true,
      steps: [
        "Open Perplexity and go to Settings, then Connectors.",
        "Choose Add connector, then Custom (MCP).",
        `Paste your private ${appName} link.`,
        "If it asks for a token, paste a personal access token from the section below.",
        "Press Connect and start asking about your financial data.",
      ],
    },
  ];
}

const ACCESS_ITEMS = [
  { icon: Landmark, label: "Accounts", color: GREEN },
  { icon: ArrowLeftRight, label: "Transactions", color: BLUE },
  { icon: Waves, label: "Cashflow", color: "#ECAA0B" },
  { icon: BarChart3, label: "Spending breakdown", color: "#AD74FF" },
  { icon: UserRound, label: "Financial profile", color: "#FF6F69" },
];

export default function ConnectAiPage() {
  const [origin, setOrigin] = useState("https://fintrk.io");
  const [copied, setCopied] = useState(false);
  const [activeProvider, setActiveProvider] = useState<ProviderId>("chatgpt");

  const [pats, setPats] = useState<Pat[]>([]);
  const [patsLoaded, setPatsLoaded] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [showToken, setShowToken] = useState(true);
  const [tokenCopied, setTokenCopied] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const mcpUrl = useMemo(() => `${origin}/api/mcp`, [origin]);
  const providers = useMemo(() => buildProviders("FinTRK"), []);

  useEffect(() => {
    if (typeof window !== "undefined") setOrigin(window.location.origin);
  }, []);

  const loadPats = useCallback(async () => {
    try {
      const res = await fetch("/api/mcp/pat");
      if (res.ok) {
        const data = await res.json();
        setPats(Array.isArray(data.tokens) ? data.tokens : []);
      }
    } catch {
      /* non-fatal */
    } finally {
      setPatsLoaded(true);
    }
  }, []);

  useEffect(() => {
    void loadPats();
  }, [loadPats]);

  const copyUrl = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(mcpUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked */
    }
  }, [mcpUrl]);

  const copyToken = useCallback(async () => {
    if (!newToken) return;
    try {
      await navigator.clipboard.writeText(newToken);
      setTokenCopied(true);
      setTimeout(() => setTokenCopied(false), 1800);
    } catch {
      /* clipboard blocked */
    }
  }, [newToken]);

  const createPat = useCallback(async () => {
    if (creating) return;
    setCreating(true);
    setNewToken(null);
    try {
      const res = await fetch("/api/mcp/pat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: "AI connection" }),
      });
      if (res.ok) {
        const data = await res.json();
        setNewToken(data.token ?? null);
        setShowToken(true);
        await loadPats();
      }
    } catch {
      /* non-fatal */
    } finally {
      setCreating(false);
    }
  }, [creating, loadPats]);

  const revokePat = useCallback(
    async (id: number) => {
      try {
        await fetch("/api/mcp/pat", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id }),
        });
        await loadPats();
      } catch {
        /* non-fatal */
      }
    },
    [loadPats],
  );

  const current = providers.find((p) => p.id === activeProvider) ?? providers[0];
  const currentColor = PROVIDER_BRAND_COLOR[current.id];

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:py-10 space-y-8">
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="text-center space-y-3"
      >
        <div
          className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl"
          style={{ background: `linear-gradient(135deg, ${GREEN}, ${BLUE})` }}
        >
          <Link2 className="h-7 w-7 text-white" />
        </div>
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center justify-center gap-2">
          <Sparkles className="h-7 w-7" style={{ color: GREEN }} />
          Bring your money into any AI
        </h2>
        <p className="mx-auto max-w-xl text-sm sm:text-base text-muted-foreground">
          Connect FinTRK to ChatGPT, Claude, or Perplexity in under a minute. Your AI can
          then read your real accounts, transactions, and cashflow to give you answers
          grounded in your own numbers.
        </p>
      </motion.section>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.05 }}
      >
        <Card className="border-emerald-500/25 bg-gradient-to-br from-emerald-500/5 to-cyan-500/5">
          <CardContent className="p-5 sm:p-6">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <KeyRound className="h-4 w-4" style={{ color: GREEN }} />
              Your private FinTRK link
            </div>
            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
              <code className="flex-1 truncate rounded-xl border border-border bg-muted/50 px-4 py-3 font-mono text-sm">
                {mcpUrl}
              </code>
              <Button
                onClick={copyUrl}
                className="h-11 shrink-0 gap-2 font-semibold text-white"
                style={{ background: copied ? GREEN : `linear-gradient(135deg, ${GREEN}, ${BLUE})` }}
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? "Copied" : "Copy link"}
              </Button>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Paste this single link into your AI tool. When it asks, sign in to FinTRK and tap
              Allow. No keys, no setup files.
            </p>
          </CardContent>
        </Card>
      </motion.div>

      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
      >
        <div className="mb-4 flex items-center gap-2">
          {providers.map((p) => {
            const active = p.id === activeProvider;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setActiveProvider(p.id)}
                className={`flex flex-1 items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-semibold transition-all ${
                  active
                    ? "border-emerald-500/30 bg-emerald-500/10"
                    : "border-border bg-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <ProviderBrandIcon provider={p.id} size="sm" />
                <span className="hidden sm:inline">{p.name}</span>
              </button>
            );
          })}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={current.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
          >
            <Card>
              <CardContent className="p-5 sm:p-6">
                <div className="mb-4 flex items-center gap-3">
                  <ProviderBrandIcon provider={current.id} size="md" />
                  <div>
                    <div className="font-bold">{current.name}</div>
                    <div className="text-xs text-muted-foreground">{current.blurb}</div>
                  </div>
                </div>

                <ol className="space-y-3">
                  {current.steps.map((step, i) => (
                    <li key={i} className="flex gap-3">
                      <span
                        className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold"
                        style={{ background: `${currentColor}22`, color: currentColor }}
                      >
                        {i + 1}
                      </span>
                      <span className="text-sm leading-relaxed text-muted-foreground">{step}</span>
                    </li>
                  ))}
                </ol>

                {current.needsToken && (
                  <div className="mt-4 rounded-xl border border-blue-500/25 bg-blue-500/5 p-3 text-xs text-muted-foreground">
                    Perplexity may ask for a token instead of an in-browser sign-in. Create one
                    in the Personal access token section below and paste it when prompted.
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        </AnimatePresence>
      </motion.section>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.15 }}
      >
        <Card>
          <CardContent className="p-5 sm:p-6">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              What your AI can read
            </h3>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {ACCESS_ITEMS.map((item) => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.label}
                    className="flex items-center gap-2.5 rounded-xl border border-border bg-muted/30 px-3 py-3"
                  >
                    <Icon className="h-5 w-5 shrink-0" style={{ color: item.color }} />
                    <span className="text-xs font-medium">{item.label}</span>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 flex items-start gap-2 text-xs text-muted-foreground">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" style={{ color: GREEN }} />
              <span>
                Access is strictly read-only. Your AI can never change or delete anything, and it
                only ever sees your own account. Revoke access anytime, here or in your AI tool.
              </span>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
      >
        <Card>
          <CardContent className="p-5 sm:p-6">
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className="flex w-full items-center justify-between text-left"
            >
              <div className="flex items-center gap-2">
                <Lock className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-semibold">Advanced: personal access token</span>
              </div>
              <span className="text-xs text-muted-foreground">{showAdvanced ? "Hide" : "Show"}</span>
            </button>

            <AnimatePresence initial={false}>
              {showAdvanced && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.25 }}
                  className="overflow-hidden"
                >
                  <p className="mt-4 text-xs text-muted-foreground">
                    Some tools (or automations like n8n and Cursor) connect with a token instead
                    of a sign-in window. Create one below, paste your FinTRK link, and add this
                    token as the Authorization Bearer value.
                  </p>

                  <div className="mt-4">
                    <Button
                      onClick={createPat}
                      disabled={creating}
                      className="gap-2 font-semibold text-white"
                      style={{ background: `linear-gradient(135deg, ${GREEN}, ${BLUE})` }}
                    >
                      {creating ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Plus className="h-4 w-4" />
                      )}
                      Generate token
                    </Button>
                  </div>

                  <AnimatePresence>
                    {newToken && (
                      <motion.div
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4"
                      >
                        <div className="flex items-center gap-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                          <Check className="h-4 w-4" />
                          Token created. Copy it now, it is shown only once.
                        </div>
                        <div className="mt-3 flex items-center gap-2">
                          <code className="flex-1 truncate rounded-lg border border-border bg-muted/50 px-3 py-2 font-mono text-xs">
                            {showToken ? newToken : "•".repeat(28)}
                          </code>
                          <button
                            type="button"
                            onClick={() => setShowToken((v) => !v)}
                            className="rounded-lg border border-border p-2 text-muted-foreground hover:text-foreground"
                            aria-label={showToken ? "Hide token" : "Show token"}
                          >
                            {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                          <button
                            type="button"
                            onClick={copyToken}
                            className="rounded-lg border border-border p-2 text-muted-foreground hover:text-foreground"
                            aria-label="Copy token"
                          >
                            {tokenCopied ? (
                              <Check className="h-4 w-4 text-emerald-500" />
                            ) : (
                              <Copy className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <div className="mt-5">
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Active tokens
                    </div>
                    {!patsLoaded ? (
                      <div className="flex items-center gap-2 py-3 text-xs text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                      </div>
                    ) : pats.length === 0 ? (
                      <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/30 px-3 py-3 text-xs text-muted-foreground">
                        <WifiOff className="h-4 w-4" /> No tokens yet.
                      </div>
                    ) : (
                      <ul className="space-y-2">
                        {pats.map((pat) => (
                          <li
                            key={pat.id}
                            className="flex items-center justify-between rounded-xl border border-border bg-muted/30 px-3 py-2.5"
                          >
                            <div className="min-w-0">
                              <div className="truncate text-sm font-medium">
                                {pat.label || "AI connection"}
                                <span className="ml-2 font-mono text-xs text-muted-foreground">
                                  ····{pat.last4}
                                </span>
                              </div>
                              <div className="text-[11px] text-muted-foreground">
                                {pat.lastUsedAt
                                  ? `Last used ${new Date(pat.lastUsedAt).toLocaleDateString()}`
                                  : "Never used"}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => revokePat(pat.id)}
                              className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-500"
                              aria-label="Revoke token"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </CardContent>
        </Card>
      </motion.div>

      <p className="pb-6 text-center text-xs text-muted-foreground">
        FinTRK is not a substitute for professional financial advice. Always confirm decisions
        with a qualified advisor.
      </p>
    </div>
  );
}
