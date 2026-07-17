'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useLang, T, tr } from '@/lib/i18n';
import { Btn } from '@/components/design/RippleButton';
import { ReviewModal } from '@/components/workshops/ReviewModal';
import { type JourneyItem, journeyStatus, fmtJourneyDate } from '@/lib/journey';
import { getWorkshopDays } from '@/lib/workshop-utils';
import type { Review } from '@/lib/types';

type AppProfile = {
  fullName?: string; nickname?: string; age?: number | null; gender?: string;
  email?: string; phone?: string; facebook?: string; lineId?: string;
  emergency?: { name?: string; relation?: string; phone?: string };
  medical?: string; dietary?: string;
};
type AppSnapshot = { profile?: AppProfile; answers?: { id: string; label: string; value: string | string[] }[]; consent?: { label?: string } };

export default function JourneyDetailPage() {
  const { lang } = useLang();
  const { workshopId } = useParams<{ workshopId: string }>();
  const [item, setItem] = useState<JourneyItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [showApp, setShowApp] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [slipOpen, setSlipOpen] = useState(false);

  function load() {
    fetch('/api/me/journey')
      .then((r) => (r.ok ? (r.json() as Promise<{ items: JourneyItem[] }>) : null))
      .then((d) => {
        const found = d?.items.find((x) => x.workshop_id === workshopId) || null;
        setItem(found);
        if (!found) setNotFound(true);
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }
  useEffect(load, [workshopId]);

  const snap = useMemo<AppSnapshot | null>(() => {
    if (!item?.application_json) return null;
    try { return JSON.parse(item.application_json) as AppSnapshot; } catch { return null; }
  }, [item?.application_json]);

  if (loading) {
    return (
      <section className="section" style={{ padding: '80px 0', textAlign: 'center' }}>
        <div style={{ width: 32, height: 32, border: '2px solid var(--teal)', borderTopColor: 'transparent', borderRadius: '50%', margin: '0 auto', animation: 'float 1s linear infinite' }} />
      </section>
    );
  }
  if (notFound || !item) {
    return (
      <section className="section" style={{ padding: '80px 0', textAlign: 'center' }}>
        <p style={{ color: 'var(--muted)', marginBottom: 16 }}>{tr(lang, 'ไม่พบกิจกรรมนี้ในเส้นทางของคุณ', 'This workshop is not in your journey')}</p>
        <Btn kind="teal" href="/me/journey">← My Journey</Btn>
      </section>
    );
  }

  const st = journeyStatus(item);
  const attended = item.attended === 1;
  const hasReview = item.review_rating != null;
  const days = getWorkshopDays({ workshop_type: item.workshop_type as 'one_day', date: item.date, end_date: item.end_date, dates_json: item.dates_json, time_end: item.time_end });
  const multiDay = days.length > 1;

  return (
    <section className="section" style={{ paddingTop: 40, paddingBottom: 64 }}>
      <div className="container" style={{ maxWidth: 720 }}>
        <Link href="/me/journey" style={{ fontSize: 13, color: 'var(--muted)', textDecoration: 'none' }}>
          ← My Journey
        </Link>

        {/* Poster */}
        {item.image_url && (
          <div style={{ marginTop: 16, borderRadius: 20, overflow: 'hidden', background: 'var(--cream-deep)', aspectRatio: '297 / 210', maxHeight: 380 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={item.image_url} alt={item.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
        )}

        {/* Title → workshop overview */}
        <Link href={`/workshops/${item.workshop_id}`} style={{ textDecoration: 'none', color: 'var(--ink)' }}>
          <h1 className="display-th" style={{ fontSize: 'clamp(26px, 4vw, 38px)', margin: '20px 0 4px', lineHeight: 1.2 }}>
            {item.title}
            <span style={{ fontSize: 15, color: 'var(--teal)', marginLeft: 10, whiteSpace: 'nowrap' }}>{tr(lang, 'ดูภาพรวม →', 'Overview →')}</span>
          </h1>
        </Link>

        {/* Status + date */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', margin: '10px 0 4px' }}>
          {st.done ? (
            <span className="tag" style={{ background: 'var(--cream-deep)', color: 'var(--muted)', fontSize: 13 }}>✓ {tr(lang, 'เสร็จสิ้นกิจกรรม', 'Completed')}</span>
          ) : (
            <span className="tag" style={{ background: '#e6f4f1', color: 'var(--teal-deep)', fontSize: 13 }}>⏳ {tr(lang, `นับถอยหลัง ${st.daysLeft} วัน`, `${st.daysLeft} days left`)}</span>
          )}
          {attended && <span className="tag" style={{ background: 'var(--teal)', color: '#fff', fontSize: 13 }}>★ {tr(lang, 'เข้าร่วมแล้ว', 'Attended')}</span>}
          <span className="mono" style={{ fontSize: 12.5, color: 'var(--muted)' }}>
            {multiDay ? `${fmtJourneyDate(days[0])} – ${fmtJourneyDate(days[days.length - 1])}` : `${fmtJourneyDate(item.date)} · ${item.time_start}–${item.time_end}`}
          </span>
        </div>

        {/* Photos Drive link — only present when admin set it AND user attended (gated server-side) */}
        {item.photos_drive_url && (
          <a
            href={item.photos_drive_url}
            target="_blank"
            rel="noopener noreferrer"
            className="card"
            style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', marginTop: 18, textDecoration: 'none', color: 'var(--ink)', background: 'var(--teal-50, #e6f4f1)' }}
          >
            <span style={{ width: 38, height: 38, borderRadius: 10, background: 'var(--teal)', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2" strokeWidth={1.7} /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M3 9h18M8 14l2.5 2.5L16 11" /></svg>
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14.5, fontWeight: 700 }}>{tr(lang, 'ดูรูปกิจกรรม (Google Drive)', 'Event photos (Google Drive)')}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>{tr(lang, 'เฉพาะผู้เข้าร่วมกิจกรรม', 'For attendees only')}</div>
            </div>
            <span aria-hidden style={{ color: 'var(--teal-deep)', fontSize: 18 }}>↗</span>
          </a>
        )}

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 20 }}>
          <button type="button" onClick={() => setShowApp((s) => !s)} className="btn btn-paper">
            {showApp ? tr(lang, 'ซ่อนใบสมัคร', 'Hide application') : tr(lang, 'ดูใบสมัคร', 'View application')}
          </button>
          {hasReview ? (
            <span className="btn btn-paper" style={{ cursor: 'default', pointerEvents: 'none', gap: 6 }}>
              <span style={{ color: '#f5b301', letterSpacing: 1 }}>{'★'.repeat(item.review_rating || 0)}</span>
              {tr(lang, 'รีวิวของคุณ', 'Your review')}
            </span>
          ) : attended && st.done ? (
            <Btn kind="teal" onClick={() => setReviewOpen(true)}>
              {tr(lang, 'เขียนรีวิว', 'Write a review')} ★
            </Btn>
          ) : null}
        </div>

        {/* Your review (read-only, one-time) */}
        {hasReview && (
          <div className="card" style={{ marginTop: 16, padding: '16px 18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
              <span className="mono" style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.1em' }}>{tr(lang, 'รีวิวของคุณ', 'Your review')}</span>
              <span style={{ color: '#f5b301', letterSpacing: 2 }}>{'★'.repeat(item.review_rating || 0)}<span style={{ color: 'var(--cream-deep)' }}>{'★'.repeat(5 - (item.review_rating || 0))}</span></span>
            </div>
            {item.review_comment && <p style={{ fontSize: 13.5, color: 'var(--ink)', lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap' }}>{item.review_comment}</p>}
          </div>
        )}

        {/* Application detail */}
        {showApp && (
          <div className="card" style={{ marginTop: 16, padding: '16px 18px' }}>
            {snap ? <ApplicationView snap={snap} lang={lang} /> : <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>{tr(lang, 'ไม่มีข้อมูลใบสมัคร', 'No application data')}</p>}
          </div>
        )}

        {/* Deposit refund slip — only when refunded (slip attached) */}
        {item.refund_slip_url && (
          <div className="card" style={{ marginTop: 16, padding: '16px 18px' }}>
            <div className="mono" style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 10 }}>{tr(lang, 'สลิปคืนเงินมัดจำ', 'Deposit refund slip')}</div>
            <button type="button" onClick={() => setSlipOpen(true)} style={{ background: 'none', border: 0, cursor: 'pointer', padding: 0 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item.refund_slip_url} alt="refund slip" style={{ maxWidth: 180, borderRadius: 12, border: '1px solid var(--cream-deep)', display: 'block' }} />
            </button>
          </div>
        )}
      </div>

      {reviewOpen && (
        <ReviewModal
          workshopId={item.workshop_id}
          workshopTitle={item.title}
          initial={null}
          onClose={() => setReviewOpen(false)}
          onSaved={(rv: Review) => {
            setItem((p) => (p ? { ...p, review_rating: rv.rating, review_comment: rv.comment } : p));
            setReviewOpen(false);
          }}
        />
      )}

      {slipOpen && item.refund_slip_url && (
        <div onMouseDown={(e) => { if (e.target === e.currentTarget) setSlipOpen(false); }} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(13,30,29,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 16px' }}>
          <div style={{ maxWidth: 420, width: '100%', background: 'var(--paper)', borderRadius: 18, overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--cream-deep)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="display-th" style={{ fontSize: 15 }}>{tr(lang, 'สลิปคืนเงินมัดจำ', 'Refund slip')}</span>
              <button type="button" onClick={() => setSlipOpen(false)} style={{ border: 0, background: 'var(--cream)', borderRadius: '50%', width: 30, height: 30, cursor: 'pointer' }}>✕</button>
            </div>
            <div style={{ padding: 14, textAlign: 'center', background: 'var(--cream)' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item.refund_slip_url} alt="refund slip" style={{ maxWidth: '100%', maxHeight: '70vh', borderRadius: 10 }} />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function ApplicationView({ snap, lang }: { snap: AppSnapshot; lang: 'th' | 'en' }) {
  const p = snap.profile || {};
  const items: [string, string][] = [
    [tr(lang, 'ชื่อ-นามสกุล', 'Full name'), p.fullName || '—'],
    [tr(lang, 'ชื่อเล่น', 'Nickname'), p.nickname || '—'],
    [tr(lang, 'อายุ', 'Age'), p.age != null ? `${p.age}` : '—'],
    [tr(lang, 'เพศ', 'Gender'), p.gender || '—'],
    [tr(lang, 'โทร', 'Phone'), p.phone || '—'],
    [tr(lang, 'อีเมล', 'Email'), p.email || '—'],
    ['Facebook', p.facebook || '—'],
    ['Line', p.lineId || '—'],
    [tr(lang, 'สุขภาพ/แพ้', 'Medical'), p.medical || '—'],
    [tr(lang, 'อาหาร', 'Dietary'), p.dietary || '—'],
    [tr(lang, 'ผู้ติดต่อฉุกเฉิน', 'Emergency'), p.emergency ? `${p.emergency.name || '—'} (${p.emergency.relation || '—'}) ${p.emergency.phone || ''}` : '—'],
  ];
  return (
    <div>
      <div className="mono" style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 10 }}>{tr(lang, 'ใบสมัคร', 'Application')}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '8px 16px' }}>
        {items.map(([k, v]) => (
          <div key={k}>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>{k}</div>
            <div style={{ fontSize: 13.5, color: 'var(--ink)' }}>{v}</div>
          </div>
        ))}
      </div>
      {(snap.answers || []).length > 0 && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--cream-deep)' }}>
          {(snap.answers || []).map((a) => (
            <div key={a.id} style={{ fontSize: 13, marginBottom: 4 }}>
              <span style={{ color: 'var(--muted)' }}>{a.label}: </span>
              <span style={{ color: 'var(--ink)' }}>{Array.isArray(a.value) ? a.value.join(', ') : a.value || '—'}</span>
            </div>
          ))}
        </div>
      )}
      {snap.consent?.label && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--cream-deep)', fontSize: 13, color: 'var(--muted)' }}>
          {tr(lang, 'ยินยอมบันทึกภาพ/วิดีโอ', 'Photo/video consent')}: <span style={{ color: 'var(--ink)' }}>{snap.consent.label}</span>
        </div>
      )}
    </div>
  );
}
