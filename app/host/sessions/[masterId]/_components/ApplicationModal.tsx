'use client';

/* The host writes the activity's application form and switches the PDPA
 * consent on or off. Saved once per activity; every round that has not
 * started takes it straight away, and new rounds copy it. People who already
 * booked keep the answers they gave. */

import { useEffect, useMemo, useState } from 'react';
import type { ApplicationQuestion, WorkshopMaster } from '@/lib/types';
import { ApplicationEditor } from '@/components/workshops/ApplicationEditor';

const parse = (json: string | null | undefined): ApplicationQuestion[] => {
  try {
    const v = json ? (JSON.parse(json) as unknown) : [];
    return Array.isArray(v) ? (v as ApplicationQuestion[]) : [];
  } catch {
    return [];
  }
};

export function ApplicationModal({
  master,
  bookedRounds,
  onClose,
  onSaved,
}: {
  master: WorkshopMaster;
  /** Upcoming rounds that already have bookings — shown so the host knows. */
  bookedRounds: number;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const initial = useMemo(() => parse(master.application_form), [master.application_form]);
  const [questions, setQuestions] = useState<ApplicationQuestion[]>(initial);
  const [consent, setConsent] = useState(!!master.require_consent);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [askClose, setAskClose] = useState(false);
  const dirty = JSON.stringify(questions) !== JSON.stringify(initial) || consent !== !!master.require_consent;

  const tryClose = () => {
    if (saving) return;
    if (dirty && !askClose) setAskClose(true);
    else onClose();
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && tryClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  async function save() {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/teacher/masters/${master.id}/application`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questions, require_consent: consent }),
      });
      const d = (await res.json()) as { error?: string; rounds?: number };
      if (!res.ok) {
        setError(d.error || 'บันทึกไม่สำเร็จ');
        return;
      }
      onSaved(`บันทึกใบสมัครแล้ว${d.rounds ? ` · ใช้กับ ${d.rounds} รอบที่ยังไม่เริ่ม` : ''}`);
    } catch {
      setError('เชื่อมต่อไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="tdb-backdrop" onMouseDown={(e) => e.target === e.currentTarget && tryClose()}>
      <section className="tdb-modal tdb-app" role="dialog" aria-modal="true" aria-label="ใบสมัครและ PDPA">
        <div className="tdb-grab tdb-phone-only" aria-hidden />
        <div className="tdb-cx-head">
          <div style={{ flex: 1, minWidth: 0 }}>
            <span className="tdb-eyebrow" style={{ fontSize: 11 }}>
              ใบสมัคร · PDPA
            </span>
            <h2>{master.title}</h2>
            <p>คำถามที่ผู้จองตอบก่อนจอง ใช้กับทุกรอบของกิจกรรมนี้ — รอบที่ยังไม่เริ่มได้ทันที รอบที่เปิดใหม่ก็ได้ด้วย</p>
          </div>
          <button type="button" className="tdb-x" onClick={tryClose} disabled={saving} aria-label="ปิด">
            ×
          </button>
        </div>
        {bookedRounds > 0 && (
          <div className="tdb-note-ok">มี {bookedRounds} รอบที่มีคนจองแล้ว — คนที่จองแล้วไม่ต้องตอบใหม่ คำถามใหม่ใช้กับคนที่จองต่อจากนี้</div>
        )}
        <div className="tdb-app-body">
          <ApplicationEditor questions={questions} onQuestions={setQuestions} consent={consent} onConsent={setConsent} disabled={saving} />
        </div>
        <div className="tdb-cx-foot">
          {error && <div className="tdb-note-warn">{error}</div>}
          {askClose && <div className="tdb-note-warn">ยังไม่ได้บันทึก — กดปิดอีกครั้งเพื่อทิ้งการแก้ไข</div>}
          <div className="tdb-cx-actions">
            <button type="button" className="tdb-soft-btn" style={{ padding: '12px 20px' }} onClick={tryClose} disabled={saving}>
              {askClose ? 'ทิ้งการแก้ไข' : 'ยกเลิก'}
            </button>
            <button type="button" className="btn btn-teal" onClick={save} disabled={saving || !dirty} style={{ opacity: dirty ? 1 : 0.5 }}>
              {saving ? 'กำลังบันทึก…' : 'บันทึกใบสมัคร'}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
