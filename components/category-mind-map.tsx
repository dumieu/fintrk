"use client";

import {
  useState, useRef, useEffect, useCallback, useMemo,
  type ReactNode,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  TrendingUp, PiggyBank, TrendingDown,
  Pencil, Trash2, Plus, Check,
  ZoomIn, ZoomOut, Maximize2,
} from "lucide-react";
import type { FlowData, FlowType } from "@/lib/default-categories";
import { getDefaultCategories, FLOW_COLORS } from "@/lib/default-categories";
import { FINTRK_TRANSACTIONS_CHANGED } from "@/lib/notify-transactions-changed";

/* ═══════════════════════════════════ TYPES ═══════════════════════════════════ */

interface LNode {
  id: string;
  x: number;
  y: number;
  level: 0 | 1 | 2;
  label: string;
  color: string;
  flowType: FlowType;
  flowId: string;
  categoryId?: string;
  childCount: number;
  isExpanded: boolean;
  px: number;
  py: number;
  stagger: number;
  /** Level-1 only: 1 = min diameter … 3 = max, from share of flow $ total. */
  sizeScale?: number;
}

interface LConn {
  id: string;
  fromId: string;
  toId: string;
  x1: number; y1: number;
  x2: number; y2: number;
  color: string;
}

interface AddBtn {
  key: string;
  x: number; y: number;
  px: number; py: number;
  color: string;
  stagger: number;
  targetId: string;
  addLevel: 1 | 2;
}

/* ═══════════════════════════════ CONSTANTS ═══════════════════════════════════ */

/** Edge length between the three root flow centers (equilateral triangle). */
const TRI_SIDE = 200;
const TRI_SQ3 = Math.sqrt(3);
/** Centroid at (0,0): Inflow & Savings on the base, Outflow at the top. fi matches [inflow, savings, outflow]. */
const FPOS = [
  { x: -TRI_SIDE / 2, y: (TRI_SIDE * TRI_SQ3) / 6 },
  { x: TRI_SIDE / 2, y: (TRI_SIDE * TRI_SQ3) / 6 },
  { x: 0, y: (-TRI_SIDE * TRI_SQ3) / 3 },
] as const;
const CAT_R = 210;
const SIZES = [76, 54, 38] as const;

function nodeVisualSize(n: LNode): number {
  if (n.level === 1) return SIZES[1] * (n.sizeScale ?? 1);
  return SIZES[n.level];
}
/** Bisector angle for category arc (y-down coords: 0 = right, π/2 = down). */
const DIR: Record<FlowType, number> = {
  inflow: (3 * Math.PI) / 4,
  savings: Math.PI / 4,
  outflow: -Math.PI / 2,
};
const SPRING = { type: "spring" as const, stiffness: 160, damping: 20 };

/** Arc width for level-1 categories: outflow starts mostly upward, approaches full circle when crowded. */
function categorySpan(flowType: FlowType, categoryCount: number): number {
  if (flowType === "outflow") {
    const minSpan = Math.PI * 0.48;
    const maxSpan = Math.PI * 1.94;
    return Math.min(maxSpan, minSpan + categoryCount * 0.105);
  }
  return Math.min(Math.PI * 0.5, categoryCount * 0.16 + 0.26);
}

function catRingRadius(flowType: FlowType, categoryCount: number): number {
  if (flowType === "outflow")
    return CAT_R + Math.min(72, Math.max(0, categoryCount - 3) * 5);
  return CAT_R;
}

/** Slot indices 0..n-1 along the fan (left→right); result[k] = arc slot for k-th from center (0 = middle). */
function positionOrderByCenterOut(n: number): number[] {
  if (n <= 0) return [];
  const center = (n - 1) / 2;
  const idx = Array.from({ length: n }, (_, j) => j);
  idx.sort((a, b) => {
    const da = Math.abs(a - center);
    const db = Math.abs(b - center);
    if (da !== db) return da - db;
    return a - b;
  });
  return idx;
}

/** Minimum gap between element edges (~1cm at 96dpi). */
const MIN_EDGE_GAP = 40;

function level1CollisionR(sizeScale: number): number {
  const s = sizeScale;
  return (SIZES[1] / 2) * s + 28 * s;
}

function level2CollisionR(): number {
  return SIZES[2] / 2 + 36;
}

/** Distance from category center to subcategory center — clears scaled parent + gap + sub label bounds. */
function subcategoryRingDistance(parentSizeScale: number): number {
  return level1CollisionR(parentSizeScale) + MIN_EDGE_GAP + level2CollisionR();
}

/** Mass for overlap resolution — higher level-0 mass keeps roots steadier while children push. */
const BODY_MASS: Record<0 | 1 | 2, number> = { 0: 11, 1: 3.5, 2: 0.85 };

function collisionRadius(level: 0 | 1 | 2, sizeScale = 1): number {
  if (level === 1) return level1CollisionR(sizeScale);
  if (level === 2) return level2CollisionR();
  return SIZES[0] / 2 + 38;
}

/** Push nodes/add-buttons apart so bounding circles stay ≥ MIN_EDGE_GAP; heavier roots move less. */
function resolveOverlaps(nodes: LNode[], adds: AddBtn[], conns: LConn[]) {
  type Body = {
    node?: LNode;
    add?: AddBtn;
    x: number;
    y: number;
    r: number;
    mass: number;
  };

  const bodies: Body[] = nodes.map((n) => ({
    node: n,
    x: n.x,
    y: n.y,
    r: collisionRadius(n.level, n.level === 1 ? (n.sizeScale ?? 1) : 1),
    mass: BODY_MASS[n.level],
  }));

  for (const a of adds) {
    bodies.push({
      add: a,
      x: a.x,
      y: a.y,
      r: 28,
      mass: 0.4,
    });
  }

  const bn = bodies.length;
  const ITERS = 240;
  for (let iter = 0; iter < ITERS; iter++) {
    for (let i = 0; i < bn; i++) {
      for (let j = i + 1; j < bn; j++) {
        const bi = bodies[i];
        const bj = bodies[j];
        let dx = bj.x - bi.x;
        let dy = bj.y - bi.y;
        let dist = Math.hypot(dx, dy);
        const minD = bi.r + bj.r + MIN_EDGE_GAP;
        if (dist >= minD) continue;
        if (dist < 1e-6) {
          const ang = (iter * 2.513274 + i * 0.7 + j * 1.1) % (Math.PI * 2);
          dx = Math.cos(ang) * 0.02;
          dy = Math.sin(ang) * 0.02;
          dist = Math.hypot(dx, dy);
        }
        const nx = dx / dist;
        const ny = dy / dist;
        const overlap = minD - dist;
        const tm = bi.mass + bj.mass;
        bi.x -= nx * overlap * (bj.mass / tm);
        bi.y -= ny * overlap * (bj.mass / tm);
        bj.x += nx * overlap * (bi.mass / tm);
        bj.y += ny * overlap * (bi.mass / tm);
      }
    }
  }

  for (const b of bodies) {
    if (b.node) {
      b.node.x = b.x;
      b.node.y = b.y;
    } else if (b.add) {
      b.add.x = b.x;
      b.add.y = b.y;
    }
  }

  const pos = new Map(nodes.map((n) => [n.id, { x: n.x, y: n.y }] as const));
  for (const c of conns) {
    const p = pos.get(c.fromId);
    const q = pos.get(c.toId);
    if (p && q) {
      c.x1 = p.x;
      c.y1 = p.y;
      c.x2 = q.x;
      c.y2 = q.y;
    }
  }
}

function recenterOnRoots(nodes: LNode[], adds: AddBtn[], conns: LConn[]) {
  const roots = nodes.filter((n) => n.level === 0);
  if (!roots.length) return;
  let cx = 0;
  let cy = 0;
  for (const r of roots) {
    cx += r.x;
    cy += r.y;
  }
  cx /= roots.length;
  cy /= roots.length;
  for (const n of nodes) {
    n.x -= cx;
    n.y -= cy;
  }
  for (const a of adds) {
    a.x -= cx;
    a.y -= cy;
  }
  for (const c of conns) {
    c.x1 -= cx;
    c.y1 -= cy;
    c.x2 -= cx;
    c.y2 -= cy;
  }
}

/* ═══════════════════════════════ LAYOUT ══════════════════════════════════════ */

function lookupMindMapAmount(name: string, amounts: Record<string, number>): number {
  const direct = amounts[name];
  if (direct != null && !Number.isNaN(direct)) return direct;
  const lower = name.trim().toLowerCase();
  const key = Object.keys(amounts).find((k) => k.trim().toLowerCase() === lower);
  return key ? amounts[key]! : 0;
}

function calcLayout(
  flows: FlowData[],
  expF: Set<string>,
  expC: Set<string>,
  amountByName: Record<string, number>,
) {
  const nodes: LNode[] = [];
  const conns: LConn[] = [];
  const adds: AddBtn[] = [];
  let s = 0;

  flows.forEach((f, fi) => {
    const fp = FPOS[fi];
    const open = expF.has(f.id);

    nodes.push({
      id: f.id, x: fp.x, y: fp.y, level: 0, label: f.name,
      color: f.color, flowType: f.type, flowId: f.id,
      childCount: f.categories.length, isExpanded: open,
      px: fp.x, py: fp.y, stagger: s++,
    });

    if (!open) return;

    const cn = f.categories.length;
    const ca = DIR[f.type];
    const span = categorySpan(f.type, cn);
    const catR = catRingRadius(f.type, cn);

    const catAmounts = f.categories.map((c) => lookupMindMapAmount(c.name, amountByName));
    const catTotal = catAmounts.reduce((a, b) => a + b, 0);

    const sortedIdx = f.categories
      .map((_, i) => i)
      .sort((a, b) => {
        const diff = catAmounts[b] - catAmounts[a];
        if (diff !== 0) return diff;
        return f.categories[a].name.localeCompare(f.categories[b].name);
      });
    const slotByRank = positionOrderByCenterOut(cn);

    for (let k = 0; k < cn; k++) {
      const ci = sortedIdx[k];
      const cat = f.categories[ci];
      const arcPos = slotByRank[k];
      const t = cn === 1 ? 0.5 : arcPos / (cn - 1);
      const a = ca + (t - 0.5) * span;
      const cx = fp.x + Math.cos(a) * catR;
      const cy = fp.y + Math.sin(a) * catR;
      const catOpen = expC.has(cat.id);
      const share = catTotal > 0 ? catAmounts[ci] / catTotal : 0;
      const sizeScale = 1 + 2 * share;

      nodes.push({
        id: cat.id, x: cx, y: cy, level: 1, label: cat.name,
        color: f.color, flowType: f.type, flowId: f.id,
        childCount: cat.subcategories.length, isExpanded: catOpen,
        px: fp.x, py: fp.y, stagger: s++,
        sizeScale,
      });
      conns.push({
        id: `${f.id}-${cat.id}`,
        fromId: f.id,
        toId: cat.id,
        x1: fp.x, y1: fp.y, x2: cx, y2: cy, color: f.color,
      });

      if (!catOpen) continue;

      const sn = cat.subcategories.length;
      const sd = Math.atan2(cy - fp.y, cx - fp.x);
      const ss = Math.min(Math.PI * 0.98, sn * 0.36 + 0.18);
      const ring = subcategoryRingDistance(sizeScale);

      cat.subcategories.forEach((sub, si) => {
        const st = sn === 1 ? 0.5 : si / (sn - 1);
        const sa = sd + (st - 0.5) * ss;
        const sx = cx + Math.cos(sa) * ring;
        const sy = cy + Math.sin(sa) * ring;

        nodes.push({
          id: sub.id, x: sx, y: sy, level: 2, label: sub.name,
          color: f.color, flowType: f.type, flowId: f.id,
          categoryId: cat.id, childCount: 0, isExpanded: false,
          px: cx, py: cy, stagger: s++,
        });
        conns.push({
          id: `${cat.id}-${sub.id}`,
          fromId: cat.id,
          toId: sub.id,
          x1: cx, y1: cy, x2: sx, y2: sy, color: f.color,
        });
      });

      // add-subcategory button
      const tsn = sn + 1;
      const tss = Math.min(Math.PI * 0.98, tsn * 0.36 + 0.18);
      const addST = tsn <= 1 ? 0.5 : sn / (tsn - 1);
      const addSA = sd + (addST - 0.5) * tss;
      adds.push({
        key: `as-${cat.id}`, targetId: cat.id, addLevel: 2,
        x: cx + Math.cos(addSA) * ring,
        y: cy + Math.sin(addSA) * ring,
        px: cx, py: cy, color: f.color, stagger: s++,
      });
    }

    // add-category button
    const tcn = cn + 1;
    const tspan = categorySpan(f.type, tcn);
    const addCT = tcn <= 1 ? 0.5 : cn / (tcn - 1);
    const addCA = ca + (addCT - 0.5) * tspan;
    adds.push({
      key: `ac-${f.id}`, targetId: f.id, addLevel: 1,
      x: fp.x + Math.cos(addCA) * catR,
      y: fp.y + Math.sin(addCA) * catR,
      px: fp.x, py: fp.y, color: f.color, stagger: s++,
    });
  });

  resolveOverlaps(nodes, adds, conns);
  resolveOverlaps(nodes, adds, conns);
  resolveOverlaps(nodes, adds, conns);
  recenterOnRoots(nodes, adds, conns);

  return { nodes, conns, adds };
}

/* ═══════════════════════════ BACKGROUND PARTICLES ════════════════════════════ */

function seeded(i: number, offset: number) {
  const x = Math.sin(i * 127.1 + offset * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function BackgroundParticles() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  if (!mounted) return <div className="absolute inset-0 overflow-hidden pointer-events-none" />;

  const stars = Array.from({ length: 130 }, (_, i) => ({
    i,
    x: seeded(i, 0) * 100,
    y: seeded(i, 1) * 100,
    s: seeded(i, 2) * 2.2 + 0.4,
    o: seeded(i, 3) * 0.5 + 0.08,
    d: seeded(i, 4) * 28 + 14,
    dl: -(seeded(i, 5) * 28),
  }));

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {Object.values(FLOW_COLORS).map((c, i) => (
        <div
          key={i}
          className="absolute rounded-full mm-nebula"
          style={{
            left: `${25 + i * 25}%`,
            top: "32%",
            width: 520,
            height: 520,
            background: `radial-gradient(circle, ${c}16 0%, ${c}06 35%, transparent 70%)`,
            filter: "blur(90px)",
            transform: "translate(-50%,-50%)",
            animationDelay: `${i * -9}s`,
          }}
        />
      ))}
      {stars.map((p) => (
        <div
          key={p.i}
          className="absolute rounded-full bg-white mm-star"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: p.s,
            height: p.s,
            opacity: p.o,
            animationDuration: `${p.d}s`,
            animationDelay: `${p.dl}s`,
          }}
        />
      ))}
    </div>
  );
}

/* ═══════════════════════════════ CONNECTION ══════════════════════════════════ */

function ConnLine({ c }: { c: LConn }) {
  const mx = (c.x1 + c.x2) / 2;
  const my = c.y1 + (c.y2 - c.y1) * 0.6;
  const d = `M${c.x1},${c.y1} Q${mx},${my} ${c.x2},${c.y2}`;
  const gid = `g${c.id.replace(/[^a-z0-9]/gi, "")}`;

  return (
    <g>
      <defs>
        <linearGradient
          id={gid}
          x1={c.x1} y1={c.y1} x2={c.x2} y2={c.y2}
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor={c.color} stopOpacity={0.55} />
          <stop offset="100%" stopColor={c.color} stopOpacity={0.15} />
        </linearGradient>
      </defs>
      <path d={d} stroke={c.color} strokeWidth={5} fill="none" opacity={0.06} />
      <path d={d} stroke={`url(#${gid})`} strokeWidth={1.5} fill="none" className="mm-conn" />
    </g>
  );
}

/* ════════════════════════════════ NODE ═══════════════════════════════════════ */

const FLOW_ICON: Record<FlowType, ReactNode> = {
  inflow: <TrendingUp className="w-7 h-7" />,
  savings: <PiggyBank className="w-7 h-7" />,
  outflow: <TrendingDown className="w-7 h-7" />,
};

function MNode({
  n,
  sel,
  onTap,
}: {
  n: LNode;
  sel: boolean;
  onTap: (id: string, level: number) => void;
}) {
  const size = nodeVisualSize(n);

  const glow = sel
    ? `0 0 28px ${n.color}70, 0 0 60px ${n.color}30, inset 0 0 18px ${n.color}18`
    : n.level === 0
      ? `0 0 22px ${n.color}35, 0 0 50px ${n.color}14, inset 0 0 14px ${n.color}10`
      : n.level === 1
        ? `0 0 16px ${n.color}28, 0 0 38px ${n.color}0c`
        : `0 0 10px ${n.color}20`;

  const border = sel
    ? `2px solid ${n.color}`
    : `${n.level === 0 ? 2 : n.level === 1 ? 1.5 : 1}px solid ${n.color}${n.level === 0 ? "55" : n.level === 1 ? "38" : "28"}`;

  return (
    <motion.div
      className="absolute left-0 top-0 z-10"
      initial={{ x: n.px, y: n.py, scale: 0, opacity: 0 }}
      animate={{ x: n.x, y: n.y, scale: 1, opacity: 1 }}
      exit={{ x: n.px, y: n.py, scale: 0, opacity: 0 }}
      transition={{ ...SPRING, delay: n.stagger * 0.032, opacity: { duration: 0.25 } }}
    >
      <motion.div
        className="flex flex-col items-center cursor-pointer select-none"
        style={{ marginLeft: -size / 2, marginTop: -size / 2 }}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.92 }}
        onClick={(e) => { e.stopPropagation(); onTap(n.id, n.level); }}
        data-mm-node
      >
        <div
          className="flex items-center justify-center rounded-full mm-breathe"
          style={{
            width: size,
            height: size,
            background: `radial-gradient(circle at 32% 28%, rgba(255,255,255,0.1), transparent 55%), radial-gradient(circle, ${n.color}${n.level === 0 ? "22" : "14"}, ${n.color}06)`,
            border,
            boxShadow: glow,
            backdropFilter: "blur(10px)",
            animationDelay: `${-((n.stagger * 1.7) % 8)}s`,
          }}
        >
          {n.level === 0 && (
            <span style={{ color: n.color }}>{FLOW_ICON[n.flowType]}</span>
          )}
          {n.level === 1 && (
            <span
              className="font-bold tabular-nums leading-none"
              style={{
                color: n.color,
                fontSize: `${Math.round(11 * Math.min(n.sizeScale ?? 1, 2.2))}px`,
              }}
            >
              {n.childCount}
            </span>
          )}
          {n.level === 2 && (
            <div
              className="w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: `${n.color}70` }}
            />
          )}
        </div>
        <span
          className="mt-1.5 text-center leading-tight max-w-[105px]"
          style={{
            fontSize: n.level === 0 ? 13 : n.level === 1 ? 11 : 10,
            fontWeight: n.level < 2 ? 600 : 400,
            color: n.level === 0 ? n.color : n.level === 1 ? "#cbd5e1" : "#94a3b8",
            textShadow: "0 1px 6px rgba(0,0,0,0.7)",
          }}
        >
          {n.label}
        </span>
      </motion.div>
    </motion.div>
  );
}

/* ═══════════════════════════ ACTION BUTTONS ══════════════════════════════════ */

function Actions({
  n,
  zoom,
  panX,
  panY,
  cx,
  cy,
  onEdit,
  onAdd,
  onDel,
}: {
  n: LNode;
  zoom: number;
  panX: number;
  panY: number;
  cx: number;
  cy: number;
  onEdit: () => void;
  onAdd?: () => void;
  onDel: () => void;
}) {
  const sx = n.x * zoom + panX + cx;
  const sy = n.y * zoom + panY + cy;
  const ns = nodeVisualSize(n) * zoom;
  const bc =
    "flex items-center justify-center w-9 h-9 rounded-full backdrop-blur-md cursor-pointer transition-all duration-200 hover:scale-115 active:scale-90";

  return (
    <motion.div
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0, opacity: 0 }}
      transition={{ type: "spring", stiffness: 340, damping: 22 }}
      className="absolute z-[60] flex gap-2"
      style={{ left: sx, top: sy - ns / 2 - 48, transform: "translateX(-50%)" }}
      data-mm-actions
    >
      <button
        type="button"
        className={bc}
        style={{ background: `${n.color}28`, border: `1px solid ${n.color}45` }}
        onClick={(e) => { e.stopPropagation(); onEdit(); }}
      >
        <Pencil className="w-3.5 h-3.5" style={{ color: n.color }} />
      </button>
      {onAdd && (
        <button
          type="button"
          className={bc}
          style={{ background: `${n.color}28`, border: `1px solid ${n.color}45` }}
          onClick={(e) => { e.stopPropagation(); onAdd(); }}
        >
          <Plus className="w-3.5 h-3.5" style={{ color: n.color }} />
        </button>
      )}
      <button
        type="button"
        className={bc}
        style={{ background: "rgba(248,70,70,0.18)", border: "1px solid rgba(248,70,70,0.35)" }}
        onClick={(e) => { e.stopPropagation(); onDel(); }}
      >
        <Trash2 className="w-3.5 h-3.5 text-red-400" />
      </button>
    </motion.div>
  );
}

/* ══════════════════════════ ADD CIRCLE BUTTON ════════════════════════════════ */

function AddCircle({
  b,
  onClick,
}: {
  b: AddBtn;
  onClick: (targetId: string, level: 1 | 2) => void;
}) {
  return (
    <motion.div
      className="absolute left-0 top-0 z-10"
      initial={{ x: b.px, y: b.py, scale: 0, opacity: 0 }}
      animate={{ x: b.x, y: b.y, scale: 1, opacity: 1 }}
      exit={{ x: b.px, y: b.py, scale: 0, opacity: 0 }}
      transition={{ ...SPRING, delay: b.stagger * 0.032, opacity: { duration: 0.2 } }}
    >
      <motion.div
        className="flex flex-col items-center cursor-pointer select-none"
        style={{ marginLeft: -22, marginTop: -22 }}
        whileHover={{ scale: 1.18 }}
        whileTap={{ scale: 0.88 }}
        onClick={(e) => { e.stopPropagation(); onClick(b.targetId, b.addLevel); }}
        data-mm-node
      >
        <div
          className="flex items-center justify-center w-11 h-11 rounded-full"
          style={{
            border: `1.5px dashed ${b.color}45`,
            background: `${b.color}08`,
            boxShadow: `0 0 14px ${b.color}12`,
          }}
        >
          <Plus className="w-4 h-4" style={{ color: `${b.color}80` }} />
        </div>
        <span
          className="mt-1 text-[9px]"
          style={{ color: `${b.color}60` }}
        >
          Add
        </span>
      </motion.div>
    </motion.div>
  );
}

/* ══════════════════════════════ MODALS ═══════════════════════════════════════ */

function Modal({
  title,
  init,
  color,
  onSave,
  onClose,
}: {
  title: string;
  init: string;
  color: string;
  onSave: (v: string) => void;
  onClose: () => void;
}) {
  const [val, setVal] = useState(init);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { setTimeout(() => ref.current?.focus(), 80); }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      data-mm-modal
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.8, opacity: 0, y: 24 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.8, opacity: 0, y: 24 }}
        transition={{ type: "spring", stiffness: 320, damping: 26 }}
        className="w-[340px] rounded-2xl p-6"
        style={{
          background: "rgba(12,12,28,0.96)",
          border: `1px solid ${color}30`,
          boxShadow: `0 0 50px ${color}12, 0 30px 60px rgba(0,0,0,0.55)`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-sm font-semibold mb-4" style={{ color }}>
          {title}
        </h3>
        <input
          ref={ref}
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && val.trim()) onSave(val.trim());
            if (e.key === "Escape") onClose();
          }}
          className="w-full rounded-lg px-3 py-2.5 text-sm bg-white/[0.04] text-white/90 outline-none transition-colors focus:bg-white/[0.07]"
          style={{ border: `1px solid ${color}28` }}
          placeholder="Enter name…"
        />
        <div className="flex justify-end gap-2 mt-5">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium rounded-lg text-white/50 hover:text-white/80 hover:bg-white/5 transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={() => val.trim() && onSave(val.trim())}
            disabled={!val.trim()}
            className="px-4 py-2 text-xs font-semibold rounded-lg text-white transition-all cursor-pointer disabled:opacity-25"
            style={{ background: `${color}35`, border: `1px solid ${color}45` }}
          >
            <Check className="w-3.5 h-3.5 inline mr-1 -mt-0.5" />
            Save
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function ConfirmDelete({
  label,
  color,
  hasChildren,
  onConfirm,
  onClose,
}: {
  label: string;
  color: string;
  hasChildren: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      data-mm-modal
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.8, opacity: 0 }}
        transition={{ type: "spring", stiffness: 320, damping: 26 }}
        className="w-[320px] rounded-2xl p-6"
        style={{
          background: "rgba(12,12,28,0.96)",
          border: "1px solid rgba(248,70,70,0.25)",
          boxShadow: "0 0 50px rgba(248,70,70,0.08), 0 30px 60px rgba(0,0,0,0.55)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-sm font-semibold text-red-400 mb-2">
          Delete &ldquo;{label}&rdquo;?
        </h3>
        <p className="text-xs text-white/40 mb-5">
          {hasChildren
            ? "This will remove it and all its subcategories."
            : "This action cannot be undone."}
        </p>
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium rounded-lg text-white/50 hover:text-white/80 hover:bg-white/5 cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 text-xs font-semibold rounded-lg bg-red-500/25 text-red-300 border border-red-500/35 hover:bg-red-500/40 cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5 inline mr-1 -mt-0.5" />
            Delete
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ═══════════════════════════ MAIN COMPONENT ══════════════════════════════════ */

export function CategoryMindMap() {
  const containerRef = useRef<HTMLDivElement>(null);

  // ── Data ──
  const [flows, setFlows] = useState<FlowData[]>(getDefaultCategories);
  const hydratedLS = useRef(false);

  useEffect(() => {
    if (hydratedLS.current) {
      localStorage.setItem("fintrk-cat-map", JSON.stringify(flows));
      return;
    }
    hydratedLS.current = true;
    try {
      const raw = localStorage.getItem("fintrk-cat-map");
      if (raw) {
        const parsed = JSON.parse(raw) as FlowData[];
        if (Array.isArray(parsed) && parsed.length) setFlows(parsed);
      }
    } catch { /* ignore */ }
  }, [flows]);

  // ── Expand / select ──
  const [expF, setExpF] = useState<Set<string>>(
    () => new Set(flows.map((f) => f.id)),
  );
  const [expC, setExpC] = useState<Set<string>>(new Set());
  const [selId, setSelId] = useState<string | null>(null);

  // ── Viewport ──
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(0.75);

  const panning = useRef(false);
  const panO = useRef({ x: 0, y: 0, px: 0, py: 0 });
  const lastPinch = useRef<number | null>(null);

  // ── Modals ──
  const [editM, setEditM] = useState<{
    id: string; level: 1 | 2; flowId: string; catId?: string;
    name: string; color: string;
  } | null>(null);
  const [addM, setAddM] = useState<{
    level: 1 | 2; parentId: string; flowId: string; color: string;
  } | null>(null);
  const [delM, setDelM] = useState<{
    id: string; level: 1 | 2; flowId: string; catId?: string;
    label: string; color: string; hasChildren: boolean;
  } | null>(null);

  const [categoryAmounts, setCategoryAmounts] = useState<Record<string, number>>({});

  useEffect(() => {
    let cancelled = false;
    const loadAmounts = () => {
      fetch("/api/categories/amounts")
        .then((r) => (r.ok ? r.json() : Promise.resolve({ amounts: {} })))
        .then((data: { amounts?: Record<string, number> }) => {
          if (cancelled) return;
          setCategoryAmounts(data.amounts ?? {});
        })
        .catch(() => {
          if (!cancelled) setCategoryAmounts({});
        });
    };

    loadAmounts();
    const onTxnChanged = () => loadAmounts();
    const onVisible = () => {
      if (document.visibilityState === "visible") loadAmounts();
    };
    window.addEventListener("focus", loadAmounts);
    window.addEventListener(FINTRK_TRANSACTIONS_CHANGED, onTxnChanged);
    document.addEventListener("visibilitychange", onVisible);
    const interval = window.setInterval(loadAmounts, 45_000);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", loadAmounts);
      window.removeEventListener(FINTRK_TRANSACTIONS_CHANGED, onTxnChanged);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(interval);
    };
  }, []);

  // ── Resize (also sets initial zoom) ──
  const didInit = useRef(false);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = (entries: ResizeObserverEntry[]) => {
      const r = entries[0].contentRect;
      setSize({ w: r.width, h: r.height });
      if (!didInit.current) {
        didInit.current = true;
        setZoom(Math.max(0.35, Math.min(0.9, r.width / 1350)));
      }
    };
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ── Wheel zoom (non-passive) ──
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setZoom((z) => Math.max(0.2, Math.min(2.8, z - e.deltaY * 0.0012)));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // ── Pinch zoom ──
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onTM = (e: TouchEvent) => {
      if (e.touches.length !== 2) return;
      e.preventDefault();
      const d = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY,
      );
      if (lastPinch.current !== null) {
        const r = d / lastPinch.current;
        setZoom((z) => Math.max(0.2, Math.min(2.8, z * r)));
      }
      lastPinch.current = d;
    };
    const onTE = () => { lastPinch.current = null; };
    el.addEventListener("touchmove", onTM, { passive: false });
    el.addEventListener("touchend", onTE);
    return () => {
      el.removeEventListener("touchmove", onTM);
      el.removeEventListener("touchend", onTE);
    };
  }, []);

  // ── Layout ──
  const { nodes, conns, adds } = useMemo(
    () => calcLayout(flows, expF, expC, categoryAmounts),
    [flows, expF, expC, categoryAmounts],
  );

  const cX = size.w / 2;
  const cY = size.h * 0.3;
  const ready = size.w > 0;
  const selNode = nodes.find((n) => n.id === selId) ?? null;

  // ── Handlers ──
  const onTap = useCallback(
    (id: string, level: number) => {
      setSelId((prev) => (prev === id ? null : id));
      if (level === 0) {
        setExpF((p) => {
          const n = new Set(p);
          n.has(id) ? n.delete(id) : n.add(id);
          return n;
        });
      } else if (level === 1) {
        setExpC((p) => {
          const n = new Set(p);
          n.has(id) ? n.delete(id) : n.add(id);
          return n;
        });
      }
    },
    [],
  );

  const onAddClick = useCallback(
    (targetId: string, level: 1 | 2) => {
      const flow = flows.find(
        (f) =>
          f.id === targetId ||
          f.categories.some(
            (c) => c.id === targetId,
          ),
      );
      if (!flow) return;
      setAddM({ level, parentId: targetId, flowId: flow.id, color: flow.color });
    },
    [flows],
  );

  // ── CRUD ──
  const doRename = useCallback(
    (newName: string) => {
      if (!editM) return;
      setFlows((prev) =>
        prev.map((f) => {
          if (f.id !== editM.flowId) return f;
          if (editM.level === 1)
            return {
              ...f,
              categories: f.categories.map((c) =>
                c.id === editM.id ? { ...c, name: newName } : c,
              ),
            };
          return {
            ...f,
            categories: f.categories.map((c) =>
              c.id === editM.catId
                ? {
                    ...c,
                    subcategories: c.subcategories.map((s) =>
                      s.id === editM.id ? { ...s, name: newName } : s,
                    ),
                  }
                : c,
            ),
          };
        }),
      );
      setEditM(null);
    },
    [editM],
  );

  const doAdd = useCallback(
    (name: string) => {
      if (!addM) return;
      const nid = `n${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      setFlows((prev) =>
        prev.map((f) => {
          if (f.id !== addM.flowId) return f;
          if (addM.level === 1)
            return {
              ...f,
              categories: [
                ...f.categories,
                { id: nid, name, subcategories: [] },
              ],
            };
          return {
            ...f,
            categories: f.categories.map((c) =>
              c.id === addM.parentId
                ? { ...c, subcategories: [...c.subcategories, { id: nid, name }] }
                : c,
            ),
          };
        }),
      );
      if (addM.level === 1) setExpF((p) => new Set(p).add(addM.flowId));
      if (addM.level === 2) setExpC((p) => new Set(p).add(addM.parentId));
      setAddM(null);
    },
    [addM],
  );

  const doDel = useCallback(() => {
    if (!delM) return;
    setFlows((prev) =>
      prev.map((f) => {
        if (f.id !== delM.flowId) return f;
        if (delM.level === 1)
          return {
            ...f,
            categories: f.categories.filter((c) => c.id !== delM.id),
          };
        return {
          ...f,
          categories: f.categories.map((c) =>
            c.id === delM.catId
              ? { ...c, subcategories: c.subcategories.filter((s) => s.id !== delM.id) }
              : c,
          ),
        };
      }),
    );
    setSelId(null);
    setDelM(null);
  }, [delM]);

  // ── Pan handlers ──
  const onPtrDown = useCallback(
    (e: React.PointerEvent) => {
      const t = e.target as HTMLElement;
      if (
        t.closest("[data-mm-node]") ||
        t.closest("[data-mm-modal]") ||
        t.closest("[data-mm-actions]")
      )
        return;
      panning.current = true;
      panO.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    [pan],
  );
  const onPtrMove = useCallback((e: React.PointerEvent) => {
    if (!panning.current) return;
    setPan({
      x: panO.current.px + (e.clientX - panO.current.x),
      y: panO.current.py + (e.clientY - panO.current.y),
    });
  }, []);
  const onPtrUp = useCallback(() => { panning.current = false; }, []);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-[calc(100dvh-56px)] overflow-hidden select-none touch-none"
      style={{ background: "radial-gradient(ellipse at 50% 18%, #0e1020, #060610)" }}
      onPointerDown={onPtrDown}
      onPointerMove={onPtrMove}
      onPointerUp={onPtrUp}
      onClick={() => setSelId(null)}
    >
      <BackgroundParticles />

      {/* ── Zoom controls ── */}
      <div className="absolute top-3 right-3 z-50 flex flex-col gap-1.5">
        {[
          { icon: <ZoomIn className="w-4 h-4" />, fn: () => setZoom((z) => Math.min(2.8, z + 0.18)) },
          { icon: <ZoomOut className="w-4 h-4" />, fn: () => setZoom((z) => Math.max(0.2, z - 0.18)) },
          { icon: <Maximize2 className="w-4 h-4" />, fn: () => { setZoom(Math.max(0.38, Math.min(0.88, size.w / 1350))); setPan({ x: 0, y: 0 }); } },
        ].map((b, i) => (
          <button
            key={i}
            onClick={b.fn}
            className="w-9 h-9 rounded-xl bg-white/[0.04] backdrop-blur-md border border-white/[0.08] flex items-center justify-center text-white/50 hover:text-white hover:bg-white/[0.08] transition-all cursor-pointer"
          >
            {b.icon}
          </button>
        ))}
      </div>

      {/* ── World ── */}
      {ready && <div
        className="absolute inset-0"
        style={{
          transform: `translate(${pan.x + cX}px, ${pan.y + cY}px) scale(${zoom})`,
          transformOrigin: "0 0",
          willChange: "transform",
        }}
      >
        {/* SVG connections */}
        <svg
          className="absolute overflow-visible pointer-events-none"
          style={{ width: 1, height: 1 }}
        >
          <AnimatePresence>
            {conns.map((c) => (
              <motion.g
                key={c.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.35 }}
              >
                <ConnLine c={c} />
              </motion.g>
            ))}
          </AnimatePresence>
        </svg>

        {/* Nodes */}
        <AnimatePresence>
          {nodes.map((n) => (
            <MNode key={n.id} n={n} sel={selId === n.id} onTap={onTap} />
          ))}
          {adds.map((b) => (
            <AddCircle key={b.key} b={b} onClick={onAddClick} />
          ))}
        </AnimatePresence>
      </div>}

      {/* ── Action bar (screen space) ── */}
      <AnimatePresence>
        {selNode && selNode.level > 0 && (
          <Actions
            key={`act-${selNode.id}`}
            n={selNode}
            zoom={zoom}
            panX={pan.x}
            panY={pan.y}
            cx={cX}
            cy={cY}
            onEdit={() =>
              setEditM({
                id: selNode.id,
                level: selNode.level as 1 | 2,
                flowId: selNode.flowId,
                catId: selNode.categoryId,
                name: selNode.label,
                color: selNode.color,
              })
            }
            onAdd={
              selNode.level === 1
                ? () =>
                    setAddM({
                      level: 2,
                      parentId: selNode.id,
                      flowId: selNode.flowId,
                      color: selNode.color,
                    })
                : undefined
            }
            onDel={() =>
              setDelM({
                id: selNode.id,
                level: selNode.level as 1 | 2,
                flowId: selNode.flowId,
                catId: selNode.categoryId,
                label: selNode.label,
                color: selNode.color,
                hasChildren: selNode.level === 1 && selNode.childCount > 0,
              })
            }
          />
        )}
      </AnimatePresence>

      {/* ── Modals ── */}
      <AnimatePresence>
        {editM && (
          <Modal
            key="edit"
            title={`Rename ${editM.level === 1 ? "Category" : "Subcategory"}`}
            init={editM.name}
            color={editM.color}
            onSave={doRename}
            onClose={() => setEditM(null)}
          />
        )}
        {addM && (
          <Modal
            key="add"
            title={`New ${addM.level === 1 ? "Category" : "Subcategory"}`}
            init=""
            color={addM.color}
            onSave={doAdd}
            onClose={() => setAddM(null)}
          />
        )}
        {delM && (
          <ConfirmDelete
            key="del"
            label={delM.label}
            color={delM.color}
            hasChildren={delM.hasChildren}
            onConfirm={doDel}
            onClose={() => setDelM(null)}
          />
        )}
      </AnimatePresence>

      {/* ── Legend ── */}
      <div className="absolute bottom-3 left-3 z-50 flex flex-wrap items-center gap-x-4 gap-y-1">
        {flows.map((f) => (
          <div key={f.id} className="flex items-center gap-1.5">
            <div
              className="w-2.5 h-2.5 rounded-full"
              style={{
                backgroundColor: f.color,
                boxShadow: `0 0 7px ${f.color}55`,
              }}
            />
            <span className="text-[10px] font-medium text-white/40">
              {f.name}
            </span>
          </div>
        ))}
      </div>

      {/* ── Hint ── */}
      <motion.p
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.8 }}
        className="absolute bottom-3 right-3 z-50 text-[10px] text-white/20 text-right"
      >
        Scroll to zoom · Drag to pan · Tap to explore
      </motion.p>
    </div>
  );
}
