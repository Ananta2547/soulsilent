'use client';

/* Who the seat is for. Asked before payment, because a gift is bought for a
 * person, not for an account — the receiver may not have one yet. */
import { useState } from 'react';
import { useLang, T, tr } from '@/lib/i18n';
import { Btn } from '@/components/design/RippleButton';

const INPUT: React.CSSProperties = {
  width: '100%',
  border: '1px solid var(--cream-deep)',
  borderRadius: 12,
  padding: '12px 14px',
  fontSize: 14.5,
  background: 'var(--paper)',
  color: 'var(--ink)',
};

export function GiftModal({
  workshopTitle,
  submitting,
  onClose,
  onSubmit,
}: {
  workshopTitle: string;
  submitting: boolean;
  onClose: () => void;
  /** Resolves to an error message, or null when the caller took over (payment). */
  onSubmit: (recipient: { name: string; phone: string }) => Promise<string | null>;
}) {
  const { lang } = useLang();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (submitting) return;
    const n = name.trim();
    const p = phone.trim();
    if (!n) {
      setErr(tr(lang, 'กรุณากรอกชื่อผู้รับ', 'Please enter the recipient name.'));
      return;
    }
    // Thai mobile numbers are 9–10 digits; spaces and dashes are how people
    // actually type them, so they are stripped rather than rejected.
    if (p.replace(/[^0-9]/g, '').length < 9) {
      setErr(tr(lang, 'กรุณากรอกเบอร์โทรศัพท์ผู้รับให้ถูกต้อง', 'Please enter a valid phone number.'));
      return;
    }
    setErr(null);
    const message = await onSubmit({ name: n, phone: p });
    if (message) setErr(message);
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget && !submitting) onClose(); }}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()} style={{ maxWidth: 440 }}>
        <button
          type="button"
          onClick={onClose}
          disabled={submitting}
          aria-label={tr(lang, 'ปิด', 'Close')}
          style={{ position: 'absolute', top: 16, right: 18, background: 'none', border: 0, fontSize: 22, lineHeight: 1, color: 'var(--muted)', cursor: 'pointer' }}
        >
          ×
        </button>

        <div className="mono" style={{ fontSize: 11, color: 'var(--teal)', letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: 10 }}>
          {tr(lang, 'ส่งเป็นของขวัญ', 'Send as a gift')}
        </div>
        <h3 className="display-th" style={{ fontSize: 22, margin: '0 0 8px', lineHeight: 1.3 }}>
          {workshopTitle}
        </h3>
        <p style={{ fontSize: 13.5, color: 'var(--muted)', lineHeight: 1.6, margin: '0 0 20px' }}>
          <T
            th="กรอกชื่อและเบอร์ผู้รับ แล้วชำระเงินได้เลย — หลังชำระเสร็จคุณจะได้ลิงก์สำหรับส่งให้ผู้รับกดรับสิทธิ์และกรอกใบสมัครเอง"
            en="Tell us who it is for, then pay. Once paid you get a link to send them; they claim the seat and fill in their own application."
          />
        </p>

        <label style={{ display: 'block', marginBottom: 14 }}>
          <span style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
            {tr(lang, 'ชื่อผู้รับ', 'Recipient name')} <span style={{ color: '#b3261e' }}>*</span>
          </span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={submitting}
            placeholder={tr(lang, 'ชื่อ นามสกุล', 'Full name')}
            style={INPUT}
          />
        </label>

        <label style={{ display: 'block', marginBottom: 18 }}>
          <span style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
            {tr(lang, 'เบอร์โทรศัพท์ผู้รับ', 'Recipient phone')} <span style={{ color: '#b3261e' }}>*</span>
          </span>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            disabled={submitting}
            inputMode="tel"
            placeholder="08x-xxx-xxxx"
            style={INPUT}
          />
        </label>

        {err && (
          <div style={{ background: '#fdeceb', border: '1px solid #f3c9c5', color: '#b3261e', borderRadius: 12, padding: '10px 14px', fontSize: 13, lineHeight: 1.55, marginBottom: 14 }}>
            {err}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" onClick={onClose} disabled={submitting} className="btn btn-paper" style={{ flex: 1, justifyContent: 'center' }}>
            {tr(lang, 'ยกเลิก', 'Cancel')}
          </button>
          <Btn kind="teal" onClick={submit} disabled={submitting} style={{ flex: 1.4, justifyContent: 'center' }}>
            {submitting ? tr(lang, 'กำลังดำเนินการ…', 'Processing…') : <>{tr(lang, 'ไปชำระเงิน', 'Continue to payment')} <span className="mono">→</span></>}
          </Btn>
        </div>
      </div>
    </div>
  );
}
