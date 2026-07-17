import { NextResponse } from 'next/server';
import { getCurrentUser, createResetToken } from '@/lib/auth';
import { getDB, getEnv } from '@/lib/db';
import { sendEmail, emailTemplate } from '@/lib/email';
import type { User } from '@/lib/types';

/**
 * POST /api/me/password-reset
 *
 * Triggers a "reset your password" email for the signed-in user. We generate a
 * short-lived signed token and build a reset link. Actually delivering the
 * email requires an email provider (Resend/SES/etc.) which isn't wired up yet —
 * so for now we log the link server-side and return success. Swap the
 * `sendEmail` stub for a real provider when credentials are available.
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
    return NextResponse.json({ error: 'ไม่พบผู้ใช้' }, { status: 404 });
  }

  const env = await getEnv();
  const siteUrl = env.SITE_URL || 'http://localhost:3000';

  // Rotate the single-use nonce: storing a fresh value invalidates any link
  // sent earlier, so only the newest email works.
  const nonce = crypto.randomUUID();
  await db
    .prepare(`UPDATE users SET reset_nonce = ? WHERE id = ?`)
    .bind(nonce, user.id)
    .run();

  const token = await createResetToken(user.id, nonce);
  const resetLink = `${siteUrl}/auth/reset-password?token=${encodeURIComponent(token)}`;

  const { sent } = await sendEmail({
    to: user.email,
    subject: 'รีเซ็ตรหัสผ่าน · soulsilent',
    html: emailTemplate({
      heading: 'รีเซ็ตรหัสผ่านของคุณ',
      body: `สวัสดี ${user.name} — เราได้รับคำขอรีเซ็ตรหัสผ่านสำหรับบัญชี soulsilent ของคุณ กดปุ่มด้านล่างเพื่อตั้งรหัสผ่านใหม่ (ลิงก์มีอายุ 7 วัน)`,
      ctaLabel: 'ตั้งรหัสผ่านใหม่',
      ctaHref: resetLink,
      footnote: 'หากคุณไม่ได้เป็นผู้ขอ สามารถเพิกเฉยอีเมลนี้ได้ รหัสผ่านของคุณจะไม่เปลี่ยนแปลง',
    }),
  });

  return NextResponse.json({
    ok: true,
    sentTo: user.email,
    // `devLink` only surfaces when the mailer hasn't sent (no key / localhost),
    // so QA can click through without a configured provider.
    devLink: !sent ? resetLink : undefined,
  });
}
