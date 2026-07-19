"use client";

import {
  Bold,
  Indent,
  Italic,
  List,
  ListOrdered,
  Outdent,
  Strikethrough,
  Type,
  Underline,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { sanitizeQuickNoteHtml } from "@/lib/quick-note/sanitize-html";
import { cn } from "@/lib/utils";

const COLORS = [
  { id: "ink", label: "Ink", value: "#1a1408" },
  { id: "bronze", label: "Bronze", value: "#9a6f2e" },
  { id: "red", label: "Red", value: "#c0392b" },
  { id: "blue", label: "Blue", value: "#1a5fb4" },
  { id: "green", label: "Green", value: "#1e7a46" },
  { id: "purple", label: "Purple", value: "#6c3483" },
] as const;

const SIZES = [
  { id: "sm", label: "S", px: "13px" },
  { id: "md", label: "M", px: "16px" },
  { id: "lg", label: "L", px: "20px" },
  { id: "xl", label: "XL", px: "26px" },
] as const;

function ToolBtn({
  active,
  label,
  onClick,
  children,
}: {
  active?: boolean;
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      onMouseDown={(e) => {
        e.preventDefault();
        onClick();
      }}
      className={cn(
        "inline-flex h-7 w-7 items-center justify-center rounded-md transition",
        active
          ? "bg-[#e8c84a]/55 text-[#2a1d00] shadow-sm"
          : "text-[#6b5618] hover:bg-[#f5e6a8]/80 hover:text-[#2a1d00]"
      )}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span className="mx-0.5 h-4 w-px bg-[#d4b84a]/55" aria-hidden />;
}

export function QuickNoteRichEditor({
  html,
  onChange,
  className,
}: {
  html: string;
  onChange: (nextHtml: string) => void;
  className?: string;
}) {
  const editorRef = useRef<HTMLDivElement>(null);
  const lastEmitted = useRef(html);
  const [colorOpen, setColorOpen] = useState(false);
  const [sizeOpen, setSizeOpen] = useState(false);

  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    if (document.activeElement === el) return;
    const safe = sanitizeQuickNoteHtml(html || "");
    if (el.innerHTML === safe) return;
    el.innerHTML = safe;
    lastEmitted.current = safe;
  }, [html]);

  const emit = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    const next = sanitizeQuickNoteHtml(el.innerHTML);
    if (next === lastEmitted.current) return;
    lastEmitted.current = next;
    onChange(next);
  }, [onChange]);

  const run = useCallback(
    (command: string, value?: string) => {
      editorRef.current?.focus();
      try {
        document.execCommand("styleWithCSS", false, "true");
      } catch {
        /* older engines */
      }
      document.execCommand(command, false, value);
      emit();
    },
    [emit]
  );

  const applyColor = (value: string) => {
    run("foreColor", value);
    setColorOpen(false);
  };

  const applySize = (px: string) => {
    editorRef.current?.focus();
    try {
      document.execCommand("styleWithCSS", false, "true");
    } catch {
      /* */
    }
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
      document.execCommand("fontSize", false, "4");
      const fonts = editorRef.current?.querySelectorAll("font[size], span[style*='font-size']");
      const last = fonts?.[fonts.length - 1] as HTMLElement | undefined;
      if (last) {
        last.style.fontSize = px;
        if (last.tagName === "FONT") {
          const span = document.createElement("span");
          span.style.fontSize = px;
          span.innerHTML = last.innerHTML;
          last.replaceWith(span);
        }
      }
    } else {
      document.execCommand("fontSize", false, "7");
      const fonts = editorRef.current?.querySelectorAll('font[size="7"]');
      fonts?.forEach((font) => {
        const span = document.createElement("span");
        span.style.fontSize = px;
        span.innerHTML = font.innerHTML;
        font.replaceWith(span);
      });
    }
    emit();
    setSizeOpen(false);
  };

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", className)}>
      <div className="quick-note-format-bar relative z-[2] flex shrink-0 flex-wrap items-center gap-0.5 border-b border-[#e8d48a]/55 bg-[#fff8d6]/95 px-2 py-1.5 sm:px-3">
        <ToolBtn label="Bold" onClick={() => run("bold")}>
          <Bold className="h-3.5 w-3.5" strokeWidth={2.5} />
        </ToolBtn>
        <ToolBtn label="Italic" onClick={() => run("italic")}>
          <Italic className="h-3.5 w-3.5" />
        </ToolBtn>
        <ToolBtn label="Underline" onClick={() => run("underline")}>
          <Underline className="h-3.5 w-3.5" />
        </ToolBtn>
        <ToolBtn label="Strikethrough" onClick={() => run("strikeThrough")}>
          <Strikethrough className="h-3.5 w-3.5" />
        </ToolBtn>
        <Divider />
        <ToolBtn label="Bulleted list" onClick={() => run("insertUnorderedList")}>
          <List className="h-3.5 w-3.5" />
        </ToolBtn>
        <ToolBtn label="Numbered list" onClick={() => run("insertOrderedList")}>
          <ListOrdered className="h-3.5 w-3.5" />
        </ToolBtn>
        <ToolBtn label="Indent" onClick={() => run("indent")}>
          <Indent className="h-3.5 w-3.5" />
        </ToolBtn>
        <ToolBtn label="Outdent" onClick={() => run("outdent")}>
          <Outdent className="h-3.5 w-3.5" />
        </ToolBtn>
        <Divider />
        <div className="relative">
          <ToolBtn label="Text size" onClick={() => { setSizeOpen((v) => !v); setColorOpen(false); }}>
            <Type className="h-3.5 w-3.5" />
          </ToolBtn>
          {sizeOpen ? (
            <div className="absolute left-0 top-[calc(100%+4px)] z-20 flex gap-1 rounded-lg border border-[#e0c96a]/70 bg-[#fffbe8] p-1 shadow-lg">
              {SIZES.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    applySize(s.px);
                  }}
                  className="rounded-md px-2 py-1 text-[11px] font-bold text-[#3d2e00] transition hover:bg-[#f5e6a8]"
                  style={{ fontSize: s.px }}
                >
                  {s.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <div className="relative">
          <ToolBtn label="Text color" onClick={() => { setColorOpen((v) => !v); setSizeOpen(false); }}>
            <span className="flex h-3.5 w-3.5 items-end justify-center">
              <span className="text-[11px] font-bold leading-none">A</span>
              <span className="absolute bottom-1.5 h-0.5 w-3 rounded-full bg-[#c0392b]" />
            </span>
          </ToolBtn>
          {colorOpen ? (
            <div className="absolute left-0 top-[calc(100%+4px)] z-20 flex gap-1 rounded-lg border border-[#e0c96a]/70 bg-[#fffbe8] p-1.5 shadow-lg">
              {COLORS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  title={c.label}
                  aria-label={c.label}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    applyColor(c.value);
                  }}
                  className="h-5 w-5 rounded-full border border-black/10 shadow-sm transition hover:scale-110"
                  style={{ background: c.value }}
                />
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <div className="relative min-h-0 flex-1 overflow-y-auto">
        <div className="quick-note-ruled pointer-events-none absolute inset-0" aria-hidden />
        <div
          ref={editorRef}
          role="textbox"
          aria-multiline
          aria-label="Quick note"
          contentEditable
          suppressContentEditableWarning
          data-placeholder="Start writing…"
          className="quick-note-body quick-note-editor relative min-h-[calc(70vh-10rem)] w-full px-5 py-4 text-[16px] leading-[1.65] text-[#2a2210] outline-none sm:px-8 sm:py-6"
          onInput={emit}
          onBlur={emit}
          onKeyUp={() => {
            setColorOpen(false);
            setSizeOpen(false);
          }}
        />
      </div>
    </div>
  );
}
