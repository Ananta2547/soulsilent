'use client';

import { PageLoader } from '@/components/design/PageLoader';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

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

  return <div className="container" style={{ padding: '40px 0 80px' }}>{children}</div>;
}
