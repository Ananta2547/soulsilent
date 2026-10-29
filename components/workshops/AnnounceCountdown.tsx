'use client';

/* Announcement date + live countdown for Selection-Required workshops.
 * Shows "ประกาศผล: <24h datetime>" and a ticking countdown until that moment.
 * Once the time passes it prompts the user to refresh for their result. */
import { useEffect, useState } from 'react';
import { useLang, tr } from '@/lib/i18n';
import { fmtDateTime } from '@/lib/datetime';

function parts(diffMs: number) {
  const s = Math.max(0, Math.floor(diffMs / 1000));
  return {
    days: Math.floor(s / 86400),
    hours: Math.floor((s % 86400) / 3600),
    mins: Math.floor((s % 3600) / 60),
    secs: s % 60,
  };
}

export function AnnounceCountdown({
  announceAt,
  heading,
  style,
}: {
  announceAt: string;
  /** Override the box heading (default: "ประกาศผลคัดเลือก"). */
  heading?: string;
  style?: React.CSSProperties;
}) {
  const { lang } = useLang();
  // Lazy init avoids a synchronous setState inside the effect body.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const target = new Date(announceAt).getTime();
  if (Number.isNaN(target)) return null;
  const diff = target - now;
  const passed = diff <= 0;
  const { days, hours, mins, secs } = parts(diff);

  // Same dark card as the event countdown (design: Journey Detail).
  return (
    <div style={{ background: 'var(--ink)', color: '#fff', padding: '18px 16px', borderRadius: 16, ...style }}>
      <div className="mono" style={{ fontSize: 10.5, color: 'var(--accent)', letterSpacing: '.16em', textTransform: 'uppercase', textAlign: 'center', fontWeight: 600 }}>
        {heading ?? tr(lang, 'ประกาศผลคัดเลือก · นับถอยหลัง', 'Results · counting down')}
      </div>
      <div style={{ fontSize: 13.5, color: 'rgba(255,255,255,.75)', textAlign: 'center', margin: '4px 0 12px' }}>{fmtDateTime(announceAt, lang, 'long')}</div>
      {passed ? (
        <div style={{ fontSize: 13, color: 'var(--accent)', textAlign: 'center', fontWeight: 600 }}>
          {tr(lang, 'ถึงเวลาประกาศผลแล้ว — รีเฟรชหน้าเพื่อดูผล', 'Announcement time reached — refresh to see your result')}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, textAlign: 'center' }}>
          <Unit n={days} label={tr(lang, 'วัน', 'days')} />
          <Unit n={hours} label={tr(lang, 'ชม.', 'hrs')} />
          <Unit n={mins} label={tr(lang, 'นาที', 'min')} />
          <Unit n={secs} label={tr(lang, 'วิ', 'sec')} />
        </div>
      )}
    </div>
  );
}

function Unit({ n, label }: { n: number; label: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ fontFamily: 'Archivo Black, Mitr, sans-serif', fontSize: 'clamp(20px, 3.4vw, 30px)', lineHeight: 1, letterSpacing: '-.02em', color: '#fff' }}>{String(n).padStart(2, '0')}</div>
      <div className="mono" style={{ fontSize: 9.5, color: '#9ab1ae', letterSpacing: '.12em', textTransform: 'uppercase' }}>
        {label}
      </div>
    </div>
  );
}
