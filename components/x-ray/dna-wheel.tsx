"use client";

import { useEffect, useMemo, useRef, useState } from "react";

interface SubcatNode {
  id: number;
  name: string;
  total: number;
  count: number;
  monthlyMean: number;
  topMerchants: { name: string; total: number; count: number }[];
  flowType: string;
  discretionary: string | null;
}
interface ParentNode {
  id: number;
  name: string;
  color: string;
  total: number;
  count: number;
  share: number;
  subcategories: SubcatNode[];
}

interface DnaWheelProps {
  parents: ParentNode[];
  monthly: { month: string; total: number; byParent: Record<string, number> }[];
  currency: string;
  archetypeName: string;
  archetypeBlurb: string;
  monthlyOutflow: number;
  monthsCovered: number;
}

interface PetalGeo {
  parent: ParentNode;
  sub: SubcatNode;
  startAngle: number;
  endAngle: number;
  innerR: number;
  outerR: number;
}

/* ────────────────────────────────────────────────────────────────────────── *
 * DNA Wheel — your spending fingerprint.
 *
 * Layout:
 *  - Outer ring of "petals", one per subcategory.
 *  - Each petal: angular width ∝ share-of-outflow, radial length ∝ share-of-parent.
 *  - Petals grouped by parent category (same hue, same arc).
 *  - Concentric monthly rings (one ring per month) showing parent share evolution.
 *  - Center disc with archetype + monthly outflow + hover detail.
 *  - Continuous breathing animation (radius pulse) keyed off the user's
 *    real monthly cadence so the wheel feels alive without being noisy.
 * ────────────────────────────────────────────────────────────────────────── */
export function DnaWheel({
  parents,
  monthly,
  currency,
  archetypeName,
  monthlyOutflow,
  monthsCovered,
}: DnaWheelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<PetalGeo | null>(null);
  const [size, setSize] = useState(620);

  const fmt = useMemo(
    () => new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }),
    [currency],
  );

  const totalOutflow = useMemo(
    () => parents.reduce((s, p) => s + p.total, 0),
    [parents],
  );

  // Pre-compute petal geometry once per data change.
  const petals = useMemo<PetalGeo[]>(() => {
    if (!parents.length) return [];
    const list: PetalGeo[] = [];
    const totalShare = parents.reduce(
      (s, p) => s + p.subcategories.reduce((ss, x) => ss + x.total, 0),
      0,
    );
    if (totalShare <= 0) return [];

    let angle = -Math.PI / 2; // start at top (12 o'clock)
    const PADDING = 0.012; // small gap between parent groups
    for (const p of parents) {
      const parentArc = (p.total / totalShare) * (Math.PI * 2 - parents.length * PADDING);
      // Subcat angular slices proportional to subcat share within the parent
      const parentSubTotal = p.subcategories.reduce((s, x) => s + x.total, 0) || 1;
      let subAngle = angle;
      // Largest subcat in parent → reference for radius normalisation
      const maxSub = Math.max(...p.subcategories.map((s) => s.total), 1);
      for (const sub of p.subcategories) {
        const subArc = (sub.total / parentSubTotal) * parentArc;
        // radial length: 0.55..1.0 of available outer band, log-scaled
        const norm = Math.pow(sub.total / maxSub, 0.55);
        const innerR = 0.62; // inner band starts after the monthly rings
        const outerR = innerR + 0.34 * Math.max(0.18, norm);
        list.push({
          parent: p,
          sub,
          startAngle: subAngle,
          endAngle: subAngle + subArc,
          innerR,
          outerR,
        });
        subAngle += subArc;
      }
      angle += parentArc + PADDING;
    }
    return list;
  }, [parents]);

  /* Resize observer keeps canvas square inside its parent. */
  useEffect(() => {
    if (!wrapRef.current) return;
    const el = wrapRef.current;
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth;
      const next = Math.max(320, Math.min(820, w));
      setSize(next);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* Render loop. */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(size * dpr);
    canvas.height = Math.floor(size * dpr);
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    let raf = 0;
    let destroyed = false;
    const start = performance.now();

    const cx = size / 2;
    const cy = size / 2;
    const R = size / 2 - 6;

    const monthRingMax = Math.min(12, monthly.length);
    const monthsToShow = monthly.slice(-monthRingMax);
    const monthRingInner = R * 0.18;
    const monthRingOuter = R * 0.6;

    function renderFrame(now: number) {
      if (destroyed || !ctx) return;
      const t = (now - start) / 1000;

      ctx.clearRect(0, 0, size, size);

      // Background vignette
      const bg = ctx.createRadialGradient(cx, cy, R * 0.05, cx, cy, R);
      bg.addColorStop(0, "rgba(11, 193, 141, 0.07)");
      bg.addColorStop(0.6, "rgba(44, 162, 255, 0.04)");
      bg.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = bg;
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.fill();

      // Concentric month rings (chromatogram-of-time).
      for (let mi = 0; mi < monthsToShow.length; mi++) {
        const m = monthsToShow[mi];
        const ringT = mi / Math.max(1, monthsToShow.length - 1);
        const r = monthRingInner + (monthRingOuter - monthRingInner) * ringT;
        const ringWidth = (monthRingOuter - monthRingInner) / Math.max(1, monthsToShow.length) * 0.72;

        // Sweep around the ring assigning each parent its share-arc for this month.
        let a = -Math.PI / 2;
        const monthTotal = m.total || 1;
        for (const p of parents) {
          const v = m.byParent[p.name] ?? 0;
          if (v <= 0) continue;
          const arc = (v / monthTotal) * Math.PI * 2;
          ctx.strokeStyle = hexToRgba(p.color, 0.55);
          ctx.lineWidth = ringWidth;
          ctx.lineCap = "butt";
          ctx.beginPath();
          ctx.arc(cx, cy, r, a, a + arc);
          ctx.stroke();
          a += arc;
        }
      }

      // Soft inner pulse (heartbeat)
      const pulse = 1 + Math.sin(t * 1.6) * 0.02;
      const innerGlow = ctx.createRadialGradient(cx, cy, 4, cx, cy, monthRingInner * pulse);
      innerGlow.addColorStop(0, "rgba(11, 193, 141, 0.5)");
      innerGlow.addColorStop(0.6, "rgba(11, 193, 141, 0.15)");
      innerGlow.addColorStop(1, "rgba(11, 193, 141, 0)");
      ctx.fillStyle = innerGlow;
      ctx.beginPath();
      ctx.arc(cx, cy, monthRingInner * pulse, 0, Math.PI * 2);
      ctx.fill();

      // Petals (subcategories)
      for (const pet of petals) {
        const isHover = hover && hover.sub.id === pet.sub.id;
        const isParentHover = hover && hover.parent.id === pet.parent.id && !isHover;
        const innerR = pet.innerR * R;
        const outerR = pet.outerR * R * (isHover ? 1.06 : 1);

        const grad = ctx.createRadialGradient(cx, cy, innerR, cx, cy, outerR);
        grad.addColorStop(0, hexToRgba(pet.parent.color, isHover ? 0.95 : isParentHover ? 0.7 : 0.45));
        grad.addColorStop(1, hexToRgba(pet.parent.color, isHover ? 0.45 : 0.1));
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx, cy, outerR, pet.startAngle, pet.endAngle);
        ctx.arc(cx, cy, innerR, pet.endAngle, pet.startAngle, true);
        ctx.closePath();
        ctx.fill();

        if (isHover) {
          ctx.strokeStyle = hexToRgba(pet.parent.color, 1);
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      }

      // Parent labels around the outside
      ctx.font = "600 11px ui-sans-serif, system-ui, -apple-system, Segoe UI";
      ctx.textBaseline = "middle";
      ctx.textAlign = "center";
      let cursor = -Math.PI / 2;
      const PADDING = 0.012;
      const totalShare = parents.reduce(
        (s, p) => s + p.subcategories.reduce((ss, x) => ss + x.total, 0),
        0,
      ) || 1;
      for (const p of parents) {
        const arc = (p.total / totalShare) * (Math.PI * 2 - parents.length * PADDING);
        const mid = cursor + arc / 2;
        const r = R * 0.99;
        const x = cx + Math.cos(mid) * r;
        const y = cy + Math.sin(mid) * r;
        ctx.fillStyle = hexToRgba(p.color, 0.9);
        if (arc > 0.18) {
          // Only draw if there's space
          ctx.save();
          ctx.translate(x, y);
          let rot = mid + Math.PI / 2;
          if (mid > 0 && mid < Math.PI) rot = mid - Math.PI / 2;
          ctx.rotate(rot);
          ctx.fillText(p.name.toUpperCase(), 0, 0);
          ctx.restore();
        }
        cursor += arc + PADDING;
      }

      // Center text — archetype + monthly outflow
      ctx.fillStyle = "rgba(255,255,255,0.92)";
      ctx.font = "700 13px ui-sans-serif, system-ui";
      ctx.textBaseline = "alphabetic";
      ctx.textAlign = "center";
      ctx.fillText(archetypeName.toUpperCase(), cx, cy - 14);
      ctx.font = "800 26px ui-sans-serif, system-ui";
      ctx.fillStyle = "#0BC18D";
      ctx.fillText(fmt.format(Math.round(monthlyOutflow)), cx, cy + 18);
      ctx.font = "500 10.5px ui-sans-serif, system-ui";
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.fillText(`avg ${monthsCovered}-mo monthly outflow`, cx, cy + 36);

      raf = requestAnimationFrame(renderFrame);
    }
    raf = requestAnimationFrame(renderFrame);
    return () => {
      destroyed = true;
      cancelAnimationFrame(raf);
    };
  }, [size, petals, parents, monthly, hover, archetypeName, monthlyOutflow, monthsCovered, fmt]);

  /* Hit testing for hover */
  function handleMove(e: React.MouseEvent<HTMLCanvasElement>) {
    const c = canvasRef.current;
    if (!c) return;
    const rect = c.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const cx = size / 2;
    const cy = size / 2;
    const R = size / 2 - 6;
    const dx = x - cx;
    const dy = y - cy;
    const dist = Math.sqrt(dx * dx + dy * dy) / R;
    const ang = Math.atan2(dy, dx);
    const hit = petals.find(
      (p) =>
        dist >= p.innerR &&
        dist <= p.outerR &&
        angleInArc(ang, p.startAngle, p.endAngle),
    );
    setHover(hit ?? null);
  }

  return (
    <div ref={wrapRef} className="relative w-full">
      <canvas
        ref={canvasRef}
        onMouseMove={handleMove}
        onMouseLeave={() => setHover(null)}
        className="mx-auto block cursor-crosshair"
        aria-label="Spending DNA wheel"
      />

      {/* Hover tooltip */}
      {hover && (
        <div
          className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 rounded-xl border border-white/10 bg-black/70 px-4 py-3 text-xs text-white shadow-2xl backdrop-blur-md"
          style={{ minWidth: 240 }}
        >
          <div className="flex items-center gap-2">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: hover.parent.color }}
            />
            <span className="text-white/60">{hover.parent.name}</span>
          </div>
          <div className="mt-0.5 text-base font-bold">{hover.sub.name}</div>
          <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-0.5">
            <span className="text-white/55">Total</span>
            <span className="text-right font-semibold">{fmt.format(Math.round(hover.sub.total))}</span>
            <span className="text-white/55">Monthly mean</span>
            <span className="text-right font-semibold">{fmt.format(Math.round(hover.sub.monthlyMean))}</span>
            <span className="text-white/55">Charges</span>
            <span className="text-right font-semibold">{hover.sub.count}</span>
            {hover.sub.discretionary && (
              <>
                <span className="text-white/55">Type</span>
                <span className="text-right font-semibold capitalize">{hover.sub.discretionary}</span>
              </>
            )}
          </div>
          {hover.sub.topMerchants.length > 0 && (
            <div className="mt-2 border-t border-white/10 pt-2">
              <div className="mb-1 text-[10px] uppercase tracking-wider text-white/50">Top merchants</div>
              {hover.sub.topMerchants.slice(0, 3).map((m) => (
                <div key={m.name} className="flex items-center justify-between text-[11px]">
                  <span className="truncate pr-2">{m.name}</span>
                  <span className="font-semibold">{fmt.format(Math.round(m.total))}</span>
                </div>
              ))}
            </div>
          )}
          <div className="mt-2 text-[10px] uppercase tracking-wider text-white/35">
            Share of outflow: {((hover.sub.total / Math.max(1, totalOutflow)) * 100).toFixed(1)}%
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── helpers ──────────────────────────────────────────────────────────── */

function hexToRgba(hex: string, alpha: number) {
  const h = hex.replace("#", "");
  const v = h.length === 3
    ? h.split("").map((c) => c + c).join("")
    : h;
  const r = parseInt(v.slice(0, 2), 16);
  const g = parseInt(v.slice(2, 4), 16);
  const b = parseInt(v.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function angleInArc(a: number, start: number, end: number) {
  const norm = (x: number) => {
    let v = x;
    while (v < -Math.PI) v += Math.PI * 2;
    while (v > Math.PI) v -= Math.PI * 2;
    return v;
  };
  const A = norm(a);
  let s = norm(start);
  let e = norm(end);
  if (e < s) e += Math.PI * 2;
  let test = A;
  if (test < s) test += Math.PI * 2;
  return test >= s && test <= e;
}
