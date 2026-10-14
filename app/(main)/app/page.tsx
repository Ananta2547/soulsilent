'use client';

/**
 * /app — how to install AllSoulLearn on a phone (it is a PWA: the website,
 * installable, no app store). The steps shown follow the device: a one-tap
 * button on Android/Chrome, Share → Add to Home Screen on iPhone, a QR code to
 * scan on a computer, and "open in your browser first" inside LINE/Facebook.
 */
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { useLang, tr } from '@/lib/i18n';
import { Icon } from '@/components/design/Icon';
import { isIOS, isStandalone, usePwa } from '@/components/pwa/usePwa';

type Device = 'loading' | 'installed' | 'ios' | 'android' | 'inapp' | 'desktop';

function detect(): Device {
  if (isStandalone()) return 'installed';
  const ua = navigator.userAgent;
  // LINE, Facebook, Instagram and similar in-app browsers cannot install apps.
  if (/Line\/|FBAN|FBAV|Instagram|; wv\)/i.test(ua)) return 'inapp';
  if (isIOS()) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'desktop';
}

function ShareGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ verticalAlign: '-0.2em' }}>
      <path d="M12 3v12M8 7l4-4 4 4" />
      <path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" />
    </svg>
  );
}

function AddGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" style={{ verticalAlign: '-0.2em' }}>
      <rect x="4" y="4" width="16" height="16" rx="4" />
      <path d="M12 8v8M8 12h8" />
    </svg>
  );
}

export default function AppInstallPage() {
  const { lang } = useLang();
  const th = lang === 'th';
  const { canInstall, installed, promptInstall } = usePwa();
  const [device, setDevice] = useState<Device>('loading');
  const [qr, setQr] = useState('');

  // Read the device after mount so the server render and the first client
  // render agree.
  useEffect(() => {
    const d = detect();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDevice(d);
    if (d === 'desktop') {
      QRCode.toDataURL(`${window.location.origin}/app`, { margin: 1, width: 360, color: { dark: '#0d1e1d', light: '#ffffff' } })
        .then(setQr)
        .catch(() => {});
    }
  }, []);

  const perks = [
    { icon: 'event' as const, t: th ? 'เปิดได้ในแตะเดียว' : 'One tap away', d: th ? 'ไอคอนอยู่บนหน้าจอ เปิดเต็มจอเหมือนแอป ไม่ต้องพิมพ์เว็บ' : 'An icon on your home screen that opens full screen' },
    { icon: 'date' as const, t: th ? 'ดูการจองได้แม้ไม่มีเน็ต' : 'Bookings offline', d: th ? 'วัน เวลา สถานที่ของกิจกรรมที่จองไว้ เปิดดูได้ที่หน้างานแม้สัญญาณไม่ดี' : 'Your booked dates, times and places, even with no signal' },
    { icon: 'reminder' as const, t: th ? 'แจ้งเตือน (เร็ว ๆ นี้)' : 'Reminders (soon)', d: th ? 'เตือนก่อนวันกิจกรรม รอบใหม่ของผู้จัดที่ชอบ และเมื่อเพื่อนรับคำเชิญ' : 'Before your day, new rounds, and when friends join' },
    { icon: 'notes' as const, t: th ? 'Diary อยู่ใกล้มือ' : 'Your Diary, close by', d: th ? 'กดค้างที่ไอคอนเพื่อไปที่การจอง Diary หรือปฏิทินได้ทันที (Android)' : 'Long-press the icon for bookings, Diary or calendar (Android)' },
  ];

  const done = device === 'installed' || installed;

  return (
    <div className="pwa-page">
      <section className="pwa-hero">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/icon-192.png" alt="" className="pwa-hero-icon" />
        <h1>{th ? 'AllSoulLearn บนมือถือ' : 'AllSoulLearn on your phone'}</h1>
        <p>{th ? 'ติดตั้งจากเว็บได้เลย ไม่ต้องโหลดจาก App Store หรือ Play Store ไม่เปลืองที่ และอัปเดตเองอัตโนมัติ' : 'Install straight from the web — no app store, almost no space, always up to date.'}</p>
      </section>

      <section className="pwa-card pwa-install">
        {device === 'loading' ? null : done ? (
          <div className="pwa-done">
            <span className="pwa-done-tick">✓</span>
            <div>
              <b>{th ? 'ติดตั้งแล้ว' : 'Installed'}</b>
              <p>{th ? 'คุณกำลังใช้ AllSoulLearn แบบแอปอยู่ เปิดได้จากไอคอนบนหน้าจอ' : 'You are using the app. Open it from your home screen.'}</p>
            </div>
          </div>
        ) : device === 'android' || (device === 'desktop' && canInstall) ? (
          <>
            <h2>{th ? 'ติดตั้งในแตะเดียว' : 'Install in one tap'}</h2>
            {canInstall ? (
              <button type="button" className="pwa-cta" onClick={() => promptInstall()}>
                {th ? 'ติดตั้งแอป' : 'Install the app'}
              </button>
            ) : (
              <ol className="pwa-steps">
                <li>{th ? 'กดเมนู ⋮ มุมขวาบนของ Chrome' : 'Tap the ⋮ menu in Chrome'}</li>
                <li>{th ? 'เลือก "ติดตั้งแอป" หรือ "เพิ่มลงในหน้าจอหลัก"' : 'Choose "Install app" or "Add to Home screen"'}</li>
                <li>{th ? 'กด "ติดตั้ง" — ไอคอนจะอยู่บนหน้าจอ' : 'Tap "Install" — the icon lands on your home screen'}</li>
              </ol>
            )}
            {device === 'desktop' && <p className="pwa-note">{th ? 'ติดตั้งบนคอมพิวเตอร์ก็ได้ แต่จะใช้สะดวกที่สุดบนมือถือ' : 'Works on a computer too, but it is best on a phone.'}</p>}
          </>
        ) : device === 'ios' ? (
          <>
            <h2>{th ? 'ติดตั้งบน iPhone / iPad' : 'Install on iPhone / iPad'}</h2>
            <ol className="pwa-steps">
              <li>{th ? 'เปิดหน้านี้ใน Safari' : 'Open this page in Safari'}</li>
              <li>
                {th ? 'กดปุ่มแชร์ ' : 'Tap Share '}
                <ShareGlyph />
                {th ? ' ด้านล่าง (หรือด้านบนบน iPad)' : ' at the bottom (top on iPad)'}
              </li>
              <li>
                {th ? 'เลื่อนลงแล้วกด ' : 'Scroll and tap '}
                <AddGlyph /> <b>{th ? '"เพิ่มไปยังหน้าจอโฮม"' : '"Add to Home Screen"'}</b>
              </li>
              <li>{th ? 'กด "เพิ่ม" มุมขวาบน — เสร็จแล้ว' : 'Tap "Add" — done'}</li>
            </ol>
            <p className="pwa-note">{th ? 'การแจ้งเตือนบน iPhone ใช้ได้เมื่อเปิดจากไอคอนที่ติดตั้งแล้วเท่านั้น (iOS 16.4 ขึ้นไป)' : 'On iPhone, notifications only work from the installed icon (iOS 16.4+).'}</p>
          </>
        ) : device === 'inapp' ? (
          <>
            <h2>{th ? 'เปิดในเบราว์เซอร์ก่อน' : 'Open in your browser first'}</h2>
            <p>{th ? 'แอปอย่าง LINE หรือ Facebook ติดตั้งให้ไม่ได้ กดเมนู ⋯ แล้วเลือก "เปิดในเบราว์เซอร์" (Safari หรือ Chrome) จากนั้นทำตามขั้นตอนบนหน้านี้อีกครั้ง' : 'LINE, Facebook and similar apps cannot install it. Tap ⋯ and choose "Open in browser" (Safari or Chrome), then follow this page again.'}</p>
          </>
        ) : (
          <div className="pwa-desktop">
            {qr && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qr} alt={th ? 'QR code ไปหน้านี้บนมือถือ' : 'QR code to this page'} className="pwa-qr" />
            )}
            <div>
              <h2>{th ? 'สแกนเพื่อติดตั้งบนมือถือ' : 'Scan to install on your phone'}</h2>
              <p>{th ? 'เปิดกล้องมือถือสแกน QR นี้ แล้วทำตามขั้นตอนที่ขึ้นบนมือถือ' : 'Point your phone camera at this code and follow the steps there.'}</p>
            </div>
          </div>
        )}
      </section>

      <section className="pwa-perks">
        {perks.map((p) => (
          <div key={p.t} className="pwa-perk">
            <span className="pwa-perk-icon">
              <Icon name={p.icon} size={22} />
            </span>
            <div>
              <b>{p.t}</b>
              <span>{p.d}</span>
            </div>
          </div>
        ))}
      </section>

      <p className="pwa-foot">{tr(lang, 'ลบแอปได้เหมือนแอปทั่วไป ข้อมูลบัญชีของคุณยังอยู่บนเว็บครบ', 'Remove it like any app — your account stays on the web.')}</p>
    </div>
  );
}
