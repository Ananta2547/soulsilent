'use client';

import { useEffect, useState, type ReactNode } from 'react';

type Me = { id: string; name: string; email: string; role: string };
type State = 'loading' | 'ok' | 'not-logged-in' | 'forbidden';

/**
 * Client-side role check for /admin/*. Server-side proxy.ts only requires
 * a session cookie (can't JWT-verify without Cloudflare bindings in dev),
 * and every /api/* admin route also runs `requireAdmin()`, so this is the
 * UI layer that tells the user *why* they can't see anything.
 */
export function AdminGuard({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>('loading');
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    fetch('/api/auth/me')
      .then(async (r) => {
        if (r.status === 401) return { user: null };
        return (await r.json()) as { user: Me | null };
      })
      .then((data) => {
        if (!data.user) {
          setState('not-logged-in');
          return;
        }
        setMe(data.user);
        setState(data.user.role === 'admin' ? 'ok' : 'forbidden');
      })
      .catch(() => setState('not-logged-in'));
  }, []);

  if (state === 'loading') {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (state === 'not-logged-in') {
    return (
      <div className="card text-center py-16 max-w-md mx-auto">
        <h2 className="font-heading text-xl text-dark mb-2">ต้องเข้าสู่ระบบ</h2>
        <p className="text-gray text-sm mb-5">หน้านี้เปิดเฉพาะผู้ดูแลระบบ</p>
        <a
          href={`/auth/login?redirect=${encodeURIComponent(window.location.pathname)}`}
          className="btn-primary text-sm"
        >
          เข้าสู่ระบบ
        </a>
      </div>
    );
  }

  if (state === 'forbidden') {
    return (
      <div className="card text-center py-16 max-w-md mx-auto">
        <h2 className="font-heading text-xl text-dark mb-2">เข้าถึงไม่ได้</h2>
        <p className="text-gray text-sm mb-1">
          คุณ login ในชื่อ <b className="text-dark">{me?.name}</b> ({me?.email})
        </p>
        <p className="text-gray text-sm mb-5">
          บัญชีนี้ role = <code className="bg-cream px-1.5 py-0.5 rounded text-xs">{me?.role}</code>{' '}
          ซึ่งไม่ใช่ admin
        </p>
        <div className="flex gap-2 justify-center">
          <a href="/" className="btn-ghost text-sm">
            กลับหน้าแรก
          </a>
          <a href="/auth/login?redirect=/admin" className="btn-primary text-sm">
            เปลี่ยนบัญชี
          </a>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
