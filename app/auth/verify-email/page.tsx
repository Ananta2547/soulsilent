'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useLang, T, tr } from '@/lib/i18n';
import { Btn } from '@/components/design/RippleButton';

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', background: 'var(--cream)' }} />}>
      <VerifyInner />
    </Suspense>
  );
}

type Status = 'loading' | 'ok' | 'error';

function VerifyInner() {
  const { lang } = useLang();
  const token = useSearchParams().get('token') || '';
  const [status, setStatus] = useState<Status>('loading');

  useEffect(() => {
    (async () => {
      if (!token) {
        setStatus('error');
        return;
      }
      try {
        const res = await fetch('/api/auth/verify-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        const data = (await res.json()) as { ok?: boolean };
        setStatus(res.ok && data.ok ? 'ok' : 'error');
      } catch {
        setStatus('error');
      }
    })();
  }, [token]);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--cream)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 420 }}>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <span style={{ width: 52, height: 52, borderRadius: '50%', background: 'var(--teal)', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Mitr', fontWeight: 600, fontSize: 24 }}>s</span>
        </div>

        <div className="modal" style={{ position: 'static', animation: 'none', textAlign: 'center', boxShadow: '0 24px 60px -20px rgba(13,30,29,.2)' }}>
          {status === 'loading' && (
            <>
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" style={{ margin: '8px auto 18px' }} />
              <p style={{ fontSize: 14, color: 'var(--muted)' }}>
                <T th="กำลังยืนยันอีเมล…" en="Verifying your email…" />
              </p>
            </>
          )}

          {status === 'ok' && (
            <>
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--teal-50)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                <svg width="28" height="28" fill="none" stroke="var(--teal)" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.4} d="M5 13l4 4L19 7" /></svg>
              </div>
              <h1 className="display-th" style={{ fontSize: 24, margin: '0 0 8px' }}>
                <T th="ยืนยันอีเมลสำเร็จ" en="Email verified" />
              </h1>
              <p style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 20 }}>
                <T th="อีเมลของคุณได้รับการยืนยันแล้ว — เข้าสู่ระบบเพื่อเริ่มใช้งานได้เลย" en="Your email is verified — sign in to get started." />
              </p>
              <Btn kind="teal" href="/auth/login" style={{ justifyContent: 'center' }}>
                {tr(lang, 'เข้าสู่ระบบ', 'Sign in')} <span className="mono">→</span>
              </Btn>
            </>
          )}

          {status === 'error' && (
            <>
              <h1 className="display-th" style={{ fontSize: 24, margin: '0 0 8px' }}>
                <T th="ลิงก์ไม่ถูกต้อง" en="Invalid or expired link" />
              </h1>
              <p style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 20 }}>
                <T th="ลิงก์ยืนยันหมดอายุหรือไม่ถูกต้อง — ลองส่งอีเมลยืนยันใหม่อีกครั้ง" en="The verification link is invalid or expired. Try sending a new one." />
              </p>
              <Link href="/auth/login" className="btn btn-paper">
                {tr(lang, 'ไปหน้าเข้าสู่ระบบ', 'Go to sign in')}
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
