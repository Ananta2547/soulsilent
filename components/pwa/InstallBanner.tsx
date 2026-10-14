'use client';

/**
 * A small card at the bottom of phone screens inviting people to install the
 * app. On Android/Chrome it installs in one tap; on iPhone it links to /app,
 * which shows the Share → Add to Home Screen steps.
 *
 * Shown only on touch phones, outside the installed app, from the second page
 * viewed in a visit, and not again for 14 days once closed.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLang, tr } from '@/lib/i18n';
import { isIOS, isStandalone, usePwa } from './usePwa';

const DISMISS_KEY = 'asl-install-dismissed';
const VIEWS_KEY = 'asl-install-views';
const QUIET_DAYS = 14;

export function InstallBanner() {
  const { lang } = useLang();
  const pathname = usePathname();
  const { canInstall, installed, promptInstall } = usePwa();
  const [eligible, setEligible] = useState(false);
  const [ios, setIos] = useState(false);
  const [closed, setClosed] = useState(false);

  useEffect(() => {
    if (isStandalone()) return;
    if (!window.matchMedia('(pointer: coarse) and (max-width: 820px)').matches) return;
    try {
      const at = Number(localStorage.getItem(DISMISS_KEY) || 0);
      if (at && Date.now() - at < QUIET_DAYS * 86400000) return;
      const views = Number(sessionStorage.getItem(VIEWS_KEY) || 0) + 1;
      sessionStorage.setItem(VIEWS_KEY, String(views));
      if (views < 2) return;
    } catch {
      return;
    }
    // Read after mount so the server render and the first client render agree.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIos(isIOS());
    setEligible(true);
  }, [pathname]);

  const dismiss = () => {
    setClosed(true);
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {}
  };

  // Android/desktop Chrome only offer install when the browser allows it;
  // iPhone always can, by hand.
  const show = eligible && !closed && !installed && pathname !== '/app' && (canInstall || ios);
  if (!show) return null;

  return (
    <div className="pwa-banner" role="dialog" aria-label={tr(lang, 'ติดตั้งแอป', 'Install the app')}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icons/icon-192.png" alt="" className="pwa-banner-icon" />
      <div className="pwa-banner-text">
        <b>{tr(lang, 'ติดตั้ง AllSoulLearn บนมือถือ', 'Get the AllSoulLearn app')}</b>
        <span>{tr(lang, 'เปิดได้ในแตะเดียว ดูการจองได้แม้ไม่มีเน็ต', 'One tap away, bookings even offline')}</span>
      </div>
      {canInstall ? (
        <button
          type="button"
          className="pwa-banner-btn"
          onClick={async () => {
            if (await promptInstall()) setClosed(true);
          }}
        >
          {tr(lang, 'ติดตั้ง', 'Install')}
        </button>
      ) : (
        <Link href="/app" className="pwa-banner-btn" onClick={() => setClosed(true)}>
          {tr(lang, 'วิธีติดตั้ง', 'How')}
        </Link>
      )}
      <button type="button" className="pwa-banner-x" onClick={dismiss} aria-label={tr(lang, 'ปิด', 'Close')}>
        ✕
      </button>
    </div>
  );
}

export default InstallBanner;
