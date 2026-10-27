'use client';

import { useEffect, useState } from 'react';
import { useLang, tr } from '@/lib/i18n';

type Props = {
  /** Target ISO-like string from workshop (date "YYYY-MM-DD", time_start "HH:MM") */
  date: string;
  timeStart: string;
  timeEnd: string;
  /** Last day for multi-day events (YYYY-MM-DD). Defaults to `date`. `timeEnd`
   *  is then the last day's end time, so "ongoing/ended" spans the whole run. */
  endDate?: string;
};

function buildTarget(date: string, time: string): Date {
  // workshop.date and time_start are stored as local-time strings.
  // Build a Date in the user's local zone.
  return new Date(`${date}T${time}:00`);
}

function diffParts(ms: number) {
  if (ms < 0) ms = 0;
  const sec = Math.floor(ms / 1000);
  return {
    days: Math.floor(sec / 86400),
    hours: Math.floor((sec % 86400) / 3600),
    minutes: Math.floor((sec % 3600) / 60),
    seconds: sec % 60,
  };
}

export function Countdown({ date, timeStart, timeEnd, endDate }: Props) {
  const { lang } = useLang();
  // Init to 0 so server-rendered and first client paint match; real value
  // is set in useEffect after mount, then ticks every second.
  const [now, setNow] = useState<number>(0);

  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Before client effect runs (now === 0), render a placeholder so SSR
  // and first CSR paint produce identical markup.
  if (now === 0) {
    return (
      <div
        style={{
          background: 'var(--ink)',
          color: '#fff',
          padding: '18px 16px',
          borderRadius: 16,
          height: 90,
        }}
      />
    );
  }

  const start = buildTarget(date, timeStart);
  const end = buildTarget(endDate || date, timeEnd);
  const ms = start.getTime() - now;

  // States
  if (now >= end.getTime()) {
    return (
      <div
        style={{
          textAlign: 'center',
          padding: '14px 20px',
          background: 'var(--cream-deep)',
          color: 'var(--ink-soft)',
          borderRadius: 14,
          fontWeight: 600,
          fontSize: 14,
        }}
      >
        {tr(lang, 'กิจกรรมจบแล้ว — ขอบคุณที่เข้าร่วม', 'Event has ended — thanks for joining')}
      </div>
    );
  }

  if (now >= start.getTime() && now < end.getTime()) {
    return (
      // Same dark card as the countdown before it, so the box does not
      // change colour the moment the activity starts.
      <div
        style={{
          textAlign: 'center',
          padding: '18px 16px',
          background: 'var(--ink)',
          color: '#fff',
          borderRadius: 16,
        }}
      >
        <div
          className="mono"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 10.5, color: 'var(--accent)', letterSpacing: '.16em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 8 }}
        >
          <span className="cd-live-dot" aria-hidden="true" />
          {tr(lang, 'กำลังเริ่มแล้ว', 'In progress')}
        </div>
        <div style={{ fontFamily: "'Mitr', sans-serif", fontWeight: 500, fontSize: 17 }}>{tr(lang, 'กิจกรรมกำลังจัดอยู่ตอนนี้', 'The event is happening now')}</div>
        <style>{`.cd-live-dot{width:8px;height:8px;border-radius:99px;background:var(--accent);animation:cdLive 1.6s ease-out infinite}@keyframes cdLive{0%{box-shadow:0 0 0 0 rgba(245,194,67,.55)}100%{box-shadow:0 0 0 10px rgba(245,194,67,0)}}@media (prefers-reduced-motion: reduce){.cd-live-dot{animation:none}}`}</style>
      </div>
    );
  }

  const { days, hours, minutes, seconds } = diffParts(ms);
  const labels =
    lang === 'th'
      ? ['วัน', 'ชม.', 'นาที', 'วิ']
      : ['days', 'hrs', 'min', 'sec'];

  return (
    <div
      style={{
        background: 'var(--ink)',
        color: '#fff',
        padding: '18px 16px',
        borderRadius: 16,
      }}
    >
      <div
        className="mono"
        style={{
          fontSize: 10.5,
          color: 'var(--accent)',
          letterSpacing: '.16em',
          textTransform: 'uppercase',
          textAlign: 'center',
          marginBottom: 12,
          fontWeight: 600,
        }}
      >
        ✓ {tr(lang, 'จองสำเร็จ · นับถอยหลัง', 'Booked · counting down')}
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 6,
          textAlign: 'center',
        }}
      >
        {[days, hours, minutes, seconds].map((v, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div
              style={{
                fontFamily: 'Archivo Black, Mitr',
                fontSize: 'clamp(20px, 3.4vw, 30px)',
                lineHeight: 1,
                letterSpacing: '-.02em',
                color: '#fff',
              }}
            >
              {String(v).padStart(2, '0')}
            </div>
            <div
              className="mono"
              style={{
                fontSize: 9.5,
                color: '#9ab1ae',
                letterSpacing: '.12em',
                textTransform: 'uppercase',
              }}
            >
              {labels[i]}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
