'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useLang, T, tr } from '@/lib/i18n';
import { Btn } from '@/components/design/RippleButton';

export default function LoginPage() {
  return (
    <Suspense
      fallback={<div style={{ minHeight: '100vh', background: 'var(--cream)' }} />}
    >
      <LoginPageInner />
    </Suspense>
  );
}

function LoginPageInner() {
  const router = useRouter();
  const { lang } = useLang();
  const searchParams = useSearchParams();
  const redirect = searchParams.get('redirect') || '/';
  const errorParam = searchParams.get('error');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  // Blocked-account dialogs: self-deleted (recoverable) / suspended / permanently gone.
  const [blocked, setBlocked] = useState<null | 'recover' | 'suspended' | 'deleted'>(null);

  const urlError =
    errorParam === 'google_failed'
      ? tr(lang, 'เข้าสู่ระบบด้วย Google ไม่สำเร็จ', 'Google sign-in failed')
      : errorParam === 'google_not_configured'
        ? tr(
            lang,
            'ระบบยังไม่ได้ตั้งค่า Google Sign-in — กรุณาเข้าสู่ระบบด้วยอีเมล หรือแจ้งผู้ดูแลระบบ',
            'Google Sign-in is not configured yet — please use email, or contact the admin',
          )
        : '';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    // Custom Thai validation (browser tooltips disabled via noValidate).
    if (!email.trim()) {
      setError('กรุณากรอกอีเมล');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('รูปแบบอีเมลไม่ถูกต้อง');
      return;
    }
    if (!password) {
      setError('กรุณากรอกรหัสผ่าน');
      return;
    }
    await attemptLogin(false);
  }

  async function attemptLogin(recover: boolean) {
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, recover }),
      });
      const data = (await res.json()) as { error?: string; blocked?: string };
      // Account-state gates take priority over the plain error/redirect path.
      if (data.blocked === 'suspended') { setBlocked('suspended'); return; }
      if (data.blocked === 'deleted') { setBlocked('deleted'); return; }
      if (data.blocked === 'pending_deletion') { setBlocked('recover'); return; }
      if (!res.ok) {
        setError(data.error || tr(lang, 'เกิดข้อผิดพลาด', 'Something went wrong'));
        return;
      }
      // Successful login (including a just-recovered account).
      setBlocked(null);
      router.push(redirect);
    } catch {
      setError(tr(lang, 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้', 'Cannot reach server'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--cream)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div style={{ width: '100%', maxWidth: 440 }}>
        <div style={{ textAlign: 'center', marginBottom: 22 }}>
          <Link
            href="/"
            style={{
              display: 'inline-flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 12,
              textDecoration: 'none',
              color: 'var(--ink)',
            }}
          >
            <span
              style={{
                width: 56,
                height: 56,
                borderRadius: '50%',
                background: 'var(--teal)',
                color: '#fff',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: 'Mitr',
                fontWeight: 600,
                fontSize: 26,
                position: 'relative',
              }}
            >
              s
              <span
                style={{
                  position: 'absolute',
                  top: -4,
                  right: -4,
                  width: 12,
                  height: 12,
                  background: 'var(--accent)',
                  borderRadius: '50%',
                }}
              />
            </span>
            <span style={{ fontFamily: 'Mitr', fontWeight: 500, fontSize: 22 }}>
              soulsilent<span style={{ color: 'var(--teal)' }}>.</span>
            </span>
          </Link>
        </div>

        <div className="modal" style={{ position: 'static', animation: 'none', boxShadow: '0 24px 60px -20px rgba(13,30,29,.2)' }}>
          <div style={{ textAlign: 'center', marginBottom: 22 }}>
            <h1 className="display-th" style={{ fontSize: 26, margin: '0 0 6px' }}>
              <T th="ยินดีต้อนรับกลับมา" en="Welcome back" />
            </h1>
            <div style={{ fontSize: 13, color: 'var(--muted)' }}>
              <T th="เข้าสู่ระบบเพื่อจัดการการจองของคุณ" en="Sign in to manage your bookings" />
            </div>
          </div>

          {(error || urlError) && (
            <div
              style={{
                marginBottom: 14,
                padding: 12,
                background: '#fde7d3',
                color: '#a04a14',
                borderRadius: 14,
                fontSize: 13,
              }}
            >
              {error || urlError}
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="field"
              placeholder={tr(lang, 'อีเมล', 'Email')}
              required
              style={{ marginBottom: 10 }}
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="field"
              placeholder={tr(lang, 'รหัสผ่าน', 'Password')}
              required
              style={{ marginBottom: 16 }}
            />
            <Btn
              kind="teal"
              type="submit"
              disabled={loading}
              style={{ width: '100%', justifyContent: 'center' }}
            >
              {loading ? tr(lang, 'กำลังเข้าสู่ระบบ...', 'Signing in...') : tr(lang, 'เข้าสู่ระบบ', 'Sign in')}{' '}
              <span className="mono">→</span>
            </Btn>
          </form>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '18px 0', color: 'var(--muted)', fontSize: 12 }}>
            <div style={{ flex: 1, height: 1, background: 'var(--cream-deep)' }} />
            <span>{tr(lang, 'หรือ', 'or')}</span>
            <div style={{ flex: 1, height: 1, background: 'var(--cream-deep)' }} />
          </div>

          <a
            href={`/api/auth/google?redirect=${encodeURIComponent(redirect)}`}
            className="btn btn-paper"
            style={{ width: '100%', justifyContent: 'center', background: 'var(--cream)' }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            {tr(lang, 'เข้าสู่ระบบด้วย Google', 'Sign in with Google')}
          </a>

          <p style={{ textAlign: 'center', marginTop: 22, fontSize: 13, color: 'var(--muted)' }}>
            {tr(lang, 'ยังไม่มีบัญชี?', 'No account yet?')}{' '}
            <Link
              href="/auth/register"
              style={{ color: 'var(--teal)', fontWeight: 600, textDecoration: 'none' }}
            >
              {tr(lang, 'สมัครสมาชิก', 'Sign up')}
            </Link>
          </p>
        </div>
      </div>

      {blocked && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
        >
          <div
            className="modal"
            style={{ position: 'static', animation: 'none', width: '100%', maxWidth: 420, textAlign: 'center' }}
          >
            {blocked === 'recover' ? (
              <>
                <span style={{ width: 52, height: 52, borderRadius: 16, margin: '0 auto 14px', background: 'var(--teal-50, #e6f4f1)', color: 'var(--teal)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="26" height="26" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 12a9 9 0 1 0 3-6.7L3 8m0 0V3m0 5h5" />
                  </svg>
                </span>
                <h2 className="display-th" style={{ fontSize: 22, margin: '0 0 8px' }}>
                  <T th="ต้องการกู้คืนบัญชีหรือไม่?" en="Recover your account?" />
                </h2>
                <p style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.6, margin: '0 0 22px' }}>
                  <T
                    th="บัญชีนี้อยู่ระหว่างรอการลบ คุณสามารถกู้คืนและเข้าสู่ระบบได้ทันที หากไม่กู้คืน ระบบจะพาไปหน้าสมัครสมาชิก"
                    en="This account is pending deletion. You can recover it and sign in right away. If not, you'll be taken to sign-up."
                  />
                </p>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    type="button"
                    onClick={() => { setBlocked(null); router.push('/auth/register'); }}
                    className="btn btn-paper"
                    style={{ flex: 1, justifyContent: 'center' }}
                    disabled={loading}
                  >
                    <T th="ไม่กู้คืน" en="Don't recover" />
                  </button>
                  <Btn
                    kind="teal"
                    onClick={() => attemptLogin(true)}
                    disabled={loading}
                    style={{ flex: 1, justifyContent: 'center' }}
                  >
                    {loading ? tr(lang, 'กำลังกู้คืน...', 'Recovering...') : tr(lang, 'กู้คืนบัญชี', 'Recover')}
                  </Btn>
                </div>
              </>
            ) : (
              <>
                <span style={{ width: 52, height: 52, borderRadius: 16, margin: '0 auto 14px', background: '#fdeceb', color: '#b3261e', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="26" height="26" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M18.36 6.64A9 9 0 1 1 5.64 6.64m6.36-3.64v9" />
                  </svg>
                </span>
                <h2 className="display-th" style={{ fontSize: 22, margin: '0 0 8px' }}>
                  {blocked === 'suspended'
                    ? tr(lang, 'บัญชีถูกระงับการใช้งาน', 'Account suspended')
                    : tr(lang, 'บัญชีถูกลบถาวรแล้ว', 'Account deleted')}
                </h2>
                <p style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.6, margin: '0 0 22px' }}>
                  {blocked === 'suspended'
                    ? tr(
                        lang,
                        'บัญชีนี้ถูกระงับการใช้งาน หากต้องการความช่วยเหลือ กรุณาติดต่อผู้ดูแลระบบ',
                        'This account has been suspended. Please contact the administrator for assistance.',
                      )
                    : tr(
                        lang,
                        'บัญชีนี้เลยกำหนดการกู้คืน 30 วันแล้ว และถูกลบถาวร กรุณาสมัครสมาชิกใหม่',
                        'This account is past the 30-day recovery window and has been permanently deleted. Please sign up again.',
                      )}
                </p>
                <Btn
                  kind="teal"
                  onClick={() => setBlocked(null)}
                  style={{ width: '100%', justifyContent: 'center' }}
                >
                  <T th="รับทราบ" en="OK" />
                </Btn>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
