'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type Lang = 'th' | 'en';

type LangCtxValue = {
  lang: Lang;
  setLang: (l: Lang) => void;
};

const LangCtx = createContext<LangCtxValue>({ lang: 'th', setLang: () => {} });

const STORAGE_KEY = 'ss_lang';

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>('th');

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY) as Lang | null;
      if (stored === 'th' || stored === 'en') setLangState(stored);
    } catch {}
  }, []);

  const setLang = (l: Lang) => {
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
