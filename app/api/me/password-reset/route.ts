import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getDB } from '@/lib/db';
import { sendResetLink } from '@/lib/password-reset';
import type { User } from '@/lib/types';

/**
 * POST /api/me/password-reset
 *
 * Emails a "set a new password" link to the signed-in user (see
 * lib/password-reset). Signed-out users use /api/auth/forgot-password.
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

  const { sent, resetLink } = await sendResetLink(user);

  return NextResponse.json({
    ok: true,
    sentTo: user.email,
    // `devLink` only surfaces when the mailer hasn't sent (no key / localhost),
    // so QA can click through without a configured provider.
    devLink: !sent ? resetLink : undefined,
  });
}
