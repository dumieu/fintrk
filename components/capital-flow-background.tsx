"use client";

import { useEffect, useRef } from "react";

/**
 * "Capital Flow" — a 2D canvas particle simulation built specifically for the
 * FinTRK landing page. Designed to be visually distinct from BioTRK's 3D
 * spring-grid wave:
 *
 *  - 2D fluid flow field (sin/cos pseudo-curl noise) instead of a 3D grid
 *  - Each particle leaves a fading streak (capital trails)
 *  - Mouse acts as a *gravitational attractor* (BioTRK's repels)
 *  - Click/tap creates a golden burst that radially impulses particles
 *  - Particles cycle through emerald → cyan → gold → violet over their life
 *  - Constellation lines connect close particles (transactions)
 *  - Drifting denomination glyphs ($ € £ ¥ ₿) populate the depths
 */
export function CapitalFlowBackground() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    const canvas = document.createElement("canvas");
    canvas.style.display = "block";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    container.appendChild(canvas);

    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = 0;
    let h = 0;

    const resize = () => {
      const rect = container.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    const mobile = w < 768;
    const PARTICLE_COUNT = mobile ? 220 : 520;
    const GLYPH_COUNT = mobile ? 12 : 22;
    const CONNECT_DIST = mobile ? 60 : 90;
    const CONNECT_DIST_SQ = CONNECT_DIST * CONNECT_DIST;

    /* ─── Color palette: emerald → teal → cyan → gold → violet ──────── */
    const palette: [number, number, number][] = [
      [16, 225, 161], // emerald
      [6, 214, 160], // teal
      [34, 211, 238], // cyan
      [125, 211, 252], // sky
      [253, 224, 71], // gold
      [251, 191, 36], // amber
      [192, 132, 252], // violet
    ];

    function pickColor(tIn: number): [number, number, number] {
      // Defensively clamp + sanitize: the math elsewhere should always keep
      // hue in [0, 1) but a single NaN/negative would crash the loop.
      let t = Number.isFinite(tIn) ? tIn : 0;
      t = ((t % 1) + 1) % 1;
      const last = palette.length - 1;
      const f = t * last;
      const i = Math.min(Math.max(Math.floor(f), 0), last);
      const k = f - i;
      const a = palette[i] ?? palette[0];
      const b = palette[Math.min(i + 1, last)] ?? a;
      return [
        a[0] + (b[0] - a[0]) * k,
        a[1] + (b[1] - a[1]) * k,
        a[2] + (b[2] - a[2]) * k,
      ];
    }

    interface Particle {
      x: number;
      y: number;
      vx: number;
      vy: number;
      life: number;
      maxLife: number;
      size: number;
      hue: number; // 0-1 phase along palette
      hueSpeed: number;
      px: number; // previous pos for trail
      py: number;
    }

    const particles: Particle[] = [];

    function spawn(p: Particle, x?: number, y?: number) {
      p.x = x ?? Math.random() * w;
      p.y = y ?? Math.random() * h;
      p.px = p.x;
      p.py = p.y;
      const speed = 0.15 + Math.random() * 0.6;
      const ang = Math.random() * Math.PI * 2;
      p.vx = Math.cos(ang) * speed;
      p.vy = Math.sin(ang) * speed;
      p.life = 0;
      p.maxLife = 280 + Math.random() * 520;
      p.size = mobile ? 0.7 + Math.random() * 1.2 : 0.9 + Math.random() * 1.6;
      p.hue = Math.random();
      p.hueSpeed = 0.0008 + Math.random() * 0.0018;
    }

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const p: Particle = {
        x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 0,
        size: 0, hue: 0, hueSpeed: 0, px: 0, py: 0,
      };
      spawn(p);
      p.life = Math.random() * p.maxLife;
      particles.push(p);
    }

    /* ─── Drifting currency glyphs ──────────────────────────────────── */
    interface Glyph {
      x: number;
      y: number;
      vx: number;
      vy: number;
      ch: string;
      size: number;
      alpha: number;
      rot: number;
      vrot: number;
    }
    const glyphChars = ["$", "€", "£", "¥", "₿", "₹", "₩"];
    const glyphs: Glyph[] = [];
    for (let i = 0; i < GLYPH_COUNT; i++) {
      glyphs.push({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.12,
        vy: -(0.04 + Math.random() * 0.18),
        ch: glyphChars[Math.floor(Math.random() * glyphChars.length)],
        size: 18 + Math.random() * 56,
        alpha: 0.04 + Math.random() * 0.08,
        rot: (Math.random() - 0.5) * 0.4,
        vrot: (Math.random() - 0.5) * 0.0012,
      });
    }

    /* ─── Mouse / touch / click state ───────────────────────────────── */
    const mouse = { x: -9999, y: -9999, active: false, influence: 0 };
    interface Burst { x: number; y: number; age: number; life: number }
    const bursts: Burst[] = [];

    function inBounds(x: number, y: number) {
      return x >= 0 && y >= 0 && x <= w && y <= h;
    }

    // Bind to window so the animation reacts even while the cursor is over
    // the hero text / CTAs (which sit above the canvas in z-order).
    const onMouseMove = (e: MouseEvent) => {
      const r = container.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      if (!inBounds(x, y)) {
        mouse.active = false;
        return;
      }
      mouse.x = x;
      mouse.y = y;
      mouse.active = true;
    };
    const onMouseLeaveWin = () => { mouse.active = false; };
    const onTouchMove = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      const r = container.getBoundingClientRect();
      const x = t.clientX - r.left;
      const y = t.clientY - r.top;
      if (!inBounds(x, y)) {
        mouse.active = false;
        return;
      }
      mouse.x = x;
      mouse.y = y;
      mouse.active = true;
    };
    const onTouchEnd = () => { mouse.active = false; };

    const triggerBurst = (clientX: number, clientY: number) => {
      const r = container.getBoundingClientRect();
      const x = clientX - r.left;
      const y = clientY - r.top;
      if (!inBounds(x, y)) return;
      bursts.push({ x, y, age: 0, life: 60 });
    };
    const onClick = (e: MouseEvent) => {
      // Don't burst when the user clicks an actual interactive element
      // (button/link). Empty hero space → satisfying golden splash.
      const target = e.target as HTMLElement | null;
      if (target?.closest("a, button, input, textarea, [role='button']")) return;
      triggerBurst(e.clientX, e.clientY);
    };
    const onTouchStart = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      const r = container.getBoundingClientRect();
      const x = t.clientX - r.left;
      const y = t.clientY - r.top;
      if (!inBounds(x, y)) return;
      mouse.x = x;
      mouse.y = y;
      mouse.active = true;
      const target = e.target as HTMLElement | null;
      if (target?.closest("a, button, input, textarea, [role='button']")) return;
      triggerBurst(t.clientX, t.clientY);
    };

    window.addEventListener("mousemove", onMouseMove, { passive: true });
    window.addEventListener("mouseout", onMouseLeaveWin);
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd);
    window.addEventListener("click", onClick);
    window.addEventListener("touchstart", onTouchStart, { passive: true });

    const onResize = () => resize();
    window.addEventListener("resize", onResize);

    /* ─── Flow field (cheap pseudo-curl from sin/cos) ──────────────── */
    function flow(x: number, y: number, t: number) {
      const a =
        Math.sin(x * 0.0035 + t * 0.00035) +
        Math.cos(y * 0.0028 - t * 0.0002);
      const b =
        Math.cos(x * 0.0024 - t * 0.0004) +
        Math.sin(y * 0.0032 + t * 0.0005);
      return { fx: a * 0.07, fy: b * 0.07 };
    }

    /* ─── Animation loop ────────────────────────────────────────────── */
    let frameId = 0;
    let destroyed = false;
    let lastT = performance.now();

    // Initial paint a deep base so the first frames don't flash
    ctx.fillStyle = "rgba(2, 12, 14, 1)";
    ctx.fillRect(0, 0, w, h);

    const frame = (now: number) => {
      if (destroyed) return;
      frameId = requestAnimationFrame(frame);
      const dt = Math.min(now - lastT, 50);
      lastT = now;
      const t = now;

      // Soft motion-blur trails: paint a translucent dark over the canvas
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "rgba(2, 12, 14, 0.18)";
      ctx.fillRect(0, 0, w, h);

      /* ── Drifting currency glyphs (under particles) ──────────────── */
      ctx.globalCompositeOperation = "lighter";
      for (const g of glyphs) {
        g.x += g.vx * (dt * 0.06);
        g.y += g.vy * (dt * 0.06);
        g.rot += g.vrot * dt;
        if (g.y < -g.size) { g.y = h + g.size; g.x = Math.random() * w; }
        if (g.x < -g.size) g.x = w + g.size;
        if (g.x > w + g.size) g.x = -g.size;
        ctx.save();
        ctx.translate(g.x, g.y);
        ctx.rotate(g.rot);
        ctx.font = `600 ${g.size}px "Inter", system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = `rgba(125, 230, 195, ${g.alpha})`;
        ctx.fillText(g.ch, 0, 0);
        ctx.restore();
      }

      /* ── Resolve burst impulses into a list of active sources ────── */
      for (let i = bursts.length - 1; i >= 0; i--) {
        bursts[i].age += dt * 0.06;
        if (bursts[i].age > bursts[i].life) bursts.splice(i, 1);
      }

      /* ── Mouse attractor influence smoothing ─────────────────────── */
      if (mouse.active) mouse.influence = Math.min(1, mouse.influence + 0.04);
      else mouse.influence = Math.max(0, mouse.influence - 0.025);

      /* ── Particle update ────────────────────────────────────────── */
      ctx.lineCap = "round";
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.life += dt * 0.06;
        p.hue = (p.hue + p.hueSpeed * dt) % 1;

        // Flow-field force
        const { fx, fy } = flow(p.x, p.y, t);
        p.vx += fx * (dt * 0.05);
        p.vy += fy * (dt * 0.05);

        // Mouse gravitational attraction
        if (mouse.influence > 0.01) {
          const dx = mouse.x - p.x;
          const dy = mouse.y - p.y;
          const d2 = dx * dx + dy * dy;
          const R = 260;
          const R2 = R * R;
          if (d2 < R2 && d2 > 1) {
            const d = Math.sqrt(d2);
            const fall = 1 - d / R;
            const force = 0.35 * fall * fall * mouse.influence;
            p.vx += (dx / d) * force;
            p.vy += (dy / d) * force;
          }
        }

        // Burst impulses (golden explosion repels)
        for (let b = 0; b < bursts.length; b++) {
          const burst = bursts[b];
          const bdx = p.x - burst.x;
          const bdy = p.y - burst.y;
          const bd2 = bdx * bdx + bdy * bdy;
          const BR = 220;
          if (bd2 < BR * BR && bd2 > 1) {
            const bd = Math.sqrt(bd2);
            const ageRatio = 1 - burst.age / burst.life;
            const fall = 1 - bd / BR;
            const force = 6 * fall * fall * ageRatio;
            p.vx += (bdx / bd) * force;
            p.vy += (bdy / bd) * force;
          }
        }

        // Damping
        p.vx *= 0.965;
        p.vy *= 0.965;

        // Cap velocity to avoid teleporting
        const sp2 = p.vx * p.vx + p.vy * p.vy;
        const MAX_SP = 5.5;
        if (sp2 > MAX_SP * MAX_SP) {
          const sp = Math.sqrt(sp2);
          p.vx = (p.vx / sp) * MAX_SP;
          p.vy = (p.vy / sp) * MAX_SP;
        }

        p.px = p.x;
        p.py = p.y;
        p.x += p.vx;
        p.y += p.vy;

        // Wrap or respawn
        if (
          p.life > p.maxLife ||
          p.x < -20 || p.x > w + 20 || p.y < -20 || p.y > h + 20
        ) {
          spawn(p);
        }

        const [r, gr, bl] = pickColor(p.hue);
        const a = Math.min(1, 0.25 + Math.sin((p.life / p.maxLife) * Math.PI) * 0.85);

        // Streak from previous to current
        ctx.strokeStyle = `rgba(${r | 0}, ${gr | 0}, ${bl | 0}, ${a * 0.85})`;
        ctx.lineWidth = p.size;
        ctx.beginPath();
        ctx.moveTo(p.px, p.py);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();

        // Glow head
        ctx.fillStyle = `rgba(${r | 0}, ${gr | 0}, ${bl | 0}, ${a})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 1.4, 0, Math.PI * 2);
        ctx.fill();
      }

      /* ── Constellation links (transactions) ───────────────────────── */
      // Only check a sub-sample each frame for performance
      const sampleStride = mobile ? 6 : 4;
      ctx.lineWidth = 0.6;
      for (let i = 0; i < particles.length; i += sampleStride) {
        const a = particles[i];
        for (let j = i + sampleStride; j < particles.length; j += sampleStride) {
          const b = particles[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < CONNECT_DIST_SQ) {
            const alpha = (1 - d2 / CONNECT_DIST_SQ) * 0.22;
            const [r, gr, bl] = pickColor((a.hue + b.hue) * 0.5);
            ctx.strokeStyle = `rgba(${r | 0}, ${gr | 0}, ${bl | 0}, ${alpha})`;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }

      /* ── Render burst rings (golden expanding rings) ─────────────── */
      for (const burst of bursts) {
        const k = burst.age / burst.life;
        const radius = k * 240;
        const alpha = (1 - k) * 0.55;
        const grad = ctx.createRadialGradient(
          burst.x, burst.y, Math.max(2, radius * 0.5),
          burst.x, burst.y, radius
        );
        grad.addColorStop(0, `rgba(253, 224, 71, ${alpha * 0.0})`);
        grad.addColorStop(0.7, `rgba(253, 224, 71, ${alpha * 0.7})`);
        grad.addColorStop(1, `rgba(251, 191, 36, 0)`);
        ctx.strokeStyle = grad;
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.arc(burst.x, burst.y, radius, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = `rgba(253, 224, 71, ${alpha * 0.18})`;
        ctx.beginPath();
        ctx.arc(burst.x, burst.y, radius * 0.6, 0, Math.PI * 2);
        ctx.fill();
      }

      /* ── Mouse aura (subtle gold halo when active) ────────────────── */
      if (mouse.influence > 0.01) {
        const auraR = 110 + mouse.influence * 40;
        const auraGrad = ctx.createRadialGradient(
          mouse.x, mouse.y, 0, mouse.x, mouse.y, auraR,
        );
        auraGrad.addColorStop(0, `rgba(253, 224, 71, ${0.18 * mouse.influence})`);
        auraGrad.addColorStop(0.5, `rgba(34, 211, 238, ${0.07 * mouse.influence})`);
        auraGrad.addColorStop(1, `rgba(34, 211, 238, 0)`);
        ctx.fillStyle = auraGrad;
        ctx.beginPath();
        ctx.arc(mouse.x, mouse.y, auraR, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    if (!reduceMotion) {
      frameId = requestAnimationFrame(frame);
    } else {
      // Single static frame for reduced-motion users
      ctx.fillStyle = "rgba(2, 12, 14, 1)";
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        const [r, gr, bl] = pickColor(p.hue);
        ctx.fillStyle = `rgba(${r | 0}, ${gr | 0}, ${bl | 0}, 0.7)`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 1.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    return () => {
      destroyed = true;
      cancelAnimationFrame(frameId);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseout", onMouseLeaveWin);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("click", onClick);
      window.removeEventListener("touchstart", onTouchStart);
      if (canvas.parentNode === container) container.removeChild(canvas);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 overflow-hidden"
      aria-hidden="true"
    />
  );
}
