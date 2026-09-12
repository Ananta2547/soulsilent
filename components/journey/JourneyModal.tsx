'use client';

/* One stop on the journey, opened in place — the popup from the Design
 * Composer "Journey + Diary" canvas. Tapping a card on /me/journey opens this
 * rather than navigating away, so the path stays behind it and closing puts the
 * reader back exactly where they were. There is no full-page version — the
 * only way out, other than closing, is to the workshop itself. */

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useLang, tr } from '@/lib/i18n';
import { Icon, Stars } from '@/components/design/Icon';
import { ReviewModal } from '@/components/workshops/ReviewModal';
import { type JourneyItem, journeyStatus, fmtJourneyDate } from '@/lib/journey';
import { getWorkshopDays } from '@/lib/workshop-utils';
import type { Review } from '@/lib/types';

export function JourneyModal({
  item,
  index,
  onClose,
  onChange,
}: {
  item: JourneyItem;
  /** Which stop this is, counted from the start of the path. */
  index: number;
  onClose: () => void;
  onChange: (next: JourneyItem) => void;
}) {
  const { lang } = useLang();
  const [note, setNote] = useState(item.journey_note || '');
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);

  /* On a phone this is a bottom sheet, so it closes the way sheets do — pulled
     down. The drag only starts when the sheet is scrolled to the top, so
     reading a long stop still scrolls normally. Mirrors the profile sheet. */
  const sheet = useRef<HTMLDivElement>(null);
  const dragFrom = useRef<number | null>(null);
  const dragStartedAt = useRef(0);
  const [dragY, setDragY] = useState(0);

  function onTouchStart(e: React.TouchEvent) {
    if (sheet.current && sheet.current.scrollTop > 0) return;
    dragFrom.current = e.touches[0].clientY;
    dragStartedAt.current = Date.now();
  }

  function onTouchMove(e: React.TouchEvent) {
    if (dragFrom.current == null) return;
    const dy = e.touches[0].clientY - dragFrom.current;
    setDragY(dy > 0 ? dy : dy / 5);
  }

  function onTouchEnd() {
    if (dragFrom.current == null) return;
    const dt = Date.now() - dragStartedAt.current;
    dragFrom.current = null;
    if (dragY > 110 || (dragY > 44 && dt < 280)) {
      onClose();
      return;
    }
    setDragY(0);
  }

  const dragging = dragFrom.current != null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function saveNote() {
    setSaving(true);
    setJustSaved(false);
    try {
      const res = await fetch('/api/me/journey', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ booking_id: item.booking_id, note }),
      });
      if (res.ok) {
        const d = (await res.json()) as { note: string | null };
        onChange({ ...item, journey_note: d.note });
        setNote(d.note || '');
        setJustSaved(true);
        setTimeout(() => setJustSaved(false), 2000);
      }
    } finally {
      setSaving(false);
    }
  }

  const st = journeyStatus(item);
  const attended = item.attended === 1;
  const hasReview = item.review_rating != null;
  const days = getWorkshopDays({
    workshop_type: item.workshop_type as 'one_day',
    date: item.date,
    end_date: item.end_date,
    dates_json: item.dates_json,
    time_end: item.time_end,
  });
  const multiDay = days.length > 1;
  const dirty = note !== (item.journey_note || '');

  return (
    <>
      <div
        className="jn-modal-backdrop"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div
          ref={sheet}
          className="jn-modal"
          role="dialog"
          aria-modal="true"
          aria-label={item.title}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onTouchCancel={onTouchEnd}
          style={{
            ...(dragY !== 0 ? { transform: `translateY(${Math.max(dragY, -24)}px)`, animation: 'none' } : null),
            transition: dragging ? 'none' : 'transform .26s cubic-bezier(.2,.8,.2,1)',
          }}
        >
          <span className="jn-modal-grab" aria-hidden />
          <button type="button" className="jn-modal-close" onClick={onClose} aria-label={tr(lang, 'ปิด', 'Close')}>
            ✕
          </button>

          {/* Left: the poster, shown whole rather than cropped. */}
          <div className="jn-modal-poster">
            <div className="jn-modal-poster-frame">
              {item.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.image_url} alt={item.title} />
              ) : (
                <span className="mono" style={{ fontSize: 11, color: 'var(--muted)' }}>
                  {tr(lang, 'ไม่มีรูป', 'No image')}
                </span>
              )}
            </div>
            <Link href={`/workshops/${item.workshop_id}`} className="btn btn-paper jn-modal-full">
              {tr(lang, 'รายละเอียด', 'Details')} <span aria-hidden className="mono">↗</span>
            </Link>
          </div>

          {/* Right: what happened that day, and what you wrote about it. */}
          <div className="jn-modal-body">
            <span className="eyebrow" style={{ color: 'var(--teal)' }}>
              {tr(lang, `จุดที่ ${String(index).padStart(2, '0')} บนเส้นทาง`, `stop ${index} on the path`)}
            </span>
            <h2 className="jn-modal-title">{item.title}</h2>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              {st.done ? (
                <span className="tag" style={{ background: 'var(--teal-50)', color: 'var(--teal-deep)' }}>
                  ✓ {tr(lang, 'เสร็จสิ้นกิจกรรม', 'Completed')}
                </span>
              ) : (
                <span className="tag" style={{ background: 'var(--teal-50)', color: 'var(--teal-deep)' }}>
                  <Icon name="duration" size={13} /> {tr(lang, `อีก ${st.daysLeft} วัน`, `${st.daysLeft} days left`)}
                </span>
              )}
              {attended && (
                <span className="tag" style={{ background: 'var(--ink)', color: '#fff' }}>
                  <Icon name="rating" size={12} filled /> {tr(lang, 'เข้าร่วมแล้ว', 'Attended')}
                </span>
              )}
              <span className="mono" style={{ fontSize: 12.5, color: 'var(--muted)' }}>
                {multiDay
                  ? `${fmtJourneyDate(days[0])} – ${fmtJourneyDate(days[days.length - 1])}`
                  : `${fmtJourneyDate(item.date)} · ${item.time_start}–${item.time_end}`}
              </span>
            </div>

            {item.photos_drive_url && (
              <a href={item.photos_drive_url} target="_blank" rel="noopener noreferrer" className="jn-modal-drive">
                <span className="jn-modal-drive-mark" aria-hidden>
                  <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <rect x="3" y="5" width="18" height="14" rx="2" strokeWidth={1.7} />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M3 9h18M8 14l2.5 2.5L16 11" />
                  </svg>
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontWeight: 600, fontSize: 15 }}>
                    {tr(lang, 'ดูรูปกิจกรรม (Google Drive)', 'Event photos (Google Drive)')}
                  </span>
                  <span style={{ display: 'block', fontSize: 12.5, color: 'var(--muted)', marginTop: 2 }}>
                    {tr(lang, 'เฉพาะผู้เข้าร่วมกิจกรรม', 'For attendees only')}
                  </span>
                </span>
                <span aria-hidden style={{ color: 'var(--teal)' }}>↗</span>
              </a>
            )}

            {/* Rating: yours if you left one, an invitation if you can leave one. */}
            {(hasReview || (attended && st.done)) && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 20, flexWrap: 'wrap' }}>
                <span className="eyebrow" style={{ color: 'var(--muted)' }}>{tr(lang, 'ให้ดาว', 'Rating')}</span>
                {hasReview ? (
                  <>
                    <Stars value={item.review_rating || 0} size={17} />
                    <span style={{ fontSize: 13.5, color: 'var(--muted)' }}>
                      {item.review_rating}/5 · {tr(lang, 'ขอบคุณที่รีวิว', 'thanks for reviewing')}
                    </span>
                  </>
                ) : (
                  <button type="button" onClick={() => setReviewOpen(true)} className="btn btn-teal btn-sm">
                    {tr(lang, 'เขียนรีวิว', 'Write a review')} <Icon name="rating" size={14} filled />
                  </button>
                )}
              </div>
            )}

            {/* The private note — the one thing here only you can see. */}
            <div className="jn-modal-note">
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
                <Icon name="notes" size={17} />
                <span style={{ fontWeight: 600, fontSize: 15 }}>{tr(lang, 'ความทรงจำส่วนตัว', 'Your memory')}</span>
                <span className="eyebrow" style={{ color: 'var(--muted)' }}>{tr(lang, 'ส่วนตัว', 'private')}</span>
              </div>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={4}
                placeholder={tr(lang, 'วันนั้นรู้สึกยังไงบ้าง', 'How did that day feel?')}
                className="jn-modal-textarea"
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 14, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={saveNote}
                  disabled={saving || !dirty}
                  className="btn btn-ink btn-sm"
                  style={{ opacity: saving || !dirty ? 0.5 : 1 }}
                >
                  {saving
                    ? tr(lang, 'กำลังบันทึก...', 'Saving...')
                    : tr(lang, `บันทึกลงวันที่ ${fmtJourneyDate(item.date)}`, `Save to ${fmtJourneyDate(item.date)}`)}
                </button>
                {justSaved && <span style={{ fontSize: 13, color: 'var(--teal)' }}>✓ {tr(lang, 'บันทึกแล้ว', 'Saved')}</span>}
              </div>
            </div>
          </div>
        </div>
      </div>

      {reviewOpen && (
        <ReviewModal
          workshopId={item.workshop_id}
          workshopTitle={item.title}
          initial={null}
          onClose={() => setReviewOpen(false)}
          onSaved={(rv: Review) => {
            onChange({ ...item, review_rating: rv.rating, review_comment: rv.comment });
            setReviewOpen(false);
          }}
        />
      )}
    </>
  );
}
