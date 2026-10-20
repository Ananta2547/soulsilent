import { NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { sendResetLink } from '@/lib/password-reset';
import type { User } from '@/lib/types';

/**
 * POST /api/auth/forgot-password { email }
 *
 * Signed-out "forgot password": emails a reset link when the address has an
 * account. The answer is the same whether or not it does, so the form cannot
 * be used to find out who is registered. (Without a mail key, lib/email logs
 * the message instead of sending it.)
 */
export async function POST(request: Request) {
  let email = '';
  try {
    const body = (await request.json()) as { email?: unknown };
    email = typeof body.email === 'string' ? body.email.trim() : '';
  } catch {
    // fall through to the validation below
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return NextResponse.json({ error: 'รูปแบบอีเมลไม่ถูกต้อง' }, { status: 400 });
  }

  try {
    const db = await getDB();
    const user = await db
      .prepare('SELECT id, email, name, account_status FROM users WHERE email = ?')
      .bind(email)
      .first<Pick<User, 'id' | 'email' | 'name' | 'account_status'>>();
    // A suspended account cannot sign in, so it gets no link either.
    if (user && user.account_status !== 'suspended') await sendResetLink(user);
  } catch (error) {
    // Same answer as success: an error must not reveal whether the account exists.
    console.error('Forgot password error:', error);
  }

  return NextResponse.json({ ok: true });
}
