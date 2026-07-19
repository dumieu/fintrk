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
    pitch: "See where every dollar goes, and where it takes you.",
    href: "https://fintrk.io",
    accent: "#6aa1ff",
    Icon: FinIcon,
  },
  {
    key: "bull",
    name: "BullTRK",
    pitch: "See the whole market. Move before it does.",
    href: "https://bulltrk.com",
    accent: "#f0a52e",
    Icon: BullIcon,
  },
  {
    key: "piggy",
    name: "PiggyTRK",
    pitch: "A tiny economy that raises money-smart kids.",
    href: "https://piggytrk.com",
    accent: "#ff9a5a",
    Icon: PiggyIcon,
  },
  {
    key: "mind",
    name: "MindTRK",
    pitch: "Capture every thought. Find your focus.",
    href: "https://xtrk.ai",
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
`;

function injectStyles() {
  if (typeof document === "undefined") return;
  if (document.getElementById(STYLE_ID)) return;
  const el = document.createElement("style");
  el.id = STYLE_ID;
  el.textContent = CSS;
  document.head.appendChild(el);
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
              aria-label="My Personal Intelligence Apps"
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
                My Personal Intelligence Apps
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
                  fontSize: 12,
                  fontWeight: 700,
                  color: hoveredApp.accent,
                  marginBottom: 3,
                }}
              >
                {hoveredApp.name}
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
        <linearGradient id="al-bio-strand" x1="256" y1="88" x2="256" y2="424" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#4be3ba" />
          <stop offset="1" stopColor="#4a8af0" />
        </linearGradient>
        <linearGradient id="al-bio-rung" x1="180" y1="0" x2="332" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#2bd4a4" />
          <stop offset="1" stopColor="#6aa1ff" />
        </linearGradient>
      </defs>
      <g fill="none" strokeLinecap="round">
        <g stroke="url(#al-bio-rung)" strokeWidth="26" opacity="0.9">
          <line x1="316" y1="150" x2="196" y2="150" />
          <line x1="196" y1="362" x2="316" y2="362" />
          <line x1="300" y1="204" x2="212" y2="204" />
          <line x1="212" y1="308" x2="300" y2="308" />
        </g>
        <g stroke="url(#al-bio-strand)" strokeWidth="34">
          <path d="M256 96 C 322 116 332 138 332 168 C 332 208 292 232 256 256 C 220 280 180 304 180 344 C 180 374 190 396 256 416" />
          <path d="M256 96 C 190 116 180 138 180 168 C 180 208 220 232 256 256 C 292 280 332 304 332 344 C 332 374 322 396 256 416" />
        </g>
      </g>
    </svg>
  );
}

function FinIcon() {
  return (
    <svg viewBox="0 0 512 512" width="100%" height="100%" aria-hidden="true">
      <defs>
        <linearGradient id="al-fin-line" x1="96" y1="360" x2="416" y2="140" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#4a8af0" />
          <stop offset="1" stopColor="#2bd4a4" />
        </linearGradient>
        <linearGradient id="al-fin-fill" x1="256" y1="150" x2="256" y2="392" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#6aa1ff" stopOpacity="0.35" />
          <stop offset="1" stopColor="#6aa1ff" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="al-fin-node" cx="0.4" cy="0.35" r="0.75">
          <stop offset="0" stopColor="#7bf0cf" />
          <stop offset="1" stopColor="#2bd4a4" />
        </radialGradient>
      </defs>
      <path d="M96 356 C 168 344 196 300 256 268 C 312 238 344 196 416 148 L 416 392 L 96 392 Z" fill="url(#al-fin-fill)" />
      <path d="M96 356 C 168 344 196 300 256 268 C 312 238 344 196 416 148" fill="none" stroke="url(#al-fin-line)" strokeWidth="32" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="416" cy="148" r="30" fill="url(#al-fin-node)" />
      <circle cx="416" cy="148" r="11" fill="#ffffff" />
    </svg>
  );
}

function BullIcon() {
  return (
    <svg viewBox="0 0 512 512" width="100%" height="100%" aria-hidden="true">
      <defs>
        <linearGradient id="al-bull-horn" x1="128" y1="150" x2="384" y2="320" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ffce6a" />
          <stop offset="1" stopColor="#f0952e" />
        </linearGradient>
        <linearGradient id="al-bull-up" x1="256" y1="336" x2="256" y2="188" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#1a9f63" />
          <stop offset="1" stopColor="#3ecf8e" />
        </linearGradient>
      </defs>
      <g fill="none" stroke="url(#al-bull-horn)" strokeWidth="42" strokeLinecap="round">
        <path d="M244 316 C 190 302 152 258 146 168" />
        <path d="M268 316 C 322 302 360 258 366 168" />
      </g>
      <g fill="none" stroke="url(#al-bull-up)" strokeWidth="40" strokeLinecap="round" strokeLinejoin="round">
        <line x1="256" y1="342" x2="256" y2="214" />
        <path d="M206 256 L 256 204 L 306 256" />
      </g>
    </svg>
  );
}

function PiggyIcon() {
  return (
    <svg viewBox="0 0 512 512" width="100%" height="100%" aria-hidden="true">
      <defs>
        <linearGradient id="al-piggy-p" x1="170" y1="110" x2="360" y2="410" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ffc24a" />
          <stop offset="0.65" stopColor="#f79438" />
          <stop offset="1" stopColor="#f0662e" />
        </linearGradient>
      </defs>
      <g fill="none" stroke="url(#al-piggy-p)" strokeLinecap="round" strokeLinejoin="round">
        <path d="M196 402 L 196 118 L 300 118 C 366 118 366 244 300 244 L 196 244" strokeWidth="52" />
        <line x1="150" y1="158" x2="238" y2="158" strokeWidth="22" />
        <line x1="150" y1="200" x2="238" y2="200" strokeWidth="22" />
      </g>
    </svg>
  );
}

function MindIcon() {
  return (
    <svg viewBox="0 0 512 512" width="100%" height="100%" aria-hidden="true">
      <defs>
        <linearGradient id="al-mind-wave" x1="80" y1="256" x2="432" y2="256" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#6aa1ff" />
          <stop offset="0.5" stopColor="#8f6eef" />
          <stop offset="1" stopColor="#c7a9ff" />
        </linearGradient>
        <radialGradient id="al-mind-node" cx="0.4" cy="0.35" r="0.75">
          <stop offset="0" stopColor="#d9c4ff" />
          <stop offset="1" stopColor="#8f6eef" />
        </radialGradient>
      </defs>
      <circle cx="256" cy="150" r="70" fill="#b08bff" opacity="0.16" />
      <path d="M84 300 C 132 300 150 292 182 292 C 212 292 220 306 240 236 L 256 150 L 272 236 C 292 306 300 292 330 292 C 362 292 380 300 428 300" fill="none" stroke="url(#al-mind-wave)" strokeWidth="32" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="256" cy="150" r="30" fill="url(#al-mind-node)" />
      <circle cx="256" cy="150" r="11" fill="#ffffff" />
    </svg>
  );
}

export default AppsLauncher;
