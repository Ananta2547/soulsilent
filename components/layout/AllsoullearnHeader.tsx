'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useLang, T, tr } from '@/lib/i18n';
import { LangSwitch } from '@/components/design/LangSwitch';
import { Btn } from '@/components/design/RippleButton';
import { ProfileDropdown, type ProfileUser } from '@/components/layout/ProfileDropdown';

type UserInfo = ProfileUser;

/* ---------- AllSoulLearn Logo ---------- */
function AslLogo({ size = 34 }: { size?: number }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 10,
        textDecoration: 'none',
        color: 'var(--ink)',
      }}
    >
      <span
        style={{
          width: size,
          height: size,
          borderRadius: '30%',
          background: 'var(--ink)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#fff',
          fontFamily: 'Archivo Black',
          fontSize: size * 0.46,
          position: 'relative',
          transform: 'rotate(-6deg)',
        }}
      >
        a
        <span
          style={{
            position: 'absolute',
            top: -3,
            right: -3,
            width: Math.max(8, size * 0.26),
            height: Math.max(8, size * 0.26),
            background: 'var(--accent)',
            borderRadius: '50%',
          }}
        />
        <span
          style={{
            position: 'absolute',
            bottom: -2,
            left: -2,
            width: 6,
            height: 6,
            background: 'var(--teal)',
            borderRadius: '50%',
          }}
        />
      </span>
      <span
        style={{
          fontFamily: 'Mitr',
          fontWeight: 500,
          fontSize: size * 0.58,
          letterSpacing: '-.012em',
          lineHeight: 1,
        }}
      >
        AllSoul<span style={{ color: 'var(--teal)' }}>Learn</span>
        <span style={{ color: 'var(--accent)' }}>.</span>
      </span>
    </span>
  );
}

export function AllsoullearnHeader() {
  const { lang } = useLang();
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<UserInfo | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/auth/me');
        const data = (await res.json()) as { user: UserInfo | null };
        setUser(data.user);
      } catch {}
    })();
  }, []);

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    setUser(null);
    router.push('/allsoullearn');
  }

  const links = [
    { href: '/allsoullearn/courses', key: 'courses', th: 'คอร์สเรียน', en: 'Courses' },
    { href: '/allsoullearn#why', key: 'paths', th: 'เส้นทาง', en: 'Paths' },
    { href: '/allsoullearn#teachers', key: 'teachers', th: 'ผู้สอน', en: 'Teachers' },
    { href: '/allsoullearn/about', key: 'about', th: 'เกี่ยวกับเรา', en: 'About' },
  ];

  const isCurrent = (href: string) => {
    if (href.includes('#')) return false;
    if (href === '/allsoullearn/courses') return pathname?.startsWith('/allsoullearn/courses');
    return pathname === href;
  };

  return (
    <>
      <div className="nav-wrap">
        <div
          className="container"
          style={{ display: 'flex', alignItems: 'center', gap: 20, padding: '16px 32px' }}
        >
          <Link href="/allsoullearn" style={{ textDecoration: 'none' }}>
            <AslLogo />
          </Link>

          <nav className="hide-sm" style={{ display: 'flex', gap: 6, marginLeft: 18, flex: 1 }}>
            {links.map((l) => (
              <Link
                key={l.key}
                href={l.href}
                className={`nav-link${isCurrent(l.href) ? ' current' : ''}`}
                style={isCurrent(l.href) ? { color: 'var(--teal)' } : undefined}
              >
                {tr(lang, l.th, l.en)}
              </Link>
            ))}
          </nav>

          <span style={{ flex: 1 }} className="show-sm" />

          <LangSwitch />

          <Link
            href="/"
            className="hide-sm"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 7,
              padding: '9px 14px',
              borderRadius: 999,
              background: 'var(--cream)',
              color: 'var(--ink)',
              textDecoration: 'none',
              fontSize: 13,
              fontWeight: 600,
              transition: 'background .2s ease',
            }}
            onMouseOver={(e) => (e.currentTarget.style.background = 'var(--cream-deep)')}
            onMouseOut={(e) => (e.currentTarget.style.background = 'var(--cream)')}
            title={tr(lang, 'กลับไป soulsilent', 'Back to soulsilent')}
          >
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: 'var(--teal)',
              }}
            />
            soulsilent
            <span className="mono" style={{ marginLeft: 2 }}>
              ↗
            </span>
          </Link>

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
                    background: 'var(--ink)',
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
            <Btn kind="ink" size="sm" href="/auth/login">
              <T th="เข้าสู่ระบบ" en="Sign in" />
            </Btn>
          )}

          <button
            className="show-sm"
            onClick={() => setDrawerOpen(true)}
            style={{ background: 'transparent', border: 0, padding: 8, cursor: 'pointer' }}
            aria-label="Menu"
          >
            <svg width="22" height="22" viewBox="0 0 22 22">
              <path
                d="M3 6 H 19 M3 11 H 19 M3 16 H 19"
                stroke="var(--ink)"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile drawer */}
      <div className={`drawer ${drawerOpen ? 'open' : ''}`} aria-hidden={!drawerOpen}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <AslLogo size={30} />
          <button
            onClick={() => setDrawerOpen(false)}
            style={{
              background: 'transparent',
              border: 0,
              padding: 8,
              cursor: 'pointer',
              fontSize: 18,
            }}
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 18 }}>
          {links.map((l) => (
            <Link
              key={l.key}
              href={l.href}
              onClick={() => setDrawerOpen(false)}
              style={{
                padding: '16px 4px',
                fontSize: 24,
                fontFamily: 'Mitr',
                fontWeight: 500,
                textDecoration: 'none',
                color: 'var(--ink)',
              }}
            >
              {tr(lang, l.th, l.en)}
            </Link>
          ))}
          <Link
            href="/"
            onClick={() => setDrawerOpen(false)}
            style={{
              marginTop: 16,
              padding: '16px 4px',
              fontSize: 18,
              fontWeight: 600,
              textDecoration: 'none',
              color: 'var(--teal)',
            }}
          >
            ↗ {tr(lang, 'กลับไป soulsilent', 'Back to soulsilent')}
          </Link>
        </div>
        <div style={{ marginTop: 'auto', display: 'flex', gap: 10 }}>
          {!user ? (
            <Btn kind="teal" href="/auth/login" onClick={() => setDrawerOpen(false)}>
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
