"use client";

/**
 * ConnectAiOrb - the animated "AI-woven" mark (same one used in the app-hub
 * tooltips) shown in the top-right chrome. It links to the Connect-AI page and
 * removes itself once the user is already connected to a GenAI over MCP.
 *
 * Self-contained: injects its own keyframes so it looks identical across apps.
 */

import { useEffect, useState } from "react";

const STYLE_ID = "connect-ai-orb-styles";
const CSS = `
@keyframes caio-orbit{to{transform:rotate(360deg);}}
@keyframes caio-pulse{0%,100%{transform:scale(1);opacity:1;}50%{transform:scale(1.16);opacity:.9;}}
@keyframes caio-spark{0%,100%{opacity:.4;transform:scale(.85);}50%{opacity:1;transform:scale(1.15);}}
@keyframes caio-glow{0%,100%{opacity:.4;transform:scale(.92);}50%{opacity:.85;transform:scale(1.08);}}
.caio-svg{display:block;overflow:visible;filter:drop-shadow(0 0 5px rgba(139,92,246,.5));}
.caio-orbit{transform-origin:12px 12px;animation:caio-orbit 3.2s linear infinite;}
.caio-orbit-rev{transform-origin:12px 12px;animation:caio-orbit 4.4s linear infinite reverse;}
.caio-core{transform-origin:12px 12px;animation:caio-pulse 1.8s ease-in-out infinite;}
.caio-spark{animation:caio-spark 1.2s ease-in-out infinite;}
.caio-glow{animation:caio-glow 1.8s ease-in-out infinite;}
@media (prefers-reduced-motion:reduce){.caio-orbit,.caio-orbit-rev,.caio-core,.caio-spark,.caio-glow{animation:none;}}
`;

function injectStyles() {
  if (typeof document === "undefined") return;
  if (document.getElementById(STYLE_ID)) return;
  const el = document.createElement("style");
  el.id = STYLE_ID;
  el.textContent = CSS;
  document.head.appendChild(el);
}

export function AiMark({ size = 20 }: { size?: number }) {
  return (
    <svg
      className="caio-svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="caio-grad" x1="4" y1="4" x2="20" y2="20" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#8b5cf6" />
          <stop offset="0.5" stopColor="#06b6d4" />
          <stop offset="1" stopColor="#d946ef" />
        </linearGradient>
        <radialGradient id="caio-glow-grad" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#a78bfa" stopOpacity="0.55" />
          <stop offset="1" stopColor="#a78bfa" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle className="caio-glow" cx="12" cy="12" r="10" fill="url(#caio-glow-grad)" />
      <g className="caio-orbit">
        <circle cx="12" cy="3.2" r="1.45" fill="#0891b2" />
        <circle cx="20.8" cy="12" r="1.15" fill="#7c3aed" opacity="0.9" />
        <circle cx="12" cy="20.8" r="1.25" fill="#c026d3" />
      </g>
      <g className="caio-orbit-rev">
        <circle cx="5.2" cy="7.2" r="1" fill="#0891b2" opacity="0.85" />
        <circle cx="18.8" cy="16.8" r="0.95" fill="#9333ea" opacity="0.8" />
      </g>
      <g className="caio-core">
        <path
          d="M12 6.4 L13.55 10.45 L17.8 12 L13.55 13.55 L12 17.6 L10.45 13.55 L6.2 12 L10.45 10.45 Z"
          fill="url(#caio-grad)"
        />
        <circle className="caio-spark" cx="12" cy="12" r="1.55" fill="#ffffff" />
      </g>
    </svg>
  );
}

export function ConnectAiOrb() {
  const [status, setStatus] = useState<"loading" | "connected" | "disconnected">(
    "loading",
  );

  useEffect(() => {
    injectStyles();
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/mcp/connection-status", {
          cache: "no-store",
        });
        if (!res.ok) {
          if (alive) setStatus("disconnected");
          return;
        }
        const data = (await res.json()) as { connected?: boolean };
        if (alive) setStatus(data.connected ? "connected" : "disconnected");
      } catch {
        if (alive) setStatus("disconnected");
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Hidden while loading and once connected - never occupies space in either.
  if (status !== "disconnected") return null;

  return (
    <div className="group relative shrink-0">
      <a
        href="/dashboard/connect-ai"
        aria-label="Connect FinTRK to your favorite AI"
        className="flex h-9 w-9 items-center justify-center rounded-xl border border-border/60 bg-background/70 backdrop-blur transition-all hover:-translate-y-px hover:border-[#8b5cf6]/50 hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6]/60"
      >
        <AiMark size={20} />
      </a>
      <div
        role="tooltip"
        className="pointer-events-none absolute right-0 top-[calc(100%+8px)] z-50 w-64 rounded-xl bg-[#11121a] px-3.5 py-3 text-left opacity-0 shadow-xl transition-opacity duration-75 group-hover:opacity-100"
      >
        <p className="mb-1 bg-gradient-to-r from-[#c4b5fd] via-[#67e8f9] to-[#f0abfc] bg-clip-text text-[12.5px] font-bold leading-snug text-transparent">
          Bring FinTRK into your favorite AI.
        </p>
        <p className="text-[11.5px] leading-relaxed text-white/80">
          Connect once so ChatGPT, Claude, Cursor or Perplexity can read your
          accounts, spending and net worth. Read-only, and you can revoke access
          anytime.
        </p>
        <span
          aria-hidden
          className="absolute -top-1 right-3.5 h-2.5 w-2.5 rotate-45 bg-[#11121a]"
        />
      </div>
    </div>
  );
}

export default ConnectAiOrb;
