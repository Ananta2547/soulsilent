'use client';

/**
 * Picks which part of an article's 3:1 cover the 4:3 cards show. The cover
 * is drawn full width with a 4:3 window on it; drag the window (or use the
 * arrow keys) and the card preview beside it updates. The value is CSS
 * object-position x in % — what the public cards apply.
 *
 * It also reports the cover's real pixel size against the recommended size,
 * so a too-small upload is caught here rather than on the page.
 */
import { useRef, useState } from 'react';
import { ARTICLE_CARD_RATIO } from '@/lib/article-card';

const HERO_RATIO = 3;
const REC_W = 2400;
const REC_H = 800;

export function CardFocus({ src, value, onChange }: { src: string; value: number; onChange: (x: number) => void }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const drag = useRef<{ startX: number; startVal: number } | null>(null);
  // Share of the cover's width the card window covers (4:3 inside 3:1 ≈ 44%).
  const frac = Math.min(1, ARTICLE_CARD_RATIO / HERO_RATIO);
  const left = (value / 100) * (1 - frac) * 100;
  const right = left + frac * 100;

  const setFromDelta = (dxPx: number) => {
    const box = boxRef.current;
    if (!box || !drag.current) return;
    const travel = box.clientWidth * (1 - frac);
    if (travel <= 0) return;
    const next = drag.current.startVal + (dxPx / travel) * 100;
    onChange(Math.round(Math.min(100, Math.max(0, next))));
  };

  const small = !!size && (size.w < REC_W * 0.75 || size.h < REC_H * 0.75);
  const cardW = size ? Math.round(size.h * ARTICLE_CARD_RATIO) : null;

  return (
    <div className="mt-4 rounded-xl border border-gray-200 p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
        <span className="text-xs font-medium text-dark">ส่วนที่แสดงบนการ์ดบทความ (4:3)</span>
        <span className="text-[11px] text-gray">ลากกรอบเส้นประเพื่อเลือกตำแหน่ง</span>
      </div>
      <div className="flex flex-wrap gap-3 items-start">
        <div
          ref={boxRef}
          className="relative overflow-hidden rounded-lg bg-gray-100 select-none"
          style={{ flex: '1 1 320px', aspectRatio: String(HERO_RATIO), touchAction: 'none' }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt=""
            draggable={false}
            onLoad={(e) => setSize({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
          />
          {/* Dim what the card leaves out. */}
          <div aria-hidden style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: `${left}%`, background: 'rgba(13,30,29,.5)' }} />
          <div aria-hidden style={{ position: 'absolute', top: 0, bottom: 0, left: `${right}%`, right: 0, background: 'rgba(13,30,29,.5)' }} />
          <div
            role="slider"
            tabIndex={0}
            aria-label="ตำแหน่งการ์ด"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={value}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              drag.current = { startX: e.clientX, startVal: value };
            }}
            onPointerMove={(e) => {
              if (drag.current) setFromDelta(e.clientX - drag.current.startX);
            }}
            onPointerUp={() => {
              drag.current = null;
            }}
            onPointerCancel={() => {
              drag.current = null;
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowLeft') onChange(Math.max(0, value - 5));
              if (e.key === 'ArrowRight') onChange(Math.min(100, value + 5));
            }}
            style={{ position: 'absolute', top: 0, bottom: 0, left: `${left}%`, width: `${frac * 100}%`, border: '2px dashed #fff', boxShadow: '0 0 0 1px rgba(0,0,0,.25)', cursor: 'grab', borderRadius: 4 }}
          />
        </div>
        <div style={{ flex: '0 0 132px' }}>
          <div className="rounded-lg overflow-hidden bg-gray-100" style={{ aspectRatio: '4 / 3' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: `${value}% 50%` }} />
          </div>
          <div className="text-[11px] text-gray mt-1 text-center">ตัวอย่างการ์ด</div>
        </div>
      </div>
      <div className="mt-2 text-[11px] leading-relaxed text-gray">
        หน้ารายละเอียดบทความ 3:1 · แนะนำ {REC_W}×{REC_H} px
        {size && (
          <>
            {' '}· รูปนี้ <b className={small ? 'text-red-600' : 'text-dark'}>{size.w}×{size.h} px</b>
            {cardW && <> · การ์ดได้ราว {cardW}×{size.h} px</>}
            {small && <span className="text-red-600"> — เล็กไป อาจไม่คมบนจอใหญ่</span>}
          </>
        )}
      </div>
    </div>
  );
}

export default CardFocus;
