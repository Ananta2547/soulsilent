'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { useLang, LANG_SWITCH_ENABLED } from '@/lib/i18n';

export function LangSwitch() {
  const { lang, setLang } = useLang();
  const ref = useRef<HTMLDivElement>(null);
  const [thumb, setThumb] = useState({ x: 3, w: 0 });

  useLayoutEffect(() => {
    if (!ref.current) return;
    const active = ref.current.querySelector('.on');
    if (active) {
      const r = active.getBoundingClientRect();
      const parent = ref.current.getBoundingClientRect();
      setThumb({ x: r.left - parent.left, w: r.width });
    }
  }, [lang]);

  // After the hooks, never before — the early return must not change hook order.
  if (!LANG_SWITCH_ENABLED) return null;

  return (
    <div className="seg" ref={ref}>
      <span
        className="thumb"
        style={{ transform: `translateX(${thumb.x}px)`, width: thumb.w }}
      />
      <button className={lang === 'th' ? 'on' : ''} onClick={() => setLang('th')}>
        TH
      </button>
      <button className={lang === 'en' ? 'on' : ''} onClick={() => setLang('en')}>
        EN
      </button>
    </div>
  );
}
