'use client';

/**
 * "ไปจัดการ" from an Admin Insights alert lands on the page that fixes it with
 * `?focus=<tokens>` (comma-separated). Rows on that page carry the matching
 * tokens in `data-focus` (space-separated): this scrolls to the first one,
 * highlights every match and shows a banner with what to do. The alert's text
 * comes from sessionStorage (set by AlertsTab), so the URL stays short.
 * Mounted once in AdminShell.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';

export const FOCUS_KEY = 'asl-alert-focus';
export type FocusNote = { focus: string; title: string; detail?: string; todo?: string };

/** The `?focus=` tokens of the current URL — pages use it to reveal a row
 *  they would otherwise hide (paging, collapsed lists). */
export function useFocusTokens(): string[] {
  const sp = useSearchParams();
  const f = sp.get('focus') || '';
  return f ? f.split(',').filter(Boolean) : [];
}

const HIT = 'adm-focus';

/** Matching elements that are on screen — a page often renders a table for
 *  desktop and cards for phones, one of them hidden. */
function targets(tokens: string[]): HTMLElement[] {
  return tokens
    .flatMap((t) => Array.from(document.querySelectorAll<HTMLElement>(`[data-focus~="${CSS.escape(t)}"]`)))
    .filter((el) => el.getClientRects().length > 0);
}

export function AlertFocus() {
  const pathname = usePathname();
  const sp = useSearchParams();
  const focus = sp.get('focus') || '';
  const [note, setNote] = useState<FocusNote | null>(null);
  const [state, setState] = useState<'idle' | 'looking' | 'found' | 'missing'>('idle');
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!focus) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState('idle');
      return;
    }
    const tokens = focus.split(',').filter(Boolean);
    let stored: FocusNote | null = null;
    try {
      const raw = sessionStorage.getItem(FOCUS_KEY);
      const n = raw ? (JSON.parse(raw) as FocusNote) : null;
      if (n && n.focus === focus) stored = n;
    } catch {}
    setNote(stored);
    setState('looking');

    // The page loads its rows after mount: watch until they show up.
    let done = false;
    let settle = 0;
    const look = () => {
      if (done) return;
      const els = targets(tokens);
      if (!els.length) return;
      done = true;
      els.forEach((el) => el.classList.add(HIT));
      els[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
      // A smooth scroll started while the page is still loading can stall
      // (seen on a fresh load), and rows above can still grow: jump it back
      // into view a few times — unless the admin has started scrolling.
      let touched = false;
      const mine = () => (touched = true);
      window.addEventListener('wheel', mine, { once: true, passive: true });
      window.addEventListener('touchstart', mine, { once: true, passive: true });
      let tries = 0;
      const check = () => {
        const r = els[0].getBoundingClientRect();
        if (!touched && (r.top < 0 || r.bottom > window.innerHeight)) els[0].scrollIntoView({ block: 'center', behavior: 'instant' });
        if (++tries < 4) settle = window.setTimeout(check, 700);
      };
      settle = window.setTimeout(check, 700);
      setCount(els.length);
      setState('found');
    };
    const mo = new MutationObserver(look);
    mo.observe(document.body, { childList: true, subtree: true });
    look();
    const give = window.setTimeout(() => {
      if (!done) setState('missing');
      mo.disconnect();
    }, 10000);
    return () => {
      done = true;
      mo.disconnect();
      window.clearTimeout(give);
      window.clearTimeout(settle);
      targets(tokens).forEach((el) => el.classList.remove(HIT));
    };
  }, [focus, pathname]);

  if (!focus || state === 'idle') return null;

  const close = () => {
    try {
      const u = new URL(window.location.href);
      u.searchParams.delete('focus');
      window.history.replaceState(null, '', u);
    } catch {}
  };
  const again = () => {
    const els = targets(focus.split(',').filter(Boolean));
    els.forEach((el) => {
      el.classList.remove(HIT);
      void el.offsetWidth; // restart the pulse
      el.classList.add(HIT);
    });
    els[0]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  return (
    <div className="adm-focusbar" role="status">
      <div className="adm-focusbar-body">
        <span className="adm-focusbar-tag">จากแจ้งเตือน</span>
        <b>{note?.title || 'รายการที่ต้องจัดการ'}</b>
        {note?.todo && <span className="adm-focusbar-todo">ต้องทำ: {note.todo}</span>}
        <span className="adm-meta">
          {state === 'looking'
            ? 'กำลังหารายการ…'
            : state === 'found'
              ? `ไฮไลต์ไว้ ${count} รายการ`
              : 'ไม่พบรายการนี้บนหน้า — อาจจัดการไปแล้ว หรือถูกกรองไว้ (ลองล้างคำค้นหา/ตัวกรอง)'}
        </span>
      </div>
      <div className="adm-focusbar-acts">
        {state === 'found' && (
          <button type="button" className="adm-btn sm white" onClick={again}>
            ดูอีกครั้ง
          </button>
        )}
        <Link href="/admin/insights?tab=alerts" className="adm-btn sm white">
          ‹ กลับไปแจ้งเตือน
        </Link>
        <button type="button" className="adm-btn sm" aria-label="ปิด" onClick={close}>
          ✕
        </button>
      </div>
    </div>
  );
}
