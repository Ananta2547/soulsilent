'use client';

/* Whether the dashboard rail (admin or teacher) is folded down to its icons.
 * One setting for both dashboards, remembered in this browser only; storage
 * that is blocked or empty just means "open". */

import { createElement, useCallback, useEffect, useState } from 'react';

const KEY = 'dash-rail-collapsed';

export function useRailCollapsed(): [boolean, () => void, (v: boolean) => void] {
  const [collapsed, setCollapsed] = useState(false);

  // Read after mount so the server render and the first client render agree.
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (localStorage.getItem(KEY) === '1') setCollapsed(true);
    } catch {}
  }, []);

  const set = useCallback((v: boolean) => {
    setCollapsed(v);
    try {
      localStorage.setItem(KEY, v ? '1' : '0');
    } catch {}
  }, []);

  const toggle = useCallback(() => set(!collapsed), [collapsed, set]);
  return [collapsed, toggle, set];
}

/** The fold / unfold glyph for the button at the top of the rail. */
export function RailToggleIcon({ collapsed }: { collapsed: boolean }) {
  return createElement(
    'svg',
    { className: 'w-5 h-5', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24', 'aria-hidden': true },
    createElement('rect', { x: 3.5, y: 4.5, width: 17, height: 15, rx: 3, strokeWidth: 1.5 }),
    createElement('path', { strokeWidth: 1.5, d: 'M9.5 4.5v15' }),
    createElement('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 1.5, d: collapsed ? 'M13 10l2 2-2 2' : 'M16 10l-2 2 2 2' }),
  );
}
