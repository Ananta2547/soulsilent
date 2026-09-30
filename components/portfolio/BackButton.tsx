'use client';

import { useRouter } from 'next/navigation';
import { useLang, tr } from '@/lib/i18n';

/**
 * "Back" control for the public portfolio page. Uses the browser history when
 * available (so visitors return to the workshop they came from); falls back to
 * the workshops listing if the page was opened directly.
 */
export function BackButton() {
  const router = useRouter();
  const { lang } = useLang();

  function goBack() {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
    } else {
      router.push('/journeys');
    }
  }

  return (
    <button type="button" onClick={goBack} className="pf-back">
      <span aria-hidden>←</span>
      <span>{tr(lang, 'ย้อนกลับ', 'Back')}</span>
      <span className="sep" />
      <span className="lbl">Portfolio</span>
    </button>
  );
}
