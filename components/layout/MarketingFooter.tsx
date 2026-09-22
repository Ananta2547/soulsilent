import Link from 'next/link';

/* Shared marketing footer — used by the Home and Workshops pages (ported from
   the Design Composer footer). Teal-deep social band over an ink info band. */

function SocialIcon({ label }: { label: string }) {
  const common = { width: 18, height: 18, viewBox: '0 0 24 24', 'aria-hidden': true } as const;
  switch (label) {
    case 'Facebook':
      return <svg {...common} fill="currentColor"><path d="M22 12a10 10 0 1 0-11.6 9.9v-7H7.9V12h2.5V9.8c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2.2.2 2.2.2v2.5h-1.3c-1.2 0-1.6.8-1.6 1.6V12h2.8l-.4 2.9h-2.4v7A10 10 0 0 0 22 12" /></svg>;
    case 'Instagram':
      return <svg {...common} fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.2" cy="6.8" r="1" /></svg>;
    case 'YouTube':
      return <svg {...common} fill="currentColor"><path d="M21.6 7.6a3 3 0 0 0-2.1-2.1C17.7 5 12 5 12 5s-5.7 0-7.5.5a3 3 0 0 0-2.1 2.1C2 9.4 2 12 2 12s0 2.6.4 4.4a3 3 0 0 0 2.1 2.1c1.8.5 7.5.5 7.5.5s5.7 0 7.5-.5a3 3 0 0 0 2.1-2.1c.4-1.8.4-4.4.4-4.4s0-2.6-.4-4.4M10 15.2V8.8l5.5 3.2z" /></svg>;
    case 'TikTok':
      return <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M16.6 5.1c-.9-.8-1.5-1.9-1.6-3.1h-3.1v13.9a3 3 0 1 1-2.1-2.9v-3.2A6.1 6.1 0 0 0 9 9.6a6.2 6.2 0 1 0 6.1 6.2V9.4a8.3 8.3 0 0 0 4.9 1.6V8a4.9 4.9 0 0 1-3.4-2.9" /></svg>;
    case 'X':
      return <svg {...common} fill="currentColor"><path d="M18.2 2.2h3.3l-7.2 8.3 8.5 11.3h-6.6l-5.2-6.8-6 6.8H1.7l7.7-8.8L1.2 2.2H8l4.7 6.2zm-1.2 17.9h1.8L7.1 4H5.2z" /></svg>;
    default:
      return null;
  }
}

/** An entry with no href is shown but not clickable — the account exists in the
 *  set, its link just hasn't been given yet. */
const SOCIALS: { label: string; href?: string }[] = [
  { label: 'Facebook', href: 'https://www.facebook.com/allsoullearn' },
  { label: 'Instagram', href: 'https://www.instagram.com/allsoullearn/' },
  { label: 'YouTube', href: 'https://www.youtube.com/@allsoullearn' },
  { label: 'TikTok', href: 'https://www.tiktok.com/@allsoullearn' },
  { label: 'X', href: 'https://x.com/allsoullearn' },
];

const FOOTER_NAV = [
  { label: 'กิจกรรมทั้งหมด', href: '/workshops' },
  { label: 'บทความ', href: '/articles' },
  { label: 'เกี่ยวกับเรา', href: '/about' },
  { label: 'ช่วยเหลือ', href: '/help' },
];

export function MarketingFooter() {
  const be = new Date().getFullYear() + 543;
  return (
    <footer>
      <div style={{ background: 'var(--teal-deep)', padding: '52px 0', textAlign: 'center' }}>
        <div className="mono" style={{ color: '#fff', letterSpacing: '.16em', fontSize: 14, textTransform: 'uppercase', fontWeight: 700, marginBottom: 22 }}>ติดตามเรา</div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}>
          {SOCIALS.map((s) => {
            const dot = { width: 42, height: 42, borderRadius: '50%', background: 'rgba(255,255,255,.14)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#fff' } as const;
            return s.href ? (
              <a key={s.label} href={s.href} target="_blank" rel="noopener noreferrer" aria-label={s.label} style={dot}>
                <SocialIcon label={s.label} />
              </a>
            ) : (
              <span key={s.label} aria-label={s.label} style={{ ...dot, opacity: 0.45 }}>
                <SocialIcon label={s.label} />
              </span>
            );
          })}
        </div>
      </div>

      <div style={{ background: 'var(--ink)' }}>
        <div className="container" style={{ paddingTop: 48, paddingBottom: 28 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ maxWidth: 280 }}>
              <span style={{ fontFamily: 'Mitr', fontWeight: 500, fontSize: 19, color: '#fff' }}>soulsilent<span style={{ color: 'var(--teal)' }}>.</span></span>
              <p style={{ margin: '16px 0 0', fontSize: 13.5, lineHeight: 1.65, color: 'rgba(255,255,255,.55)' }}>เรียนรู้นอกห้องเรียน — workshop · camp · organize</p>
            </div>
            <nav style={{ display: 'flex', flexWrap: 'wrap', gap: 28 }}>
              {FOOTER_NAV.map((l) => (
                <Link key={l.href} href={l.href} style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>{l.label}</Link>
              ))}
            </nav>
          </div>
          <div style={{ height: 1, background: 'rgba(255,255,255,.12)', margin: '36px 0 24px' }} />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="mono" style={{ fontSize: 11.5, color: 'rgba(255,255,255,.5)' }}>© {be} soulsilent. สงวนลิขสิทธิ์.</div>
            <div className="mono" style={{ fontSize: 11.5, color: 'rgba(255,255,255,.35)' }}>allsoullearn.com</div>
          </div>
        </div>
      </div>
    </footer>
  );
}
