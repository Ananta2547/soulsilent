'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useLang, T, tr } from '@/lib/i18n';
import { Btn } from '@/components/design/RippleButton';

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', background: 'var(--cream)' }} />}>
      <ResetInner />
    </Suspense>
  );
}

function ResetInner() {
  const { lang } = useLang();
  const router = useRouter();
  const token = useSearchParams().get('token') || '';
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  // 'checking' until we know if the link is still valid; 'invalid' when it was
  // already used / superseded so we show a dead-link state instead of the form.
  const [validity, setValidity] = useState<'checking' | 'valid' | 'invalid'>('checking');

  useEffect(() => {
    (async () => {
      if (!token) {
        setValidity('invalid');
        return;
      }
      try {
        const res = await fetch(`/api/auth/reset-password?token=${encodeURIComponent(token)}`);
        const data = (await res.json()) as { valid?: boolean };
        setValidity(data.valid ? 'valid' : 'invalid');
      } catch {
        setValidity('invalid');
      }
    })();
  }, [token]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (pw.length < 6) {
      setError(tr(lang, 'รหัสผ่านอย่างน้อย 6 ตัวอักษร', 'Password must be at least 6 characters'));
      return;
    }
    if (pw !== confirm) {
      setError(tr(lang, 'รหัสผ่านไม่ตรงกัน', 'Passwords do not match'));
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password: pw }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error || tr(lang, 'รีเซ็ตไม่สำเร็จ', 'Reset failed'));
        return;
      }
      setDone(true);
      setTimeout(() => router.push('/auth/login'), 1800);
    } catch {
      setError(tr(lang, 'เชื่อมต่อไม่ได้', 'Cannot reach server'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--cream)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 420 }}>
        <Link href="/" style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 12, textDecoration: 'none', color: 'var(--ink)', width: '100%' }}>
          <span style={{ width: 52, height: 52, borderRadius: '50%', background: 'var(--teal)', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Mitr', fontWeight: 600, fontSize: 24 }}>s</span>
        </Link>

        <div className="modal" style={{ position: 'static', animation: 'none', marginTop: 20, boxShadow: '0 24px 60px -20px rgba(13,30,29,.2)' }}>
          {validity === 'checking' && !done ? (
            <div style={{ textAlign: 'center', padding: '8px 0' }}>
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" style={{ margin: '8px auto 18px' }} />
              <p style={{ fontSize: 14, color: 'var(--muted)' }}>
                <T th="กำลังตรวจสอบลิงก์…" en="Checking link…" />
              </p>
            </div>
          ) : validity === 'invalid' && !done ? (
            <div style={{ textAlign: 'center' }}>
              <h1 className="display-th" style={{ fontSize: 24, margin: '0 0 8px' }}>
                <T th="ลิงก์ใช้ไม่ได้แล้ว" en="This link is no longer valid" />
              </h1>
              <p style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 18 }}>
                <T
                  th="ลิงก์นี้ถูกใช้ไปแล้ว หมดอายุ หรือมีการขอลิงก์ใหม่ — กรุณากด “แก้ไขรหัสผ่าน” ในหน้าตั้งค่าอีกครั้งเพื่อรับลิงก์ใหม่"
                  en="This link was already used, has expired, or was replaced by a newer request. Tap “Change password” in settings again to get a new link."
                />
              </p>
              <Link href="/me/settings?tab=account" className="btn btn-paper">
                {tr(lang, 'ไปที่ตั้งค่าบัญชี', 'Go to account settings')}
              </Link>
            </div>
          ) : done ? (
            <div style={{ textAlign: 'center' }}>
              <h1 className="display-th" style={{ fontSize: 24, margin: '0 0 8px' }}>
                <T th="ตั้งรหัสผ่านใหม่แล้ว ✓" en="Password updated ✓" />
              </h1>
              <p style={{ fontSize: 14, color: 'var(--muted)' }}>
                <T th="กำลังพาไปหน้าเข้าสู่ระบบ…" en="Redirecting to sign in…" />
              </p>
            </div>
          ) : (
            <>
              <div style={{ textAlign: 'center', marginBottom: 22 }}>
                <h1 className="display-th" style={{ fontSize: 26, margin: '0 0 6px' }}>
                  <T th="ตั้งรหัสผ่านใหม่" en="Set a new password" />
                </h1>
                <p style={{ fontSize: 13, color: 'var(--muted)' }}>
                  <T th="เลือกรหัสผ่านใหม่สำหรับบัญชีของคุณ" en="Choose a new password for your account" />
                </p>
              </div>

              {error && (
                <div style={{ marginBottom: 14, padding: 12, background: '#fde7d3', color: '#a04a14', borderRadius: 14, fontSize: 13 }}>{error}</div>
              )}

              <form onSubmit={submit}>
                <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} className="field" placeholder={tr(lang, 'รหัสผ่านใหม่', 'New password')} minLength={6} required style={{ marginBottom: 10 }} />
                <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className="field" placeholder={tr(lang, 'ยืนยันรหัสผ่านใหม่', 'Confirm new password')} required style={{ marginBottom: 16 }} />
                <Btn kind="teal" type="submit" disabled={loading} style={{ width: '100%', justifyContent: 'center' }}>
                  {loading ? tr(lang, 'กำลังบันทึก...', 'Saving...') : tr(lang, 'ตั้งรหัสผ่านใหม่', 'Update password')} <span className="mono">→</span>
                </Btn>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
