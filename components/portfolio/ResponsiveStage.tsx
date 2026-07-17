'use client';

/* Scales a fixed-width design (the 1200px portfolio canvas) down to fit its
 * container, so the published page and thumbnails never overflow on narrow
 * viewports. Scales down only (never up past maxScale). */
import { useEffect, useRef, useState } from 'react';

export function ResponsiveStage({
  contentWidth,
  contentHeight,
  maxScale = 1,
  children,
}: {
  contentWidth: number;
  contentHeight: number;
  maxScale?: number;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(maxScale);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setScale(Math.min(maxScale, el.clientWidth / contentWidth));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [contentWidth, maxScale]);

  return (
    // Outer measures the available width; inner is sized to the *scaled* canvas
    // and centered, so on wide viewports (scale capped at 1) the 1200px canvas
    // sits in the middle instead of hugging the left edge.
    <div ref={ref} style={{ width: '100%' }}>
      <div
        style={{
          width: contentWidth * scale,
          height: contentHeight * scale,
          margin: '0 auto',
          overflow: 'hidden',
        }}
      >
        <div style={{ width: contentWidth, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
          {children}
        </div>
      </div>
    </div>
  );
}
