'use client';

import { useEffect } from 'react';

/**
 * Warns the user about unsaved changes when `dirty` is true.
 *
 * Covers two escape routes:
 *  1. **Leaving the page** (tab close, refresh, external URL) via the native
 *     `beforeunload` prompt.
 *  2. **In-app navigation** — any click that lands inside an `<a href>` is
 *     intercepted in the capture phase; we ask for confirmation and cancel the
 *     navigation if the user declines. This catches the navbar profile dropdown
 *     links, the logo, etc. (plain anchors and Next.js <Link>, which renders an
 *     <a>).
 *
 * `message` is shown in the in-app confirm() dialog. The browser controls the
 * beforeunload wording itself.
 */
export function useUnsavedGuard(dirty: boolean, message: string) {
  useEffect(() => {
    if (!dirty) return;

    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };

    const onClickCapture = (e: MouseEvent) => {
      // only plain left clicks without modifiers can be a SPA navigation
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const anchor = (e.target as HTMLElement)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!anchor) return;
      const href = anchor.getAttribute('href') || '';
      // ignore hash-only, new-tab, downloads, and non-navigations
      if (!href || href.startsWith('#') || anchor.target === '_blank' || anchor.hasAttribute('download')) return;

      if (!window.confirm(message)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    window.addEventListener('beforeunload', onBeforeUnload);
    // capture phase so we run before Next.js Link's own click handler
    document.addEventListener('click', onClickCapture, true);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('click', onClickCapture, true);
    };
  }, [dirty, message]);
}
