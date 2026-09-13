'use client';

/* One activity's rounds for the teacher: a calendar of the days it runs,
 * the rounds on the chosen day, and a way into each round's roster. */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useLang, T, tr } from '@/lib/i18n';
import { MonthPicker, todayYmd } from '@/components/calendar/MonthPicker';
import { fmtDate } from '@/lib/datetime';
import type { Workshop } from '@/lib/types';

type Row = Workshop & { booked: number };

export default function TeacherRoundsPage() {
  const { masterId } = useParams<{ masterId: string }>();
  const { lang } = useLang();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [day, setDay] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch('/api/teacher/workshops')
      .then((r) => (r.ok ? (r.json() as Promise<{ workshops: Row[] }>) : { workshops: [] }))
      .then((d) => {
        if (!alive) return;
        const mine = (d.workshops || []).filter((w) => w.master_id === masterId && w.status !== 'cancelled');
        setRows(mine);
        // Open on the nearest day from today, else the latest one there is.
        const today = todayYmd();
        const sorted = [...mine].sort((a, b) => a.date.localeCompare(b.date));
        const next = sorted.find((w) => w.date >= today) || sorted[sorted.length - 1];
        if (next) setDay(next.date);
      })
      .catch(() => {
        if (alive) setRows([]);
      });
    return () => {
      alive = false;
    };
  }, [masterId]);

  const byDay = useMemo(() => {
    const m = new Map<string, Row[]>();
    (rows || []).forEach((w) => {
      if (!m.has(w.date)) m.set(w.date, []);
      m.get(w.date)!.push(w);
    });
    m.forEach((list) => list.sort((a, b) => a.time_start.localeCompare(b.time_start)));
    return m;
  }, [rows]);
  const marks = useMemo(() => {
    const m: Record<string, number> = {};
    byDay.forEach((list, d) => {
      m[d] = list.length;
    });
    return m;
  }, [byDay]);

  if (rows === null) return null;
  const first = rows[0];
  const onDay = day ? byDay.get(day) || [] : [];

  return (
    <div>
      <Link href="/teacher/workshops" className="mono" style={{ fontSize: 12, color: 'var(--muted)', textDecoration: 'none' }}>
        ← {tr(lang, 'กลับไปเวิร์กชอปของฉัน', 'Back to my workshops')}
      </Link>
      <h1 className="display-th" style={{ fontSize: 'clamp(24px,3.5vw,36px)', margin: '12px 0 4px' }}>
        {first?.title || tr(lang, 'รอบสอน', 'Rounds')}
      </h1>
      <p style={{ fontSize: 14, color: 'var(--muted)', margin: '0 0 22px' }}>
        {tr(lang, `${rows.length} รอบ · ${byDay.size} วัน — จิ้มวันเพื่อดูรอบและเช็คชื่อ`, `${rows.length} rounds on ${byDay.size} days — tap a day to see its rounds and check in`)}
        {' · '}
        <Link href="/teacher/sessions" style={{ color: 'var(--teal-deep)' }}>{tr(lang, 'เปิด/แก้ไขรอบ', 'Open or edit rounds')} →</Link>
      </p>

      {rows.length === 0 ? (
        <div className="card card-static" style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--muted)' }}>
          <T th="ยังไม่มีรอบของ Workshop นี้" en="No rounds for this activity yet." />
        </div>
      ) : (
        <div className="tch-cal">
          <div className="card card-static">
            <MonthPicker value={day} onChange={setDay} enabled={new Set(byDay.keys())} marks={marks} min="" initialMonth={day || undefined} />
            <p style={{ fontSize: 12, color: 'var(--muted)', margin: '12px 0 0' }}>
              <T th="วันที่มีสี = มีรอบ · ตัวเลขคือจำนวนรอบในวันนั้น" en="Tinted days have a round · the number is how many that day" />
            </p>
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 10 }}>
              {day ? fmtDate(day, lang) : tr(lang, 'เลือกวันจากปฏิทิน', 'Choose a day')}
              {day && <span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: 13 }}> · {onDay.length} {tr(lang, 'รอบ', onDay.length === 1 ? 'round' : 'rounds')}</span>}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {onDay.map((w) => (
                <Link key={w.id} href={`/teacher/workshops/${w.id}`} className="card card-static" style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none', color: 'var(--ink)' }}>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span className="mono" style={{ display: 'block', fontWeight: 700, fontSize: 15 }}>
                      {w.time_start}–{w.time_end}
                    </span>
                    <span style={{ display: 'block', fontSize: 12.5, color: 'var(--muted)', marginTop: 2 }}>
                      {w.location || '—'}
                    </span>
                  </span>
                  <span className="tag" style={{ fontSize: 11 }}>{w.booked}/{w.max_participants} {tr(lang, 'ที่นั่ง', 'seats')}</span>
                  <span className="btn btn-teal btn-sm">{tr(lang, 'เช็คชื่อ', 'Check in')} →</span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
