'use client';

import { PageLoader } from '@/components/design/PageLoader';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useLang, tr } from '@/lib/i18n';

// Client gate: the teacher dashboard is for 'teacher' (and 'admin') roles only.
// Server-side, every /api/teacher/* route re-checks the role too.
export default function TeacherLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<'checking' | 'ok' | 'denied'>('checking');

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/auth/me');
        const data = (await res.json()) as { user?: { role?: string } | null };
        const role = data.user?.role;
        if (role === 'teacher' || role === 'admin') setState('ok');
        else setState('denied');
      } catch {
        setState('denied');
      }
    })();
  }, []);

  useEffect(() => {
    if (state === 'denied') router.replace('/');
  }, [state, router]);

  if (state !== 'ok') {
    return (
      <div className="flex items-center justify-center" style={{ minHeight: '60vh' }}>
        <PageLoader />
      </div>
    );
  }

  return (
    <div className="container tch-shell" style={{ padding: '40px 0 80px' }}>
      <TeacherNav />
      <div style={{ minWidth: 0 }}>{children}</div>
    </div>
  );
}

/**
 * Dashboard sections. A rail on the left from 900px up, a scrolling row of
 * pills above the content below that — a sidebar on a phone would eat the half
 * of the screen the work actually happens in.
 */
function TeacherNav() {
  const pathname = usePathname();
  const { lang } = useLang();

  const items = [
    { href: '/teacher', th: 'ภาพรวม / รายได้', en: 'Overview / Revenue' },
    { href: '/teacher/reviews', th: 'รีวิว', en: 'Reviews' },
    { href: '/teacher/workshops', th: 'Workshop ของฉัน', en: 'My workshops' },
  ];

  return (
    <nav className="tch-nav" aria-label={tr(lang, 'เมนูผู้สอน', 'Teacher menu')}>
      <div className="mono tch-nav-title">{tr(lang, 'แดชบอร์ดผู้สอน', 'teacher dashboard')}</div>
      {items.map((it) => {
        // /teacher matches only itself; the others own their subtrees, so the
        // workshop detail page keeps "Workshop ของฉัน" lit.
        const active =
          it.href === '/teacher' ? pathname === '/teacher' : pathname.startsWith(it.href);
        return (
          <Link
            key={it.href}
            href={it.href}
            aria-current={active ? 'page' : undefined}
            className={`tch-nav-link${active ? ' is-active' : ''}`}
          >
            {tr(lang, it.th, it.en)}
          </Link>
        );
      })}
    </nav>
  );
}
