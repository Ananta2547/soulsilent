import Link from 'next/link';
import { SocialIcon } from '@/components/design/SocialIcon';
import type { SocialKind } from '@/lib/teacher-profile';

/* Shared marketing footer — used by the Home and Workshops pages (ported from
   the Design Composer footer). Teal-deep social band over an ink info band. */

/** An entry with no href is shown but not clickable — the account exists in the
 *  set, its link just hasn't been given yet. */
const SOCIALS: { kind: SocialKind; label: string; href?: string }[] = [
  { kind: 'facebook', label: 'Facebook', href: 'https://www.facebook.com/allsoullearn' },
  { kind: 'instagram', label: 'Instagram', href: 'https://www.instagram.com/allsoullearn/' },
  { kind: 'youtube', label: 'YouTube', href: 'https://www.youtube.com/@allsoullearn' },
  { kind: 'tiktok', label: 'TikTok', href: 'https://www.tiktok.com/@allsoullearn' },
  { kind: 'x', label: 'X', href: 'https://x.com/allsoullearn' },
];

const FOOTER_NAV = [
  { label: 'กิจกรรมทั้งหมด', href: '/journeys' },
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
                <SocialIcon kind={s.kind} />
              </a>
            ) : (
              <span key={s.label} aria-label={s.label} style={{ ...dot, opacity: 0.45 }}>
                <SocialIcon kind={s.kind} />
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
