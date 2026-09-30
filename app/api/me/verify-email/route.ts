import { NextResponse } from 'next/server';
import { getCurrentUser, createToken } from '@/lib/auth';
import { getDB, getEnv } from '@/lib/db';
import { sendEmail, emailTemplate } from '@/lib/email';
import type { User } from '@/lib/types';

/**
 * POST /api/me/verify-email
 *
 * Sends an "verify your email" link to the signed-in user's address. Mirrors
 * the password-reset flow: a short-lived signed token + a confirmation link.
 * Email delivery needs a provider (Resend/SES/etc.) which isn't wired yet — so
 * we log the link server-side and return success. Swap the log for a real
 * mailer when credentials are available.
 */
export async function POST() {
  const payload = await getCurrentUser();
  if (!payload) {
    return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });
  }

  const db = await getDB();
  const user = await db
    .prepare('SELECT id, email, name FROM users WHERE id = ?')
    .bind(payload.sub)
    .first<Pick<User, 'id' | 'email' | 'name'>>();

  if (!user) {
    return NextResponse.json({ error: 'ไม่พบผู้เข้าร่วม' }, { status: 404 });
  }

  const env = await getEnv();
  const siteUrl = env.SITE_URL || 'http://localhost:3000';

  const token = await createToken({
    sub: user.id,
    email: user.email,
    name: user.name,
    role: 'user',
  });
  const verifyLink = `${siteUrl}/auth/verify-email?token=${encodeURIComponent(token)}`;

  const { sent } = await sendEmail({
    to: user.email,
    subject: 'ยืนยันอีเมลของคุณ · soulsilent',
    html: emailTemplate({
      heading: 'ยืนยันอีเมลของคุณ',
      body: `สวัสดี ${user.name} — กดปุ่มด้านล่างเพื่อยืนยันว่า ${user.email} เป็นอีเมลของคุณจริง เพื่อปลดล็อกการยืนยันตัวตนของบัญชี`,
      ctaLabel: 'ยืนยันอีเมล',
      ctaHref: verifyLink,
      footnote: 'หากคุณไม่ได้เป็นผู้ขอ สามารถเพิกเฉยอีเมลนี้ได้',
    }),
  });

  return NextResponse.json({
    ok: true,
    sentTo: user.email,
    devLink: !sent ? verifyLink : undefined,
  });
}
