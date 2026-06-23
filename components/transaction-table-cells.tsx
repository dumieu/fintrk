"use client";

import type { ReactNode } from "react";
import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, ChevronDown, Copy, Globe, Repeat, Search } from "lucide-react";
import { CardNetworkLogo } from "@/components/card-network-logo";
import { TransactionCategoryIcon } from "@/components/transaction-category-icon";
import {
  accountKindSubtitleLabel,
  cardNetworkLabel,
  formatMaskedNumber,
  TRANSACTION_SUBTITLE_SEPARATOR,
} from "@/lib/format";
import { countryDisplayName, flagEmoji, transactionTypeLabel } from "@/lib/transaction-flags";
import { dispatchTransactionsChanged } from "@/lib/notify-transactions-changed";
import { cn } from "@/lib/utils";

export interface TransactionRowDoubleChargeSuspect {
  verdict: "strong" | "likely_benign";
  reason: string;
  relatedIds: string[];
  merchantKey?: string;
  displayName?: string;
}

export interface TransactionRowData {
  id: string;
  postedDate: string;
  rawDescription: string;
  referenceId: string | null;
  merchantName: string | null;
  baseAmount: string;
  baseCurrency: string;
  foreignAmount: string | null;
  foreignCurrency: string | null;
  implicitFxRate: string | null;
  implicitFxSpreadBps: string | null;
  categoryId: number | null;
  categoryConfidence: string | null;
  categoryName: string | null;
  subcategoryName: string | null;
  countryIso: string | null;
  isRecurring: boolean;
  warningFlag: boolean;
  aiConfidence: string | null;
  balanceAfter: string | null;
  accountId: string;
  statementId: number | null;
  accountType: string | null;
  accountCardNetwork: string | null;
  accountMaskedNumber: string | null;
  accountInstitutionName: string | null;
  accountName: string | null;
  statementFileName: string | null;
  statementPeriodStart: string | null;
  statementPeriodEnd: string | null;
  note: string | null;
  label: string | null;
  doubleChargeSuspect?: TransactionRowDoubleChargeSuspect;
}

export interface TransactionTableUserSubcategory {
  id: number;
  name: string;
}

export interface TransactionTableUserCategory {
  id: number;
  name: string;
  color: string | null;
  subcategories: TransactionTableUserSubcategory[];
}

export const TRANSACTION_TABLE_ROW_GRID =
  "sm:grid-cols-[auto_minmax(0,1.65fr)_minmax(4.5rem,6.5rem)_minmax(0,12rem)_minmax(7.5rem,10rem)_80px_minmax(7rem,1.25fr)_64px]";

export const FLOATING_EDITOR_Z = 2147483646;

function transactionReferenceDisplay(txn: TransactionRowData): string | null {
  const ref = txn.referenceId?.trim();
  if (ref) return ref.replace(/\s+/g, " ");
  return null;
}

function transactionReferenceTitle(txn: TransactionRowData): string | undefined {
  const ref = txn.referenceId?.trim();
  return ref || undefined;
}

/** Plain-text subtitle for tooltips / accessibility (includes network name when a logo is shown). */
function transactionSourceSubtitleTitle(txn: TransactionRowData): string {
  const kind = accountKindSubtitleLabel(txn.accountType, txn.accountCardNetwork);
  const masked = formatMaskedNumber(txn.accountMaskedNumber);
  const net = cardNetworkLabel(txn.accountCardNetwork);
  const bank =
    (txn.accountInstitutionName?.trim() || txn.accountName?.trim() || "") || null;

  const mid =
    masked && net ? `${net} ${masked}` : masked || null;
  const parts = [kind, mid, bank].filter(Boolean) as string[];
  return parts.join(TRANSACTION_SUBTITLE_SEPARATOR);
}

function TransactionSourceSubtitle({ txn }: { txn: TransactionRowData }) {
  const kind = accountKindSubtitleLabel(txn.accountType, txn.accountCardNetwork);
  const masked = formatMaskedNumber(txn.accountMaskedNumber);
  const bank =
    (txn.accountInstitutionName?.trim() || txn.accountName?.trim() || "") || null;
  const network = txn.accountCardNetwork;
  const showLogo =
    Boolean(masked) && Boolean(network) && network !== "unknown";

  const sep = (
    <span className="inline-block shrink-0" aria-hidden>
      {TRANSACTION_SUBTITLE_SEPARATOR}
    </span>
  );

  const segments: ReactNode[] = [];
  if (kind) segments.push(<span>{kind}</span>);
  if (showLogo || masked) {
    segments.push(
      <span className="inline-flex items-center gap-1 align-middle">
        {showLogo ? <CardNetworkLogo network={network} className="relative top-px" /> : null}
        {masked ? (
          <span className="font-mono tabular-nums tracking-tight text-muted-foreground">{masked}</span>
        ) : null}
      </span>,
    );
  }
  if (bank) segments.push(<span>{bank}</span>);

  if (segments.length === 0) return null;

  const title = transactionSourceSubtitleTitle(txn);

  return (
    <p className="mt-0.5 min-w-0 max-w-full text-[9px] leading-snug" title={title}>
      <span className="block min-w-0 truncate text-muted-foreground">
        {segments.map((node, i) => (
          <Fragment key={i}>
            {i > 0 ? sep : null}
            {node}
          </Fragment>
        ))}
      </span>
    </p>
  );
}

export function DoubleChargeSuspectBadge({
  suspect,
  onReviewStrong,
}: {
  suspect: TransactionRowDoubleChargeSuspect;
  onReviewStrong?: (merchantKey: string, displayName: string) => void;
}) {
  const isStrong = suspect.verdict === "strong";
  const label = isStrong ? "Likely double charge" : "Possible duplicate (often benign)";
  const tooltip = `${label}: ${suspect.reason}${
    suspect.relatedIds.length > 0 ? ` · ${suspect.relatedIds.length} related charge(s)` : ""
  }`;
  const className = cn(
    "inline-flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-0.5 text-[9px] font-medium leading-none transition-colors",
    isStrong
      ? "border-[#FF6F69]/55 bg-[#FF6F69]/12 text-[#FF6F69] hover:border-[#FF6F69]/75 hover:bg-[#FF6F69]/18"
      : "border-[#AD74FF]/45 bg-[#AD74FF]/10 text-[#AD74FF]",
  );

  const content = (
    <>
      <Copy className="h-2.5 w-2.5" aria-hidden />
      {isStrong ? "Double?" : "Benign dup?"}
    </>
  );

  if (isStrong && onReviewStrong && suspect.merchantKey) {
    return (
      <button
        type="button"
        className={className}
        title={`${tooltip} · Click to review watchlist`}
        aria-label={`${tooltip}. Review watchlist.`}
        onClick={() =>
          onReviewStrong(suspect.merchantKey!, suspect.displayName ?? suspect.merchantKey!)
        }
      >
        {content}
      </button>
    );
  }

  return (
    <span className={className} title={tooltip} aria-label={tooltip}>
      {content}
    </span>
  );
}

export function FlagsCell({
  countryIso,
  isRecurring,
  hasFx,
}: {
  countryIso: string | null;
  isRecurring: boolean;
  hasFx: boolean;
}) {
  const name = countryDisplayName(countryIso);
  const flag = flagEmoji(countryIso);
  const typeLine = transactionTypeLabel(isRecurring, hasFx);
  const countryLine = name
    ? `${name}${countryIso ? ` (${countryIso.toUpperCase()})` : ""}`
    : null;
  const tooltip = [countryLine, `Transaction: ${typeLine}`].filter(Boolean).join(" · ");

  return (
    <div className="hidden h-full w-full sm:flex items-center justify-center">
      <div
        className="group relative flex cursor-default items-center justify-center gap-1.5 px-1 py-0.5"
        aria-label={tooltip}
      >
        {flag ? (
          <span className="text-[1.05rem] leading-none select-none" aria-hidden>
            {flag}
          </span>
        ) : (
          <span className="flex h-5 w-5 items-center justify-center rounded bg-chart-muted text-[9px] text-muted-foreground/80">
            —
          </span>
        )}
        {isRecurring && <Repeat className="h-3 w-3 shrink-0 text-[#AD74FF]" aria-hidden />}
        {hasFx && <Globe className="h-3 w-3 shrink-0 text-[#AD74FF]/70" aria-hidden />}

        <div className="pointer-events-none absolute bottom-[calc(100%+8px)] left-1/2 z-50 w-max max-w-[min(240px,calc(100vw-2rem))] -translate-x-1/2 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
          <div className="rounded-lg border border-chart-border bg-popover px-2.5 py-2 text-left text-[10px] leading-snug text-foreground shadow-xl backdrop-blur-md">
            {countryLine && <p className="font-medium text-white">{countryLine}</p>}
            <p className={cn("text-foreground", countryLine && "mt-1")}>
              <span className="text-muted-foreground">Type: </span>
              {typeLine}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

const LABEL_MAX_LEN = 20;
const LABEL_SUGGEST_MAX = 100;

export function TransactionLabelCell({
  transactionId,
  merchantName,
  value,
  onSaved,
  allLabels,
}: {
  transactionId: string;
  merchantName: string | null;
  value: string | null;
  onSaved: (id: string, label: string | null, scope: "this" | "merchant", merchantName: string | null) => void;
  allLabels: string[];
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const hasMerchantName = Boolean(merchantName?.trim());
  const defaultScope = hasMerchantName ? "merchant" : "this";
  const [scope, setScope] = useState<"this" | "merchant">(defaultScope);
  const effectiveScope = scope === "merchant" && !hasMerchantName ? "this" : scope;
  const inputRef = useRef<HTMLInputElement>(null);
  /** Stays in the table cell; used to position the portaled editor above all columns. */
  const anchorRef = useRef<HTMLDivElement>(null);
  const skipBlurPersistRef = useRef(false);
  const [panelRect, setPanelRect] = useState<{
    top: number;
    left: number;
    width: number;
    maxHeight: number;
  } | null>(null);

  const LABEL_EDITOR_Z = FLOATING_EDITOR_Z;

  useEffect(() => {
    if (!editing) {
      setDraft(value ?? "");
      setScope(defaultScope);
      setPanelRect(null);
    }
  }, [value, editing, defaultScope]);

  const filteredSuggestions = useMemo(() => {
    const selfNorm = (value ?? "").trim().toLowerCase();
    const q = draft.trim().toLowerCase();
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of allLabels) {
      const l = raw.trim();
      if (!l) continue;
      if (l.toLowerCase() === selfNorm) continue;
      if (q && !l.toLowerCase().includes(q)) continue;
      const key = l.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(l);
    }
    out.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
    return out.slice(0, LABEL_SUGGEST_MAX);
  }, [allLabels, value, draft]);

  const updatePanelPosition = useCallback(() => {
    const el = anchorRef.current;
    if (!el || !editing) {
      setPanelRect(null);
      return;
    }
    const rect = el.getBoundingClientRect();
    const MARGIN = 8;
    const width = Math.max(240, Math.min(Math.max(rect.width, 240), window.innerWidth - 2 * MARGIN));
    const left = Math.max(MARGIN, Math.min(rect.left, window.innerWidth - width - MARGIN));
    const top = Math.max(MARGIN, rect.top);
    const maxHeight = Math.min(420, Math.max(140, window.innerHeight - top - MARGIN));
    const next = { top, left, width, maxHeight };
    setPanelRect((prev) => {
      if (
        prev &&
        prev.top === next.top &&
        prev.left === next.left &&
        prev.width === next.width &&
        prev.maxHeight === next.maxHeight
      ) {
        return prev;
      }
      return next;
    });
  }, [editing]);

  useLayoutEffect(() => {
    updatePanelPosition();
  }, [updatePanelPosition, draft, filteredSuggestions.length, scope]);

  useEffect(() => {
    if (!editing) return;
    const onWin = () => updatePanelPosition();
    window.addEventListener("resize", onWin);
    window.addEventListener("scroll", onWin, true);
    return () => {
      window.removeEventListener("resize", onWin);
      window.removeEventListener("scroll", onWin, true);
    };
  }, [editing, updatePanelPosition]);

  const persistWith = async (labelRaw: string, closeEditor = true) => {
    const trimmed = labelRaw.trim().slice(0, LABEL_MAX_LEN);
    const next = trimmed === "" ? null : trimmed;
    const prev = (value ?? "").trim().slice(0, LABEL_MAX_LEN) || null;
    if (next === prev) {
      if (closeEditor) setEditing(false);
      return;
    }
    try {
      const res = await fetch("/api/transactions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transactionId,
          label: trimmed,
          labelApplyScope: effectiveScope,
          labelMerchantName: effectiveScope === "merchant" ? merchantName : undefined,
        }),
      });
      if (res.ok) {
        const json = (await res.json()) as { label?: string | null };
        onSaved(transactionId, json.label ?? next, effectiveScope, merchantName);
        dispatchTransactionsChanged();
      }
    } finally {
      if (closeEditor) setEditing(false);
    }
  };

  const persistDraft = () => void persistWith(draft, true);

  const editorPortal =
    editing && panelRect && typeof document !== "undefined"
      ? createPortal(
          <div
            data-label-editor-floating
            className="flex flex-col gap-1.5 overflow-y-auto rounded-lg border border-chart-border bg-popover p-2 shadow-2xl shadow-black/70 ring-1 ring-black/50"
            style={{
              position: "fixed",
              top: panelRect.top,
              left: panelRect.left,
              width: panelRect.width,
              maxHeight: panelRect.maxHeight,
              zIndex: LABEL_EDITOR_Z,
              backgroundColor: "#161616",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <input
              ref={inputRef}
              type="text"
              autoFocus
              maxLength={LABEL_MAX_LEN}
              value={draft}
              onChange={(e) => setDraft(e.target.value.slice(0, LABEL_MAX_LEN))}
              onBlur={(e) => {
                if (skipBlurPersistRef.current) return;
                if (e.relatedTarget?.closest("[data-label-editor-floating]")) return;
                persistDraft();
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setDraft(value ?? "");
                  setEditing(false);
                }
              }}
              className="w-full min-w-0 rounded-md border border-chart-border bg-chart-muted px-1.5 py-1 font-mono text-[11px] tabular-nums text-foreground outline-none focus:border-[#0BC18D]/60 focus:ring-1 focus:ring-[#0BC18D]/30"
              placeholder="Label…"
              aria-label="Transaction label"
              aria-expanded={filteredSuggestions.length > 0}
            />
            <div
              className="flex flex-nowrap items-center gap-1.5 whitespace-nowrap"
              data-label-toggle
            >
              <span className="shrink-0 text-[9px] text-muted-foreground/80">Update for:</span>
              <div className="inline-flex h-[20px] shrink-0 rounded-full border border-chart-border bg-chart-muted p-px text-[9px] font-medium">
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setScope("this")}
                  className={cn(
                    "rounded-full px-2 transition-colors whitespace-nowrap cursor-pointer",
                    effectiveScope === "this"
                      ? "bg-[#0BC18D]/20 text-[#0BC18D]"
                      : "text-muted-foreground hover:text-muted-foreground",
                  )}
                >
                  This item
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
              onClick={() => { if (hasMerchantName) setScope("merchant"); }}
                  className={cn(
                    "rounded-full px-2 transition-colors whitespace-nowrap",
                    !hasMerchantName
                      ? "text-muted-foreground/40 cursor-not-allowed"
                      : effectiveScope === "merchant"
                        ? "bg-[#0BC18D]/20 text-[#0BC18D] cursor-pointer"
                        : "text-muted-foreground hover:text-muted-foreground cursor-pointer",
                  )}
                  title={hasMerchantName ? "Apply to matching merchant names" : "This transaction has no saved merchant name"}
                >
                  All with this name
                </button>
              </div>
            </div>
            {filteredSuggestions.length > 0 ? (
              <div
                data-label-suggest
                role="listbox"
                aria-label="Existing labels"
                className="min-h-0 border-t border-chart-border pt-1.5"
              >
                <ul className="max-h-[min(200px,35vh)] overflow-y-auto overscroll-contain px-0.5">
                  {filteredSuggestions.map((lbl) => (
                    <li key={lbl}>
                      <button
                        type="button"
                        role="option"
                        className="w-full cursor-pointer rounded-md px-2 py-1.5 text-left font-mono text-[11px] text-foreground outline-none hover:bg-chart-hover focus-visible:bg-white/[0.1] focus-visible:ring-1 focus-visible:ring-[#0BC18D]/40"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          skipBlurPersistRef.current = true;
                          setDraft(lbl);
                          void persistWith(lbl, true).finally(() => {
                            skipBlurPersistRef.current = false;
                          });
                        }}
                      >
                        {lbl}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>,
          document.body,
        )
      : null;

  return (
    <div
      ref={anchorRef}
      className="min-w-0 w-full max-w-full"
      onClick={(e) => e.stopPropagation()}
    >
      {editorPortal}
      {editing ? (
        <div
          className="min-h-[4.5rem] w-full rounded-md border border-dashed border-chart-border bg-white/[0.02]"
          aria-hidden
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          aria-label="Add or edit label"
          className={cn(
            "w-full max-w-full truncate text-left font-mono text-[11px] tabular-nums transition-[background-color,border-color,box-shadow]",
            value?.trim()
              ? "rounded-md px-1.5 py-1 text-foreground hover:bg-chart-muted"
              : "min-h-[1.75rem] rounded-full bg-white/[0.015] px-3 py-1.5 hover:bg-chart-muted",
          )}
        >
          {value?.trim() ? value : null}
        </button>
      )}
    </div>
  );
}

export function TransactionNoteCell({
  transactionId,
  merchantName,
  value,
  onSaved,
}: {
  transactionId: string;
  merchantName: string | null;
  value: string | null;
  onSaved: (id: string, note: string | null, scope: "this" | "merchant", merchantName: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [scope, setScope] = useState<"this" | "merchant">("this");
  const hasMerchantName = Boolean(merchantName?.trim());
  const effectiveScope = scope === "merchant" && !hasMerchantName ? "this" : scope;

  useEffect(() => {
    if (!editing) { setDraft(value ?? ""); setScope("this"); }
  }, [value, editing]);

  const persist = async () => {
    const trimmed = draft.trim();
    const next = trimmed === "" ? null : trimmed;
    const prev = (value ?? "").trim() || null;
    if (next === prev) {
      setEditing(false);
      return;
    }
    try {
      const res = await fetch("/api/transactions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transactionId,
          note: trimmed,
          noteApplyScope: effectiveScope,
          noteMerchantName: effectiveScope === "merchant" && merchantName ? merchantName : undefined,
        }),
      });
      if (res.ok) {
        const json = (await res.json()) as { note?: string | null };
        onSaved(transactionId, json.note ?? next, effectiveScope, merchantName);
        dispatchTransactionsChanged();
      }
    } finally {
      setEditing(false);
    }
  };

  return (
    <div
      className="min-w-0 w-full"
      onClick={(e) => e.stopPropagation()}
    >
      {editing ? (
        <div className="flex flex-col gap-1.5">
          <textarea
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={(e) => {
              if (e.relatedTarget?.closest("[data-note-toggle]")) return;
              void persist();
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setDraft(value ?? "");
                setEditing(false);
              }
            }}
            rows={2}
            className="w-full min-h-[2.25rem] resize-y rounded-md border border-chart-border bg-chart-muted px-1.5 py-1 text-[11px] leading-snug text-foreground placeholder:text-muted-foreground/80 outline-none focus:border-[#0BC18D]/60 focus:ring-1 focus:ring-[#0BC18D]/30"
            placeholder="Note…"
            aria-label="Transaction note"
          />
          <div className="flex items-center gap-1.5" data-note-toggle>
            <span className="shrink-0 text-[9px] text-muted-foreground/80">Update for:</span>
            <div className="inline-flex h-[20px] rounded-full border border-chart-border bg-chart-muted p-px text-[9px] font-medium">
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setScope("this")}
                className={cn(
                  "rounded-full px-2 transition-colors whitespace-nowrap cursor-pointer",
                  scope === "this"
                    ? "bg-[#0BC18D]/20 text-[#0BC18D]"
                    : "text-muted-foreground hover:text-muted-foreground",
                )}
              >
                This item
              </button>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => { if (hasMerchantName) setScope("merchant"); }}
                className={cn(
                  "rounded-full px-2 transition-colors whitespace-nowrap",
                  !hasMerchantName
                    ? "text-muted-foreground/40 cursor-not-allowed"
                    : effectiveScope === "merchant"
                      ? "bg-[#0BC18D]/20 text-[#0BC18D] cursor-pointer"
                      : "text-muted-foreground hover:text-muted-foreground cursor-pointer",
                )}
                title={hasMerchantName ? "Apply to matching merchant names" : "This transaction has no saved merchant name"}
              >
                All with this name
              </button>
            </div>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          aria-label="Add or edit note"
          className={cn(
            "w-full max-w-full text-left text-[11px] leading-snug transition-[background-color,border-color,box-shadow]",
            value?.trim()
              ? "rounded-md px-1.5 py-1 text-foreground hover:bg-chart-muted"
              : "min-h-[1.75rem] rounded-full bg-white/[0.015] px-3 py-1.5 hover:bg-chart-muted",
          )}
        >
          {value?.trim() ? <span className="line-clamp-3 break-words">{value}</span> : null}
        </button>
      )}
    </div>
  );
}

export function MerchantNameEditor({
  txn,
  onSaved,
}: {
  txn: TransactionRowData;
  onSaved: (id: string, newName: string | null, applyAll: boolean, oldName: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(txn.merchantName ?? "");
  const [applyAll, setApplyAll] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const savingRef = useRef(false);

  useEffect(() => {
    if (!editing) setDraft(txn.merchantName ?? "");
  }, [txn.merchantName, editing]);

  useEffect(() => {
    if (editing) {
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
  }, [editing]);

  const save = useCallback(() => {
    if (savingRef.current) return;
    const trimmed = draft.trim().toLowerCase();
    const oldTrimmed = (txn.merchantName ?? "").trim().toLowerCase();
    if (!trimmed || trimmed === oldTrimmed) {
      setEditing(false);
      return;
    }
    savingRef.current = true;
    onSaved(txn.id, trimmed, applyAll, txn.merchantName);
    setEditing(false);
    savingRef.current = false;
  }, [draft, txn.merchantName, txn.id, applyAll, onSaved]);

  if (!editing) {
    return (
      <div className="min-w-0">
        <div
          className="min-w-0 cursor-pointer rounded-md py-0.5 -my-0.5 pr-1 ring-0 hover:ring-1 hover:ring-chart-border hover:bg-chart-muted transition-[box-shadow,background]"
          onClick={(e) => {
            e.stopPropagation();
            setEditing(true);
            setApplyAll(true);
          }}
        >
          <p className="text-xs font-medium text-foreground truncate">
            {txn.merchantName ?? txn.rawDescription}
          </p>
          <TransactionSourceSubtitle txn={txn} />
          {transactionReferenceDisplay(txn) != null && (
            <p
              className="mt-0.5 min-w-0 max-w-full text-[9px] leading-snug"
              title={transactionReferenceTitle(txn)}
            >
              <span className="block min-w-0 truncate text-muted-foreground">
                {transactionReferenceDisplay(txn)}
              </span>
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-w-0 space-y-1.5"
      onClick={(e) => e.stopPropagation()}
    >
      <input
        ref={inputRef}
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => save()}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); save(); }
          if (e.key === "Escape") { e.preventDefault(); setDraft(txn.merchantName ?? ""); setEditing(false); }
        }}
        className="w-full min-w-0 rounded-md border border-chart-border bg-chart-muted px-2 py-1 text-xs font-medium text-foreground outline-none focus:border-[#0BC18D]/60 focus:ring-1 focus:ring-[#0BC18D]/30"
        aria-label="Merchant name"
      />
      <div className="flex items-center gap-1.5">
        <span className="shrink-0 text-[9px] text-muted-foreground/80">Apply to:</span>
        <div className="inline-flex h-[22px] rounded-full border border-chart-border bg-chart-muted p-px text-[9px] font-medium">
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setApplyAll(true)}
            className={cn(
              "rounded-full px-2 transition-colors whitespace-nowrap cursor-pointer",
              applyAll
                ? "bg-[#0BC18D]/20 text-[#0BC18D]"
                : "text-muted-foreground hover:text-muted-foreground",
            )}
          >
            All with this name
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setApplyAll(false)}
            className={cn(
              "rounded-full px-2 transition-colors whitespace-nowrap cursor-pointer",
              !applyAll
                ? "bg-[#0BC18D]/20 text-[#0BC18D]"
                : "text-muted-foreground hover:text-muted-foreground",
            )}
          >
            Only this
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════ CATEGORY CELL EDITOR ═════════════════════════ */

export function CategoryCellEditor({
  txn,
  userCategories,
  onSaved,
}: {
  txn: TransactionRowData;
  userCategories: TransactionTableUserCategory[];
  onSaved: (
    txnId: string,
    categoryId: number,
    scope: "this" | "merchant" | "label",
    merchantName: string | null,
    label: string | null,
    resolvedCategoryName: string | null,
    resolvedSubcategoryName: string | null,
  ) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [scope, setScope] = useState<"merchant" | "label" | "this">("merchant");
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [panelRect, setPanelRect] = useState<{ top: number; left: number; width: number } | null>(null);

  useEffect(() => {
    if (!open) { setSearch(""); setPanelRect(null); return; }
    requestAnimationFrame(() => searchRef.current?.focus());
  }, [open]);

  const updatePanelPosition = useCallback(() => {
    const el = containerRef.current;
    if (!el || !open) {
      setPanelRect(null);
      return;
    }
    const rect = el.getBoundingClientRect();
    const MARGIN = 8;
    const width = Math.min(280, window.innerWidth - 2 * MARGIN);
    const left = Math.max(MARGIN, Math.min(rect.left, window.innerWidth - width - MARGIN));
    setPanelRect({ top: rect.bottom + 4, left, width });
  }, [open]);

  useLayoutEffect(() => {
    updatePanelPosition();
  }, [updatePanelPosition, search, scope]);

  useEffect(() => {
    if (!open) return;
    const onWin = () => updatePanelPosition();
    window.addEventListener("resize", onWin);
    window.addEventListener("scroll", onWin, true);
    return () => {
      window.removeEventListener("resize", onWin);
      window.removeEventListener("scroll", onWin, true);
    };
  }, [open, updatePanelPosition]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (containerRef.current?.contains(target)) return;
      if ((target as Element).closest?.("[data-category-editor-floating]")) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const q = search.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!q) return userCategories;
    return userCategories
      .map((cat) => ({
        ...cat,
        subcategories: cat.subcategories.filter(
          (s) => s.name.toLowerCase().includes(q) || cat.name.toLowerCase().includes(q),
        ),
      }))
      .filter((cat) => cat.subcategories.length > 0 || cat.name.toLowerCase().includes(q));
  }, [userCategories, q]);

  const hasLabel = Boolean(txn.label?.trim());
  const hasMerchantName = Boolean(txn.merchantName?.trim());
  const effectiveScope = scope === "merchant" && !hasMerchantName ? "this" : scope;

  useEffect(() => {
    if (open && scope === "merchant" && !hasMerchantName) setScope("this");
  }, [hasMerchantName, open, scope]);

  const selectCategory = (subcatId: number) => {
    let resolvedCat: string | null = null;
    let resolvedSub: string | null = null;
    for (const cat of userCategories) {
      if (cat.id === subcatId) { resolvedCat = cat.name; break; }
      const sub = cat.subcategories.find((s) => s.id === subcatId);
      if (sub) { resolvedCat = cat.name; resolvedSub = sub.name; break; }
    }
    onSaved(txn.id, subcatId, effectiveScope, txn.merchantName, txn.label, resolvedCat, resolvedSub);
    setOpen(false);
  };

  const dropdownPanel =
    open && panelRect && typeof document !== "undefined"
      ? createPortal(
          <div
            data-category-editor-floating
            className="flex max-h-[340px] w-[280px] flex-col overflow-hidden rounded-xl border border-chart-border bg-popover shadow-2xl backdrop-blur-lg"
            style={{
              position: "fixed",
              top: panelRect.top,
              left: panelRect.left,
              width: panelRect.width,
              zIndex: FLOATING_EDITOR_Z,
              backgroundColor: "#161616",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="shrink-0 px-2.5 pt-2 pb-1.5">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground/70" />
                <input
                  ref={searchRef}
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search categories…"
                  className="w-full rounded-md border border-chart-border bg-chart-muted py-1.5 pl-7 pr-2 text-[11px] text-foreground placeholder:text-muted-foreground/70 outline-none focus:border-[#0BC18D]/40 focus:ring-1 focus:ring-[#0BC18D]/20"
                />
              </div>
            </div>
            <div className="shrink-0 border-b border-chart-border px-2.5 pb-2 pt-0">
              <div className="flex items-center gap-1.5">
                <span className="shrink-0 text-[9px] text-muted-foreground/80">Apply to:</span>
                <div className="inline-flex h-[22px] rounded-full border border-chart-border bg-chart-muted p-px text-[9px] font-medium">
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setScope("merchant")}
                    className={cn(
                      "rounded-full px-2 transition-colors whitespace-nowrap cursor-pointer",
                      scope === "merchant"
                        ? "bg-[#0BC18D]/20 text-[#0BC18D]"
                        : "text-muted-foreground hover:text-muted-foreground",
                    )}
                  >
                    All with this name
                  </button>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => { if (hasLabel) setScope("label"); }}
                    className={cn(
                      "rounded-full px-2 transition-colors whitespace-nowrap",
                      !hasLabel
                        ? "text-muted-foreground/40 cursor-not-allowed"
                        : effectiveScope === "label"
                          ? "bg-[#0BC18D]/20 text-[#0BC18D] cursor-pointer"
                          : "text-muted-foreground hover:text-muted-foreground cursor-pointer",
                    )}
                    title={hasLabel ? `Label: ${txn.label}` : "No label assigned"}
                  >
                    {hasLabel ? txn.label : "No label"}
                  </button>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setScope("this")}
                    className={cn(
                      "rounded-full px-2 transition-colors whitespace-nowrap cursor-pointer",
                      effectiveScope === "this"
                        ? "bg-[#0BC18D]/20 text-[#0BC18D]"
                        : "text-muted-foreground hover:text-muted-foreground",
                    )}
                  >
                    Only this
                  </button>
                </div>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto overscroll-contain py-1">
              {filtered.length === 0 ? (
                <p className="px-3 py-4 text-center text-[11px] text-muted-foreground/70">No categories found</p>
              ) : (
                filtered.map((cat) => (
                  <div key={cat.id}>
                    <button
                      type="button"
                      onClick={() => {
                        if (cat.subcategories.length === 0) selectCategory(cat.id);
                      }}
                      className={cn(
                        "w-full flex items-center gap-2 px-3 py-1.5 text-left text-[11px] font-semibold tracking-wide",
                        cat.subcategories.length === 0
                          ? "text-muted-foreground hover:bg-chart-muted cursor-pointer"
                          : "text-muted-foreground cursor-default",
                      )}
                    >
                      <div
                        className="w-1.5 h-1.5 rounded-full shrink-0"
                        style={{ backgroundColor: cat.color ?? "#808080" }}
                      />
                      {cat.name}
                    </button>
                    {cat.subcategories.map((sub) => {
                      const isActive = txn.categoryId === sub.id;
                      return (
                        <button
                          key={sub.id}
                          type="button"
                          onClick={() => selectCategory(sub.id)}
                          className={cn(
                            "w-full flex items-center gap-2 pl-7 pr-3 py-1.5 text-left text-[11px] transition-colors cursor-pointer",
                            isActive
                              ? "bg-[#0BC18D]/10 text-[#0BC18D]"
                              : "text-muted-foreground hover:bg-chart-muted hover:text-foreground",
                          )}
                        >
                          <div
                            className="w-1 h-1 rounded-full shrink-0"
                            style={{ backgroundColor: `${cat.color ?? "#808080"}60` }}
                          />
                          <span className="truncate">{sub.name}</span>
                          {isActive && (
                            <span className="ml-auto shrink-0 text-[9px] font-medium text-[#0BC18D]/60">current</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                ))
              )}
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <div
      ref={containerRef}
      className="relative min-w-0 w-full"
      onClick={(e) => e.stopPropagation()}
    >
      {dropdownPanel}
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "flex min-w-0 w-full items-center gap-2.5 rounded-md py-0.5 -my-0.5 pr-1 transition-[box-shadow,background]",
          open
            ? "ring-1 ring-[#0BC18D]/40 bg-chart-muted cursor-pointer"
            : "ring-0 hover:ring-1 hover:ring-chart-border hover:bg-chart-muted cursor-pointer",
        )}
      >
        <TransactionCategoryIcon
          categoryName={txn.categoryName}
          subcategoryName={txn.subcategoryName}
          size="md"
        />
        <div className="flex min-w-0 flex-1 flex-col items-start justify-center gap-0.5 text-left">
          <span className="block w-full max-w-full truncate text-[12px] text-foreground">
            {txn.categoryName ?? "Uncategorized"}
          </span>
          {txn.subcategoryName ? (
            <span className="block w-full max-w-full truncate text-[11px] text-muted-foreground">
              {txn.subcategoryName}
            </span>
          ) : null}
        </div>
        <ChevronDown
          className={cn(
            "w-3 h-3 shrink-0 transition-transform",
            open ? "text-[#0BC18D] rotate-180" : "text-muted-foreground/50",
          )}
        />
      </button>
    </div>
  );
}
