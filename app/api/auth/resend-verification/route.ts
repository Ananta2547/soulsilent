import { NextResponse } from 'next/server';
import { getDB, getEnv } from '@/lib/db';
import { createToken } from '@/lib/auth';
import { sendEmail, emailTemplate } from '@/lib/email';
import type { User } from '@/lib/types';

// POST /api/auth/resend-verification { email }
// Resends the verification link for an unverified email/password account.
// Always returns { ok: true } (never reveals whether the email exists).
export async function POST(request: Request) {
  try {
    const { email } = (await request.json()) as { email?: string };
    if (!email) return NextResponse.json({ error: 'กรุณากรอกอีเมล' }, { status: 400 });

    const db = await getDB();
    const user = await db.prepare('SELECT * FROM users WHERE email = ?').bind(email).first<User>();

    let devLink: string | undefined;
    // Only resend for a real, password-based, still-unverified account.
    if (user && user.password_hash && !user.email_verified) {
      const env = await getEnv();
      const siteUrl = env.SITE_URL || 'http://localhost:3000';
      const verifyToken = await createToken({ sub: user.id, email: user.email, name: user.name, role: user.role });
      const verifyLink = `${siteUrl}/auth/verify-email?token=${encodeURIComponent(verifyToken)}`;
      const { sent } = await sendEmail({
        to: user.email,
        subject: 'ยืนยันอีเมลของคุณ · soulsilent',
        html: emailTemplate({
          heading: 'ยืนยันอีเมลของคุณ',
          body: `กดปุ่มด้านล่างเพื่อยืนยันว่า ${user.email} เป็นอีเมลของคุณจริง แล้วเข้าสู่ระบบได้เลย`,
          ctaLabel: 'ยืนยันอีเมล',
          ctaHref: verifyLink,
          footnote: 'หากคุณไม่ได้เป็นผู้สมัคร สามารถเพิกเฉยอีเมลนี้ได้',
        }),
      });
      if (!sent) devLink = verifyLink;
    }

    return NextResponse.json({ ok: true, devLink });
  } catch (error) {
    console.error('Resend verification error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 });
  }
}
