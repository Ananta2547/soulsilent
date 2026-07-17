'use client';

/* View your submitted application (read-only) while an event is ongoing, and
 * edit ONLY the PDPA photo/video consent. Everything else is locked. */
import { useMemo, useState } from 'react';
import { useLang, T, tr } from '@/lib/i18n';
import { Btn } from '@/components/design/RippleButton';

type AppProfile = {
  prefix?: string; fullName?: string; nickname?: string; age?: number | null; gender?: string;
  email?: string; phone?: string; facebook?: string; lineId?: string;
  emergency?: { name?: string; relation?: string; phone?: string };
  medical?: string; dietary?: string;
};
type AppSnapshot = {
  profile?: AppProfile;
  answers?: { id: string; label: string; value: string | string[] }[];
  consent?: { photoVideo?: 'granted' | 'denied'; label?: string };
};

export function ApplicationConsentModal({
  bookingId,
  applicationJson,
  workshopTitle,
  requireConsent,
  onClose,
  onSaved,
}: {
  bookingId: string;
  applicationJson: string | null;
  workshopTitle: string;
  requireConsent: boolean;
  onClose: () => void;
  onSaved?: (consent: 'granted' | 'denied') => void;
}) {
  const { lang } = useLang();
  const snap = useMemo<AppSnapshot>(() => {
    try { return applicationJson ? (JSON.parse(applicationJson) as AppSnapshot) : {}; } catch { return {}; }
  }, [applicationJson]);

  const p = snap.profile || {};
  const [consent, setConsent] = useState<'' | 'granted' | 'denied'>(snap.consent?.photoVideo || '');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const rows: [string, string][] = [
    [tr(lang, 'ชื่อ-นามสกุล', 'Full name'), p.fullName || '—'],
    [tr(lang, 'ชื่อเล่น', 'Nickname'), p.nickname || '—'],
    [tr(lang, 'อายุ', 'Age'), p.age != null ? `${p.age}` : '—'],
    [tr(lang, 'เพศ', 'Gender'), p.gender || '—'],
    [tr(lang, 'โทร', 'Phone'), p.phone || '—'],
    [tr(lang, 'อีเมล', 'Email'), p.email || '—'],
    ['Facebook', p.facebook || '—'],
    ['Line', p.lineId || '—'],
    [tr(lang, 'สุขภาพ / แพ้', 'Medical / allergies'), p.medical || '—'],
    [tr(lang, 'ข้อจำกัดอาหาร', 'Dietary'), p.dietary || '—'],
  ];

  async function saveConsent() {
    if (!consent) { setErr(tr(lang, 'กรุณาเลือกความยินยอม', 'Please choose a consent option')); return; }
    setSaving(true); setErr(null); setMsg(null);
    try {
      const res = await fetch(`/api/bookings/${bookingId}/consent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ consent }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) { setErr(data.error || tr(lang, 'บันทึกไม่สำเร็จ', 'Could not save')); return; }
      setMsg(tr(lang, 'บันทึกความยินยอมแล้ว', 'Consent saved'));
      onSaved?.(consent);
    } catch {
      setErr(tr(lang, 'เชื่อมต่อไม่ได้', 'Cannot reach server'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(13,30,29,.45)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 16px', overflowY: 'auto' }}
    >
      <div style={{ width: '100%', maxWidth: 560, background: 'var(--paper)', borderRadius: 22, boxShadow: '0 30px 80px -24px rgba(13,30,29,.5)', overflow: 'hidden' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--cream-deep)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="mono" style={{ fontSize: 11, color: 'var(--muted)', letterSpacing: '.1em', textTransform: 'uppercase' }}>
              {tr(lang, 'ใบสมัครของคุณ', 'Your application')}
            </div>
            <h2 className="display-th" style={{ fontSize: 20, margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {workshopTitle}
            </h2>
          </div>
          <button type="button" onClick={onClose} aria-label="close" style={{ background: 'none', border: 0, fontSize: 22, color: 'var(--muted)', cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>

        <div style={{ padding: '20px 24px', maxHeight: '60vh', overflowY: 'auto' }}>
          <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: '0 0 16px', lineHeight: 1.6 }}>
            <T th="ข้อมูลส่วนตัวเป็นแบบอ่านอย่างเดียว — แก้ไขได้เฉพาะการยินยอมบันทึกภาพ/วิดีโอในช่วงที่กิจกรรมกำลังจัด" en="Personal info is read-only — you may change only the photo/video consent while the event is ongoing." />
          </p>

          {/* Read-only application */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '8px 16px' }}>
            {rows.map(([k, v]) => (
              <div key={k}>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>{k}</div>
                <div style={{ fontSize: 14, color: 'var(--ink)', fontWeight: 500, wordBreak: 'break-word' }}>{v}</div>
              </div>
            ))}
            <div style={{ gridColumn: '1 / -1' }}>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>{tr(lang, 'ผู้ติดต่อฉุกเฉิน', 'Emergency contact')}</div>
              <div style={{ fontSize: 14, color: 'var(--ink)', fontWeight: 500 }}>
                {p.emergency && (p.emergency.name || p.emergency.phone) ? `${p.emergency.name || '—'} (${p.emergency.relation || '—'}) ${p.emergency.phone || ''}` : '—'}
              </div>
            </div>
          </div>

          {(snap.answers || []).length > 0 && (
            <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--cream-deep)' }}>
              {(snap.answers || []).map((a) => (
                <div key={a.id} style={{ fontSize: 13.5, marginBottom: 6 }}>
                  <span style={{ color: 'var(--muted)' }}>{a.label}: </span>
                  <span style={{ color: 'var(--ink)' }}>{Array.isArray(a.value) ? a.value.join(', ') : a.value || '—'}</span>
                </div>
              ))}
            </div>
          )}

          {/* Editable PDPA consent — the ONLY editable field */}
          {requireConsent && (
            <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--cream-deep)' }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)', marginBottom: 4 }}>
                {tr(lang, 'ความยินยอมการบันทึกเสียง ภาพและวิดีโอ (PDPA)', 'Audio, photo & video consent (PDPA)')}
                <span style={{ color: '#d35d52' }}> *</span>
              </div>
              <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 10px', lineHeight: 1.6 }}>
                {tr(lang, 'คุณสามารถเปลี่ยนการตัดสินใจได้ตลอดช่วงที่กิจกรรมกำลังจัด', 'You can change your choice anytime while the event is ongoing.')}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: 'var(--ink)', cursor: 'pointer' }}>
                  <input type="radio" name="consent-edit" checked={consent === 'granted'} onChange={() => setConsent('granted')} />
                  {tr(lang, 'ยินยอม', 'I consent')}
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: 'var(--ink)', cursor: 'pointer' }}>
                  <input type="radio" name="consent-edit" checked={consent === 'denied'} onChange={() => setConsent('denied')} />
                  {tr(lang, 'ไม่ยินยอม', 'I do not consent')}
                </label>
              </div>
              {err && <div style={{ marginTop: 10, fontSize: 13, color: '#a04a14' }}>{err}</div>}
              {msg && <div style={{ marginTop: 10, fontSize: 13, color: 'var(--teal-deep)' }}>✓ {msg}</div>}
            </div>
          )}
        </div>

        <div style={{ padding: '16px 24px', borderTop: '1px solid var(--cream-deep)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <button type="button" onClick={onClose} className="btn btn-paper btn-sm">
            {tr(lang, 'ปิด', 'Close')}
          </button>
          {requireConsent && (
            <Btn kind="teal" onClick={saveConsent} disabled={saving} style={{ marginLeft: 'auto', justifyContent: 'center' }}>
              {saving ? tr(lang, 'กำลังบันทึก…', 'Saving…') : tr(lang, 'บันทึกความยินยอม', 'Save consent')}
            </Btn>
          )}
        </div>
      </div>
    </div>
  );
}
