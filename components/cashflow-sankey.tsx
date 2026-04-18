"use client";

import { useMemo, useState, useId, useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
/** Integer-only currency formatter (no decimals anywhere on this page). */
function fmtInt(amount: number, currency: string, locale = "en-US"): string {
  const n = Math.round(amount);
  if (!Number.isFinite(n)) return "—";
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: currency.toUpperCase(),
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(n);
  } catch {
    return `${currency} ${n.toLocaleString(locale)}`;
  }
}

/* ════════════════════════════════════════════════════════════════════
 * CASHFLOW SANKEY — a custom-built, animated, particle-flowing,
 * gradient-ribbon Sankey designed specifically for FinTRK.
 *
 *  Columns (left → right):
 *   0 Inflow categories      (+ optional "Deficit Funding" node)
 *   1 Total Income           (single trunk node)
 *   2 Allocation             (Spent · Saved & Invested · optional Surplus)
 *   3 Outflow / Savings categories
 *   4 Subcategories
 *
 * Hovering any node highlights every ribbon flowing through it AND
 * opens a breakdown tooltip that decomposes that node one level deeper
 * (e.g. subcategory → labels). Hovering a ribbon highlights both
 * endpoint nodes and shows the link's contribution.
 * ═══════════════════════════════════════════════════════════════════ */

export interface CashflowSankeyData {
  currency: string;
  availableCurrencies: string[];
  dateFrom: string | null;
  dateTo: string | null;
  inflow: FlowSlice;
  outflow: FlowSlice;
  savings: FlowSlice;
  /** All-time monthly stats keyed by `LayoutNode.statsKey`. */
  allTimeStats?: Record<string, NodeAllTimeStats>;
}

export interface NodeAllTimeStats {
  months: { ym: string; value: number }[];
  total: number;
  count: number;
  monthsSpan: number;
  firstYm: string | null;
  lastYm: string | null;
  /** Mean of each calendar year’s actual total (from API; never monthly × 12). */
  avgPerYear: number | null;
  /** Number of distinct calendar years with data for this node. */
  yearsSpan: number;
}

export interface FlowSlice {
  flow: "inflow" | "outflow" | "savings";
  value: number;
  count: number;
  categories: CategorySlice[];
}

interface CategorySlice {
  name: string;
  color: string | null;
  value: number;
  count: number;
  subs: SubSlice[];
}

interface SubSlice {
  name: string;
  value: number;
  count: number;
  leaves: LeafSlice[];
}

interface LeafSlice {
  name: string;
  value: number;
  count: number;
}

/* ─────────────────────────  COLOR PALETTE  ────────────────────────── */

const COL = {
  inflow: "#0BC18D",
  inflowSoft: "#34E6B0",
  outflow: "#FF6F69",
  outflowSoft: "#FFA199",
  savings: "#AD74FF",
  savingsSoft: "#C9A4FF",
  income: "#10B981",      // green trunk for Total Income
  incomeSoft: "#34D399",
  surplus: "#2CA2FF",
  deficit: "#E11D48",
  uncategorized: "#9CA3AF",
};

// Distinct shades of green used for inflow sources so the Total Income trunk
// and every ribbon feeding into it stays in the green family.
const INFLOW_GREENS = [
  "#0BC18D",
  "#10B981",
  "#34D399",
  "#22C57E",
  "#16A34A",
  "#059669",
  "#4ADE80",
  "#65D9A0",
  "#84E1A8",
  "#0EA572",
];

const FLOW_PALETTE = [
  "#0BC18D",
  "#2CA2FF",
  "#AD74FF",
  "#ECAA0B",
  "#FF6F69",
  "#34D399",
  "#F472B6",
  "#60A5FA",
  "#FBBF24",
  "#22D3EE",
  "#A78BFA",
  "#F87171",
  "#10B981",
  "#FB923C",
  "#818CF8",
  "#E879F9",
];

function colorForCategory(name: string, hint: string | null, fallback: string): string {
  if (hint && /^#[0-9a-f]{6}$/i.test(hint)) return hint;
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return FLOW_PALETTE[h % FLOW_PALETTE.length] ?? fallback;
}

/* ───────────────────────────  LAYOUT  ──────────────────────────────── */

interface BreakdownItem {
  name: string;
  value: number;
  count?: number;
  color: string;
}

interface LayoutNode {
  id: string;
  col: number;
  name: string;
  color: string;
  value: number;
  count?: number;
  level: "inflow-cat" | "income" | "alloc" | "category" | "sub" | "label" | "deficit" | "surplus";
  flow: "inflow" | "outflow" | "savings" | "income" | "alloc";
  /** Layout-time. */
  y: number;
  height: number;
  /** UI label tier: top categories show big text, leaves smaller. */
  emphasis: 0 | 1 | 2;
  /** What this node decomposes into (used in hover tooltip). */
  breakdown?: BreakdownItem[];
  /** Friendly label for what the breakdown represents (e.g. "Labels"). */
  breakdownKind?: string;
  /** Lookup key into `data.allTimeStats` for sparkline / averages. */
  statsKey?: string;
}

interface LayoutLink {
  id: string;
  sourceId: string;
  targetId: string;
  value: number;
  color: string;
  sy0: number; sy1: number;
  ty0: number; ty1: number;
}

interface SankeyLayout {
  nodes: LayoutNode[];
  links: LayoutLink[];
  width: number;
  height: number;
  /** Per-column x-coordinates (varies with rendered width). */
  colX: number[];
  /** Effective horizontal label gutters (shrink on narrow viewports). */
  padLeft: number;
  padRight: number;
  totalIncome: number;
  totalSpent: number;
  totalSaved: number;
  surplus: number;
  deficit: number;
}

/* Truncate small slices into a single "Other" bucket per parent. */
function consolidateSmall<T extends { name: string; value: number }>(
  arr: T[],
  maxKeep: number,
  builder: (rest: T[]) => T,
): T[] {
  if (arr.length <= maxKeep) return arr;
  const sorted = [...arr].sort((a, b) => b.value - a.value);
  const keep = sorted.slice(0, maxKeep - 1);
  const rest = sorted.slice(maxKeep - 1);
  if (rest.length === 0) return keep;
  return [...keep, builder(rest)];
}

/** Default label gutters used at the natural diagram width. They shrink on
 *  narrow viewports (see {@link computeColX}) so the chart never has to be
 *  scaled down by SVG `meet` and never overflows its card. */
const PAD_LEFT_BASE = 120;
const PAD_RIGHT_BASE = 120;
const PAD_LEFT_MIN = 56;
const PAD_RIGHT_MIN = 56;
const PAD_Y = 28;
const MIN_NODE_H = 4;
const NODE_W = 16;
// Five columns now (Inflow Sources, Total Income, Allocation, Categories, Subcategories)
const COL_GAPS = [240, 200, 220, 280];
/** Absolute minimum column gap before the chart turns into a tangle. */
const MIN_GAP = 78;
/** Natural diagram width — what the chart wants when there's plenty of room. */
const BASE_W =
  PAD_LEFT_BASE + COL_GAPS.reduce((a, b) => a + b, 0) + NODE_W + PAD_RIGHT_BASE;
/** Smallest layout width we'll render — tighter than this and the labels
 *  collide. Below this width the SVG falls back to `meet` scaling. */
const MIN_W =
  PAD_LEFT_MIN + COL_GAPS.length * MIN_GAP + NODE_W + PAD_RIGHT_MIN;

/** Compute per-column x positions for a given target SVG width.
 *
 *  • At ≥ BASE_W: gutters stay fixed and column gaps absorb the extra width.
 *  • Between MIN_W and BASE_W: gutters and gaps shrink proportionally so the
 *    diagram fills exactly `targetWidth`, removing the "tiny chart inside a
 *    huge whitespace" effect on tablet-sized viewports.
 *  • Below MIN_W: layout stays at MIN_W and the SVG `viewBox` scales down to
 *    fit (a last-resort fallback for very narrow phones). */
function computeColX(targetWidth: number): {
  colX: number[];
  width: number;
  padLeft: number;
  padRight: number;
} {
  const baseGapSum = COL_GAPS.reduce((a, b) => a + b, 0);

  if (targetWidth >= BASE_W) {
    const width = targetWidth;
    const scaledGapSum = width - PAD_LEFT_BASE - NODE_W - PAD_RIGHT_BASE;
    const scale = scaledGapSum / baseGapSum;
    const xs: number[] = [PAD_LEFT_BASE];
    for (let i = 0; i < COL_GAPS.length; i++) xs.push(xs[i] + COL_GAPS[i] * scale);
    return { colX: xs, width, padLeft: PAD_LEFT_BASE, padRight: PAD_RIGHT_BASE };
  }

  const width = Math.max(MIN_W, targetWidth);
  /** Smoothly interpolate gutters between MIN and BASE based on how much
   *  width is available between MIN_W and BASE_W. */
  const t = (width - MIN_W) / (BASE_W - MIN_W); // 0..1
  const padLeft = Math.round(PAD_LEFT_MIN + (PAD_LEFT_BASE - PAD_LEFT_MIN) * t);
  const padRight = Math.round(PAD_RIGHT_MIN + (PAD_RIGHT_BASE - PAD_RIGHT_MIN) * t);
  const scaledGapSum = width - padLeft - NODE_W - padRight;
  const scale = scaledGapSum / baseGapSum;
  const xs: number[] = [padLeft];
  for (let i = 0; i < COL_GAPS.length; i++) xs.push(xs[i] + COL_GAPS[i] * scale);
  return { colX: xs, width, padLeft, padRight };
}

const MAX_INFLOW_CATS = 8;
const MAX_TOP_CATS = 9;
const MAX_SUBS = 8;
/** Maximum items rendered inside the breakdown tooltip per node. */
const MAX_BREAKDOWN_ITEMS = 8;

function buildLayout(
  data: CashflowSankeyData,
  height: number,
  targetWidth: number = BASE_W,
): SankeyLayout {
  const { colX, width: layoutWidth, padLeft, padRight } = computeColX(targetWidth);
  const nodes: LayoutNode[] = [];
  const links: LayoutLink[] = [];

  const { inflow, outflow, savings } = data;

  /* --- Consolidate small slices --- */
  const inflowCats = consolidateSmall(
    inflow.categories.filter((c) => c.value > 0),
    MAX_INFLOW_CATS,
    (rest) => ({
      name: `Other (${rest.length})`,
      color: null,
      value: rest.reduce((s, x) => s + x.value, 0),
      count: rest.reduce((s, x) => s + x.count, 0),
      subs: [],
    }),
  );

  const totalInflow = inflowCats.reduce((s, c) => s + c.value, 0);
  const totalOutflow = outflow.value;
  const totalSavings = savings.value;
  const totalSpentSaved = totalOutflow + totalSavings;

  const surplus = Math.max(0, totalInflow - totalSpentSaved);
  const deficit = Math.max(0, totalSpentSaved - totalInflow);
  const totalIncome = totalInflow + deficit; // == totalSpentSaved + surplus

  if (totalIncome <= 0) {
    return {
      nodes: [], links: [], width: layoutWidth, height, colX, padLeft, padRight,
      totalIncome: 0, totalSpent: 0, totalSaved: 0, surplus: 0, deficit: 0,
    };
  }

  const innerH = height - PAD_Y * 2;

  /* --- Build nodes per column --- */

  // Column 0 — Inflow categories (sources). All shades of green so the
  // Total Income trunk and feeding ribbons stay in the green family.
  const c0Nodes: LayoutNode[] = inflowCats.map((c, i) => {
    const color = INFLOW_GREENS[i % INFLOW_GREENS.length];
    const isOther = /^Other \(/.test(c.name);
    return {
      id: `inflow-cat:${c.name}`,
      col: 0,
      name: c.name,
      color,
      value: c.value,
      count: c.count,
      level: "inflow-cat",
      flow: "inflow",
      y: 0, height: 0, emphasis: 1,
      statsKey: isOther ? undefined : `cat:inflow:${c.name}`,
    };
  });
  if (deficit > 0) {
    c0Nodes.push({
      id: "inflow-deficit",
      col: 0,
      name: "Deficit (Drawdown)",
      color: COL.deficit,
      value: deficit,
      level: "deficit",
      flow: "inflow",
      y: 0, height: 0, emphasis: 1,
    });
  }

  // Column 1 — Total Income trunk
  const incomeNode: LayoutNode = {
    id: "income",
    col: 1,
    name: "Total Income",
    color: COL.income,
    value: totalIncome,
    level: "income",
    flow: "income",
    y: 0, height: 0, emphasis: 0,
    statsKey: "income:trunk",
  };

  // Column 2 — Allocation: Spent · Saved · (optional Surplus)
  const allocNodes: LayoutNode[] = [];
  if (totalOutflow > 0) {
    allocNodes.push({
      id: "alloc-outflow",
      col: 2,
      name: "Spent",
      color: COL.outflow,
      value: totalOutflow,
      level: "alloc",
      flow: "outflow",
      y: 0, height: 0, emphasis: 0,
      statsKey: "alloc:outflow",
    });
  }
  if (totalSavings > 0) {
    allocNodes.push({
      id: "alloc-savings",
      col: 2,
      name: "Saved & Invested",
      color: COL.savings,
      value: totalSavings,
      level: "alloc",
      flow: "savings",
      y: 0, height: 0, emphasis: 0,
      statsKey: "alloc:savings",
    });
  }
  if (surplus > 0) {
    allocNodes.push({
      id: "alloc-surplus",
      col: 2,
      name: "Unallocated Surplus",
      color: COL.surplus,
      value: surplus,
      level: "surplus",
      flow: "income",
      y: 0, height: 0, emphasis: 0,
    });
  }

  // Column 3 — Categories (outflow + savings); Column 4 — Subcategories; Column 5 — Labels
  type CatNodeInfo = {
    flow: "outflow" | "savings";
    parent: CategorySlice;
    color: string;
  };
  const c3Infos: CatNodeInfo[] = [];

  for (const flowSlice of [outflow, savings] as const) {
    if (flowSlice.value <= 0) continue;
    const parentColor = flowSlice.flow === "outflow" ? COL.outflow : COL.savings;
    const cats = consolidateSmall(
      flowSlice.categories.filter((c) => c.value > 0),
      MAX_TOP_CATS,
      (rest) => ({
        name: `Other (${rest.length})`,
        color: null,
        value: rest.reduce((s, x) => s + x.value, 0),
        count: rest.reduce((s, x) => s + x.count, 0),
        subs: [],
      }),
    );
    for (const cat of cats) {
      const color = colorForCategory(cat.name, cat.color, parentColor);
      c3Infos.push({ flow: flowSlice.flow as "outflow" | "savings", parent: cat, color });
    }
  }

  const c3Nodes: LayoutNode[] = c3Infos.map((info, i) => {
    const isOther = /^Other \(/.test(info.parent.name);
    return {
      id: `cat:${info.flow}:${info.parent.name}:${i}`,
      col: 3,
      name: info.parent.name,
      color: info.color,
      value: info.parent.value,
      count: info.parent.count,
      level: "category",
      flow: info.flow,
      y: 0, height: 0, emphasis: 1,
      statsKey: isOther ? undefined : `cat:${info.flow}:${info.parent.name}`,
    };
  });

  // Subcategories (col 4) — labels are now revealed via the hover tooltip,
  // not as a separate column.
  const c4Nodes: LayoutNode[] = [];

  // For each top-cat node, build its sub list (consolidated)
  const subInfos: { catNodeId: string; catColor: string; sub: SubSlice }[] = [];
  c3Infos.forEach((info, i) => {
    const catId = c3Nodes[i].id;
    let subs = info.parent.subs.filter((s) => s.value > 0);
    if (subs.length === 0) {
      subs = [{
        name: info.parent.name,
        value: info.parent.value,
        count: info.parent.count,
        leaves: [{ name: "Unlabeled", value: info.parent.value, count: info.parent.count }],
      }];
    }
    subs = consolidateSmall(
      subs,
      MAX_SUBS,
      (rest) => ({
        name: `Other (${rest.length})`,
        value: rest.reduce((s, x) => s + x.value, 0),
        count: rest.reduce((s, x) => s + x.count, 0),
        leaves: rest.flatMap((x) => x.leaves),
      }),
    );
    for (const s of subs) {
      subInfos.push({ catNodeId: catId, catColor: info.color, sub: s });
    }
  });

  subInfos.forEach((info, i) => {
    const parentNode = c3Nodes.find((n) => n.id === info.catNodeId)!;
    const parentName = parentNode.name;
    const isOther = /^Other \(/.test(info.sub.name) || /^Other \(/.test(parentName);
    return c4Nodes.push({
      id: `sub:${info.catNodeId}:${info.sub.name}:${i}`,
      col: 4,
      name: info.sub.name,
      color: info.catColor,
      value: info.sub.value,
      count: info.sub.count,
      level: "sub",
      flow: parentNode.flow,
      y: 0, height: 0, emphasis: 2,
      statsKey: isOther ? undefined : `sub:${parentNode.flow}:${parentName}:${info.sub.name}`,
    });
  });

  /* --- Compute scale & node heights --- */
  const colTotals = [
    c0Nodes.reduce((s, n) => s + n.value, 0),
    incomeNode.value,
    allocNodes.reduce((s, n) => s + n.value, 0),
    c3Nodes.reduce((s, n) => s + n.value, 0),
    c4Nodes.reduce((s, n) => s + n.value, 0),
  ];
  // Use the largest column total to fix the scale; this guarantees a column never exceeds the canvas.
  const maxColTotal = Math.max(...colTotals.filter((v) => v > 0), 1);
  const allCols = [c0Nodes, [incomeNode], allocNodes, c3Nodes, c4Nodes];
  const colNodeCounts = allCols.map((arr) => arr.length);
  const maxGapCount = Math.max(...colNodeCounts) - 1;
  const NODE_GAP = Math.max(2, Math.min(8, innerH / Math.max(40, maxGapCount * 2)));
  const usableH = innerH - Math.max(0, maxGapCount) * NODE_GAP;
  const scale = Math.max(0.0001, usableH / maxColTotal);

  const positionColumn = (arr: LayoutNode[]) => {
    if (arr.length === 0) return;
    let usedH = 0;
    for (const n of arr) {
      n.height = Math.max(MIN_NODE_H, n.value * scale);
      usedH += n.height;
    }
    const totalGapH = Math.max(0, (arr.length - 1) * NODE_GAP);
    const colSpan = usedH + totalGapH;
    let yCursor = PAD_Y + (innerH - colSpan) / 2;
    for (const n of arr) {
      n.y = yCursor;
      yCursor += n.height + NODE_GAP;
    }
  };

  // Sort col0 (sources) by inflow amount desc, deficit at the bottom
  c0Nodes.sort((a, b) => {
    if (a.level === "deficit") return 1;
    if (b.level === "deficit") return -1;
    return b.value - a.value;
  });
  positionColumn(c0Nodes);
  positionColumn([incomeNode]);
  // Allocation order: Spent (top), Saved, Surplus
  allocNodes.sort((a, b) => {
    const order = (n: LayoutNode) => n.id === "alloc-outflow" ? 0 : n.id === "alloc-savings" ? 1 : 2;
    return order(a) - order(b);
  });
  positionColumn(allocNodes);
  // Sort categories by alloc parent then by value desc
  c3Nodes.sort((a, b) => {
    const af = a.flow === "outflow" ? 0 : 1;
    const bf = b.flow === "outflow" ? 0 : 1;
    if (af !== bf) return af - bf;
    return b.value - a.value;
  });
  positionColumn(c3Nodes);
  // Group subs by parent c3 node, sort by value desc within each group, then position
  // (subInfos was built in c3 declaration order; c4Nodes follow that order).
  const c4Grouped: LayoutNode[][] = c3Nodes.map(() => []);
  subInfos.forEach((info, i) => {
    const idx = c3Nodes.findIndex((n) => n.id === info.catNodeId);
    if (idx >= 0) c4Grouped[idx].push(c4Nodes[i]);
  });
  for (const g of c4Grouped) g.sort((a, b) => b.value - a.value);
  const c4Sorted = c4Grouped.flat();
  positionColumn(c4Sorted);

  nodes.push(...c0Nodes, incomeNode, ...allocNodes, ...c3Nodes, ...c4Sorted);

  /* --- Compute links + ribbon offsets --- */

  // Helper: for each node we accumulate outgoing/incoming Y offsets
  const outOffset = new Map<string, number>();
  const inOffset = new Map<string, number>();

  function addLink(srcId: string, tgtId: string, value: number, color: string) {
    if (value <= 0) return;
    const src = nodes.find((n) => n.id === srcId);
    const tgt = nodes.find((n) => n.id === tgtId);
    if (!src || !tgt) return;
    const sValueScale = src.height / Math.max(0.0001, src.value);
    const tValueScale = tgt.height / Math.max(0.0001, tgt.value);
    const sH = value * sValueScale;
    const tH = value * tValueScale;
    const sOff = outOffset.get(src.id) ?? 0;
    const tOff = inOffset.get(tgt.id) ?? 0;
    const sy0 = src.y + sOff;
    const sy1 = sy0 + sH;
    const ty0 = tgt.y + tOff;
    const ty1 = ty0 + tH;
    outOffset.set(src.id, sOff + sH);
    inOffset.set(tgt.id, tOff + tH);
    links.push({
      id: `${srcId}→${tgtId}`,
      sourceId: srcId,
      targetId: tgtId,
      value,
      color,
      sy0, sy1, ty0, ty1,
    });
  }

  // Col 0 → Col 1 (Income trunk). Order links by source y so ribbons stack naturally.
  for (const src of c0Nodes) {
    addLink(src.id, incomeNode.id, src.value, src.color);
  }

  // Col 1 → Col 2 (allocation). Order: Spent first, then Saved, then Surplus
  for (const tgt of allocNodes) {
    addLink(incomeNode.id, tgt.id, tgt.value, tgt.color);
  }

  // Col 2 → Col 3 (alloc → categories)
  for (const cat of c3Nodes) {
    const allocId = cat.flow === "outflow" ? "alloc-outflow" : "alloc-savings";
    if (allocNodes.find((n) => n.id === allocId)) {
      addLink(allocId, cat.id, cat.value, cat.color);
    }
  }

  // Col 3 → Col 4 (cat → subs)
  subInfos.forEach((info, i) => {
    addLink(info.catNodeId, c4Nodes[i].id, info.sub.value, info.catColor);
  });

  /* --- Attach breakdown data for tooltips --- */
  const inflowBreakdownItems: BreakdownItem[] = c0Nodes
    .filter((n) => n.level === "inflow-cat")
    .map((n) => ({ name: n.name, value: n.value, color: n.color }))
    .sort((a, b) => b.value - a.value);

  const allocOutBreakdown: BreakdownItem[] = c3Nodes
    .filter((n) => n.flow === "outflow")
    .map((n) => ({ name: n.name, value: n.value, count: n.count, color: n.color }))
    .sort((a, b) => b.value - a.value);

  const allocSavBreakdown: BreakdownItem[] = c3Nodes
    .filter((n) => n.flow === "savings")
    .map((n) => ({ name: n.name, value: n.value, count: n.count, color: n.color }))
    .sort((a, b) => b.value - a.value);

  // Inflow source → its labels (flatten all subs.leaves)
  inflowCats.forEach((c, i) => {
    const node = c0Nodes.find((n) => n.id === `inflow-cat:${c.name}`);
    if (!node) return;
    const leaves: { name: string; value: number; count: number }[] = [];
    for (const s of c.subs ?? []) {
      for (const l of s.leaves ?? []) leaves.push({ name: l.name, value: l.value, count: l.count });
    }
    leaves.sort((a, b) => b.value - a.value);
    if (leaves.length > 0) {
      node.breakdown = leaves.map((l) => ({
        name: l.name,
        value: l.value,
        count: l.count,
        color: INFLOW_GREENS[i % INFLOW_GREENS.length],
      }));
      node.breakdownKind = "Labels";
    }
  });

  // Total Income → all inflow sources
  incomeNode.breakdown = inflowBreakdownItems;
  incomeNode.breakdownKind = "Inflow sources";

  // Allocation nodes → their categories
  for (const n of allocNodes) {
    if (n.id === "alloc-outflow") {
      n.breakdown = allocOutBreakdown;
      n.breakdownKind = "Spend categories";
    } else if (n.id === "alloc-savings") {
      n.breakdown = allocSavBreakdown;
      n.breakdownKind = "Savings categories";
    }
  }

  // Categories (col 3) → their subcategories
  c3Infos.forEach((info, i) => {
    const node = c3Nodes[i];
    const subs = info.parent.subs ?? [];
    const items = subs
      .filter((s) => s.value > 0)
      .sort((a, b) => b.value - a.value)
      .map((s) => ({ name: s.name, value: s.value, count: s.count, color: info.color }));
    if (items.length > 0) {
      node.breakdown = items;
      node.breakdownKind = "Subcategories";
    }
  });

  // Subcategories (col 4) → their labels
  subInfos.forEach((info, i) => {
    const node = c4Nodes[i];
    const leaves = info.sub.leaves ?? [];
    const items = leaves
      .filter((l) => l.value > 0)
      .sort((a, b) => b.value - a.value)
      .map((l) => ({ name: l.name, value: l.value, count: l.count, color: info.catColor }));
    if (items.length > 0) {
      node.breakdown = items;
      node.breakdownKind = "Labels";
    }
  });

  return {
    nodes, links, width: layoutWidth, height, colX, padLeft, padRight,
    totalIncome,
    totalSpent: totalOutflow,
    totalSaved: totalSavings,
    surplus,
    deficit,
  };
}

/* ──────────────────────────  RIBBON PATH  ─────────────────────────── */

function ribbonPath(
  sx: number, sy0: number, sy1: number,
  tx: number, ty0: number, ty1: number,
): string {
  const mx = (sx + tx) / 2;
  return [
    `M ${sx},${sy0}`,
    `C ${mx},${sy0} ${mx},${ty0} ${tx},${ty0}`,
    `L ${tx},${ty1}`,
    `C ${mx},${ty1} ${mx},${sy1} ${sx},${sy1}`,
    "Z",
  ].join(" ");
}

/** Center curve for particle motion. */
function centerPath(
  sx: number, sy0: number, sy1: number,
  tx: number, ty0: number, ty1: number,
): string {
  const mx = (sx + tx) / 2;
  const sy = (sy0 + sy1) / 2;
  const ty = (ty0 + ty1) / 2;
  return `M ${sx},${sy} C ${mx},${sy} ${mx},${ty} ${tx},${ty}`;
}

/* ──────────────────────────  COMPONENT  ───────────────────────────── */

interface CashflowSankeyProps {
  data: CashflowSankeyData;
  height?: number;
  /** When true, renders animated particles flowing along ribbons (heavy). */
  showParticles?: boolean;
}

export function CashflowSankey({
  data,
  height = 720,
  showParticles = false,
}: CashflowSankeyProps) {
  /** Measure the rendered container width so the layout (column gaps) can
   *  expand to fill horizontal whitespace without distorting glyph aspect
   *  ratios or growing the SVG vertically. */
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [measuredWidth, setMeasuredWidth] = useState<number>(BASE_W);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w && Math.abs(w - measuredWidth) > 1) {
        // Allow the layout to compress down to MIN_W so narrow viewports get a
        // chart that genuinely fits its card instead of a tiny scaled-down one.
        setMeasuredWidth(Math.max(MIN_W, Math.floor(w)));
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const layout = useMemo(
    () => buildLayout(data, height, measuredWidth),
    [data, height, measuredWidth],
  );
  const [hoverNodeId, setHoverNodeId] = useState<string | null>(null);
  const [hoverLinkId, setHoverLinkId] = useState<string | null>(null);
  /** Live cursor position (viewport coords) used to anchor the tooltip. */
  const [hoverPoint, setHoverPoint] = useState<{ x: number; y: number } | null>(null);
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");

  /* Build ancestor + descendant sets for highlight propagation. */
  const adj = useMemo(() => {
    const fwd = new Map<string, string[]>();
    const back = new Map<string, string[]>();
    for (const l of layout.links) {
      if (!fwd.has(l.sourceId)) fwd.set(l.sourceId, []);
      if (!back.has(l.targetId)) back.set(l.targetId, []);
      fwd.get(l.sourceId)!.push(l.targetId);
      back.get(l.targetId)!.push(l.sourceId);
    }
    return { fwd, back };
  }, [layout.links]);

  const highlightedNodeIds = useMemo(() => {
    if (!hoverNodeId) return new Set<string>();
    const s = new Set<string>();
    const dfs = (id: string, dir: "fwd" | "back") => {
      if (s.has(id)) return;
      s.add(id);
      const next = (dir === "fwd" ? adj.fwd : adj.back).get(id);
      if (next) for (const n of next) dfs(n, dir);
    };
    dfs(hoverNodeId, "fwd");
    dfs(hoverNodeId, "back");
    return s;
  }, [hoverNodeId, adj]);

  const highlightedLinkIds = useMemo(() => {
    if (hoverLinkId) return new Set([hoverLinkId]);
    if (!hoverNodeId) return new Set<string>();
    const s = new Set<string>();
    for (const l of layout.links) {
      if (highlightedNodeIds.has(l.sourceId) && highlightedNodeIds.has(l.targetId)) {
        s.add(l.id);
      }
    }
    return s;
  }, [hoverLinkId, hoverNodeId, layout.links, highlightedNodeIds]);

  const isAnyHover = !!hoverNodeId || !!hoverLinkId;

  const linkOpacity = useCallback((id: string) => {
    if (!isAnyHover) return 0.42;
    if (highlightedLinkIds.has(id)) return 0.85;
    return 0.06;
  }, [isAnyHover, highlightedLinkIds]);

  const nodeOpacity = useCallback((id: string) => {
    if (!isAnyHover) return 1;
    if (hoverNodeId === id) return 1;
    if (highlightedNodeIds.has(id)) return 0.95;
    return 0.18;
  }, [isAnyHover, hoverNodeId, highlightedNodeIds]);

  if (layout.nodes.length === 0 || layout.totalIncome === 0) {
    return (
      <div className="flex h-[420px] items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03]">
        <div className="text-center">
          <p className="text-lg font-semibold text-white/85">No cash flow data yet</p>
          <p className="mt-1 text-sm text-white/55">
            Upload a statement to see your money flow come to life.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div ref={wrapRef} className="relative w-full">
      <svg
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        width="100%"
        height={layout.height}
        style={{ display: "block" }}
        preserveAspectRatio="xMidYMid meet"
        onMouseMove={(e) => setHoverPoint({ x: e.clientX, y: e.clientY })}
        onMouseLeave={() => { setHoverNodeId(null); setHoverLinkId(null); setHoverPoint(null); }}
      >
        <defs>
          {/* Background subtle radial */}
          <radialGradient id={`${uid}-bg`} cx="50%" cy="40%" r="80%">
            <stop offset="0%" stopColor="#1a0f3d" stopOpacity="0.6" />
            <stop offset="60%" stopColor="#0a061a" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0.0" />
          </radialGradient>

          {/* Per-link gradient: source color → target color */}
          {layout.links.map((l) => {
            const src = layout.nodes.find((n) => n.id === l.sourceId)!;
            const tgt = layout.nodes.find((n) => n.id === l.targetId)!;
            return (
              <linearGradient
                key={l.id}
                id={`${uid}-grad-${cleanId(l.id)}`}
                x1="0%" y1="0%" x2="100%" y2="0%"
              >
                <stop offset="0%" stopColor={src.color} stopOpacity="0.95" />
                <stop offset="100%" stopColor={tgt.color} stopOpacity="0.95" />
              </linearGradient>
            );
          })}

          {/* Glow filter */}
          <filter id={`${uid}-glow`} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* Hidden particle motion paths */}
          {showParticles && layout.links.map((l) => (
            <path
              key={`pp-${l.id}`}
              id={`${uid}-pp-${cleanId(l.id)}`}
              d={centerPath(
                layout.colX[layoutColX(l, layout, "src")] + NODE_W,
                l.sy0, l.sy1,
                layout.colX[layoutColX(l, layout, "tgt")],
                l.ty0, l.ty1,
              )}
              fill="none"
            />
          ))}
        </defs>

        {/* Background */}
        <rect x={0} y={0} width={layout.width} height={layout.height} fill={`url(#${uid}-bg)`} />

        {/* Faint vertical column guides for visual rhythm */}
        {layout.colX.map((x, i) => (
          <line
            key={`gl-${i}`}
            x1={x + NODE_W / 2}
            x2={x + NODE_W / 2}
            y1={PAD_Y - 6}
            y2={layout.height - PAD_Y + 6}
            stroke="rgba(255,255,255,0.04)"
            strokeWidth="1"
            strokeDasharray="2 6"
          />
        ))}

        {/* RIBBONS */}
        <g>
          {layout.links.map((l) => {
            const src = layout.nodes.find((n) => n.id === l.sourceId)!;
            const tgt = layout.nodes.find((n) => n.id === l.targetId)!;
            const sx = layout.colX[src.col] + NODE_W;
            const tx = layout.colX[tgt.col];
            const path = ribbonPath(sx, l.sy0, l.sy1, tx, l.ty0, l.ty1);
            const op = linkOpacity(l.id);
            return (
              <motion.path
                key={l.id}
                d={path}
                fill={`url(#${uid}-grad-${cleanId(l.id)})`}
                stroke="none"
                style={{ mixBlendMode: "screen" }}
                initial={{ opacity: 0 }}
                animate={{ opacity: op }}
                transition={{ duration: 0.5, ease: "easeOut" }}
                onMouseEnter={() => setHoverLinkId(l.id)}
                onMouseLeave={() => setHoverLinkId(null)}
              />
            );
          })}
        </g>

        {/* PARTICLES — small dots traveling along center curves */}
        {showParticles && (
          <g pointerEvents="none">
            {layout.links.map((l) => {
              const op = linkOpacity(l.id);
              const ribbonH = Math.max(2, Math.min(20, (l.sy1 - l.sy0)));
              // Particle count proportional to ribbon thickness, capped low for performance
              const nParticles = Math.max(1, Math.min(3, Math.round(ribbonH / 6)));
              const dur = 4 + (1 / Math.max(0.5, ribbonH)) * 18; // thicker = faster
              return Array.from({ length: nParticles }).map((_, i) => (
                <circle key={`${l.id}-p${i}`} r={1.4} fill="white" opacity={op * 0.85}>
                  <animateMotion
                    dur={`${dur}s`}
                    begin={`-${(dur / nParticles) * i}s`}
                    repeatCount="indefinite"
                  >
                    <mpath xlinkHref={`#${uid}-pp-${cleanId(l.id)}`} />
                  </animateMotion>
                </circle>
              ));
            })}
          </g>
        )}

        {/* NODES (rectangles + glow + outer halo) */}
        <g>
          {layout.nodes.map((n) => {
            const x = layout.colX[n.col];
            const op = nodeOpacity(n.id);
            const isHover = hoverNodeId === n.id;
            return (
              <g
                key={n.id}
                onMouseEnter={() => setHoverNodeId(n.id)}
                onMouseLeave={() => setHoverNodeId(null)}
                style={{ cursor: "pointer", opacity: op, transition: "opacity 200ms" }}
              >
                {/* Outer halo on hover */}
                {isHover && (
                  <rect
                    x={x - 4}
                    y={n.y - 4}
                    width={NODE_W + 8}
                    height={n.height + 8}
                    rx={8}
                    fill={n.color}
                    opacity={0.18}
                    filter={`url(#${uid}-glow)`}
                  />
                )}
                {/* Main bar */}
                <rect
                  x={x}
                  y={n.y}
                  width={NODE_W}
                  height={n.height}
                  rx={Math.min(4, n.height / 2)}
                  fill={n.color}
                  filter={`url(#${uid}-glow)`}
                />
                {/* Inner highlight */}
                <rect
                  x={x + 2}
                  y={n.y + 1}
                  width={NODE_W - 4}
                  height={Math.max(0, n.height - 2)}
                  rx={Math.min(2, (n.height - 2) / 2)}
                  fill="rgba(255,255,255,0.18)"
                />
              </g>
            );
          })}
        </g>

        {/* NODE LABELS */}
        <g pointerEvents="none">
          {layout.nodes.map((n) => {
            const op = nodeOpacity(n.id);
            const right = n.col >= 3;
            const center = n.col === 1;
            const x = center
              ? layout.colX[n.col] + NODE_W / 2
              : right
                ? layout.colX[n.col] + NODE_W + 8
                : layout.colX[n.col] - 8;
            const anchor = center ? "middle" : right ? "start" : "end";
            const yMid = n.y + n.height / 2;
            const minHForText = 10;
            const minHForValue = 16;

            // Different sizes per emphasis
            const fontSize = n.emphasis === 0 ? 13 : n.emphasis === 1 ? 11 : 9.5;
            const valueFontSize = n.emphasis === 0 ? 10 : 9;
            const fontWeight = n.emphasis === 0 ? 700 : n.emphasis === 1 ? 600 : 500;
            const fillName = n.emphasis === 0 ? "rgba(255,255,255,0.98)" : "rgba(255,255,255,0.88)";
            const fillValue = "rgba(255,255,255,0.55)";

            if (n.height < minHForText) return null;

            const showValue = n.height >= minHForValue;
            /** Compute the actual horizontal space this label has based on its
             *  anchor side and surrounding columns, so col-2 left-anchored
             *  labels (e.g. "Unallocated Surplus") don't get clipped against
             *  the wrong gutter. */
            let gutterPx: number;
            if (center) {
              // Center-anchored — can extend symmetrically into both adjacent gaps.
              const leftRoom = n.col === 0
                ? layout.padLeft
                : layout.colX[n.col] - (layout.colX[n.col - 1] + NODE_W);
              const rightRoom = n.col === 4
                ? layout.padRight
                : layout.colX[n.col + 1] - (layout.colX[n.col] + NODE_W);
              gutterPx = 2 * Math.min(leftRoom, rightRoom) - 16;
            } else if (right) {
              // Anchored "start" — label extends to the right.
              const rightLimit = n.col === 4
                ? layout.width - 4
                : layout.colX[n.col + 1];
              gutterPx = rightLimit - (layout.colX[n.col] + NODE_W) - 12;
            } else {
              // Anchored "end" — label extends to the left.
              const leftLimit = n.col === 0
                ? 4
                : layout.colX[n.col - 1] + NODE_W;
              gutterPx = (layout.colX[n.col] - 8) - leftLimit - 4;
            }
            /** ~0.55em per glyph for a sans-serif label. */
            const charCap = Math.max(10, Math.floor(gutterPx / (fontSize * 0.55)));
            const truncName = truncate(n.name, Math.min(n.col === 4 ? 26 : 32, charCap));

            return (
              <g key={`lbl-${n.id}`} opacity={op} style={{ transition: "opacity 200ms" }}>
                <text
                  x={x}
                  y={showValue ? yMid - 3 : yMid}
                  textAnchor={anchor}
                  dominantBaseline="middle"
                  fontSize={fontSize}
                  fontWeight={fontWeight}
                  fill={fillName}
                  style={{ paintOrder: "stroke" }}
                  stroke="rgba(8,5,26,0.92)"
                  strokeWidth={2.6}
                  strokeLinejoin="round"
                >
                  {truncName}
                </text>
                {showValue && (
                  <text
                    x={x}
                    y={yMid + fontSize * 0.85}
                    textAnchor={anchor}
                    dominantBaseline="middle"
                    fontSize={valueFontSize}
                    fontWeight={500}
                    fill={fillValue}
                    style={{ paintOrder: "stroke" }}
                    stroke="rgba(8,5,26,0.92)"
                    strokeWidth={2.0}
                    strokeLinejoin="round"
                  >
                    {fmtInt(n.value, data.currency)}
                  </text>
                )}
              </g>
            );
          })}
        </g>

        {/* COLUMN HEADERS */}
        <g pointerEvents="none">
          {COL_HEADERS.map((h, i) => (
            <text
              key={`h-${i}`}
              x={layout.colX[i] + NODE_W / 2}
              y={10}
              textAnchor="middle"
              fontSize={9}
              letterSpacing="0.12em"
              fill="rgba(255,255,255,0.35)"
              fontWeight={600}
            >
              {h}
            </text>
          ))}
        </g>
      </svg>

      {/* HOVER TOOLTIP for ribbons */}
      <RibbonTooltip
        layout={layout}
        hoverLinkId={hoverLinkId}
        hoverNodeId={hoverNodeId}
        hoverPoint={hoverPoint}
        currency={data.currency}
        allTimeStats={data.allTimeStats}
      />
    </div>
  );
}

const COL_HEADERS = [
  "INFLOW SOURCES",
  "TOTAL INCOME",
  "ALLOCATION",
  "CATEGORIES",
  "SUBCATEGORIES",
];

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

function cleanId(s: string): string {
  return s.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function layoutColX(l: LayoutLink, layout: SankeyLayout, which: "src" | "tgt"): number {
  const id = which === "src" ? l.sourceId : l.targetId;
  const n = layout.nodes.find((x) => x.id === id);
  return n ? n.col : 0;
}

/* ──────────────────────  RIBBON / NODE TOOLTIP  ──────────────────── */

function RibbonTooltip({
  layout,
  hoverLinkId,
  hoverNodeId,
  hoverPoint,
  currency,
  allTimeStats,
}: {
  layout: SankeyLayout;
  hoverLinkId: string | null;
  hoverNodeId: string | null;
  hoverPoint: { x: number; y: number } | null;
  currency: string;
  allTimeStats?: Record<string, NodeAllTimeStats>;
}) {
  const link = hoverLinkId ? layout.links.find((l) => l.id === hoverLinkId) : null;
  const node = hoverNodeId ? layout.nodes.find((n) => n.id === hoverNodeId) : null;

  if (!link && !node) return null;

  if (link) {
    const src = layout.nodes.find((n) => n.id === link.sourceId);
    const tgt = layout.nodes.find((n) => n.id === link.targetId);
    if (!src || !tgt) return null;
    // Show the breakdown of whichever endpoint actually decomposes further.
    // Prefer the target (downstream node — that's what the ribbon "lands on"),
    // fall back to the source (e.g. when hovering an Income → Spent ribbon).
    const focus = (tgt.breakdown && tgt.breakdown.length > 0) ? tgt : src;
    return (
      <BreakdownTooltip
        node={focus}
        layout={layout}
        currency={currency}
        linkContext={{ src, tgt, value: link.value }}
        allTimeStats={allTimeStats}
        hoverPoint={hoverPoint}
      />
    );
  }

  if (node) {
    return (
      <BreakdownTooltip
        node={node}
        layout={layout}
        currency={currency}
        allTimeStats={allTimeStats}
        hoverPoint={hoverPoint}
      />
    );
  }

  return null;
}

/* ─────────────────────  BREAKDOWN TOOLTIP  ───────────────────────── */

function BreakdownTooltip({
  node,
  layout,
  currency,
  linkContext,
  allTimeStats,
  hoverPoint,
}: {
  node: LayoutNode;
  layout: SankeyLayout;
  currency: string;
  /** When set, renders a "src → tgt · value" mini-header above the breakdown. */
  linkContext?: { src: LayoutNode; tgt: LayoutNode; value: number };
  allTimeStats?: Record<string, NodeAllTimeStats>;
  /** Cursor anchor (viewport coords) — null until first mousemove. */
  hoverPoint: { x: number; y: number } | null;
}) {
  const pct = layout.totalIncome > 0 ? (node.value / layout.totalIncome) * 100 : 0;
  const items = node.breakdown ?? [];
  const total = node.value;
  const linkPct =
    linkContext && layout.totalIncome > 0
      ? (linkContext.value / layout.totalIncome) * 100
      : 0;
  const stats = node.statsKey ? allTimeStats?.[node.statsKey] : undefined;
  const avgMonthly = stats && stats.monthsSpan > 0 ? stats.total / stats.monthsSpan : null;
  /** From API: mean of actual per-calendar-year totals, never extrapolated from a month. */
  const avgYearly = stats?.avgPerYear ?? null;

  // Consolidate overflow into a single "+N more" summary row.
  let visible: BreakdownItem[] = items;
  let restCount = 0;
  let restValue = 0;
  if (items.length > MAX_BREAKDOWN_ITEMS) {
    visible = items.slice(0, MAX_BREAKDOWN_ITEMS - 1);
    const rest = items.slice(MAX_BREAKDOWN_ITEMS - 1);
    restCount = rest.length;
    restValue = rest.reduce((s, x) => s + x.value, 0);
  }

  const maxItemValue = items.length > 0 ? items[0].value : 1;

  return (
    <SankeyTooltipPortal anchor={hoverPoint} keyId={node.id}>
      <motion.div
        key={node.id}
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.14, ease: "easeOut" }}
        className="overflow-hidden rounded-2xl border border-white/12 bg-gradient-to-br from-[#120935]/97 via-[#0a061a]/97 to-[#0a061a]/97 p-3.5 text-white/90 shadow-2xl backdrop-blur-xl"
        style={{
          boxShadow:
            "0 20px 60px -15px rgba(0,0,0,0.75), 0 0 0 1px rgba(255,255,255,0.04), inset 0 1px 0 rgba(255,255,255,0.06)",
        }}
      >
      {/* Accent bar reflecting the node color */}
      <div
        className="absolute inset-x-0 top-0 h-[3px]"
        style={{
          background: `linear-gradient(90deg, transparent, ${node.color}, transparent)`,
        }}
      />

      {/* Optional ribbon-context strip (when hovering a link) */}
      {linkContext && (
        <div className="mb-2.5 flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1.5 text-[10.5px] text-white/80">
          <div className="flex min-w-0 items-center gap-1.5">
            <span
              className="inline-block h-2 w-2 shrink-0 rounded-full"
              style={{ background: linkContext.src.color }}
            />
            <span className="truncate">{linkContext.src.name}</span>
            <span className="text-white/40">→</span>
            <span
              className="inline-block h-2 w-2 shrink-0 rounded-full"
              style={{ background: linkContext.tgt.color }}
            />
            <span className="truncate">{linkContext.tgt.name}</span>
          </div>
          <div className="flex shrink-0 items-baseline gap-1.5 tabular-nums">
            <span className="font-semibold text-white">
              {fmtInt(linkContext.value, currency)}
            </span>
            <span className="text-white/45">{Math.round(linkPct)}%</span>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-start gap-2.5">
        <span
          className="mt-1 inline-block h-3 w-3 shrink-0 rounded-full ring-2 ring-white/15"
          style={{ background: node.color, boxShadow: `0 0 14px ${node.color}88` }}
        />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold text-white/95" title={node.name}>
            {node.name}
          </div>
          <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[10.5px] text-white/55">
            <span className="text-base font-bold tabular-nums text-white">
              {fmtInt(total, currency)}
            </span>
            <span className="tabular-nums">{Math.round(pct)}% of income</span>
            {typeof node.count === "number" && (
              <span className="tabular-nums">
                · {node.count.toLocaleString()} txn{node.count === 1 ? "" : "s"}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* All-time stats panel + sparkline */}
      {stats && stats.monthsSpan > 0 && (
        <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.035] p-2.5">
          <div className="flex items-center justify-between text-[9.5px] uppercase tracking-[0.14em] text-white/40">
            <span>All-time trend</span>
            <span className="tabular-nums">
              {formatYmShort(stats.firstYm)} → {formatYmShort(stats.lastYm)}
            </span>
          </div>
          <div className="mt-2">
            <Sparkline months={stats.months} color={node.color} />
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <StatTile
              label="Avg / month"
              value={avgMonthly !== null ? fmtInt(avgMonthly, currency) : "—"}
              accent={node.color}
            />
            <StatTile
              label="Avg / year"
              value={avgYearly !== null ? fmtInt(avgYearly, currency) : "—"}
              accent={node.color}
            />
          </div>
          <div className="mt-1.5 flex items-center justify-between text-[10px] text-white/45 tabular-nums">
            <span>{stats.monthsSpan} mo span</span>
            <span>
              {fmtInt(stats.total, currency)} total · {stats.count.toLocaleString()} txn
              {stats.count === 1 ? "" : "s"}
            </span>
          </div>
        </div>
      )}

      {/* Breakdown body */}
      {items.length > 0 ? (
        <>
          <div className="mt-3 flex items-center justify-between text-[9.5px] uppercase tracking-[0.14em] text-white/40">
            <span>{node.breakdownKind ?? "Breakdown"}</span>
            <span>{items.length} item{items.length === 1 ? "" : "s"}</span>
          </div>

          {/* Per-item rows with animated bars */}
          <ul className="mt-2 flex flex-col gap-1.5">
            {visible.map((it, idx) => {
              const itemPct = total > 0 ? (it.value / total) * 100 : 0;
              const widthPct = (it.value / Math.max(0.0001, maxItemValue)) * 100;
              return (
                <li key={`${it.name}-${idx}`} className="group">
                  <div className="flex items-baseline justify-between gap-2 text-[11px]">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span
                        className="inline-block h-2 w-2 shrink-0 rounded-full"
                        style={{ background: it.color }}
                      />
                      <span className="truncate text-white/85" title={it.name}>
                        {it.name}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-baseline gap-1.5 tabular-nums">
                      <span className="text-[10.5px] text-white/45">
                        {Math.round(itemPct)}%
                      </span>
                      <span className="font-semibold text-white/95">
                        {fmtInt(it.value, currency)}
                      </span>
                    </div>
                  </div>
                  <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-white/[0.06]">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${widthPct}%` }}
                      transition={{ duration: 0.55, ease: "easeOut", delay: idx * 0.025 }}
                      className="h-full rounded-full"
                      style={{
                        background: `linear-gradient(90deg, ${it.color}, ${it.color}cc)`,
                        boxShadow: `0 0 8px ${it.color}55`,
                      }}
                    />
                  </div>
                </li>
              );
            })}
            {restCount > 0 && (
              <li className="flex items-baseline justify-between gap-2 pt-0.5 text-[10.5px] text-white/55">
                <span>+ {restCount} more</span>
                <span className="tabular-nums">{fmtInt(restValue, currency)}</span>
              </li>
            )}
          </ul>
        </>
      ) : !stats ? (
        <div className="mt-3 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-2 text-[11px] text-white/55">
          No further breakdown for this node.
        </div>
      ) : null}
      </motion.div>
    </SankeyTooltipPortal>
  );
}

/* ────────────────  PORTAL + SMART PLACEMENT WRAPPER  ──────────── */

/**
 * Renders the tooltip in a `document.body` portal as a fixed-position layer
 * sitting above every other UI element. It auto-sizes width to the available
 * viewport (≈320 → 540px), anchors near the cursor with a small offset, then
 * flips/clamps so it never gets clipped by any window edge. Vertical overflow
 * falls back to internal scrolling so even very tall breakdowns stay visible.
 */
function SankeyTooltipPortal({
  anchor,
  keyId,
  children,
}: {
  anchor: { x: number; y: number } | null;
  keyId: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number; width: number; maxHeight: number } | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  /** Measure tooltip after render; reposition smartly relative to the cursor. */
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !anchor) return;
    const margin = 12;
    const cursorPad = 18;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    /** Adaptive width: prefer roomy 460px, shrink toward 320 on narrow screens,
     *  grow up to 540px when there's plenty of horizontal space. */
    const width = Math.max(300, Math.min(540, vw - margin * 2, Math.max(360, vw * 0.34)));
    /** Cap height at 92% of the viewport; content scrolls if it overflows. */
    const maxHeight = Math.max(220, vh - margin * 2);

    /** Apply width first so we can measure the resulting natural height. */
    el.style.width = `${width}px`;
    el.style.maxHeight = `${maxHeight}px`;
    const r = el.getBoundingClientRect();
    const th = Math.min(r.height, maxHeight);

    /** Try right of cursor; flip left if not enough room; fall back to clamp. */
    let left = anchor.x + cursorPad;
    if (left + width + margin > vw) {
      left = anchor.x - cursorPad - width;
    }
    if (left < margin) left = Math.max(margin, Math.min(vw - margin - width, anchor.x - width / 2));
    left = Math.min(vw - margin - width, Math.max(margin, left));

    /** Vertically centre on cursor, then clamp so the whole box fits. */
    let top = anchor.y - th / 2;
    if (top + th + margin > vh) top = vh - margin - th;
    if (top < margin) top = margin;

    setPos({ left, top, width, maxHeight });
  }, [anchor, keyId, children]);

  if (!mounted || typeof document === "undefined") return null;

  const style: React.CSSProperties = {
    position: "fixed",
    left: pos?.left ?? -9999,
    top: pos?.top ?? -9999,
    width: pos?.width,
    maxHeight: pos?.maxHeight,
    overflowY: "auto",
    zIndex: 9999,
    visibility: pos ? "visible" : "hidden",
    pointerEvents: "none",
  };

  return createPortal(
    <div ref={ref} style={style}>
      {children}
    </div>,
    document.body,
  );
}

/* ────────────────────  STAT TILE & SPARKLINE  ─────────────────── */

function StatTile({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <div
      className="relative overflow-hidden rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5"
      style={{
        boxShadow: `inset 0 0 0 1px rgba(255,255,255,0.02)`,
      }}
    >
      <span
        className="absolute left-0 top-0 h-full w-[2px]"
        style={{ background: accent, opacity: 0.7 }}
      />
      <div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-white/45">
        {label}
      </div>
      <div className="mt-0.5 text-[12.5px] font-bold tabular-nums text-white">
        {value}
      </div>
    </div>
  );
}

function Sparkline({
  months,
  color,
}: {
  months: { ym: string; value: number }[];
  color: string;
}) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const W = 280;
  const H = 38;
  const PAD_TOP = 4;
  const PAD_BOTTOM = 4;
  const usable = H - PAD_TOP - PAD_BOTTOM;

  if (months.length < 2) {
    return (
      <div className="flex h-[38px] w-full items-center justify-center rounded-md bg-white/[0.03] text-[10px] text-white/35">
        Not enough history yet
      </div>
    );
  }

  const max = Math.max(...months.map((m) => m.value), 0.0001);
  const stepX = W / (months.length - 1);
  const ptsArr = months.map((m, i) => {
    const x = i * stepX;
    const y = H - PAD_BOTTOM - (m.value / max) * usable;
    return [x, y] as const;
  });
  const linePath = `M ${ptsArr.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" L ")}`;
  const areaPath = `${linePath} L ${(W).toFixed(2)},${H} L 0,${H} Z`;

  // Find peak month for marker
  let peakIdx = 0;
  for (let i = 1; i < months.length; i++) {
    if (months[i].value > months[peakIdx].value) peakIdx = i;
  }
  const [peakX, peakY] = ptsArr[peakIdx];
  const lastX = ptsArr[ptsArr.length - 1][0];
  const lastY = ptsArr[ptsArr.length - 1][1];

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className="block h-[38px] w-full"
    >
      <defs>
        <linearGradient id={`spark-${id}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.55" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* Baseline */}
      <line
        x1="0"
        x2={W}
        y1={H - PAD_BOTTOM}
        y2={H - PAD_BOTTOM}
        stroke="rgba(255,255,255,0.06)"
        strokeWidth={1}
      />
      <path
        d={areaPath}
        fill={`url(#spark-${id})`}
      />
      <path
        d={linePath}
        fill="none"
        stroke={color}
        strokeWidth={1.4}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      {/* Peak marker */}
      <circle
        cx={peakX}
        cy={peakY}
        r={2.4}
        fill={color}
        opacity={0.9}
      />
      <circle
        cx={peakX}
        cy={peakY}
        r={4.5}
        fill={color}
        opacity={0.18}
      />
      {/* Latest marker */}
      <circle
        cx={lastX}
        cy={lastY}
        r={2}
        fill="white"
        stroke={color}
        strokeWidth={1.2}
      />
    </svg>
  );
}

function formatYmShort(ym: string | null): string {
  if (!ym) return "";
  const [y, m] = ym.split("-").map(Number);
  if (!y || !m) return ym;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[m - 1]} ${String(y).slice(-2)}`;
}
