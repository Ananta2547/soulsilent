'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Logo } from './Logo';

/**
 * The teacher dashboard's section rail — the admin sidebar's twin, carrying the
 * teacher's three sections.
 *
 * It is a separate component rather than one shared rail taking a different
 * array: the two dashboards are edited by different people for different
 * reasons, and sharing would make every teacher menu change a change to the
 * admin menu's file. If a third dashboard ever appears, that is the moment to
 * lift the shell out.
 */
type NavItem = { href: string; label: string; icon: React.ReactNode };

const NAV: NavItem[] = [
  {
    href: '/teacher',
    label: 'ภาพรวม / รายได้',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 19V9m5 10V5m5 14v-7m5 7V8" />
      </svg>
    ),
  },
  {
    href: '/teacher/reviews',
    label: 'รีวิว',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M11.5 4.3l2.1 4.3 4.7.7-3.4 3.3.8 4.7-4.2-2.2-4.2 2.2.8-4.7L4.7 9.3l4.7-.7 2.1-4.3z"
        />
      </svg>
    ),
  },
  {
    href: '/teacher/workshops',
    label: 'Workshop ของฉัน',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M4 7.5h16M4 7.5v11a1.5 1.5 0 001.5 1.5h13a1.5 1.5 0 001.5-1.5v-11M9 7.5V6a2 2 0 012-2h2a2 2 0 012 2v1.5"
        />
      </svg>
    ),
  },
];

export function TeacherSidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 bg-dark min-h-screen flex flex-col shrink-0">
      <div className="p-6 border-b border-white/10">
        <Logo size="sm" />
        <p className="text-xs text-gray mt-1 font-mono tracking-wider">TEACHER</p>
      </div>

      <nav className="flex-1 p-4 space-y-1">
        {NAV.map((item) => {
          // /teacher matches only itself; the others own their subtrees, so the
          // workshop detail page keeps "Workshop ของฉัน" lit.
          const active =
            item.href === '/teacher' ? pathname === '/teacher' : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
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
          className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm text-gray-light hover:text-white hover:bg-white/5 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 17l-5-5m0 0l5-5m-5 5h12" />
          </svg>
          กลับหน้าเว็บ
        </Link>
      </div>
    </aside>
  );
}

export default TeacherSidebar;
