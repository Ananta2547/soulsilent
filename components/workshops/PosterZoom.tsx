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
