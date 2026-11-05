'use client';

/**
 * "ยืนยันข้อมูลเพื่อลงกิจกรรมเอง" — shown on the host's "สร้าง & ส่งกิจกรรม" page
 * until admin grants self_publisher (migration 081). The host fills in who
 * they are, their page and their bank account; admin phones them, then
 * approves. Sent back with a note, they fix it and send again.
 */
import { useState } from 'react';
import {
  VERIFY_FIELDS,
  VERIFY_LABEL,
  VERIFY_REQUIRED,
  VERIFY_STATUS_LABEL,
  type VerificationRow,
  type VerifyData,
  type VerifyField,
} from '@/lib/verification-labels';

const GROUPS: { title: string; hint?: string; fields: VerifyField[] }[] = [
  { title: 'ข้อมูลส่วนตัว', fields: ['full_name', 'nickname', 'phone', 'email', 'line_id'] },
  { title: 'เพจและช่องทางออนไลน์', hint: 'เพจหรือเว็บที่ใช้ประชาสัมพันธ์กิจกรรม ทีมงานใช้ดูผลงานที่ผ่านมา', fields: ['page_url', 'facebook', 'instagram'] },
  { title: 'บัญชีรับเงิน', hint: 'ชื่อบัญชีควรตรงกับชื่อจริง — ใช้โอนรายได้จากกิจกรรม', fields: ['bank', 'account_no', 'account_name', 'promptpay'] },
  { title: 'แนะนำตัว', fields: ['about'] },
];

const PLACEHOLDER: Partial<Record<VerifyField, string>> = {
  page_url: 'https://facebook.com/…',
  bank: 'เช่น กสิกรไทย',
  phone: '08x-xxx-xxxx',
  about: 'กิจกรรมที่เคยจัด ประสบการณ์ หรือสิ่งที่อยากให้ทีมงานรู้',
};

export function VerifyPanel({
  verification,
  prefill,
  onSent,
}: {
  verification: VerificationRow | null;
  prefill: Partial<VerifyData>;
  onSent: () => void;
}) {
  const start = Object.fromEntries(VERIFY_FIELDS.map((k) => [k, (verification?.[k] ?? prefill[k] ?? '') as string])) as VerifyData;
  const [form, setForm] = useState<VerifyData>(start);
  const [editing, setEditing] = useState(!verification || verification.status === 'changes_requested');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const st = verification?.status;

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const miss = VERIFY_REQUIRED.find((k) => !form[k].trim());
    if (miss) return setErr(`กรุณากรอก${VERIFY_LABEL[miss]}`);
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch('/api/teacher/verification', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      const d = (await r.json()) as { error?: string };
      if (!r.ok) return setErr(d.error || 'ส่งไม่สำเร็จ');
      setEditing(false);
      onSent();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="tdb-ver">
      <div className="tdb-ver-intro">
        <h2>ยืนยันข้อมูลเพื่อลงกิจกรรมเอง</h2>
        <p>
          ก่อนสร้างกิจกรรมเอง ขอข้อมูลพื้นฐาน เพจ และบัญชีรับเงินก่อน ทีมงานจะโทรคุยกับคุณ แล้วเปิดสิทธิ์ให้ — จากนั้นสร้างกิจกรรมเดี่ยวหรือกิจกรรมจองรอบ
          แล้วส่งให้ทีมงานอนุมัติได้เลย
        </p>
      </div>

      {st && (
        <div className={`tdb-ver-status is-${st}`}>
          <b>{VERIFY_STATUS_LABEL[st]}</b>
          {st === 'pending' && <span> — ทีมงานจะโทรหาที่เบอร์ {verification?.phone} ก่อนอนุมัติ และแจ้งผลทาง LINE</span>}
          {st === 'approved' && <span> — แต่บัญชียังไม่มีสิทธิ์ลงกิจกรรมเอง กรุณาติดต่อทีมงาน</span>}
          {verification?.review_note && st !== 'pending' && <p className="tdb-sub-note">หมายเหตุจากทีมงาน: {verification.review_note}</p>}
        </div>
      )}

      {st === 'pending' && !editing && (
        <button type="button" className="tdb-sub-btn" onClick={() => setEditing(true)}>
          แก้ข้อมูลที่ส่งไป
        </button>
      )}

      {editing && st !== 'rejected' && st !== 'approved' && (
        <form className="tdb-ver-form" onSubmit={send}>
          {GROUPS.map((g) => (
            <fieldset key={g.title}>
              <legend>{g.title}</legend>
              {g.hint && <p className="tdb-ver-hint">{g.hint}</p>}
              <div className="tdb-ver-grid">
                {g.fields.map((k) => (
                  <label key={k} className={k === 'about' || k === 'page_url' ? 'is-wide' : undefined}>
                    <span>
                      {VERIFY_LABEL[k]}
                      {VERIFY_REQUIRED.includes(k) ? <i> *</i> : <em> (ถ้ามี)</em>}
                    </span>
                    {k === 'about' ? (
                      <textarea rows={4} value={form[k]} placeholder={PLACEHOLDER[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
                    ) : (
                      <input
                        value={form[k]}
                        type={k === 'email' ? 'email' : k === 'page_url' ? 'url' : 'text'}
                        inputMode={k === 'phone' || k === 'account_no' || k === 'promptpay' ? 'numeric' : undefined}
                        placeholder={PLACEHOLDER[k]}
                        onChange={(e) => setForm({ ...form, [k]: e.target.value })}
                      />
                    )}
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
          {err && <p className="tdb-ver-err">{err}</p>}
          <div className="tdb-sub-acts">
            <button type="submit" className="tdb-sub-btn ink" disabled={busy}>
              {busy ? 'กำลังส่ง…' : st ? 'ส่งข้อมูลอีกครั้ง' : 'ส่งข้อมูลให้ทีมงาน'}
            </button>
            {st === 'pending' && (
              <button type="button" className="tdb-sub-btn" onClick={() => setEditing(false)}>
                ยกเลิก
              </button>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
