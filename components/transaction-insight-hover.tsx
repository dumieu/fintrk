"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Calendar,
  Receipt,
  Building2,
  CreditCard,
  Tag,
  Coins,
  Globe2,
  Sparkles,
  FileStack,
  Hash,
  Scale,
} from "lucide-react";
import {
  accountKindSubtitleLabel,
  cardNetworkLabel,
  formatCurrency,
  formatDate,
  formatFxSpread,
  formatMaskedNumber,
} from "@/lib/format";
import { countryDisplayName, flagEmoji, transactionTypeLabel } from "@/lib/transaction-flags";
import { CardNetworkLogo } from "@/components/card-network-logo";
import { TransactionCategoryIcon } from "@/components/transaction-category-icon";
import { cn } from "@/lib/utils";

export interface TransactionInsightData {
  id: string;
  postedDate: string;
  valueDate: string | null;
  rawDescription: string;
  referenceId: string | null;
  merchantName: string | null;
  mccCode: number | null;
  baseAmount: string;
  baseCurrency: string;
  foreignAmount: string | null;
  foreignCurrency: string | null;
  implicitFxRate: string | null;
  implicitFxSpreadBps: string | null;
  categorySuggestion: string | null;
  categoryConfidence: string | null;
  categoryName?: string | null;
  subcategoryName?: string | null;
  countryIso: string | null;
  isRecurring: boolean;
  aiConfidence: string | null;
  balanceAfter: string | null;
  accountType: string | null;
  accountCardNetwork: string | null;
  accountMaskedNumber: string | null;
  accountInstitutionName: string | null;
  accountName: string | null;
  statementFileName: string | null;
  statementPeriodStart: string | null;
  statementPeriodEnd: string | null;
}

function Row({ label, children, icon: Icon }: { label: string; children: ReactNode; icon?: typeof Calendar }) {
  return (
    <div className="flex gap-2.5 py-1.5 border-b border-white/[0.06] last:border-0">
      {Icon ? (
        <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#AD74FF]/80" aria-hidden />
      ) : null}
      <div className="min-w-0 flex-1">
        <p className="text-[9px] font-semibold uppercase tracking-wider text-white/40">{label}</p>
        <div className="mt-0.5 text-[11px] leading-snug text-white/88">{children}</div>
      </div>
    </div>
  );
}

function TransactionInsightPanel({ txn }: { txn: TransactionInsightData }) {
  const amt = parseFloat(txn.baseAmount);
  const isPositive = amt > 0;
  const isNegative = amt < 0;
  const hasFx = Boolean(txn.foreignCurrency && txn.foreignAmount);
  const spreadBps = txn.implicitFxSpreadBps ? parseFloat(txn.implicitFxSpreadBps) : null;
  const rate = txn.implicitFxRate ? parseFloat(txn.implicitFxRate) : null;
  const countryName = countryDisplayName(txn.countryIso);
  const flag = flagEmoji(txn.countryIso);
  const kind = accountKindSubtitleLabel(txn.accountType, txn.accountCardNetwork);
  const masked = formatMaskedNumber(txn.accountMaskedNumber);
  const netLabel = cardNetworkLabel(txn.accountCardNetwork);
  const bank = (txn.accountInstitutionName?.trim() || txn.accountName?.trim() || "") || null;
  const stmtPeriod =
    txn.statementPeriodStart && txn.statementPeriodEnd
      ? `${formatDate(txn.statementPeriodStart, "long")} – ${formatDate(txn.statementPeriodEnd, "long")}`
      : txn.statementPeriodStart
        ? formatDate(txn.statementPeriodStart, "long")
        : null;

  return (
    <div
      className={cn(
        "w-[min(340px,calc(100vw-24px))] rounded-2xl border border-white/20 p-px shadow-2xl",
        "bg-gradient-to-br from-[#0BC18D]/35 via-[#2CA2FF]/25 to-[#AD74FF]/35",
      )}
    >
      <div className="rounded-[0.9rem] bg-[#120a28] px-3.5 py-3 backdrop-blur-xl overflow-hidden">
        <div className="mb-2 flex items-center gap-2 border-b border-white/10 pb-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-[#0BC18D]/30 to-[#2CA2FF]/20 ring-1 ring-white/10">
            <Sparkles className="h-4 w-4 text-[#0BC18D]" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">Transaction insight</p>
            <p className="break-words text-xs font-semibold text-white">{txn.merchantName ?? txn.rawDescription}</p>
          </div>
        </div>

        <section className="mb-1">
          <Row label="Posted date" icon={Calendar}>
            {formatDate(txn.postedDate, "long")}
          </Row>
          {txn.valueDate && txn.valueDate !== txn.postedDate ? (
            <Row label="Value date" icon={Calendar}>
              {formatDate(txn.valueDate, "long")}
            </Row>
          ) : null}
          <Row label="As on statement" icon={Receipt}>
            <span className="whitespace-pre-wrap break-words font-mono text-[10px] text-white/70">
              {txn.rawDescription?.trim() || "—"}
            </span>
          </Row>
          {txn.referenceId ? (
            <Row label="Reference" icon={Hash}>
              <span className="font-mono text-[10px]">{txn.referenceId}</span>
            </Row>
          ) : null}
          {txn.merchantName ? (
            <Row label="Merchant" icon={Building2}>
              {txn.merchantName}
            </Row>
          ) : null}
        </section>

        <section className="mb-1">
          <Row label="Amount" icon={Coins}>
            <span
              className={cn(
                "text-sm font-bold tabular-nums",
                isPositive && "text-[#A7F3D0]",
                isNegative && "text-[#FCA5A5]",
                !isPositive && !isNegative && "text-white/80",
              )}
            >
              {isPositive ? "+" : isNegative ? "−" : ""}
              {formatCurrency(Math.abs(amt), txn.baseCurrency)}
            </span>
            {txn.balanceAfter ? (
              <p className="mt-1 text-[10px] text-white/45">
                Balance after (if provided):{" "}
                <span className="tabular-nums text-white/65">{formatCurrency(parseFloat(txn.balanceAfter), txn.baseCurrency)}</span>
              </p>
            ) : null}
          </Row>
          {hasFx ? (
            <Row label="Foreign exchange" icon={Globe2}>
              <p className="tabular-nums">
                {formatCurrency(Math.abs(parseFloat(txn.foreignAmount!)), txn.foreignCurrency!)}
              </p>
              {rate != null && !Number.isNaN(rate) ? (
                <p className="mt-1 text-[10px] text-white/50">
                  Implied rate: <span className="tabular-nums text-white/70">{rate.toFixed(6)}</span>{" "}
                  {txn.baseCurrency}/{txn.foreignCurrency}
                </p>
              ) : null}
              {spreadBps != null && !Number.isNaN(spreadBps) ? (
                <p className="mt-1 text-[10px] text-white/50">
                  FX spread vs mid: <span className="text-[#AD74FF]">{formatFxSpread(spreadBps)}</span>
                </p>
              ) : null}
            </Row>
          ) : null}
        </section>

        <section className="mb-1">
          <Row label="Category" icon={Tag}>
            <div className="flex flex-row items-center justify-start gap-2.5">
              <TransactionCategoryIcon
                categoryName={txn.categoryName ?? null}
                subcategoryName={txn.subcategoryName ?? null}
                categorySuggestion={txn.categorySuggestion}
                size="sm"
              />
              <span className="flex min-w-0 flex-col items-start gap-0.5 text-left">
                <span className="text-[12px] font-medium text-white/85">
                  {txn.categoryName ?? txn.categorySuggestion ?? "Uncategorized"}
                </span>
                {txn.subcategoryName ? (
                  <span className="text-[11px] text-white/50">{txn.subcategoryName}</span>
                ) : null}
              </span>
            </div>
          </Row>
          {(countryName || txn.countryIso) ? (
            <Row label="Country" icon={Globe2}>
              <span className="inline-flex items-center gap-1.5">
                {flag ? <span className="text-base leading-none">{flag}</span> : null}
                <span>
                  {countryName ?? "—"}
                  {txn.countryIso ? (
                    <span className="text-white/45"> ({txn.countryIso.toUpperCase()})</span>
                  ) : null}
                </span>
              </span>
            </Row>
          ) : null}
          {txn.mccCode != null ? (
            <Row label="MCC code" icon={Hash}>
              {String(txn.mccCode).padStart(4, "0")}
            </Row>
          ) : null}
          <Row label="Pattern" icon={Scale}>
            {transactionTypeLabel(txn.isRecurring, hasFx)}
          </Row>
        </section>

        <section>
          <Row label="Account" icon={CreditCard}>
            <div className="flex flex-wrap items-center gap-2">
              {kind ? <span>{kind}</span> : null}
              {masked && txn.accountCardNetwork && txn.accountCardNetwork !== "unknown" ? (
                <span className="inline-flex items-center gap-1 rounded-md bg-white/[0.06] px-1.5 py-0.5">
                  <CardNetworkLogo network={txn.accountCardNetwork} className="relative top-px" />
                  <span className="font-mono text-[10px] text-white/60">{masked}</span>
                </span>
              ) : masked ? (
                <span className="font-mono text-[10px] text-white/60">{masked}</span>
              ) : null}
              {netLabel && !masked ? <span className="text-white/55">{netLabel}</span> : null}
            </div>
            {bank ? <p className="mt-1 text-[10px] text-white/55">{bank}</p> : null}
          </Row>
          {(txn.statementFileName || stmtPeriod) ? (
            <Row label="Statement source" icon={FileStack}>
              {txn.statementFileName ? (
                <p className="break-all font-mono text-[10px] text-white/70">{txn.statementFileName}</p>
              ) : null}
              {stmtPeriod ? <p className="mt-1 text-[10px] text-white/50">Period: {stmtPeriod}</p> : null}
            </Row>
          ) : null}
        </section>
      </div>
    </div>
  );
}

const GAP = 10;
const VIEW_MARGIN = 12;

function clampTooltipPosition(
  trigger: DOMRect,
  tipW: number,
  tipH: number,
): { top: number; left: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const maxH = vh - VIEW_MARGIN * 2;

  let top = trigger.top - tipH - GAP;
  if (top < VIEW_MARGIN) {
    top = trigger.bottom + GAP;
  }
  if (top + tipH > vh - VIEW_MARGIN) {
    top = vh - tipH - VIEW_MARGIN;
  }
  if (top < VIEW_MARGIN) {
    top = VIEW_MARGIN;
  }
  if (tipH > maxH) {
    top = VIEW_MARGIN;
  }

  let left = trigger.left + trigger.width / 2 - tipW / 2;
  left = Math.max(VIEW_MARGIN, Math.min(left, vw - tipW - VIEW_MARGIN));

  return { top, left };
}

export function TransactionInsightHover({ txn, children }: { txn: TransactionInsightData; children: ReactNode }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const reposition = useCallback(() => {
    const wrap = wrapRef.current;
    const tip = tipRef.current;
    if (!wrap || !tip) return;
    const tr = wrap.getBoundingClientRect();
    const tw = tip.offsetWidth;
    const th = tip.offsetHeight;
    if (tw === 0 || th === 0) return;
    const { top, left } = clampTooltipPosition(tr, tw, th);
    tip.style.top = `${top}px`;
    tip.style.left = `${left}px`;
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    reposition();
    const onWin = () => reposition();
    window.addEventListener("resize", onWin);
    window.addEventListener("scroll", onWin, true);
    const tip = tipRef.current;
    const ro = tip ? new ResizeObserver(() => reposition()) : null;
    if (tip && ro) ro.observe(tip);
    return () => {
      window.removeEventListener("resize", onWin);
      window.removeEventListener("scroll", onWin, true);
      ro?.disconnect();
    };
  }, [open, reposition, txn.id]);

  const tooltip =
    open && mounted ? (
      <div
        ref={tipRef}
        className="pointer-events-none fixed z-[9999]"
        style={{ top: 0, left: 0 }}
        role="tooltip"
      >
        <TransactionInsightPanel txn={txn} />
      </div>
    ) : null;

  return (
    <>
      <div
        ref={wrapRef}
        className="group/txninsight relative min-w-0 cursor-default"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false);
        }}
      >
        {children}
      </div>
      {mounted && tooltip ? createPortal(tooltip, document.body) : null}
    </>
  );
}
