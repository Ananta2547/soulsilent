'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLang, T, tr } from '@/lib/i18n';
import { LangSwitch } from '@/components/design/LangSwitch';
import { Btn } from '@/components/design/RippleButton';
import { ProfileDropdown, type ProfileUser } from '@/components/layout/ProfileDropdown';
import { AllSoulLearnLogo } from '@/components/layout/AllSoulLearnLogo';

type UserInfo = ProfileUser;

export function SiteHeader() {
  const { lang } = useLang();
  const router = useRouter();
  const [user, setUser] = useState<UserInfo | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/auth/me');
        const data = (await res.json()) as { user: UserInfo | null };
        setUser(data.user);
      } catch {}
    }
    load();
  }, []);

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    setUser(null);
    router.push('/');
  }

  const links = [
    { href: '/workshops', th: 'กิจกรรม', en: 'Workshops' },
    { href: '/articles', th: 'บทความ', en: 'Articles' },
    { href: '/about', th: 'เกี่ยวกับเรา', en: 'About' },
  ];

  return (
    <>
      <div className="nav-wrap">
        <div className="nav-bar">
          <Link
            href="/"
            className="nav-logo"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              textDecoration: 'none',
              color: 'var(--ink)',
            }}
          >
            <AllSoulLearnLogo height={24} />
          </Link>

          {/* Nav sits next to the logo (design: Home Hero.dc.html). */}
          <nav className="hide-sm nav-links" style={{ marginLeft: 26 }}>
            {links.map((l) => (
              <Link key={l.href} href={l.href} className="nav-link">
                {tr(lang, l.th, l.en)}
              </Link>
            ))}
          </nav>

          {/* Spacer clusters the utilities (calendar, profile) on the right. */}
          <span style={{ flex: 1 }} />

          <Link
            href="/calendar"
            aria-label={tr(lang, 'ปฏิทิน', 'Calendar')}
            title={tr(lang, 'ปฏิทิน Workshop', 'Workshop Calendar')}
            className="nav-icon-btn"
          >
            <CalendarDaysIcon color="currentColor" size={18} />
          </Link>

          <LangSwitch />

          {user ? (
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setProfileOpen((o) => !o)}
                aria-haspopup="menu"
                aria-expanded={profileOpen}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '4px 10px 4px 4px',
                  borderRadius: 999,
                  background: profileOpen ? 'var(--cream-deep)' : 'var(--cream)',
                  border: 0,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  fontSize: 13.5,
                  fontWeight: 600,
                  color: 'var(--ink)',
                  transition: 'background .18s ease',
                }}
              >
                <span
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: '50%',
                    overflow: 'hidden',
                    background: 'var(--teal)',
                    color: '#fff',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 600,
                    fontSize: 13,
                    flexShrink: 0,
                    boxShadow: '0 0 0 2px var(--paper)',
                  }}
                >
                  {user.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={user.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    (user.nickname || user.name || '?')[0]
                  )}
                </span>
                <span className="hide-sm" style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {user.nickname || user.name}
                </span>
                <span style={{ fontSize: 10, opacity: 0.6 }}>▼</span>
              </button>
              {profileOpen && (
                <ProfileDropdown
                  user={user}
                  onClose={() => setProfileOpen(false)}
                  onLogout={handleLogout}
                />
              )}
            </div>
          ) : (
            /* Below 560px this is dropped from the bar to keep the header on
               one line — the drawer carries the same action. */
            <Btn kind="ink" size="sm" href="/auth/login" className="hide-xs">
              <T th="เข้าสู่ระบบ" en="Sign in" />
            </Btn>
          )}

          <button
            className="show-sm nav-icon-btn"
            onClick={() => setDrawerOpen(true)}
            aria-label="Menu"
          >
            <svg width="20" height="20" viewBox="0 0 22 22">
              <path
                d="M3 6 H 19 M3 11 H 19 M3 16 H 19"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
      </div>

      <div className={`drawer ${drawerOpen ? 'open' : ''}`} aria-hidden={!drawerOpen}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <AllSoulLearnLogo height={24} />
          <button
            onClick={() => setDrawerOpen(false)}
            className="nav-icon-btn"
            style={{ fontSize: 18 }}
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <div className="drawer-links">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => setDrawerOpen(false)}
              className="drawer-link"
            >
              {tr(lang, l.th, l.en)}
              <span aria-hidden className="mono">→</span>
            </Link>
          ))}
          {/* The calendar is a round icon in the bar; spelled out here so the
              drawer carries every destination the header does. */}
          <Link href="/calendar" onClick={() => setDrawerOpen(false)} className="drawer-link">
            {tr(lang, 'ปฏิทินกิจกรรม', 'Calendar')}
            <span aria-hidden className="mono">→</span>
          </Link>
        </div>
        <div style={{ marginTop: 'auto', display: 'flex', gap: 10 }}>
          {!user ? (
            <Btn
              kind="teal"
              href="/auth/login"
              onClick={() => setDrawerOpen(false)}
            >
              {tr(lang, 'เข้าสู่ระบบ', 'Sign in')}
            </Btn>
          ) : (
            <Btn
              kind="teal"
              onClick={() => {
                handleLogout();
                setDrawerOpen(false);
              }}
            >
              {tr(lang, 'ออกจากระบบ', 'Sign out')}
            </Btn>
          )}
        </div>
      </div>
    </>
  );
}

/* ============ Profile menu icons (inline SVG, no extra deps) ============ */
function CalendarDaysIcon({ color = 'currentColor', size = 16 }: { color?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
      <rect x="2.5" y="3.5" width="11" height="10" rx="1.5" stroke={color} strokeWidth="1.4" />
      <path d="M5.5 1.5 V4 M10.5 1.5 V4 M2.5 6.5 H13.5" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="5.5" cy="9.5" r="0.8" fill={color} />
      <circle cx="8" cy="9.5" r="0.8" fill={color} />
      <circle cx="10.5" cy="9.5" r="0.8" fill={color} />
    </svg>
  );
}


