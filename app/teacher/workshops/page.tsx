'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useLang, T, tr } from '@/lib/i18n';
import { Icon } from '@/components/design/Icon';
import type { Workshop } from '@/lib/types';
import { getWorkshopDays, hasWorkshopEnded } from '@/lib/workshop-utils';

type Row = Workshop & { booked: number };

const STATUS = (w: Row) => {
  if (w.status === 'cancelled') return { th: 'ยกเลิก', en: 'Cancelled', tone: '#9a4a3f', bg: '#f4dad4' };
  if (w.status === 'completed' || hasWorkshopEnded(w)) return { th: 'จบแล้ว', en: 'Ended', tone: 'var(--muted)', bg: 'var(--cream)' };
  return { th: 'เปิดรับ', en: 'Open', tone: 'var(--teal-deep)', bg: 'var(--teal-50)' };
};

export default function TeacherWorkshopsPage() {
  const { lang } = useLang();
  const [rows, setRows] = useState<Row[] | null>(null);

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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 18 }}>
          {rows.map((w) => {
            const days = getWorkshopDays(w);
            const st = STATUS(w);
            const dateLabel = new Date(days[0] + 'T00:00:00').toLocaleDateString(lang === 'th' ? 'th-TH' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
            return (
              <Link key={w.id} href={`/teacher/workshops/${w.id}`} className="card card-static" style={{ padding: 0, overflow: 'hidden', textDecoration: 'none', display: 'block' }}>
                {/* The poster is the thing a teacher recognises their own
                    workshop by, so it is shown whole: a 3:4 frame with the
                    image contained inside it, never cropped to a strip. */}
                <div style={{ aspectRatio: '3 / 4', background: 'var(--cream)', position: 'relative' }}>
                  {w.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={w.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                  ) : null}
                  <span style={{ position: 'absolute', top: 10, right: 10, fontSize: 11, fontWeight: 600, color: st.tone, background: st.bg, borderRadius: 999, padding: '4px 10px' }}>
                    {tr(lang, st.th, st.en)}
                  </span>
                </div>
                <div style={{ padding: 16 }}>
                  <h3 className="display-th" style={{ fontSize: 17, margin: '0 0 8px', lineHeight: 1.3, color: 'var(--ink)' }}>
                    {w.title}
                  </h3>
                  <div style={{ fontSize: 13, color: 'var(--muted)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span><Icon name="date" size={13} /> {dateLabel}{days.length > 1 ? tr(lang, ` · ${days.length} วัน`, ` · ${days.length} days`) : ''}</span>
                    {w.location && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}><Icon name="location" size={13} /> {w.location}</span>}
                    <span><Icon name="participants" size={13} /> {w.booked}/{w.max_participants} {tr(lang, 'ที่นั่ง', 'seats')}</span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
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
