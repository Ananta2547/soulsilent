'use client';

import './teacher.css';

import { hasAnyRole } from '@/lib/roles';

import { PageLoader } from '@/components/design/PageLoader';
import { TeacherSidebar } from '@/components/layout/TeacherSidebar';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

// Client gate: the teacher dashboard is for 'teacher' (and 'admin') roles only.
// Server-side, every /api/teacher/* route re-checks the role too.
//
// The dashboard sits outside the (main) route group on purpose — it is a tool,
// not a page of the marketing site, and it wears the same full-height dark rail
// the admin dashboard does rather than the site header. URLs are unchanged:
// (main) was only ever a route group.
export default function TeacherLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<'checking' | 'ok' | 'denied'>('checking');

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/auth/me');
        const data = (await res.json()) as { user?: { role?: string; roles?: string[] } | null };
        const roles = data.user?.roles || (data.user?.role ? [data.user.role] : []);
        if (hasAnyRole(roles, ['teacher'])) setState('ok');
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
      <div className="flex items-center justify-center" style={{ minHeight: '100vh' }}>
        <PageLoader />
      </div>
    );
  }

  return (
    // Design "Teacher Dashboard": a dark rail beside a scrolling page on
    // desktop; on phones the rail becomes a top bar with a slide-in menu
    // (styles in ./teacher.css).
    <div className="tdb-shell">
      <TeacherSidebar />
      <main className="tdb-main">
        <div className="tdb-page">{children}</div>
      </main>
    </div>
  );
}
