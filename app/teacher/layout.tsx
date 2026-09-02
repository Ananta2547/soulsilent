'use client';

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
      <div className="flex items-center justify-center" style={{ minHeight: '100vh' }}>
        <PageLoader />
      </div>
    );
  }

  return (
    // Column on phones — the rail collapses to a top bar there and only slides
    // over the page when asked for; a row from 1024px, where it is a fixed rail.
    //
    // From 1024px the shell is exactly one viewport tall and the window itself
    // never scrolls: each page pages its own long lists rather than growing.
    // The content column keeps overflow-auto as a safety valve for a short
    // desktop window — a page that cannot be reached at all is worse than a
    // scrollbar. Phones keep normal page scroll: a dashboard does not fit a
    // phone screen, and trapping it in 100vh would hide the bottom of it.
    <div className="flex flex-col lg:flex-row min-h-screen lg:h-screen lg:overflow-hidden bg-surface">
      <TeacherSidebar />
      <div className="flex-1 min-w-0 lg:h-screen lg:overflow-y-auto">
        <div className="p-4 sm:p-6 lg:p-8">{children}</div>
      </div>
    </div>
  );
}
