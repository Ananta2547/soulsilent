import { createResetToken } from '@/lib/auth';
import { getDB, getEnv } from '@/lib/db';
import { sendEmail, emailTemplate } from '@/lib/email';
import type { User } from '@/lib/types';

/**
 * Email a "set a new password" link to this user.
 *
 * Rotates the single-use nonce first: storing a fresh value invalidates any
 * link sent earlier, so only the newest email works. Used by the signed-in
 * request (/api/me/password-reset) and the forgot-password form
 * (/api/auth/forgot-password).
 */
export async function sendResetLink(
  user: Pick<User, 'id' | 'email' | 'name'>,
): Promise<{ sent: boolean; resetLink: string }> {
  const db = await getDB();
  const env = await getEnv();
  const siteUrl = env.SITE_URL || 'http://localhost:3000';

  const nonce = crypto.randomUUID();
  await db.prepare(`UPDATE users SET reset_nonce = ? WHERE id = ?`).bind(nonce, user.id).run();

  const token = await createResetToken(user.id, nonce);
  const resetLink = `${siteUrl}/auth/reset-password?token=${encodeURIComponent(token)}`;

  const { sent } = await sendEmail({
    to: user.email,
    subject: 'ตั้งรหัสผ่านใหม่ · AllSoulLearn',
    html: emailTemplate({
      heading: 'ตั้งรหัสผ่านใหม่',
      body: `สวัสดี ${user.name} เราได้รับคำขอตั้งรหัสผ่านใหม่สำหรับบัญชี AllSoulLearn ของคุณ กดปุ่มด้านล่างเพื่อตั้งรหัสผ่านใหม่ (ลิงก์มีอายุ 1 ชั่วโมง)`,
      ctaLabel: 'ตั้งรหัสผ่านใหม่',
      ctaHref: resetLink,
      footnote: 'หากคุณไม่ได้เป็นผู้ขอ เพิกเฉยอีเมลนี้ได้ รหัสผ่านของคุณจะไม่เปลี่ยนแปลง',
    }),
  });
  return { sent, resetLink };
}
