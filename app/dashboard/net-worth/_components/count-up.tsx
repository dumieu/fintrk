"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Animated number that ramps to its target value over `duration` ms with
 * an ease-out curve. Re-runs whenever `value` changes — perfect for the
 * net-worth headline so each tweak feels alive instead of teleporting.
 */
export function CountUp({
  value,
  duration = 700,
  formatter,
}: {
  value: number;
  duration?: number;
  formatter: (n: number) => string;
}) {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  const startRef = useRef<number | null>(null);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    fromRef.current = display;
    startRef.current = null;
    if (frameRef.current) cancelAnimationFrame(frameRef.current);

    const step = (ts: number) => {
      if (startRef.current == null) startRef.current = ts;
      const t = Math.min(1, (ts - startRef.current) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const next = fromRef.current + (value - fromRef.current) * eased;
      setDisplay(next);
      if (t < 1) frameRef.current = requestAnimationFrame(step);
    };
    frameRef.current = requestAnimationFrame(step);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
    // We intentionally only react to `value` changes — `display` updates
    // are driven inside the rAF loop above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, duration]);

  return <>{formatter(display)}</>;
}
