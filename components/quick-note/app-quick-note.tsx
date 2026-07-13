"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Loader2, Trash2, X } from "lucide-react";
import { usePathname } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type MouseEvent,
} from "react";
import { createPortal } from "react-dom";

import {
  APP_QUICK_NOTE_FIXED_CLASS,
  APP_QUICK_NOTE_LAYOUT_ID,
} from "@/components/app-top-chrome-slot";
import { QuickNoteRichEditor } from "@/components/quick-note/quick-note-editor";
import {
  quickNotePreviewBody,
  quickNotePreviewTitle,
  useQuickNote,
} from "@/components/quick-note/use-quick-note";
import { quickNoteHtmlToPlain } from "@/lib/quick-note/sanitize-html";
import { cn } from "@/lib/utils";

const AUTH_PATHS = ["/sign-in", "/sign-up", "/auth", "/unauth1", "/demo", "/sign-out"];

const OPEN_SPRING = {
  type: "spring" as const,
  stiffness: 320,
  damping: 32,
  mass: 0.85,
};

const PEEK_SPRING = {
  type: "spring" as const,
  stiffness: 480,
  damping: 34,
  mass: 0.72,
};

function formatUpdatedAt(iso: string | null): string {
  if (!iso) return "Not saved yet";
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return "Saved";
  }
}

function PaperCornerGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={cn("h-full w-full -scale-x-100", className)}
      aria-hidden
    >
      <defs>
        <linearGradient id="qn-fold" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fff7c2" />
          <stop offset="45%" stopColor="#ffe566" />
          <stop offset="100%" stopColor="#f5c518" />
        </linearGradient>
        <linearGradient id="qn-shadow" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#000" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#000" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d="M0 0 H64 V64 L0 0 Z" fill="url(#qn-fold)" />
      <path d="M0 0 H64 V64 L0 0 Z" fill="url(#qn-shadow)" opacity="0.35" />
      <path
        d="M0 0 L52 0 Q64 0 64 12 L64 64 Z"
        fill="none"
        stroke="#e6b800"
        strokeWidth="0.6"
        opacity="0.45"
      />
      <path
        d="M8 48 L22 34"
        stroke="#c9952f"
        strokeWidth="1.2"
        strokeLinecap="round"
        opacity="0.35"
      />
    </svg>
  );
}

export function AppQuickNote() {
  const pathname = usePathname();
  const reduceMotion = useReducedMotion();
  const { note, ready, syncing, error, updateBody, flushNow, clearNote } =
    useQuickNote();
  const [hovering, setHovering] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const sync = () => setIsDesktop(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const onLanding = pathname === "/";
  const onAuthPage =
    onLanding ||
    pathname.startsWith("/privacy") ||
    pathname.startsWith("/terms") ||
    pathname.startsWith("/contact") ||
    AUTH_PATHS.some((path) => pathname.startsWith(path));

  const plainLen = useMemo(
    () => quickNoteHtmlToPlain(note.body).length,
    [note.body]
  );
  const hasContent = plainLen > 0;
  const previewTitle = useMemo(() => quickNotePreviewTitle(note), [note]);
  const previewBody = useMemo(() => quickNotePreviewBody(note), [note]);

  const closeAndSave = useCallback(() => {
    void flushNow();
    setExpanded(false);
    setHovering(false);
  }, [flushNow]);

  useEffect(() => {
    setExpanded(false);
    setHovering(false);
  }, [pathname]);

  useEffect(() => {
    if (!expanded) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeAndSave();
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey, true);
    };
  }, [expanded, closeAndSave]);

  const onCornerClick = (e: MouseEvent) => {
    e.stopPropagation();
    setExpanded(true);
  };

  if (onAuthPage || !isDesktop) return null;

  const corner = (
    <motion.button
      type="button"
      aria-label={hasContent ? `Open note: ${previewTitle}` : "Open quick note"}
      aria-expanded={expanded}
      layoutId={APP_QUICK_NOTE_LAYOUT_ID}
      onClick={onCornerClick}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      onFocus={() => setHovering(true)}
      onBlur={() => setHovering(false)}
      className={cn(
        APP_QUICK_NOTE_FIXED_CLASS,
        "quick-note-corner group origin-top-right overflow-hidden rounded-bl-xl border border-[#e6b800]/40 shadow-[0_8px_24px_rgba(0,0,0,0.45)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#ffe566]/80",
        hovering && !expanded && "quick-note-corner--peek",
        hasContent && "quick-note-corner--filled"
      )}
      animate={
        reduceMotion
          ? undefined
          : {
              width: hovering && !expanded ? 168 : 36,
              height: hovering && !expanded ? 76 : 36,
              rotate: hovering && !expanded ? 1.5 : 0,
            }
      }
      transition={reduceMotion ? undefined : PEEK_SPRING}
      whileTap={reduceMotion ? undefined : { scale: 0.96 }}
    >
      <span className="quick-note-corner-paper absolute inset-0">
        <PaperCornerGlyph />
      </span>
      <span
        className={cn(
          "quick-note-corner-peek absolute inset-0 flex flex-col justify-end px-2.5 pb-2 pt-1 text-right opacity-0 transition-opacity duration-200",
          hovering && !expanded && "opacity-100"
        )}
      >
        <span className="truncate text-[11px] font-bold leading-tight text-[#3d2e00]">
          {previewTitle}
        </span>
        <span className="mt-0.5 line-clamp-2 text-[10px] leading-snug text-[#5c4a12]/90">
          {hasContent ? previewBody : "Your always-on scratch pad"}
        </span>
      </span>
      {!ready ? (
        <span className="absolute bottom-1 left-1">
          <Loader2 className="h-3 w-3 animate-spin text-[#8a6d1a]/80" />
        </span>
      ) : null}
    </motion.button>
  );

  const expandedPanel = (
    <>
      <motion.div
        key="quick-note-backdrop"
        className="quick-note-backdrop fixed inset-0 z-[210]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: reduceMotion ? 0.12 : 0.28 }}
        onClick={closeAndSave}
        aria-hidden
      />
      <motion.div
        key="quick-note-stage"
        role="dialog"
        aria-modal="true"
        aria-label="Quick note"
        className="quick-note-stage fixed inset-0 z-[211] flex items-center justify-center p-4 sm:p-8"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={closeAndSave}
      >
        <motion.div
          layoutId={APP_QUICK_NOTE_LAYOUT_ID}
          className="quick-note-sheet relative flex h-[70vh] w-[70vw] max-h-[min(70vh,900px)] max-w-[min(70vw,920px)] flex-col overflow-hidden rounded-2xl border border-[#e0c96a]/50 shadow-[0_40px_120px_rgba(0,0,0,0.55),0_0_0_1px_rgba(255,255,255,0.06)_inset]"
          transition={reduceMotion ? { duration: 0.2 } : OPEN_SPRING}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="quick-note-sheet-toolbar flex shrink-0 items-center gap-2 border-b border-[#e8d48a]/60 bg-[#fff6cc]/95 px-3 py-2 backdrop-blur-sm sm:px-4">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#9a7824]">
                Quick Note
              </p>
              <p className="truncate text-[11px] text-[#6b5618]/80">
                {formatUpdatedAt(note.updatedAt)}
                {syncing ? " · Saving…" : " · Auto-saved"}
              </p>
            </div>
            {error ? (
              <span className="hidden text-[10px] text-[#7a6218]/90 sm:inline">
                {error}
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => void clearNote()}
              disabled={!hasContent || syncing}
              className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-[11px] font-medium text-[#6b5618] transition hover:bg-[#f5e6a8]/80 disabled:opacity-35"
              aria-label="Clear note"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Clear</span>
            </button>
            <button
              type="button"
              onClick={closeAndSave}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#6b5618] transition hover:bg-[#f5e6a8]/80"
              aria-label="Close note"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <QuickNoteRichEditor html={note.body} onChange={updateBody} />

          <div className="quick-note-sheet-footer flex shrink-0 items-center justify-between border-t border-[#e8d48a]/50 bg-[#fff6cc]/90 px-4 py-2 text-[10px] text-[#7a6218]/75">
            <span>
              {plainLen.toLocaleString()} chars · formatting saved
            </span>
            <span className="font-medium">
              Click outside to save &amp; close
            </span>
          </div>
        </motion.div>
      </motion.div>
    </>
  );

  const portal =
    typeof document !== "undefined"
      ? createPortal(
          <AnimatePresence>{expanded ? expandedPanel : null}</AnimatePresence>,
          document.body
        )
      : null;

  return (
    <>
      {!expanded ? corner : null}
      {portal}
    </>
  );
}
