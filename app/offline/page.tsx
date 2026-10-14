'use client';

/**
 * Shown by the service worker (public/sw.js) when there is no connection and
 * the page asked for was not kept for offline use. Lives outside the (main)
 * shell so it needs nothing from the network to draw.
 */
import { useLang, tr } from '@/lib/i18n';
import { AllSoulLearnLogo } from '@/components/layout/AllSoulLearnLogo';

export default function OfflinePage() {
  const { lang } = useLang();
  return (
    <div className="pwa-offline">
      <AllSoulLearnLogo height={26} />
      <div className="pwa-offline-card">
        <span className="pwa-offline-dot" aria-hidden="true" />
        <h1>{tr(lang, 'ตอนนี้ไม่มีอินเทอร์เน็ต', 'You are offline')}</h1>
        <p>{tr(lang, 'หน้านี้ยังไม่ได้บันทึกไว้ในเครื่อง ลองเชื่อมต่ออีกครั้ง หรือเปิดหน้าที่ใช้ได้แม้ไม่มีเน็ต', 'This page was not saved on your phone. Reconnect, or open a page that works offline.')}</p>
        <button type="button" className="pwa-cta" onClick={() => window.location.reload()}>
          {tr(lang, 'ลองอีกครั้ง', 'Try again')}
        </button>
        <div className="pwa-offline-links">
          <a href="/me/bookings">{tr(lang, 'การจองของฉัน', 'My bookings')}</a>
          <a href="/me/journey">Diary / My Journey</a>
          <a href="/calendar">{tr(lang, 'ปฏิทิน', 'Calendar')}</a>
        </div>
        <p className="pwa-note">{tr(lang, 'ลิงก์เหล่านี้เปิดได้ถ้าคุณเคยเปิดไว้ตอนมีเน็ต', 'These open if you visited them while online.')}</p>
      </div>
    </div>
  );
}
