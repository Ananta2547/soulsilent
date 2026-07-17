'use client';

/* PDPA photo/video consent indicator for attendance lists (admin + teacher).
 * Red "no photo" badge when the attendee did NOT consent (so staff avoid
 * photographing them); subtle green when they consented; nothing if the
 * workshop had no PDPA question. Uses inline styles so it drops into any list. */
import { readPdpaConsent } from '@/lib/pdpa';

export function PdpaBadge({
  applicationJson,
  lang = 'th',
}: {
  applicationJson: string | null | undefined;
  lang?: 'th' | 'en';
}) {
  const consent = readPdpaConsent(applicationJson);
  if (consent === null) return null;

  if (consent === 'denied') {
    return (
      <span
        title={lang === 'th' ? 'ผู้เข้าร่วมไม่ยินยอมให้บันทึกเสียง ภาพและวิดีโอ — โปรดหลีกเลี่ยงการถ่าย' : 'Did not consent to audio/photo/video — please avoid recording'}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          background: '#fdeceb', color: '#b3261e', border: '1px solid #f3c9c5',
          borderRadius: 999, padding: '2px 9px', fontSize: 11, fontWeight: 700, lineHeight: 1.4, whiteSpace: 'nowrap',
        }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" style={{ flexShrink: 0 }}>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.9} d="M3 3l18 18M9.5 5h5l1.5 2H19a2 2 0 012 2v8.5M4.5 7.5A2 2 0 013 9v9a2 2 0 002 2h12" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.9} d="M9.9 9.9a3 3 0 004.2 4.2" />
        </svg>
        {lang === 'th' ? 'ห้ามถ่ายรูป' : 'No photos'}
      </span>
    );
  }

  return (
    <span
      title={lang === 'th' ? 'ยินยอมให้บันทึกเสียง ภาพและวิดีโอ' : 'Consented to audio/photo/video'}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        background: '#e6f4f1', color: '#0f766e',
        borderRadius: 999, padding: '2px 9px', fontSize: 11, fontWeight: 600, lineHeight: 1.4, whiteSpace: 'nowrap',
      }}
    >
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" style={{ flexShrink: 0 }}>
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.4} d="M5 13l4 4L19 7" />
      </svg>
      {lang === 'th' ? 'ยินยอมถ่ายภาพ' : 'Photo OK'}
    </span>
  );
}
