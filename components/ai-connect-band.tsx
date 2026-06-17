import { ShieldCheck, Lock, Eye, Unplug } from "lucide-react";
import {
  ChatGptIcon,
  ClaudeIcon,
  PerplexityIcon,
  PROVIDER_BRAND_COLOR,
} from "@/components/ai-provider-icons";

const GREEN = "#0BC18D";
const BLUE = "#2CA2FF";
const PURPLE = "#AD74FF";

const PROVIDERS = [
  { id: "chatgpt", name: "ChatGPT", Icon: ChatGptIcon },
  { id: "claude", name: "Claude", Icon: ClaudeIcon },
  { id: "perplexity", name: "Perplexity", Icon: PerplexityIcon },
] as const;

const TRUST = [
  { icon: Eye, label: "Read-only access" },
  { icon: ShieldCheck, label: "You approve every connection" },
  { icon: Lock, label: "Encrypted & private to you" },
  { icon: Unplug, label: "Disconnect in one tap" },
];

/**
 * Hero band that surfaces FinTRK's AI connectivity as a top-of-page,
 * non-technical, security-forward value proposition.
 */
export function AiConnectBand() {
  return (
    <div className="mx-auto mt-9 max-w-2xl">
      <style>{`
        @keyframes fmcp-flow { to { background-position: -16px 0; } }
        @keyframes fmcp-glow { 0%,100% { opacity:.55 } 50% { opacity:1 } }
      `}</style>

      <div className="relative overflow-hidden rounded-2xl border border-white/12 bg-white/[0.045] p-5 backdrop-blur-md sm:p-6">
        <div
          className="pointer-events-none absolute -inset-px rounded-2xl"
          style={{
            background:
              "radial-gradient(120% 100% at 50% -10%, rgba(11,193,141,0.10), transparent 60%)",
          }}
          aria-hidden="true"
        />

        <div className="relative z-10">
          {/* Provider logos flowing into FinTRK */}
          <div className="flex items-center justify-center gap-2.5 sm:gap-3.5">
            {PROVIDERS.map(({ id, name, Icon }) => (
              <span
                key={id}
                className="flex h-10 w-10 items-center justify-center rounded-xl shadow-lg sm:h-11 sm:w-11"
                style={{
                  background: PROVIDER_BRAND_COLOR[id],
                  boxShadow: `0 0 18px ${PROVIDER_BRAND_COLOR[id]}55`,
                }}
                title={name}
                aria-label={name}
              >
                <Icon onBrand className="h-5 w-5 sm:h-6 sm:w-6" />
              </span>
            ))}

            {/* Animated connector */}
            <span
              aria-hidden="true"
              className="h-[2px] w-8 shrink-0 rounded-full sm:w-12"
              style={{
                backgroundImage:
                  "repeating-linear-gradient(90deg, rgba(255,255,255,0.85) 0 4px, transparent 4px 8px)",
                backgroundSize: "16px 2px",
                animation: "fmcp-flow 0.9s linear infinite",
              }}
            />

            {/* FinTRK mark */}
            <span
              className="flex h-11 w-11 items-center justify-center rounded-xl font-aldhabi text-base font-bold text-emerald-950 sm:h-12 sm:w-12 sm:text-lg"
              style={{
                background: `linear-gradient(135deg, ${GREEN}, ${BLUE})`,
                boxShadow: `0 0 24px ${GREEN}66`,
                animation: "fmcp-glow 2.4s ease-in-out infinite",
              }}
              aria-label="FinTRK"
            >
              F
            </span>
          </div>

          <p className="mt-4 text-center text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-300/80">
            Now works inside your favorite AI
          </p>
          <h2 className="mt-1.5 text-center text-lg font-bold leading-snug text-white sm:text-xl">
            Ask ChatGPT, Claude &amp; Perplexity about{" "}
            <span
              style={{
                background: `linear-gradient(90deg, ${GREEN}, ${BLUE}, ${PURPLE})`,
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              your own money
            </span>
            .
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-center text-[13px] leading-relaxed text-white/70">
            Connect FinTRK once and bring your real accounts, spending, and net
            worth into the world&rsquo;s smartest AI. It only ever sees what you
            allow, stays private to you, and you can cut the connection anytime.
          </p>

          <ul className="mt-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5">
            {TRUST.map(({ icon: Icon, label }) => (
              <li
                key={label}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] text-white/75"
              >
                <Icon className="h-3 w-3 shrink-0" style={{ color: GREEN }} aria-hidden />
                {label}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
