'use client';

/**
 * Turn app notifications on/off for this device.
 *  - variant "full" (on /app): always shown, explains every state.
 *  - variant "nudge" (on My bookings): a small card only while notifications
 *    are off and could be turned on; closing it keeps it away for 30 days.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useLang, tr } from '@/lib/i18n';
import { Icon } from '@/components/design/Icon';
import { disablePush, enablePush, pushState, type PushState } from './push';

const NUDGE_KEY = 'asl-push-nudge-closed';

export function PushToggle({ variant = 'full' }: { variant?: 'full' | 'nudge' }) {
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
              : tr(lang, 'แจ้งเมื่อจองสำเร็จ เตือนคืนก่อนวัน และก่อนเริ่ม 2 ชั่วโมง', 'Booking confirmed, the evening before, and 2 hours before')}
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
    on: tr(lang, 'เปิดอยู่บนเครื่องนี้ — จะแจ้งเมื่อจองสำเร็จ เตือนคืนก่อนวัน และก่อนเริ่ม 2 ชั่วโมง', 'On for this device — booking confirmed, the evening before, and 2 hours before'),
    off: tr(lang, 'แจ้งเมื่อจองสำเร็จ เตือนคืนก่อนวันกิจกรรม และก่อนเริ่ม 2 ชั่วโมง', 'Booking confirmed, the evening before, and 2 hours before your day'),
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
      {state === 'on' && (
        <button type="button" className="pwa-ghost" disabled={busy} onClick={turnOff}>
          {tr(lang, 'ปิดการแจ้งเตือนบนเครื่องนี้', 'Turn off on this device')}
        </button>
      )}
    </div>
  );
}

export default PushToggle;
