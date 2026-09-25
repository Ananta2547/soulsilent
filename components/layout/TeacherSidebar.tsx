'use client';

import { useEffect, useState } from 'react';
import { useRailCollapsed } from './useRailCollapsed';
import { hasAnyRole } from '@/lib/roles';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * The teacher dashboard's section rail — the admin sidebar's twin, carrying the
 * teacher's three sections.
 *
 * From 1024px up it is a fixed rail beside the content. Below that a 256px rail
 * would take two-thirds of a phone, so it collapses to a top bar with a menu
 * button and slides in over the page when opened. The rail itself is the same
 * markup in both cases; only where it sits changes.
 *
 * It is a separate component rather than one shared rail taking a different
 * array: the two dashboards are edited by different people for different
 * reasons, and sharing would make every teacher menu change a change to the
 * admin menu's file. If a third dashboard ever appears, that is the moment to
 * lift the shell out.
 */
type NavItem = { href: string; label: string; icon: React.ReactNode };

// Workshops lead: they are what a teacher opens the dashboard to work on. The
// money and the feedback are things they check *about* those workshops.
const NAV: NavItem[] = [
  {
    href: '/teacher/workshops',
    label: 'Workshop เดี่ยว',
    icon: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M4 7.5h16M4 7.5v11a1.5 1.5 0 001.5 1.5h13a1.5 1.5 0 001.5-1.5v-11M9 7.5V6a2 2 0 012-2h2a2 2 0 012 2v1.5"
        />
      </svg>
    ),
  },
  {
    href: '/teacher/sessions',
    label: 'จัดรอบสอน',
    icon: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <rect x="3.5" y="5" width="17" height="15" rx="2" strokeWidth={1.5} />
        <path strokeLinecap="round" strokeWidth={1.5} d="M8 3v4M16 3v4M3.5 10h17M12 13v4M10 15h4" />
      </svg>
    ),
  },
  {
    href: '/teacher/overview',
    label: 'ภาพรวม / รายได้',
    icon: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 19V9m5 10V5m5 14v-7m5 7V8" />
      </svg>
    ),
  },
  {
    href: '/teacher/reviews',
    label: 'รีวิว',
    icon: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M11.5 4.3l2.1 4.3 4.7.7-3.4 3.3.8 4.7-4.2-2.2-4.2 2.2.8-4.7L4.7 9.3l4.7-.7 2.1-4.3z"
        />
      </svg>
    ),
  },
];

export function TeacherSidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  // Desktop only: fold the rail down to its icons.
  const [collapsed, toggleRail] = useRailCollapsed();
  // "จัดรอบสอน" is for the ผู้จัดรอบ role (session_host); admin sees it too.
  const [roles, setRoles] = useState<string[]>([]);
  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.json() as Promise<{ user?: { role?: string; roles?: string[] } | null }>)
      .then((d) => setRoles(d.user?.roles || (d.user?.role ? [d.user.role] : [])))
      .catch(() => {});
  }, []);
  const nav = NAV.filter((item) => item.href !== '/teacher/sessions' || hasAnyRole(roles, ['session_host']));
  // The phone top bar names the section the page belongs to.
  const here = NAV.find((item) => pathname.startsWith(item.href));

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      {/* Phone top bar — the rail stays off-screen until the menu is opened. */}
      <header className="tdb-topbar">
        <button type="button" className="tdb-topbar-btn" onClick={() => setOpen(true)} aria-label="เปิดเมนูผู้สอน" aria-expanded={open}>
          <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeWidth={1.8} d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </button>
        <span className="tdb-topbar-title">{here?.label || 'Teacher'}</span>
        <span className="tdb-brand-mark" aria-hidden>a</span>
      </header>

      {open && <div className="tdb-scrim" aria-hidden onClick={() => setOpen(false)} />}

      <aside className={`tdb-rail ${collapsed ? 'folded' : ''} ${open ? 'open' : ''}`}>
        <div className="tdb-rail-head">
          <Link href="/" className="tdb-brand" onClick={() => setOpen(false)}>
            <span className="tdb-brand-mark">a</span>
            <span className="tdb-brand-text">
              <span className="tdb-brand-name">
                allsoullearn<b>.</b>
              </span>
              <span className="tdb-brand-role">TEACHER</span>
            </span>
          </Link>
          {open ? (
            <button type="button" className="tdb-rail-toggle" onClick={() => setOpen(false)} aria-label="ปิดเมนู" style={{ color: '#fff', fontSize: 18 }}>
              ×
            </button>
          ) : (
            <button
              type="button"
              className="tdb-rail-toggle"
              onClick={toggleRail}
              aria-label={collapsed ? 'ขยายเมนู' : 'ย่อเมนู'}
              title={collapsed ? 'ขยายเมนู' : 'ย่อเมนู'}
              aria-expanded={!collapsed}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <rect x="3.5" y="4.5" width="17" height="15" rx="3" />
                <path d="M9 4.5v15M15.5 10l-2 2 2 2" />
              </svg>
            </button>
          )}
        </div>

        <nav className="tdb-nav">
          {nav.map((item) => {
            // Each section owns its subtree, so a round's check-in page keeps
            // "จัดรอบสอน" lit.
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                // Closes the drawer on the way out: the page behind it has just
                // changed, and a menu left over it hides what was asked for.
                onClick={() => setOpen(false)}
                title={collapsed ? item.label : undefined}
                className={`tdb-nav-item ${active ? 'on' : ''}`}
              >
                {item.icon}
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <Link href="/" onClick={() => setOpen(false)} title={collapsed ? 'กลับหน้าเว็บ' : undefined} className="tdb-nav-item tdb-nav-back">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 17l-5-5m0 0l5-5m-5 5h12" />
          </svg>
          <span>กลับหน้าเว็บ</span>
        </Link>
      </aside>
    </>
  );
}

export default TeacherSidebar;
