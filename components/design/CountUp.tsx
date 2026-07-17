'use client';

import { useEffect, useState } from 'react';
import { useReveal } from './Reveal';

export function CountUp({
  value,
  duration = 1300,
  start = false,
}: {
  value: string | number;
  duration?: number;
  start?: boolean;
}) {
  const str = String(value);
  const m = str.match(/^([\d.]+)(.*)$/);
  const target = m ? parseFloat(m[1]) : 0;
  const suffix = m ? m[2] : '';
  const decimals = m ? (m[1].split('.')[1] || '').length : 0;
  const isAnimatable = !!m && !/[–—-]/.test(suffix);
  const [n, setN] = useState(0);

  useEffect(() => {
    if (!isAnimatable) return;
    if (!start) {
      setN(0);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setN(target * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // Depend on primitives only — `m` (regex result) is a new object every render
    // and would re-fire the animation on every parent re-render, causing flicker.
  }, [start, target, duration, isAnimatable]);

  if (!isAnimatable) return <>{value}</>;

  const display = decimals ? n.toFixed(decimals) : Math.round(n).toLocaleString();
  return (
    <>
      {display}
      {suffix}
    </>
  );
}

export function CountWhenSeen({ value, duration }: { value: string | number; duration?: number }) {
  const [ref, visible] = useReveal({ threshold: 0.4 });
  return (
    <span ref={ref as React.Ref<HTMLSpanElement>}>
      <CountUp value={value} duration={duration} start={visible} />
    </span>
  );
}
