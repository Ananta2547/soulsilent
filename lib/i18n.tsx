'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type Lang = 'th' | 'en';

type LangCtxValue = {
  lang: Lang;
  setLang: (l: Lang) => void;
};

const LangCtx = createContext<LangCtxValue>({ lang: 'th', setLang: () => {} });

const STORAGE_KEY = 'ss_lang';

/**
 * Bilingual UI is OFF — the site ships Thai-only.
 *
 * This is the single switch for it. While false the language is pinned to 'th',
 * so every <T th en />, tr() and pick() call site returns Thai without being
 * touched, and <LangSwitch> renders nothing. All English strings are still in
 * the code, so flipping this back to true restores the TH/EN site as it was.
 */
export const LANG_SWITCH_ENABLED = false;

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>('th');

  useEffect(() => {
    // Skip the stored value while pinned — a visitor who previously chose 'en'
    // would otherwise be restored into an English UI that has no way back.
    if (!LANG_SWITCH_ENABLED) return;
    try {
      const stored = localStorage.getItem(STORAGE_KEY) as Lang | null;
      if (stored === 'th' || stored === 'en') setLangState(stored);
    } catch {}
  }, []);

  const setLang = (l: Lang) => {
    if (!LANG_SWITCH_ENABLED) return;
    setLangState(l);
    try {
      localStorage.setItem(STORAGE_KEY, l);
      document.documentElement.lang = l;
    } catch {}
  };

  return <LangCtx.Provider value={{ lang, setLang }}>{children}</LangCtx.Provider>;
}

export function useLang() {
  return useContext(LangCtx);
}

export function T({ th, en }: { th: ReactNode; en: ReactNode }) {
  const { lang } = useContext(LangCtx);
  return <>{lang === 'th' ? th : en}</>;
}

export function tr(lang: Lang, th: string, en: string): string {
  return lang === 'th' ? th : en;
}

type Translatable = { th: string; en: string } | string | undefined | null;
export function pick(obj: Translatable, lang: Lang): string {
  if (!obj) return '';
  if (typeof obj === 'string') return obj;
  return obj[lang] ?? '';
}
