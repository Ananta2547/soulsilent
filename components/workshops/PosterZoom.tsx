'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * A workshop poster that opens full size when tapped. The frame around it
 * still crops the poster to its box; the lightbox shows the whole image
 * (object-fit: contain) over a dark backdrop. Esc, the ✕ or a tap outside
 * the image closes it.
 *
 * The lightbox is portalled to <body> so a transformed ancestor (the page
 * transition) cannot trap its `position: fixed`.
 */
export function PosterZoom({ src, alt }: { src: string; alt: string }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <>
      <button type="button" className="poster-zoom-btn" onClick={() => setOpen(true)} aria-label={`ดูโปสเตอร์เต็ม: ${alt}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        <span className="poster-zoom-hint" aria-hidden>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
          </svg>
          ดูโปสเตอร์เต็ม
        </span>
      </button>
      {open &&
        createPortal(
          <div className="poster-zoom-back" role="dialog" aria-modal="true" aria-label={alt} onClick={() => setOpen(false)}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt={alt} className="poster-zoom-img" onClick={(e) => e.stopPropagation()} />
            <button type="button" className="poster-zoom-close" aria-label="ปิด" onClick={() => setOpen(false)}>
              ✕
            </button>
          </div>,
          document.body,
        )}
    </>
  );
}
