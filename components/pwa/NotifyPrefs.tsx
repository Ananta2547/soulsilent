'use client';

/**
 * Notification settings bits. Notifications go through LINE only (the
 * installable app was retired), so:
 *  - LineNudge (on My bookings / admin alerts): a small card while this member
 *    has not linked LINE yet; closing it keeps it away for 30 days.
 *  - PushPrefs: which kinds of notification to get.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useLang, tr } from '@/lib/i18n';
import { Icon } from '@/components/design/Icon';

const NUDGE_KEY = 'asl-line-nudge-closed';

/** `dismissible={false}`: always shown while unlinked (admin alerts tab). */
export function LineNudge({ dismissible = true }: { dismissible?: boolean }) {
  const { lang } = useLang();
  const [show, setShow] = useState(false);

  useEffect(() => {
    let alive = true;
    if (dismissible) {
      try {
        const at = Number(localStorage.getItem(NUDGE_KEY) || 0);
        if (at && Date.now() - at < 30 * 86400000) return;
      } catch {}
    }
    fetch('/api/line/link')
      .then((r) => (r.ok ? (r.json() as Promise<{ available: boolean; linked: boolean; blocked: boolean }>) : null))
      .catch(() => null)
      .then((d) => alive && d && setShow(d.available && (!d.linked || d.blocked)));
    return () => {
      alive = false;
    };
  }, [dismissible]);

  if (!show) return null;
  return (
    <div className="pwa-push-nudge">
      <span className="pwa-push-bell" aria-hidden="true"><Icon name="reminder" size={20} /></span>
      <div className="pwa-push-nudge-text">
        <b>{tr(lang, 'รับการแจ้งเตือนทาง LINE ไหม?', 'Get notifications on LINE?')}</b>
        <span>
          {tr(lang, 'ยืนยันการจอง เตือนคืนก่อนวันและก่อนเริ่ม 2 ชั่วโมง และแจ้งทันทีถ้ากิจกรรมเลื่อนหรือยกเลิก', 'Booking confirmed, the evening before, 2 hours before, and right away if your round moves or is cancelled')}
        </span>
      </div>
      <Link href="/me/settings?tab=notify" className="pwa-banner-btn" style={{ background: '#06C755' }}>
        {tr(lang, 'เชื่อม LINE', 'Link LINE')}
      </Link>
      {dismissible && (
        <button
          type="button"
          className="pwa-banner-x"
          aria-label={tr(lang, 'ปิด', 'Close')}
          onClick={() => {
            setShow(false);
            try {
              localStorage.setItem(NUDGE_KEY, String(Date.now()));
            } catch {}
          }}
        >
          ✕
        </button>
      )}
    </div>
  );
}

type Kind = 'booking' | 'reminder' | 'host' | 'admin';

/** Which kinds of notification to get.
 *  Moves and cancellations are listed but locked on. */
export function PushPrefs() {
  const { lang } = useLang();
  const [off, setOff] = useState<Kind[] | null>(null);
  const [host, setHost] = useState(false);
  const [admin, setAdmin] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    fetch('/api/push/prefs')
      .then((r) => (r.ok ? (r.json() as Promise<{ off: Kind[]; host: boolean; admin?: boolean }>) : null))
      .then((d) => {
        if (!alive || !d) return;
        setOff(d.off);
        setHost(d.host);
        setAdmin(!!d.admin);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  if (!off) return null;

  const toggle = async (k: Kind) => {
    const next = off.includes(k) ? off.filter((x) => x !== k) : [...off, k];
    const prev = off;
    setOff(next);
    setSaving(true);
    setErr('');
    try {
      const r = await fetch('/api/push/prefs', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ off: next }),
      });
      if (!r.ok) throw new Error();
    } catch {
      setOff(prev);
      setErr(tr(lang, 'บันทึกไม่สำเร็จ ลองอีกครั้ง', 'Could not save, try again'));
    } finally {
      setSaving(false);
    }
  };

  const rows: { k: Kind | 'change'; title: string; sub: string }[] = [
    {
      k: 'change',
      title: tr(lang, 'กิจกรรมเลื่อนหรือยกเลิก', 'Round moved or cancelled'),
      sub: tr(lang, 'ส่งเสมอ เพื่อไม่ให้พลาดวันหรือสถานที่ใหม่', 'Always on, so you never miss a new day or place'),
    },
    {
      k: 'reminder',
      title: tr(lang, 'เตือนก่อนวันกิจกรรม', 'Reminders'),
      sub: tr(lang, 'คืนก่อนวัน และก่อนเริ่ม 2 ชั่วโมง', 'The evening before and 2 hours before'),
    },
    {
      k: 'booking',
      title: tr(lang, 'การจองของฉัน', 'My bookings'),
      sub: tr(lang, 'จองสำเร็จ ผลคัดเลือก ได้รับสิทธิ์/ของขวัญ เพื่อนเข้ากลุ่ม และแบบสอบถามหลังกิจกรรม', 'Booking confirmed, selection results, seats received, friends joining, surveys'),
    },
    ...(host
      ? [
          {
            k: 'host' as const,
            title: tr(lang, 'สำหรับผู้จัด', 'For hosts'),
            sub: tr(lang, 'มีคนจอง ขอคืนเงิน ใบสมัครใหม่ และรีวิว/แบบสอบถามคะแนนต่ำ', 'New bookings, refund requests, applications, low ratings'),
          },
        ]
      : []),
    ...(admin
      ? [
          {
            k: 'admin' as const,
            title: tr(lang, 'แจ้งเตือนผู้ดูแล (เรื่องด่วน)', 'Admin alerts (urgent)'),
            sub: tr(lang, 'รอบที่มีคนจองถูกยกเลิกหรือเลื่อน และเรื่องด่วนจากหน้าข้อมูลเชิงลึก เช่น คืนเงิน ค้างโอน', 'Booked rounds cancelled or moved, and urgent items from Admin Insights'),
          },
        ]
      : []),
  ];

  return (
    <div className="pwa-prefs" aria-busy={saving}>
      {rows.map((row) => {
        const locked = row.k === 'change';
        const on = locked || !off.includes(row.k as Kind);
        return (
          <label key={row.k} className={`pwa-pref${locked ? ' is-locked' : ''}`}>
            <span className="pwa-pref-text">
              <b>{row.title}</b>
              <span>{row.sub}</span>
            </span>
            <input
              type="checkbox"
              role="switch"
              className="pwa-switch"
              checked={on}
              disabled={locked}
              onChange={() => !locked && toggle(row.k as Kind)}
            />
          </label>
        );
      })}
      <p className="pwa-prefs-note">
        {tr(lang, 'ส่งทาง LINE ที่เชื่อมไว้', 'Sent to your linked LINE')}
      </p>
      {err && <p className="pwa-push-err">{err}</p>}
    </div>
  );
}

export default PushPrefs;
