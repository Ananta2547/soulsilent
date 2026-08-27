'use client';

/* Announcement date + live countdown for Selection-Required workshops.
 * Shows "ประกาศผล: <24h datetime>" and a ticking countdown until that moment.
 * Once the time passes it prompts the user to refresh for their result. */
import { useEffect, useState } from 'react';
import { useLang, tr } from '@/lib/i18n';
import { Icon } from '@/components/design/Icon';
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

  return (
    <div
      style={{
        background: 'var(--cream)',
        border: '1px solid var(--cream-deep)',
        borderRadius: 14,
        padding: '12px 16px',
        ...style,
      }}
    >
      <div className="mono" style={{ fontSize: 10.5, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--teal-deep)', marginBottom: 4 }}>
        <Icon name="date" size={16} /> {heading ?? tr(lang, 'ประกาศผลคัดเลือก', 'Results announcement')}
      </div>
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>
        {fmtDateTime(announceAt, lang, 'long')}
      </div>
      {passed ? (
        <div style={{ fontSize: 12.5, color: 'var(--teal-deep)', marginTop: 6, fontWeight: 600 }}>
          {tr(lang, 'ถึงเวลาประกาศผลแล้ว — รีเฟรชหน้าเพื่อดูผล', 'Announcement time reached — refresh to see your result')}
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
          <Unit n={days} label={tr(lang, 'วัน', 'd')} />
          <Unit n={hours} label={tr(lang, 'ชม.', 'h')} />
          <Unit n={mins} label={tr(lang, 'นาที', 'm')} />
          <Unit n={secs} label={tr(lang, 'วิ', 's')} />
        </div>
      )}
    </div>
  );
}

function Unit({ n, label }: { n: number; label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 3, background: 'var(--paper)', borderRadius: 9, padding: '4px 9px' }}>
      <span style={{ fontFamily: 'Archivo Black, Mitr, sans-serif', fontSize: 16, color: 'var(--teal)', lineHeight: 1 }}>{n}</span>
      <span style={{ fontSize: 11, color: 'var(--muted)' }}>{label}</span>
    </span>
  );
}
