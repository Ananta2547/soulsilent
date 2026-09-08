'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Logo } from './Logo';

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
    label: 'Workshop ของฉัน',
    icon: (
      <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
    href: '/teacher',
    label: 'ภาพรวม / รายได้',
    icon: (
      <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 19V9m5 10V5m5 14v-7m5 7V8" />
      </svg>
    ),
  },
  {
    href: '/teacher/reviews',
    label: 'รีวิว',
    icon: (
      <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
      {/* Phone header. The rail is off-screen until it is asked for. */}
      <header className="lg:hidden sticky top-0 z-40 flex items-center gap-3 bg-dark px-4 py-3">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="เปิดเมนูผู้สอน"
          aria-expanded={open}
          className="w-10 h-10 -ml-2 flex items-center justify-center rounded-xl text-gray-light hover:text-white hover:bg-white/5"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeWidth={1.5} d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </button>
        <Logo size="sm" markOnly />
        <span className="ml-auto text-[11px] text-gray font-mono tracking-wider">TEACHER</span>
      </header>

      {/* Scrim. Only ever present on phones, where the rail floats over the page. */}
      {open && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-ink/45"
          aria-hidden
          onClick={() => setOpen(false)}
        />
      )}

      <aside
        className={`w-64 bg-dark min-h-screen flex flex-col shrink-0 ${
          open
            ? 'fixed inset-y-0 left-0 z-50 shadow-2xl lg:static lg:shadow-none'
            : 'hidden lg:flex'
        }`}
      >
        <div className="p-6 border-b border-white/10 flex items-start gap-3">
          <div className="min-w-0">
            <Logo size="sm" markOnly />
            <p className="text-xs text-gray mt-1 font-mono tracking-wider">TEACHER</p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="ปิดเมนู"
            className="lg:hidden ml-auto -mt-1 -mr-1 w-9 h-9 flex items-center justify-center rounded-xl text-gray-light hover:text-white hover:bg-white/5"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeWidth={1.5} d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          {NAV.map((item) => {
            // /teacher matches only itself; the others own their subtrees, so
            // the workshop detail page keeps "Workshop ของฉัน" lit.
            const active =
              item.href === '/teacher' ? pathname === '/teacher' : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                // Closes the drawer on the way out: the page behind it has just
                // changed, and a menu left over it hides what was asked for.
                onClick={() => setOpen(false)}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors ${
                  active ? 'bg-primary text-white' : 'text-gray-light hover:text-white hover:bg-white/5'
                }`}
              >
                {item.icon}
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-white/10">
          <Link
            href="/"
            onClick={() => setOpen(false)}
            className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm text-gray-light hover:text-white hover:bg-white/5 transition-colors"
          >
            <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 17l-5-5m0 0l5-5m-5 5h12" />
            </svg>
            กลับหน้าเว็บ
          </Link>
        </div>
      </aside>
    </>
  );
}

export default TeacherSidebar;
