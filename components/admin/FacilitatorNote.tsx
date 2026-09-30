'use client';

/* Private staff note about one participant, shown inside the expanded
 * application card. Admin and teacher screens post to different endpoints, so
 * the caller supplies the URL; everything else is shared.
 *
 * The note is staff-only — it is stripped from every participant-facing API
 * response (see migration 045). */
import { useState } from 'react';
import { Icon } from '@/components/design/Icon';

export function FacilitatorNote({
  initial,
  endpoint,
  lang = 'th',
}: {
  initial: string | null;
  /** PUT target. Receives `{ facilitator_note }`. */
  endpoint: string;
  lang?: 'th' | 'en';
}) {
  const [value, setValue] = useState(initial || '');
  // What the server currently holds — drives the dirty check so an unchanged
  // note can't be re-saved and a saved one shows a confirmation.
  const [saved, setSaved] = useState(initial || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  const dirty = value.trim() !== saved.trim();

  async function save() {
    if (!dirty || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(endpoint, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ facilitator_note: value }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error || 'บันทึกไม่สำเร็จ');
      }
      setSaved(value.trim());
      setValue(value.trim());
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2500);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const t = (th: string, en: string) => (lang === 'en' ? en : th);

  return (
    <div className="mt-3 rounded-lg border border-gray-lighter bg-surface/40 p-3">
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <label className="text-xs font-medium text-dark">
          <Icon name="notes" size={16} /> {t('หมายเหตุสำหรับผู้จัด', 'Facilitator note')}
        </label>
        <span className="text-[11px] text-gray">
          {t('เห็นเฉพาะทีมงาน ผู้เข้าร่วมไม่เห็น', 'Staff only — not shown to the seeker')}
        </span>
      </div>

      <textarea
        className="input-field text-xs"
        rows={3}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={t(
          'เช่น พฤติกรรมในคลาส ข้อควรระวังพิเศษ จุดเด่น',
          'e.g. behaviour in class, things to watch for, strengths',
        )}
      />

      <div className="flex items-center gap-2 mt-2">
        <button
          type="button"
          onClick={save}
          disabled={!dirty || busy}
          className="btn btn-teal btn-sm disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {busy ? t('กำลังบันทึก…', 'Saving…') : t('บันทึกหมายเหตุ', 'Save note')}
        </button>
        {dirty && !busy && (
          <button type="button" onClick={() => setValue(saved)} className="btn btn-paper btn-sm">
            {t('ยกเลิก', 'Cancel')}
          </button>
        )}
        {justSaved && !dirty && (
          <span className="text-xs text-primary">✓ {t('บันทึกแล้ว', 'Saved')}</span>
        )}
        {error && <span className="text-xs text-red-500">{error}</span>}
      </div>
    </div>
  );
}
