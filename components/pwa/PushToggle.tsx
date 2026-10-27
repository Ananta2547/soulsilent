'use client';

/**
 * Turn app notifications on/off for this device.
 *  - variant "full" (on /app): always shown, explains every state; once on,
 *    lets the member pick which kinds they get (PushPrefs).
 *  - variant "nudge" (on My bookings): a small card only while notifications
 *    are off and could be turned on; closing it keeps it away for 30 days.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useLang, tr } from '@/lib/i18n';
import { Icon } from '@/components/design/Icon';
import { disablePush, enablePush, pushState, type PushState } from './push';

const NUDGE_KEY = 'asl-push-nudge-closed';

/** `prefs={false}`: leave the kind switches out — for a page that shows them
 *  itself regardless of this device (Settings → การแจ้งเตือน). */
export function PushToggle({ variant = 'full', prefs = true }: { variant?: 'full' | 'nudge'; prefs?: boolean }) {
  const { lang } = useLang();
  const [state, setState] = useState<PushState | 'loading'>('loading');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let alive = true;
    pushState()
      .then((s) => alive && setState(s))
      .catch(() => alive && setState('unsupported'));
    if (variant === 'nudge') {
      try {
        const at = Number(localStorage.getItem(NUDGE_KEY) || 0);
        // eslint-disable-next-line react-hooks/set-state-in-effect
        if (at && Date.now() - at < 30 * 86400000) setHidden(true);
      } catch {}
    }
    return () => {
      alive = false;
    };
  }, [variant]);

  const turnOn = async () => {
    setBusy(true);
    setErr('');
    try {
      setState(await enablePush());
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const turnOff = async () => {
    setBusy(true);
    await disablePush();
    setState('off');
    setBusy(false);
  };

  if (state === 'loading') return null;

  if (variant === 'nudge') {
    if (hidden || (state !== 'off' && state !== 'install-first')) return null;
    return (
      <div className="pwa-push-nudge">
        <span className="pwa-push-bell" aria-hidden="true"><Icon name="reminder" size={20} /></span>
        <div className="pwa-push-nudge-text">
          <b>{tr(lang, 'ให้เราเตือนก่อนวันกิจกรรมไหม?', 'Want a reminder before your day?')}</b>
          <span>
            {state === 'install-first'
              ? tr(lang, 'บน iPhone ต้องติดตั้งแอปก่อน แล้วเปิดการแจ้งเตือนจากในแอป', 'On iPhone, install the app first, then turn reminders on inside it')
              : tr(lang, 'เตือนคืนก่อนวันและก่อนเริ่ม 2 ชั่วโมง และแจ้งทันทีถ้ากิจกรรมเลื่อนหรือยกเลิก', 'The evening before, 2 hours before, and right away if your round moves or is cancelled')}
          </span>
          {err && <span className="pwa-push-err">{err}</span>}
        </div>
        {state === 'install-first' ? (
          <Link href="/app" className="pwa-banner-btn">{tr(lang, 'วิธีติดตั้ง', 'How')}</Link>
        ) : (
          <button type="button" className="pwa-banner-btn" disabled={busy} onClick={turnOn}>
            {busy ? '…' : tr(lang, 'เปิดเตือน', 'Turn on')}
          </button>
        )}
        <button
          type="button"
          className="pwa-banner-x"
          aria-label={tr(lang, 'ปิด', 'Close')}
          onClick={() => {
            setHidden(true);
            try {
              localStorage.setItem(NUDGE_KEY, String(Date.now()));
            } catch {}
          }}
        >
          ✕
        </button>
      </div>
    );
  }

  const text: Record<PushState, string> = {
    on: tr(lang, 'เปิดอยู่บนเครื่องนี้ เลือกได้ว่าอยากรับเรื่องไหน', 'On for this device. Choose what you want to hear about.'),
    off: tr(lang, 'แจ้งเมื่อจองสำเร็จ เตือนคืนก่อนวันและก่อนเริ่ม 2 ชั่วโมง และแจ้งทันทีถ้ากิจกรรมเลื่อนหรือยกเลิก', 'Booking confirmed, the evening before, 2 hours before, and right away if your round moves or is cancelled'),
    'install-first': tr(lang, 'บน iPhone / iPad ต้องติดตั้งแอปตามขั้นตอนด้านบนก่อน แล้วเปิดแอปจากไอคอนเพื่อเปิดการแจ้งเตือน', 'On iPhone/iPad, install the app above first, then open it from the icon to turn notifications on'),
    denied: tr(lang, 'เครื่องนี้ปิดการแจ้งเตือนของเว็บไว้ เปิดได้ในการตั้งค่าของเบราว์เซอร์ (ไอคอนแม่กุญแจข้าง URL)', 'Notifications are blocked for this site — allow them in your browser settings'),
    unsupported: tr(lang, 'เบราว์เซอร์นี้ยังไม่รองรับการแจ้งเตือน ลองใช้ Chrome หรือ Safari ล่าสุด', 'This browser does not support notifications — try the latest Chrome or Safari'),
    unavailable: tr(lang, 'การแจ้งเตือนยังไม่เปิดให้ใช้ เร็ว ๆ นี้', 'Notifications are coming soon'),
  };

  return (
    <div className="pwa-card pwa-push">
      <div className="pwa-push-head">
        <span className="pwa-push-bell" aria-hidden="true"><Icon name="reminder" size={20} /></span>
        <div>
          <h2>{tr(lang, 'การแจ้งเตือน', 'Notifications')}</h2>
          <p>{text[state]}</p>
          {err && <p className="pwa-push-err">{err}</p>}
        </div>
      </div>
      {state === 'off' && (
        <button type="button" className="pwa-cta" disabled={busy} onClick={turnOn}>
          {busy ? tr(lang, 'กำลังเปิด…', 'Turning on…') : tr(lang, 'เปิดการแจ้งเตือน', 'Turn on notifications')}
        </button>
      )}
      {state === 'on' && prefs && <PushPrefs />}
      {state === 'on' && (
        <button type="button" className="pwa-ghost" disabled={busy} onClick={turnOff}>
          {tr(lang, 'ปิดการแจ้งเตือนบนเครื่องนี้', 'Turn off on this device')}
        </button>
      )}
    </div>
  );
}

type Kind = 'booking' | 'reminder' | 'host' | 'admin';

/** Which kinds of notification to get, for every device of this member.
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
            sub: tr(lang, 'เรื่องด่วนใหม่จากหน้าข้อมูลเชิงลึก เช่น คืนเงิน ค้างโอน รอบยกเลิก', 'New urgent items from Admin Insights'),
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
        {tr(lang, 'ใช้กับทุกเครื่องที่คุณเปิดการแจ้งเตือนไว้', 'Applies to every device you turned notifications on')}
      </p>
      {err && <p className="pwa-push-err">{err}</p>}
    </div>
  );
}

export default PushToggle;
