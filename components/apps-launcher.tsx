"use client";

/**
 * AppsLauncher - cross-app "waffle" launcher (Google app-drawer style).
 *
 * Self-contained: no external UI deps, its own portaled popover, instant
 * flyout tooltips, and inline xTRK-family app icons. Drop the same file into
 * any xTRK app and set `current` to highlight the app you are in.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type AppKey = "bio" | "fin" | "bull" | "piggy" | "mind";

type AppDef = {
  key: AppKey;
  name: string;
  pitch: string;
  href: string;
  accent: string;
  Icon: () => React.ReactElement;
};

const APPS: AppDef[] = [
  {
    key: "bio",
    name: "BioTRK",
    pitch: "Turn your blood work, nutrition and supplements into a longevity roadmap. Measure. Adapt. Outpace aging.",
    href: "https://biotrk.io",
    accent: "#2bd4a4",
    Icon: BioIcon,
  },
  {
    key: "fin",
    name: "FinTRK",
    pitch: "Your money, mapped - past, present, and next move. From spend to wealth - one clear financial picture.",
    href: "https://fintrk.io",
    accent: "#6aa1ff",
    Icon: FinIcon,
  },
  {
    key: "bull",
    name: "BullTRK",
    pitch: "From market intelligence to plays to deep AI stock analysis. Invest, plan, track and project markets, portfolios and wealth.",
    href: "https://bulltrk.com",
    accent: "#f0a52e",
    Icon: BullIcon,
  },
  {
    key: "piggy",
    name: "PiggyTRK",
    pitch: "A tiny economy that raises money-smart kids. Your child will learn, without realizing, life-long concepts.",
    href: "https://piggytrk.com",
    accent: "#ff9a5a",
    Icon: PiggyIcon,
  },
  {
    key: "mind",
    name: "MindTRK",
    pitch: "Capture every thought. Find focus. Unleash your creativity.",
    href: "https://mindtrk.com",
    accent: "#b08bff",
    Icon: MindIcon,
  },
];

const PANEL_W = 312;
const TIP_W = 232;
const STYLE_ID = "apps-launcher-styles";

const CSS = `
.al-btn{background:transparent;border:none;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;padding:0;-webkit-tap-highlight-color:transparent;transition:background .15s ease,color .15s ease;color:inherit;}
.al-btn:hover{background:rgba(128,128,128,.16);}
.al-btn:focus-visible{outline:2px solid rgba(128,128,128,.5);outline-offset:2px;}
.al-tile{transition:background .12s ease;text-decoration:none;}
.al-tile:hover{background:rgba(128,128,128,.14);}
.al-pop{animation:al-pop .15s cubic-bezier(.2,.9,.3,1);}
@keyframes al-pop{from{opacity:0;transform:translateY(-6px) scale(.98);}to{opacity:1;transform:none;}}
.al-ai{display:inline-flex!important;flex-direction:row!important;flex-wrap:nowrap!important;align-items:center!important;gap:4px;flex-shrink:0;margin-left:8px;line-height:1;vertical-align:middle;}
.al-ai-svg{display:block;flex:0 0 auto;width:13px;height:13px;overflow:visible;filter:drop-shadow(0 0 5px rgba(167,139,250,.7));}
.al-ai-orbit{transform-origin:12px 12px;animation:al-ai-orbit 3.2s linear infinite;}
.al-ai-orbit-rev{transform-origin:12px 12px;animation:al-ai-orbit 4.4s linear infinite reverse;}
.al-ai-core{transform-origin:12px 12px;animation:al-ai-pulse 1.8s ease-in-out infinite;}
.al-ai-spark{animation:al-ai-spark 1.2s ease-in-out infinite;}
.al-ai-glow{animation:al-ai-glow 1.8s ease-in-out infinite;}
.al-ai-label{display:inline-block;font-size:9px;font-weight:650;letter-spacing:.045em;line-height:1;white-space:nowrap;background:linear-gradient(105deg,#c4b5fd 0%,#67e8f9 42%,#f0abfc 72%,#c4b5fd 100%);background-size:220% 100%;-webkit-background-clip:text;background-clip:text;color:transparent;-webkit-text-fill-color:transparent;animation:al-ai-shimmer 2.8s linear infinite;}
@keyframes al-ai-orbit{to{transform:rotate(360deg);}}
@keyframes al-ai-pulse{0%,100%{transform:scale(1);opacity:1;}50%{transform:scale(1.18);opacity:.85;}}
@keyframes al-ai-spark{0%,100%{opacity:.35;transform:scale(.85);}50%{opacity:1;transform:scale(1.15);}}
@keyframes al-ai-glow{0%,100%{opacity:.35;transform:scale(.92);}50%{opacity:.85;transform:scale(1.08);}}
@keyframes al-ai-shimmer{0%{background-position:0% 50%;}100%{background-position:220% 50%;}}
@media (prefers-reduced-motion:reduce){
.al-ai-orbit,.al-ai-orbit-rev,.al-ai-core,.al-ai-spark,.al-ai-glow,.al-ai-label{animation:none;}
.al-ai-label{background:none;-webkit-text-fill-color:rgba(196,181,253,.92);color:rgba(196,181,253,.92);}
}
`;

function injectStyles() {
  if (typeof document === "undefined") return;
  let el = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement("style");
    el.id = STYLE_ID;
    document.head.appendChild(el);
  }
  el.textContent = CSS;
}

function useIsDark() {
  const [isDark, setIsDark] = useState(false);
  useEffect(() => {
    const check = () => {
      const el = document.documentElement;
      const cls = el.classList;
      if (cls.contains("dark")) return setIsDark(true);
      if (cls.contains("light")) return setIsDark(false);
      if (el.getAttribute("data-theme") === "dark") return setIsDark(true);
      if (el.getAttribute("data-theme") === "light") return setIsDark(false);
      setIsDark(window.matchMedia("(prefers-color-scheme: dark)").matches);
    };
    check();
    const mo = new MutationObserver(check);
    mo.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-theme"],
    });
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", check);
    return () => {
      mo.disconnect();
      mq.removeEventListener("change", check);
    };
  }, []);
  return isDark;
}

export function AppsLauncher({
  current,
  buttonClassName,
  size = 40,
}: {
  current?: AppKey;
  buttonClassName?: string;
  size?: number;
}) {
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const [hovered, setHovered] = useState<{ key: AppKey; top: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const isDark = useIsDark();

  useEffect(() => {
    setMounted(true);
    injectStyles();
  }, []);

  const place = useCallback(() => {
    const btn = btnRef.current;
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    let left = r.left;
    if (left + PANEL_W > window.innerWidth - 8) left = window.innerWidth - 8 - PANEL_W;
    if (left < 8) left = 8;
    setPos({ top: r.bottom + 8, left });
  }, []);

  useEffect(() => {
    if (!open) return;
    place();
    const onScroll = () => place();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    // Ignore dismissals for one frame so the opening gesture cannot close us.
    let armed = false;
    const armId = window.setTimeout(() => {
      armed = true;
    }, 50);
    const onDown = (e: MouseEvent) => {
      if (!armed) return;
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || btnRef.current?.contains(t)) return;
      setOpen(false);
      setHovered(null);
    };
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      window.clearTimeout(armId);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open, place]);

  const surface = isDark ? "#14141c" : "#ffffff";
  const border = isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.08)";
  const ink = isDark ? "#f2f2f5" : "#1a1a1f";
  const muted = isDark ? "#9aa0aa" : "#80868b";
  const shadow = isDark
    ? "0 16px 48px rgba(0,0,0,0.55)"
    : "0 16px 48px rgba(15,18,28,0.18)";

  // Tooltip anchored to the right of the panel (falls back to left).
  let tipLeft = pos.left + PANEL_W + 10;
  let tipSide: "right" | "left" = "right";
  if (mounted && tipLeft + TIP_W > window.innerWidth - 8) {
    tipLeft = pos.left - TIP_W - 10;
    tipSide = "left";
  }
  if (tipLeft < 8) tipLeft = 8;
  const hoveredApp = hovered ? APPS.find((a) => a.key === hovered.key) : null;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-label="Apps"
        aria-haspopup="menu"
        aria-expanded={open}
        onPointerDown={(e) => {
          e.stopPropagation();
        }}
        onMouseDown={(e) => {
          e.stopPropagation();
        }}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className={buttonClassName ? buttonClassName : "al-btn"}
        style={
          buttonClassName
            ? undefined
            : { width: size, height: size, borderRadius: 12 }
        }
      >
        <WaffleIcon />
      </button>

      {mounted && open
        ? createPortal(
            <div
              ref={panelRef}
              role="menu"
              aria-label="My Personal Intelligence Hub"
              className="al-pop"
              data-app-chrome
              onPointerDown={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              style={{
                position: "fixed",
                top: pos.top,
                left: pos.left,
                width: PANEL_W,
                zIndex: 2147483600,
                background: surface,
                color: ink,
                border: `1px solid ${border}`,
                borderRadius: 20,
                boxShadow: shadow,
                padding: 14,
                boxSizing: "border-box",
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: muted,
                  padding: "2px 6px 10px",
                  lineHeight: 1.35,
                }}
              >
                My Personal Intelligence Hub
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 1fr)",
                  gap: 4,
                }}
              >
                {APPS.map((app) => {
                  const isCurrent = app.key === current;
                  return (
                    <a
                      key={app.key}
                      href={app.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      role="menuitem"
                      className="al-tile"
                      onMouseEnter={(e) =>
                        setHovered({
                          key: app.key,
                          top:
                            e.currentTarget.getBoundingClientRect().top +
                            e.currentTarget.getBoundingClientRect().height / 2,
                        })
                      }
                      onMouseLeave={() => setHovered(null)}
                      onClick={() => setOpen(false)}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: 8,
                        padding: "12px 6px",
                        borderRadius: 14,
                        color: ink,
                        position: "relative",
                        boxShadow: isCurrent
                          ? `inset 0 0 0 1.5px ${app.accent}`
                          : "none",
                      }}
                    >
                      <span
                        style={{
                          width: 44,
                          height: 44,
                          display: "block",
                        }}
                      >
                        <app.Icon />
                      </span>
                      <span style={{ fontSize: 12, fontWeight: 600 }}>
                        {app.name}
                      </span>
                    </a>
                  );
                })}
              </div>
            </div>,
            document.body
          )
        : null}

      {mounted && open && hovered && hoveredApp
        ? createPortal(
            <div
              className="al-pop"
              style={{
                position: "fixed",
                top: hovered.top,
                left: tipLeft,
                width: TIP_W,
                transform: "translateY(-50%)",
                zIndex: 2147483601,
                background: isDark ? "#0d0d13" : "#1b1c22",
                color: "#ffffff",
                borderRadius: 12,
                padding: "10px 12px",
                boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
                pointerEvents: "none",
                boxSizing: "border-box",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                  marginBottom: 3,
                }}
              >
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: hoveredApp.accent,
                    minWidth: 0,
                  }}
                >
                  {hoveredApp.name}
                </div>
                <AiWovenMark />
              </div>
              <div style={{ fontSize: 12, lineHeight: 1.4, color: "rgba(255,255,255,0.82)" }}>
                {hoveredApp.pitch}
              </div>
              <span
                aria-hidden
                style={{
                  position: "absolute",
                  top: "50%",
                  [tipSide === "right" ? "left" : "right"]: -5,
                  width: 10,
                  height: 10,
                  background: isDark ? "#0d0d13" : "#1b1c22",
                  transform: "translateY(-50%) rotate(45deg)",
                } as React.CSSProperties}
              />
            </div>,
            document.body
          )
        : null}
    </>
  );
}

/* ---------------------------------- icons --------------------------------- */

function AiWovenMark() {
  return (
    <span
      className="al-ai"
      aria-hidden="true"
      style={{
        display: "inline-flex",
        flexDirection: "row",
        flexWrap: "nowrap",
        alignItems: "center",
        gap: 4,
        flexShrink: 0,
        marginLeft: 8,
        lineHeight: 1,
      }}
    >
      <svg
        className="al-ai-svg"
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        style={{ display: "block", flex: "0 0 auto" }}
      >
        <defs>
          <linearGradient id="al-ai-grad" x1="4" y1="4" x2="20" y2="20" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#c4b5fd" />
            <stop offset="0.5" stopColor="#67e8f9" />
            <stop offset="1" stopColor="#f0abfc" />
          </linearGradient>
          <radialGradient id="al-ai-glow" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="#a78bfa" stopOpacity="0.7" />
            <stop offset="1" stopColor="#a78bfa" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle className="al-ai-glow" cx="12" cy="12" r="10" fill="url(#al-ai-glow)" />
        <g className="al-ai-orbit">
          <circle cx="12" cy="3.2" r="1.45" fill="#67e8f9" />
          <circle cx="20.8" cy="12" r="1.15" fill="#c4b5fd" opacity="0.9" />
          <circle cx="12" cy="20.8" r="1.25" fill="#f0abfc" />
        </g>
        <g className="al-ai-orbit-rev">
          <circle cx="5.2" cy="7.2" r="1" fill="#a5f3fc" opacity="0.85" />
          <circle cx="18.8" cy="16.8" r="0.95" fill="#e9d5ff" opacity="0.8" />
        </g>
        <g className="al-ai-core">
          <path
            d="M12 6.4 L13.55 10.45 L17.8 12 L13.55 13.55 L12 17.6 L10.45 13.55 L6.2 12 L10.45 10.45 Z"
            fill="url(#al-ai-grad)"
          />
          <circle className="al-ai-spark" cx="12" cy="12" r="1.55" fill="#ffffff" />
        </g>
      </svg>
      <span className="al-ai-label" style={{ display: "inline-block", whiteSpace: "nowrap" }}>
        AI-woven
      </span>
    </span>
  );
}

function WaffleIcon() {
  const dots = [5, 12, 19];
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style={{ opacity: 0.8 }}>
      {dots.map((y) =>
        dots.map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r={2.05} />)
      )}
    </svg>
  );
}

function BioIcon() {
  return (
    <svg viewBox="0 0 512 512" width="100%" height="100%" aria-hidden="true">
      <defs>
        <linearGradient id="al-bio-a" x1="256" y1="72" x2="256" y2="440" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#0BC18D" />
          <stop offset="0.35" stopColor="#2CA2FF" />
          <stop offset="0.7" stopColor="#AD74FF" />
          <stop offset="1" stopColor="#FF6F69" />
        </linearGradient>
        <linearGradient id="al-bio-b" x1="256" y1="72" x2="256" y2="440" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ECAA0B" />
          <stop offset="0.35" stopColor="#FF6F69" />
          <stop offset="0.7" stopColor="#AD74FF" />
          <stop offset="1" stopColor="#2CA2FF" />
        </linearGradient>
      </defs>

      <g fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d="M344.00 72.00 L342.12 79.83 L336.55 87.66 L327.54 95.49 L315.46 103.32 L300.85 111.15 L284.31 118.98 L266.56 126.81 L248.36 134.64 L230.49 142.47 L213.71 150.30 L198.74 158.13 L186.21 165.96 L176.68 173.79 L170.54 181.62 L168.05 189.45 L169.33 197.28 L174.31 205.11 L182.79 212.94 L194.40 220.77 L208.65 228.60 L224.92 236.43 L242.52 244.26 L260.70 252.09 L278.68 259.91 L295.69 267.74 L311.00 275.57 L323.95 283.40 L334.00 291.23 L340.72 299.06 L343.80 306.89 L343.13 314.72 L338.74 322.55 L330.80 330.38 L319.66 338.21 L305.80 346.04 L289.81 353.87 L272.37 361.70 L254.24 369.53 L236.17 377.36 L218.96 385.19 L203.33 393.02 L189.95 400.85 L179.40 408.68 L172.13 416.51 L168.44 424.34 L168.50 432.17 L172.31 440.00" stroke="url(#al-bio-a)" strokeWidth="30" />
        <path d="M168.00 72.00 L169.88 79.83 L175.45 87.66 L184.46 95.49 L196.54 103.32 L211.15 111.15 L227.69 118.98 L245.44 126.81 L263.64 134.64 L281.51 142.47 L298.29 150.30 L313.26 158.13 L325.79 165.96 L335.32 173.79 L341.46 181.62 L343.95 189.45 L342.67 197.28 L337.69 205.11 L329.21 212.94 L317.60 220.77 L303.35 228.60 L287.08 236.43 L269.48 244.26 L251.30 252.09 L233.32 259.91 L216.31 267.74 L201.00 275.57 L188.05 283.40 L178.00 291.23 L171.28 299.06 L168.20 306.89 L168.87 314.72 L173.26 322.55 L181.20 330.38 L192.34 338.21 L206.20 346.04 L222.19 353.87 L239.63 361.70 L257.76 369.53 L275.83 377.36 L293.04 385.19 L308.67 393.02 L322.05 400.85 L332.60 408.68 L339.87 416.51 L343.56 424.34 L343.50 432.17 L339.69 440.00" stroke="url(#al-bio-b)" strokeWidth="30" />
      </g>

      <g strokeLinecap="round">
        <line x1="315.5" y1="103.3" x2="196.5" y2="103.3" stroke="#0BC18D" strokeWidth="18" opacity="0.75" />
        <line x1="230.5" y1="142.5" x2="281.5" y2="142.5" stroke="#2CA2FF" strokeWidth="18" opacity="0.75" />
        <line x1="170.5" y1="181.6" x2="341.5" y2="181.6" stroke="#AD74FF" strokeWidth="18" opacity="0.75" />
        <line x1="194.4" y1="220.8" x2="317.6" y2="220.8" stroke="#ECAA0B" strokeWidth="18" opacity="0.75" />
        <line x1="278.7" y1="259.9" x2="233.3" y2="259.9" stroke="#FF6F69" strokeWidth="18" opacity="0.75" />
        <line x1="340.7" y1="299.1" x2="171.3" y2="299.1" stroke="#0BC18D" strokeWidth="18" opacity="0.75" />
        <line x1="319.7" y1="338.2" x2="192.3" y2="338.2" stroke="#2CA2FF" strokeWidth="18" opacity="0.75" />
        <line x1="236.2" y1="377.4" x2="275.8" y2="377.4" stroke="#AD74FF" strokeWidth="18" opacity="0.75" />
      </g>
    </svg>
  );
}

function FinIcon() {
  return (
    <img
      src="/icons/fintrk-launcher.png"
      alt=""
      aria-hidden="true"
      draggable={false}
      style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
    />
  );
}

function BullIcon() {
  return (
    <svg viewBox="0 0 512 512" width="100%" height="100%" aria-hidden="true">
      <defs>
        <linearGradient id="al-bull-ring" x1="108" y1="72" x2="404" y2="440" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#3f4756" />
          <stop offset="0.55" stopColor="#1a2028" />
          <stop offset="1" stopColor="#2c2414" />
        </linearGradient>
        <linearGradient id="al-bull-ring-shine" x1="140" y1="48" x2="360" y2="210" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ffd27a" />
          <stop offset="0.55" stopColor="#f0a52e" stopOpacity="0.35" />
          <stop offset="1" stopColor="#f0a52e" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="al-bull-wash" cx="0.42" cy="0.36" r="0.64">
          <stop offset="0" stopColor="#f0a52e" stopOpacity="0.14" />
          <stop offset="1" stopColor="#f0a52e" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="al-bull-bear" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ff857c" />
          <stop offset="1" stopColor="#d2222a" />
        </linearGradient>
        <linearGradient id="al-bull-bull" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5ef5a8" />
          <stop offset="1" stopColor="#129a54" />
        </linearGradient>
        <linearGradient id="al-bull-surge" x1="340" y1="110" x2="390" y2="340" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#8affc8" />
          <stop offset="0.38" stopColor="#2fd87a" />
          <stop offset="1" stopColor="#0c8c4a" />
        </linearGradient>
      </defs>

      <circle cx="256" cy="256" r="198" fill="url(#al-bull-wash)" />
      <circle
        cx="256"
        cy="256"
        r="210"
        fill="none"
        stroke="url(#al-bull-ring)"
        strokeWidth="30"
      />
      <circle
        cx="256"
        cy="256"
        r="210"
        fill="none"
        stroke="url(#al-bull-ring-shine)"
        strokeWidth="30"
        strokeLinecap="round"
        strokeDasharray="168 1400"
        transform="rotate(-48 256 256)"
      />

      <line
        x1="92"
        y1="300"
        x2="420"
        y2="300"
        stroke="#4a5564"
        strokeWidth="11"
        strokeLinecap="round"
        opacity="0.55"
      />

      <g>
        <line x1="148" y1="286" x2="148" y2="412" stroke="#c41e26" strokeWidth="12" strokeLinecap="round" />
        <rect x="126" y="316" width="44" height="74" rx="9" fill="url(#al-bull-bear)" />
      </g>

      <g>
        <line x1="222" y1="244" x2="222" y2="376" stroke="#0f8f4c" strokeWidth="12" strokeLinecap="round" />
        <rect x="200" y="274" width="44" height="74" rx="9" fill="url(#al-bull-bull)" />
      </g>

      <g>
        <line x1="292" y1="232" x2="292" y2="344" stroke="#0f8f4c" strokeWidth="12" strokeLinecap="round" />
        <rect x="272" y="258" width="40" height="56" rx="9" fill="url(#al-bull-bull)" />
      </g>

      <g>
        <line x1="368" y1="104" x2="368" y2="352" stroke="#0a7a40" strokeWidth="14" strokeLinecap="round" />
        <rect x="338" y="124" width="60" height="200" rx="11" fill="url(#al-bull-surge)" />
        <rect x="348" y="138" width="14" height="168" rx="7" fill="#ffffff" opacity="0.28" />
      </g>
    </svg>
  );
}

function PiggyIcon() {
  return (
    <svg viewBox="0 0 512 512" width="100%" height="100%" aria-hidden="true">
      <path
        fill="#F23E73"
        fillRule="evenodd"
        d="M391.00 121.00L387.00 119.00L382.00 119.00L367.00 122.00L347.00 130.00L334.00 139.00L322.00 154.00L320.00 159.00L318.00 172.00L312.00 190.00L302.00 210.00L289.00 229.00L272.00 247.00L260.00 257.00L245.00 267.00L227.00 276.00L198.00 285.00L186.00 287.00L177.00 287.00L176.00 288.00L156.00 288.00L155.00 287.00L139.00 286.00L122.00 282.00L102.00 274.00L99.00 274.00L94.00 277.00L77.00 283.00L62.00 285.00L59.00 304.00L59.00 326.00L62.00 347.00L69.00 370.00L86.00 405.00L99.00 424.00L113.00 439.00L121.00 450.00L131.00 473.00L134.00 488.00L134.00 502.00L136.00 507.00L141.00 511.00L216.00 511.00L220.00 509.00L223.00 505.00L224.00 485.00L225.00 484.00L253.00 485.00L254.00 486.00L255.00 485.00L274.00 485.00L276.00 484.00L277.00 485.00L278.00 505.00L280.00 508.00L285.00 511.00L359.00 511.00L365.00 507.00L367.00 502.00L367.00 477.00L371.00 463.00L376.00 453.00L381.00 446.00L405.00 423.00L421.00 403.00L437.00 374.00L441.00 361.00L443.00 359.00L461.00 359.00L466.00 357.00L473.00 351.00L477.00 340.00L477.00 287.00L474.00 278.00L471.00 274.00L463.00 269.00L442.00 268.00L440.00 266.00L437.00 256.00L428.00 238.00L416.00 220.00L404.00 206.00L386.00 190.00L384.00 182.00L384.00 163.00L388.00 150.00L396.00 136.00L396.00 127.00ZM369.00 238.00L374.00 238.00L380.00 240.00L387.00 247.00L389.00 253.00L388.00 261.00L385.00 266.00L380.00 270.00L375.00 272.00L365.00 271.00L358.00 265.00L355.00 259.00L356.00 248.00L362.00 241.00ZM258.00 37.00L235.00 19.00L213.00 8.00L197.00 3.00L180.00 0.00L152.00 0.00L127.00 5.00L105.00 14.00L85.00 27.00L66.00 45.00L56.00 58.00L46.00 76.00L39.00 95.00L35.00 115.00L34.00 135.00L35.00 136.00L36.00 154.00L39.00 167.00L50.00 194.00L59.00 208.00L68.00 219.00L65.00 227.00L58.00 237.00L51.00 244.00L39.00 252.00L39.00 256.00L41.00 259.00L61.00 260.00L75.00 257.00L87.00 252.00L99.00 244.00L116.00 253.00L139.00 260.00L152.00 262.00L187.00 261.00L213.00 254.00L230.00 246.00L248.00 234.00L262.00 221.00L278.00 200.00L290.00 175.00L296.00 151.00L297.00 119.00L293.00 97.00L285.00 75.00L274.00 56.00ZM160.00 47.00L172.00 47.00L174.00 48.00L177.00 53.00L177.00 64.00L178.00 65.00L193.00 68.00L201.00 71.00L203.00 73.00L204.00 77.00L200.00 91.00L197.00 95.00L176.00 89.00L164.00 89.00L155.00 94.00L153.00 98.00L154.00 104.00L162.00 111.00L184.00 120.00L194.00 126.00L203.00 135.00L209.00 149.00L209.00 164.00L205.00 174.00L194.00 186.00L185.00 191.00L180.00 192.00L176.00 195.00L176.00 211.00L173.00 214.00L168.00 215.00L157.00 214.00L154.00 211.00L154.00 197.00L152.00 195.00L133.00 191.00L126.00 188.00L122.00 184.00L124.00 174.00L127.00 165.00L129.00 163.00L132.00 163.00L139.00 167.00L149.00 170.00L167.00 171.00L174.00 168.00L179.00 162.00L179.00 155.00L174.00 148.00L165.00 143.00L151.00 138.00L136.00 129.00L127.00 119.00L123.00 107.00L124.00 94.00L127.00 86.00L138.00 74.00L145.00 70.00L154.00 67.00L155.00 65.00L155.00 52.00L156.00 49.00Z"
      />
    </svg>
  );
}

function MindIcon() {
  return (
    <svg viewBox="0 0 512 512" width="100%" height="100%" aria-hidden="true">
      <defs>
        <linearGradient id="al-mind-brain" x1="168" y1="148" x2="348" y2="368" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ff7a8a" />
          <stop offset="0.5" stopColor="#f05570" />
          <stop offset="1" stopColor="#e04562" />
        </linearGradient>
      </defs>
      <g stroke="#3a4250" strokeWidth="15" strokeLinecap="round">
        <line x1="256" y1="172" x2="256" y2="86" />
        <line x1="316" y1="196" x2="368" y2="124" />
        <line x1="340" y1="256" x2="426" y2="256" />
        <line x1="316" y1="316" x2="368" y2="388" />
        <line x1="256" y1="340" x2="256" y2="426" />
        <line x1="196" y1="316" x2="144" y2="388" />
        <line x1="172" y1="256" x2="86" y2="256" />
        <line x1="196" y1="196" x2="144" y2="124" />
      </g>
      <circle cx="256" cy="68" r="36" fill="#149a8c" />
      <circle cx="382" cy="106" r="36" fill="#7a48d4" />
      <circle cx="444" cy="256" r="36" fill="#4eb0ea" />
      <circle cx="382" cy="406" r="36" fill="#1c355f" />
      <circle cx="256" cy="444" r="36" fill="#e6b43f" />
      <circle cx="130" cy="406" r="36" fill="#e87428" />
      <circle cx="68" cy="256" r="36" fill="#34b4e4" />
      <circle cx="130" cy="106" r="36" fill="#74c234" />
      <path
        fill="url(#al-mind-brain)"
        d="M256 152 C236 152 220 158 210 170 C198 164 182 168 174 182 C160 186 150 200 152 218 C140 226 138 244 148 258 C140 272 144 290 158 300 C156 316 168 332 186 338 C192 354 212 366 236 364 C244 372 268 372 276 364 C300 366 320 354 326 338 C344 332 356 316 354 300 C368 290 372 272 364 258 C374 244 372 226 360 218 C362 200 352 186 338 182 C330 168 314 164 302 170 C292 158 276 152 256 152 Z"
      />
      <g fill="none" stroke="#c13f58" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" opacity="0.72">
        <path d="M196 228 C218 214 238 218 250 236 C260 250 274 246 292 230" />
        <path d="M204 268 C224 260 242 268 254 286 C264 300 282 294 304 276" />
        <path d="M218 308 C236 298 250 306 262 322 C272 334 288 328 306 314" />
        <path d="M230 204 C244 192 268 192 282 204" />
      </g>
    </svg>
  );
}

export default AppsLauncher;
