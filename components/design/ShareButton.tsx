'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { tr, useLang } from '@/lib/i18n';

/**
 * Share this page — used on workshop and article pages.
 *
 * On a phone the browser's own share sheet is the right answer: it already
 * lists the apps this person actually uses, in their order, and it can reach
 * ones the web cannot. So the button calls `navigator.share` wherever it
 * exists and only falls back to its own menu (copy link, Facebook, LINE, X)
 * on desktop browsers that have no sheet to offer.
 *
 * LINE is in the fallback list because it is where most of this audience
 * forwards things; X and Facebook cover the rest.
 *
 * The glyph is drawn here rather than added to `Icon.tsx`: that set is copied
 * verbatim from the icons design canvas, and a share mark has not been drawn
 * there yet. Move it in once it has, so the family stays in one place.
 */
export function ShareButton({
  title,
  text,
  url,
  className = 'btn btn-paper btn-sm',
  compact = false,
}: {
  title: string;
  text?: string;
  /** Defaults to the page being viewed. */
  url?: string;
  className?: string;
  /** Icon only — for tight rows like the phone header bar. */
  compact?: boolean;
}) {
  const { lang } = useLang();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    document.addEventListener('keydown', onKey);
    // Deferred so the click that opened the menu does not immediately close it.
    const t = setTimeout(() => document.addEventListener('mousedown', onDown), 0);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
      clearTimeout(t);
    };
  }, [open, close]);

  /** Resolved at click time — on the server there is no location to read. */
  const shareUrl = () => url || (typeof window === 'undefined' ? '' : window.location.href);

  async function onShare() {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title, text, url: shareUrl() });
      } catch {
        // Dismissing the sheet rejects too, so there is no telling a cancel
        // from a failure. Neither deserves an error message.
      }
      return;
    }
    setOpen((o) => !o);
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl());
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Older browsers and insecure origins — the menu stays open so the link
      // can still be copied from the address bar.
    }
  }

  const enc = () => encodeURIComponent(shareUrl());
  const targets = [
    { key: 'facebook', label: 'Facebook', href: () => `https://www.facebook.com/sharer/sharer.php?u=${enc()}` },
    { key: 'line', label: 'LINE', href: () => `https://social-plugins.line.me/lineit/share?url=${enc()}` },
    { key: 'x', label: 'X', href: () => `https://twitter.com/intent/tweet?url=${enc()}&text=${encodeURIComponent(title)}` },
  ];

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        type="button"
        onClick={onShare}
        className={className}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={compact ? tr(lang, 'แชร์', 'Share') : undefined}
        style={compact ? { width: 40, height: 40, padding: 0, justifyContent: 'center' } : undefined}
      >
        <ShareGlyph />
        {!compact && <span>{tr(lang, 'แชร์', 'Share')}</span>}
      </button>

      {open && (
        <div
          role="menu"
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            right: 0,
            zIndex: 80,
            minWidth: 200,
            background: 'var(--paper)',
            borderRadius: 16,
            padding: 6,
            boxShadow: '0 18px 44px -18px rgba(13,30,29,.4), 0 0 0 1px rgba(13,30,29,.06)',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <button type="button" role="menuitem" onClick={copyLink} style={itemStyle}>
            {copied ? `✓ ${tr(lang, 'คัดลอกแล้ว', 'Copied')}` : tr(lang, 'คัดลอกลิงก์', 'Copy link')}
          </button>
          {targets.map((t) => (
            <a
              key={t.key}
              role="menuitem"
              href={t.href()}
              target="_blank"
              rel="noopener noreferrer"
              onClick={close}
              style={{ ...itemStyle, textDecoration: 'none' }}
            >
              {t.label} <span className="mono">↗</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

const itemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 10,
  width: '100%',
  background: 'none',
  border: 0,
  borderRadius: 11,
  padding: '10px 12px',
  font: 'inherit',
  fontSize: 14,
  color: 'var(--ink)',
  textAlign: 'left',
  cursor: 'pointer',
};

/** Three nodes joined by two lines — the share mark, at the set's 24px/2px. */
function ShareGlyph() {
  return (
    <svg
      width={17}
      height={17}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      style={{ flexShrink: 0, verticalAlign: '-0.16em' }}
    >
      <circle cx="18" cy="5.5" r="2.6" />
      <circle cx="6" cy="12" r="2.6" />
      <circle cx="18" cy="18.5" r="2.6" />
      <path d="M8.3 10.8 15.7 6.7M8.3 13.2l7.4 4.1" />
    </svg>
  );
}

export default ShareButton;
