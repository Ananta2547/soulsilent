'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLang, T, tr } from '@/lib/i18n';
import { Btn } from '@/components/design/RippleButton';

export default function RegisterPage() {
  const router = useRouter();
  const { lang } = useLang();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState<{ email: string; devLink?: string } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    // Custom Thai validation (browser tooltips disabled via noValidate).
    if (!name.trim()) {
      setError('กรุณากรอกชื่อ');
      return;
    }
    if (!email.trim()) {
      setError('กรุณากรอกอีเมล');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('รูปแบบอีเมลไม่ถูกต้อง');
      return;
    }
    if (password.length < 6) {
      setError('กรุณากรอกรหัสผ่านอย่างน้อย 6 ตัวอักษร');
      return;
    }
    if (password !== confirmPassword) {
      setError(tr(lang, 'รหัสผ่านไม่ตรงกัน', 'Passwords do not match'));
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      });
      const data = (await res.json()) as { error?: string; devLink?: string };
      if (!res.ok) {
        setError(data.error || tr(lang, 'เกิดข้อผิดพลาด', 'Something went wrong'));
        return;
      }
      // Account is pending (not signed in). Show the "verify your email" screen;
      // the user confirms via the emailed link, then signs in.
      setSent({ email, devLink: data.devLink });
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
          {sent ? (
            <div style={{ textAlign: 'center' }}>
              <div style={{ width: 60, height: 60, borderRadius: '50%', background: 'var(--teal)', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', margin: '4px auto 16px' }}>
                <svg width="30" height="30" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 6l8 6 8-6M4 6h16v12H4z" /></svg>
              </div>
              <h1 className="display-th" style={{ fontSize: 24, margin: '0 0 8px' }}>
                <T th="สมัครสมาชิกสำเร็จ" en="Account created" />
              </h1>
              <p style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.6, margin: '0 0 6px' }}>
                {tr(lang, 'เราได้ส่งอีเมลยืนยันไปที่', "We've sent a verification email to")}
              </p>
              <p style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--ink)', margin: '0 0 14px', wordBreak: 'break-all' }}>{sent.email}</p>
              <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6, margin: '0 0 22px' }}>
                {tr(lang, 'กรุณากดลิงก์ยืนยันเพื่อเสร็จสิ้นการสมัคร แล้วจึงเข้าสู่ระบบได้', 'Click the link to finish signing up, then sign in.')}
              </p>
              {sent.devLink && (
                <div style={{ marginBottom: 18, padding: 12, borderRadius: 12, background: 'var(--cream)', fontSize: 11 }}>
                  <div style={{ color: 'var(--muted)', marginBottom: 4 }}>dev link:</div>
                  <a href={sent.devLink} className="text-primary underline" style={{ wordBreak: 'break-all' }}>{sent.devLink}</a>
                </div>
              )}
              <Btn kind="teal" onClick={() => router.push('/auth/login')} style={{ width: '100%', justifyContent: 'center' }}>
                {tr(lang, 'ไปหน้าเข้าสู่ระบบ', 'Go to sign in')} <span className="mono">→</span>
              </Btn>
            </div>
          ) : (
          <>
          <div style={{ textAlign: 'center', marginBottom: 22 }}>
            <h1 className="display-th" style={{ fontSize: 26, margin: '0 0 6px' }}>
              <T th="มาเริ่มกันเลย" en="Let's begin" />
            </h1>
            <div style={{ fontSize: 13, color: 'var(--muted)' }}>
              <T th="สมัครฟรี — ใช้เวลา 30 วินาที" en="Sign up free — 30 seconds" />
            </div>
          </div>

          {error && (
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
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="field"
              placeholder={tr(lang, 'ชื่อของคุณ', 'Your name')}
              required
              style={{ marginBottom: 10 }}
            />
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
              placeholder={tr(lang, 'รหัสผ่าน (อย่างน้อย 6 ตัวอักษร)', 'Password (min 6 chars)')}
              minLength={6}
              required
              style={{ marginBottom: 10 }}
            />
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="field"
              placeholder={tr(lang, 'ยืนยันรหัสผ่าน', 'Confirm password')}
              required
              style={{ marginBottom: 16 }}
            />
            <Btn
              kind="teal"
              type="submit"
              disabled={loading}
              style={{ width: '100%', justifyContent: 'center' }}
            >
              {loading ? tr(lang, 'กำลังสมัคร...', 'Creating...') : tr(lang, 'สมัครสมาชิก', 'Create account')}{' '}
              <span className="mono">→</span>
            </Btn>
          </form>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '18px 0', color: 'var(--muted)', fontSize: 12 }}>
            <div style={{ flex: 1, height: 1, background: 'var(--cream-deep)' }} />
            <span>{tr(lang, 'หรือ', 'or')}</span>
            <div style={{ flex: 1, height: 1, background: 'var(--cream-deep)' }} />
          </div>

          <a
            href="/api/auth/google"
            className="btn btn-paper"
            style={{ width: '100%', justifyContent: 'center', background: 'var(--cream)' }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            {tr(lang, 'สมัครด้วย Google', 'Sign up with Google')}
          </a>

          <p style={{ textAlign: 'center', marginTop: 22, fontSize: 13, color: 'var(--muted)' }}>
            {tr(lang, 'มีบัญชีอยู่แล้ว?', 'Already have an account?')}{' '}
            <Link
              href="/auth/login"
              style={{ color: 'var(--teal)', fontWeight: 600, textDecoration: 'none' }}
            >
              {tr(lang, 'เข้าสู่ระบบ', 'Sign in')}
            </Link>
          </p>
          </>
          )}
        </div>
      </div>
    </div>
  );
}
