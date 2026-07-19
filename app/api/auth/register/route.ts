import { NextResponse } from 'next/server';
import { v4 as uuid } from 'uuid';
import { getDB, getEnv } from '@/lib/db';
import { hashPassword, createToken } from '@/lib/auth';
import { sendEmail, emailTemplate } from '@/lib/email';

export async function POST(request: Request) {
  try {
    const { email, password, name } = (await request.json()) as {
      email: string;
      password: string;
      name: string;
    };

    if (!email || !password || !name) {
      return NextResponse.json({ error: 'กรุณากรอกข้อมูลให้ครบ' }, { status: 400 });
    }

    if (password.length < 6) {
      return NextResponse.json({ error: 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร' }, { status: 400 });
    }

    const db = await getDB();

    const existing = await db
      .prepare('SELECT id FROM users WHERE email = ?')
      .bind(email)
      .first();

    if (existing) {
      return NextResponse.json({ error: 'อีเมลนี้ถูกใช้แล้ว' }, { status: 409 });
    }

    const id = uuid();
    const password_hash = await hashPassword(password);

    await db
      .prepare(
        'INSERT INTO users (id, email, password_hash, name, role) VALUES (?, ?, ?, ?, ?)'
      )
      .bind(id, email, password_hash, name, 'user')
      .run();

    // Account starts PENDING (email_verified defaults to 0). No session is issued
    // here — the user must click the emailed link, then sign in. Login is blocked
    // until email_verified = 1 (see /api/auth/login).
    // Send the email-verification link right away. Best-effort — a mail failure
    // must not fail the registration itself; the user can resend from login.
    let devLink: string | undefined;
    try {
      const env = await getEnv();
      const siteUrl = env.SITE_URL || 'http://localhost:3000';
      const verifyToken = await createToken({ sub: id, email, name, role: 'user' });
      const verifyLink = `${siteUrl}/auth/verify-email?token=${encodeURIComponent(verifyToken)}`;
      const { sent } = await sendEmail({
        to: email,
        subject: 'ยืนยันอีเมลของคุณ · soulsilent',
        html: emailTemplate({
          heading: 'ยินดีต้อนรับสู่ soulsilent',
          body: `สวัสดี ${name} — ขอบคุณที่สมัครสมาชิก กดปุ่มด้านล่างเพื่อยืนยันว่า ${email} เป็นอีเมลของคุณจริง`,
          ctaLabel: 'ยืนยันอีเมล',
          ctaHref: verifyLink,
          footnote: 'หากคุณไม่ได้เป็นผู้สมัคร สามารถเพิกเฉยอีเมลนี้ได้',
        }),
      });
      if (!sent) devLink = verifyLink; // surfaced only when no mailer is wired
    } catch (e) {
      console.error('Register verify-email send failed:', e);
    }

    return NextResponse.json({ user: { id, email, name, role: 'user' }, verifyEmailSent: true, devLink });
  } catch (error) {
    console.error('Register error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 });
  }
}
