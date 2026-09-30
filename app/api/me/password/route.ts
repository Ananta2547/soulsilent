import { NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { getCurrentUser, hashPassword, verifyPassword } from '@/lib/auth';
import type { User } from '@/lib/types';

// PUT /api/me/password — change own password
export async function PUT(request: Request) {
  const payload = await getCurrentUser();
  if (!payload) {
    return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });
  }

  const body = (await request.json()) as {
    current_password?: string;
    new_password?: string;
  };

  const newPassword = body.new_password || '';
  if (newPassword.length < 6) {
    return NextResponse.json({ error: 'รหัสผ่านใหม่อย่างน้อย 6 ตัวอักษร' }, { status: 400 });
  }

  const db = await getDB();
  const user = await db
    .prepare('SELECT id, password_hash FROM users WHERE id = ?')
    .bind(payload.sub)
    .first<Pick<User, 'id' | 'password_hash'>>();

  if (!user) {
    return NextResponse.json({ error: 'ไม่พบผู้เข้าร่วม' }, { status: 404 });
  }

  // Users who set a password must prove they know the current one.
  // OAuth-only accounts (no password_hash yet) can set one directly.
  if (user.password_hash) {
    const ok = await verifyPassword(body.current_password || '', user.password_hash);
    if (!ok) {
      return NextResponse.json({ error: 'รหัสผ่านปัจจุบันไม่ถูกต้อง' }, { status: 400 });
    }
  }

  const hash = await hashPassword(newPassword);
  await db
    .prepare(`UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?`)
    .bind(hash, payload.sub)
    .run();

  return NextResponse.json({ ok: true });
}
