'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useLang, T, tr } from '@/lib/i18n';
import { Icon } from '@/components/design/Icon';
import { Pager } from '@/components/teacher/Pager';
import type { Workshop } from '@/lib/types';
import { getWorkshopDays, hasWorkshopEnded } from '@/lib/workshop-utils';

type Row = Workshop & { booked: number };

/** Two rows of the widest grid. Past that the page would outgrow the screen,
 *  which is the one thing this dashboard does not do. */
const PER_PAGE = 8;

const STATUS = (w: Row) => {
  if (w.status === 'cancelled') return { th: 'ยกเลิก', en: 'Cancelled', tone: '#9a4a3f', bg: '#f4dad4' };
  if (w.status === 'completed' || hasWorkshopEnded(w)) return { th: 'จบแล้ว', en: 'Ended', tone: 'var(--muted)', bg: 'var(--cream)' };
  return { th: 'เปิดรับ', en: 'Open', tone: 'var(--teal-deep)', bg: 'var(--teal-50)' };
};

export default function TeacherWorkshopsPage() {
  const { lang } = useLang();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [page, setPage] = useState(1);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/teacher/workshops');
        const data = (await res.json()) as { workshops?: Row[] };
        setRows(data.workshops || []);
      } catch (e) {
        console.error('Failed to load teacher workshops', e);
        setRows([]);
      }
    })();
  }, []);

  const pageCount = Math.max(1, Math.ceil((rows?.length || 0) / PER_PAGE));
  const current = Math.min(page, pageCount);
  const shown = (rows || []).slice((current - 1) * PER_PAGE, current * PER_PAGE);

  return (
    <div>
      <span className="eyebrow">
        <T th="workshop ของฉัน" en="my workshops" />
      </span>
      <h1 className="display-th" style={{ fontSize: 'clamp(26px,3.4vw,36px)', margin: '12px 0 6px' }}>
        <T th="เวิร์กชอปของฉัน" en="My Workshops" />
      </h1>
      <p style={{ fontSize: 14.5, color: 'var(--muted)', margin: '0 0 28px' }}>
        <T th="เวิร์กชอปที่คุณเป็นผู้นำกิจกรรม — ดูผู้สมัคร เช็คชื่อ และยอดโอน" en="Workshops you lead — applicants, check-in and payouts." />
      </p>

      {rows === null ? (
        <CardGridSkeleton />
      ) : rows.length === 0 ? (
        <div className="card card-static" style={{ textAlign: 'center', padding: '48px 24px' }}>
          <p style={{ color: 'var(--muted)', margin: 0 }}>
            <T th="ยังไม่มีเวิร์กชอปที่คุณดูแล" en="You don't lead any workshops yet." />
          </p>
        </div>
      ) : (
        <>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 18 }}>
          {shown.map((w) => {
            const days = getWorkshopDays(w);
            const st = STATUS(w);
            const dateLabel = new Date(days[0] + 'T00:00:00').toLocaleDateString(lang === 'th' ? 'th-TH' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
            return (
              <Link key={w.id} href={`/teacher/workshops/${w.id}`} className="card card-static" style={{ padding: 0, overflow: 'hidden', textDecoration: 'none', display: 'block' }}>
                {/* Posters are drawn at A3, so the frame is A3: the image fills
                    it edge to edge instead of sitting between bands of
                    background, and stays contained rather than cropped so an
                    odd-sized one is still shown whole. */}
                <div style={{ aspectRatio: '297 / 420', background: 'var(--cream)', position: 'relative' }}>
                  {w.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={w.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                  ) : null}
                  <span style={{ position: 'absolute', top: 10, right: 10, fontSize: 11, fontWeight: 600, color: st.tone, background: st.bg, borderRadius: 999, padding: '4px 10px' }}>
                    {tr(lang, st.th, st.en)}
                  </span>
                  {/* Whether the platform's share has reached the organizer —
                      the question a teacher has about a finished workshop. */}
                  <span
                    style={{
                      position: 'absolute',
                      top: 10,
                      left: 10,
                      fontSize: 11,
                      fontWeight: 600,
                      borderRadius: 999,
                      padding: '4px 10px',
                      color: w.payout_status === 'paid' ? 'var(--teal-deep)' : '#8a5a00',
                      background: w.payout_status === 'paid' ? 'var(--teal-50)' : '#fcefcf',
                    }}
                  >
                    {w.payout_status === 'paid' ? tr(lang, 'โอนแล้ว', 'Paid out') : tr(lang, 'รอโอน', 'Awaiting payout')}
                  </span>
                </div>
                <div style={{ padding: 16 }}>
                  <h3 className="display-th" style={{ fontSize: 17, margin: '0 0 8px', lineHeight: 1.3, color: 'var(--ink)' }}>
                    {w.title}
                  </h3>
                  <div style={{ fontSize: 13, color: 'var(--muted)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {/* Date and seats share a line — two short facts, one row. */}
                    <span style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <span>
                        <Icon name="date" size={13} /> {dateLabel}
                        {days.length > 1 ? tr(lang, ` · ${days.length} วัน`, ` · ${days.length} days`) : ''}
                      </span>
                      <span style={{ whiteSpace: 'nowrap' }}>
                        <Icon name="participants" size={13} /> {w.booked}/{w.max_participants} {tr(lang, 'ที่นั่ง', 'seats')}
                      </span>
                    </span>
                    {w.location && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}><Icon name="location" size={13} /> {w.location}</span>}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
        <Pager page={current} pageCount={pageCount} onChange={setPage} label="หน้าเวิร์กชอป" />
        </>
      )}
    </div>
  );
}

/** The grid's own shape while it loads — same columns, same card proportions,
 *  so nothing jumps when the workshops arrive. */
function CardGridSkeleton() {
  return (
    <div
      aria-hidden
      style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 18 }}
    >
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="card card-static" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="skel" style={{ aspectRatio: '3 / 4', borderRadius: 0 }} />
          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="skel" style={{ height: 17, width: '72%' }} />
            <div className="skel" style={{ height: 12, width: '52%' }} />
            <div className="skel" style={{ height: 12, width: '40%' }} />
          </div>
        </div>
      ))}
    </div>
  );
}
