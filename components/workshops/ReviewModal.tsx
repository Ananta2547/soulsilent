'use client';

/* Star-rating + comment modal for reviewing an attended, finished workshop. */
import { useState } from 'react';
import { useLang, T, tr } from '@/lib/i18n';
import { Btn } from '@/components/design/RippleButton';
import type { Review } from '@/lib/types';
import { Icon } from '@/components/design/Icon';

export function ReviewModal({
  workshopId,
  workshopTitle,
  initial,
  onClose,
  onSaved,
}: {
  workshopId: string;
  workshopTitle: string;
  initial: Review | null;
  onClose: () => void;
  onSaved: (review: Review) => void;
}) {
  const { lang } = useLang();
  const [rating, setRating] = useState<number>(initial?.rating ?? 0);
  const [hover, setHover] = useState<number>(0);
  const [comment, setComment] = useState<string>(initial?.comment ?? '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setErr(null);
    if (rating < 1) {
      setErr(tr(lang, 'กรุณาให้คะแนนอย่างน้อย 1 ดาว', 'Please give at least 1 star.'));
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/workshops/${workshopId}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating, comment }),
      });
      const data = (await res.json()) as { review?: Review; error?: string };
      if (!res.ok || !data.review) {
        setErr(data.error || tr(lang, 'บันทึกไม่สำเร็จ', 'Could not save'));
        return;
      }
      onSaved(data.review);
    } catch {
      setErr(tr(lang, 'เกิดข้อผิดพลาด', 'Something went wrong'));
    } finally {
      setSaving(false);
    }
  }

  const shown = hover || rating;
  const labels = ['', 'แย่', 'พอใช้', 'ดี', 'ดีมาก', 'ยอดเยี่ยม'];
  const labelsEn = ['', 'Poor', 'Fair', 'Good', 'Great', 'Excellent'];

  return (
    <div
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(13,30,29,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 16px', overflowY: 'auto' }}
    >
      <div style={{ width: '100%', maxWidth: 480, background: 'var(--paper)', borderRadius: 22, boxShadow: '0 30px 80px -24px rgba(13,30,29,.5)', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--cream-deep)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="mono" style={{ fontSize: 11, color: 'var(--muted)', letterSpacing: '.1em', textTransform: 'uppercase' }}>
              {tr(lang, 'รีวิวกิจกรรม', 'Journey review')}
            </div>
            <h2 className="display-th" style={{ fontSize: 20, margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {workshopTitle}
            </h2>
          </div>
          <button type="button" onClick={onClose} aria-label="close" style={{ background: 'none', border: 0, fontSize: 22, color: 'var(--muted)', cursor: 'pointer', lineHeight: 1 }}>
            ×
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '24px' }}>
          {err && (
            <div style={{ marginBottom: 16, padding: 12, background: '#fde7d3', color: '#a04a14', borderRadius: 12, fontSize: 13 }}>{err}</div>
          )}

          <div style={{ textAlign: 'center', marginBottom: 20 }}>
            <div style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 10 }}>
              <T th="ให้คะแนนกิจกรรมนี้" en="Rate this journey" />
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 6 }}>
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setRating(n)}
                  onMouseEnter={() => setHover(n)}
                  onMouseLeave={() => setHover(0)}
                  aria-label={`${n} star`}
                  style={{ background: 'none', border: 0, cursor: 'pointer', lineHeight: 0, padding: 2, color: n <= shown ? '#f5b301' : 'var(--cream-deep)', transition: 'transform .1s', transform: n <= hover ? 'scale(1.12)' : 'scale(1)' }}
                >
                  <Icon name="rating" size={38} filled={n <= shown} align="baseline" />
                </button>
              ))}
            </div>
            <div style={{ fontSize: 13, color: 'var(--teal-deep)', fontWeight: 600, marginTop: 8, minHeight: 18 }}>
              {shown ? tr(lang, labels[shown], labelsEn[shown]) : ''}
            </div>
          </div>

          <label style={{ display: 'block', fontSize: 13.5, fontWeight: 600, color: 'var(--ink)', marginBottom: 6 }}>
            <T th="ความประทับใจ / ข้อเสนอแนะ" en="Your impressions / suggestions" />
          </label>
          <textarea
            className="field"
            rows={4}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder={tr(lang, 'เล่าประสบการณ์ของคุณ...', 'Share your experience...')}
          />

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 12, fontSize: 12.5, color: 'var(--muted)' }}>
            <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
              <rect x="5" y="11" width="14" height="10" rx="2" strokeWidth={1.8} />
              <path strokeLinecap="round" strokeWidth={1.8} d="M8 11V7a4 4 0 1 1 8 0v4" />
            </svg>
            <T th="รีวิวได้ครั้งเดียว และไม่สามารถแก้ไขภายหลัง" en="You can review only once — it cannot be edited later." />
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid var(--cream-deep)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <button type="button" onClick={onClose} className="btn btn-paper btn-sm">
            {tr(lang, 'ยกเลิก', 'Cancel')}
          </button>
          <Btn kind="teal" onClick={submit} disabled={saving} style={{ marginLeft: 'auto', justifyContent: 'center' }}>
            {saving ? tr(lang, 'กำลังบันทึก…', 'Saving…') : tr(lang, 'ส่งรีวิว', 'Submit review')}
          </Btn>
        </div>
      </div>
    </div>
  );
}
