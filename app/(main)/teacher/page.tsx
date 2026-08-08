'use client';

import { PageLoader } from '@/components/design/PageLoader';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useLang, T, tr } from '@/lib/i18n';
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
        <T th="แดชบอร์ดผู้สอน" en="Teacher dashboard" />
      </span>
      <h1 className="display-th" style={{ fontSize: 'clamp(28px,4vw,42px)', margin: '12px 0 6px' }}>
        <T th="เวิร์กชอปของฉัน" en="My Workshops" />
      </h1>
      <p style={{ fontSize: 14.5, color: 'var(--muted)', margin: '0 0 28px' }}>
        <T th="เวิร์กชอปที่คุณเป็นผู้นำกิจกรรม — ดูผู้สมัคร เช็คชื่อ และยอดโอน" en="Workshops you lead — applicants, check-in and payouts." />
      </p>

      {rows === null ? (
        <div className="flex items-center justify-center h-40">
          <PageLoader />
        </div>
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
                <div style={{ height: 150, background: 'var(--cream-deep)', position: 'relative' }}>
                  {w.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={w.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
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
                    <span>📅 {dateLabel}{days.length > 1 ? tr(lang, ` · ${days.length} วัน`, ` · ${days.length} days`) : ''}</span>
                    {w.location && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>📍 {w.location}</span>}
                    <span>👥 {w.booked}/{w.max_participants} {tr(lang, 'ที่นั่ง', 'seats')}</span>
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
