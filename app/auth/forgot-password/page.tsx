'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useLang, T, tr } from '@/lib/i18n';
import { Btn } from '@/components/design/RippleButton';
import { AllSoulLearnLogo } from '@/components/layout/AllSoulLearnLogo';

/** Signed-out "forgot password": asks for the email and sends a reset link
 *  (POST /api/auth/forgot-password). Always ends on the same "check your
 *  inbox" screen, whether or not the address has an account. */
export default function ForgotPasswordPage() {
  const { lang } = useLang();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError(tr(lang, 'รูปแบบอีเมลไม่ถูกต้อง', 'Please enter a valid email'));
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error || tr(lang, 'เกิดข้อผิดพลาด', 'Something went wrong'));
        return;
      }
      setDone(true);
    } catch {
      setError(tr(lang, 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้', 'Cannot reach server'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--cream)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 440 }}>
        <div style={{ textAlign: 'center', marginBottom: 22 }}>
          <Link href="/" aria-label="AllSoulLearn" style={{ display: 'inline-block' }}>
            <AllSoulLearnLogo height={30} />
          </Link>
        </div>

        <div className="modal" style={{ position: 'static', animation: 'none', boxShadow: '0 24px 60px -20px rgba(13,30,29,.2)' }}>
          {done ? (
            <div style={{ textAlign: 'center' }}>
              <div style={{ width: 60, height: 60, borderRadius: '50%', background: 'var(--teal)', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', margin: '4px auto 16px' }}>
                <svg width="30" height="30" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 6l8 6 8-6M4 6h16v12H4z" />
                </svg>
              </div>
              <h1 className="display-th" style={{ fontSize: 24, margin: '0 0 8px' }}>
                <T th="ตรวจอีเมลของคุณ" en="Check your inbox" />
              </h1>
              <p style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.7, margin: '0 0 22px' }}>
                {tr(
                  lang,
                  `ถ้า ${email.trim()} มีบัญชีอยู่ เราได้ส่งลิงก์ตั้งรหัสผ่านใหม่ไปแล้ว ลิงก์มีอายุ 1 ชั่วโมง หากไม่พบ ลองดูในโฟลเดอร์จดหมายขยะ`,
                  `If ${email.trim()} has an account, a reset link is on its way. It works for 1 hour. Check your spam folder if you can't find it.`,
                )}
              </p>
              <Btn kind="teal" href="/auth/login" style={{ width: '100%', justifyContent: 'center' }}>
                {tr(lang, 'กลับไปหน้าเข้าสู่ระบบ', 'Back to sign in')} <span className="mono">→</span>
              </Btn>
            </div>
          ) : (
            <>
              <div style={{ textAlign: 'center', marginBottom: 22 }}>
                <h1 className="display-th" style={{ fontSize: 26, margin: '0 0 6px' }}>
                  <T th="ลืมรหัสผ่าน" en="Forgot password" />
                </h1>
                <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>
                  <T th="กรอกอีเมลที่ใช้สมัคร เราจะส่งลิงก์ตั้งรหัสผ่านใหม่ให้" en="Enter your account email and we'll send you a reset link" />
                </div>
              </div>

              {error && (
                <div role="alert" style={{ marginBottom: 14, padding: 12, background: '#fde7d3', color: '#a04a14', borderRadius: 14, fontSize: 13 }}>
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} noValidate>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="field"
                  placeholder={tr(lang, 'อีเมล', 'Email')}
                  aria-label={tr(lang, 'อีเมล', 'Email')}
                  autoComplete="email"
                  required
                  style={{ marginBottom: 16 }}
                />
                <Btn kind="teal" type="submit" disabled={loading} style={{ width: '100%', justifyContent: 'center' }}>
                  {loading ? tr(lang, 'กำลังส่ง...', 'Sending...') : tr(lang, 'ส่งลิงก์ตั้งรหัสผ่านใหม่', 'Send reset link')}{' '}
                  <span className="mono">→</span>
                </Btn>
              </form>

              <p style={{ textAlign: 'center', marginTop: 22, fontSize: 13, color: 'var(--muted)' }}>
                <Link href="/auth/login" style={{ color: 'var(--teal)', fontWeight: 600, textDecoration: 'none' }}>
                  {tr(lang, '← กลับไปหน้าเข้าสู่ระบบ', '← Back to sign in')}
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
