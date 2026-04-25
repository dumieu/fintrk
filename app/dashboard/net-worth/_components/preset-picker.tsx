"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Search, X, Plus, ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
import {
  ASSET_PRESETS,
  LIABILITY_PRESETS,
  scorePreset,
  type PresetItem,
} from "@/lib/net-worth-presets";
import {
  ASSET_CATEGORIES,
  LIABILITY_CATEGORIES,
  findAssetCategory,
  findLiabilityCategory,
} from "@/lib/net-worth";

type Kind = "asset" | "liability";

/**
 * Beautiful searchable picker for adding an asset or liability. The user
 * never selects an icon — every preset already carries a Lucide icon. The
 * "Custom" row at the bottom lets people type their own label and falls
 * back to the category icon.
 */
export function PresetPicker({
  open,
  kind,
  onClose,
  onPick,
}: {
  open: boolean;
  kind: Kind;
  onClose: () => void;
  /** Called with a preset OR a custom item description. */
  onPick: (
    pick:
      | { kind: "preset"; preset: PresetItem }
      | { kind: "custom"; categoryId: string; label: string },
  ) => void;
}) {
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const allPresets = kind === "asset" ? ASSET_PRESETS : LIABILITY_PRESETS;
  const categories = kind === "asset" ? ASSET_CATEGORIES : LIABILITY_CATEGORIES;
  const accent = kind === "asset" ? "#0BC18D" : "#FF6F69";

  // Re-focus / reset whenever the picker opens.
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActiveIdx(0);
    const t = setTimeout(() => inputRef.current?.focus(), 30);
    return () => clearTimeout(t);
  }, [open]);

  // Filter + group by category preserving catalog order.
  const { flat, grouped } = useMemo(() => {
    const scored = allPresets
      .map((p) => ({ p, s: scorePreset(p, query) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s);
    const flat = scored.map((x) => x.p);
    const seen = new Set(flat.map((p) => p.id));
    const grouped = categories.map((cat) => ({
      cat,
      presets: allPresets.filter((p) => p.categoryId === cat.id && seen.has(p.id)),
    }));
    return { flat, grouped };
  }, [allPresets, categories, query]);

  // Clamp keyboard cursor when results change.
  useEffect(() => {
    setActiveIdx((i) => Math.max(0, Math.min(i, Math.max(0, flat.length - 1))));
  }, [flat.length]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(flat.length - 1, i + 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(0, i - 1));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (flat[activeIdx]) {
        onPick({ kind: "preset", preset: flat[activeIdx] });
        onClose();
      } else if (query.trim()) {
        // No preset matched → add as custom item under "other".
        onPick({ kind: "custom", categoryId: "other", label: query.trim() });
        onClose();
      }
    }
  };

  // Auto-scroll active row into view.
  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector<HTMLButtonElement>(`[data-active="true"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIdx]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-[80] flex items-start justify-center bg-black/60 px-3 pt-[8vh] backdrop-blur-md sm:pt-[12vh]"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="relative flex w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0e0822]/95 shadow-2xl"
            style={{ boxShadow: `0 20px 60px -15px ${accent}40, 0 0 0 1px ${accent}20 inset` }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header / search */}
            <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-3">
              <span
                className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-wider"
                style={{ background: `${accent}22`, color: accent }}
              >
                {kind === "asset" ? (
                  <ArrowUpFromLine className="h-3 w-3" />
                ) : (
                  <ArrowDownToLine className="h-3 w-3" />
                )}
                {kind === "asset" ? "Add asset" : "Add liability"}
              </span>
              <div className="flex flex-1 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-2.5">
                <Search className="h-3.5 w-3.5 shrink-0 text-white/45" />
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={onKeyDown}
                  placeholder={
                    kind === "asset"
                      ? "Search: 401k, vanguard, btc, home, tesla…"
                      : "Search: mortgage, amex, sallie mae, car loan…"
                  }
                  className="h-8 w-full bg-transparent text-sm text-white placeholder:text-white/35 outline-none"
                  autoFocus
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    className="text-white/40 hover:text-white"
                    aria-label="Clear search"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="rounded-md p-1 text-white/40 transition hover:bg-white/[0.08] hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Results list */}
            <div ref={listRef} className="max-h-[60vh] overflow-y-auto px-1 py-1">
              {flat.length === 0 && (
                <div className="px-4 py-8 text-center">
                  <p className="text-sm text-white/60">No matches for &ldquo;{query}&rdquo;</p>
                  <button
                    type="button"
                    onClick={() => {
                      onPick({ kind: "custom", categoryId: "other", label: query.trim() || "Custom" });
                      onClose();
                    }}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[11px] font-semibold transition hover:bg-white/[0.04]"
                    style={{ borderColor: `${accent}55`, color: accent }}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add &ldquo;{query.trim() || "Custom"}&rdquo; as custom
                  </button>
                </div>
              )}

              {grouped.map(({ cat, presets }) => {
                if (presets.length === 0) return null;
                return (
                  <div key={cat.id} className="px-2 py-1.5">
                    <p className="px-2 pb-1 text-[9px] font-bold uppercase tracking-wider text-white/40">
                      {cat.label}
                    </p>
                    <div className="flex flex-col gap-0.5">
                      {presets.map((p) => {
                        const idxInFlat = flat.indexOf(p);
                        const isActive = idxInFlat === activeIdx;
                        const Icon = p.icon;
                        const catColor =
                          kind === "asset"
                            ? findAssetCategory(p.categoryId).color
                            : findLiabilityCategory(p.categoryId).color;
                        return (
                          <button
                            key={p.id}
                            type="button"
                            data-active={isActive}
                            onMouseEnter={() => setActiveIdx(idxInFlat)}
                            onClick={() => {
                              onPick({ kind: "preset", preset: p });
                              onClose();
                            }}
                            className="group flex items-center gap-3 rounded-lg px-2.5 py-1.5 text-left transition"
                            style={isActive ? { background: `${accent}18` } : undefined}
                          >
                            <span
                              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md"
                              style={{ background: `${catColor}22`, color: catColor }}
                            >
                              <Icon className="h-3.5 w-3.5" />
                            </span>
                            <span className="flex-1 text-sm font-medium text-white">
                              {p.label}
                            </span>
                            <span className="hidden text-[10px] text-white/35 sm:inline">
                              {cat.label}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              {/* Always-available custom entry option */}
              {flat.length > 0 && query.trim() && (
                <div className="border-t border-white/[0.06] px-2 py-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      onPick({ kind: "custom", categoryId: "other", label: query.trim() });
                      onClose();
                    }}
                    className="flex w-full items-center gap-3 rounded-lg px-2.5 py-1.5 text-left text-white/70 transition hover:bg-white/[0.04]"
                  >
                    <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-white/[0.06] text-white/60">
                      <Plus className="h-3.5 w-3.5" />
                    </span>
                    <span className="flex-1 text-sm">
                      Add &ldquo;<span className="font-semibold text-white">{query.trim()}</span>&rdquo; as custom
                    </span>
                    <span className="hidden text-[10px] text-white/35 sm:inline">⏎</span>
                  </button>
                </div>
              )}
            </div>

            {/* Footer hint */}
            <div className="flex items-center justify-between border-t border-white/[0.06] px-4 py-2 text-[10px] text-white/40">
              <span>
                <kbd className="rounded border border-white/10 bg-white/[0.04] px-1">↑</kbd>{" "}
                <kbd className="rounded border border-white/10 bg-white/[0.04] px-1">↓</kbd>{" "}
                navigate ·{" "}
                <kbd className="rounded border border-white/10 bg-white/[0.04] px-1">↵</kbd>{" "}
                add ·{" "}
                <kbd className="rounded border border-white/10 bg-white/[0.04] px-1">esc</kbd>{" "}
                close
              </span>
              <span>{flat.length} option{flat.length === 1 ? "" : "s"}</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
