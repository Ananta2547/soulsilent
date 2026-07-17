import { NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { verifyToken } from '@/lib/auth';

// POST /api/auth/verify-email { token }
// Confirms the emailed verification token and marks email_verified = 1.
export async function POST(request: Request) {
  const { token } = (await request.json()) as { token?: string };
  if (!token) {
    return NextResponse.json({ error: 'ลิงก์ไม่ถูกต้อง' }, { status: 400 });
  }

  const payload = await verifyToken(token);
  if (!payload?.sub) {
    return NextResponse.json({ error: 'ลิงก์หมดอายุหรือไม่ถูกต้อง' }, { status: 400 });
  }

  const db = await getDB();
  const exists = await db.prepare('SELECT id FROM users WHERE id = ?').bind(payload.sub).first<{ id: string }>();
  if (!exists) {
    return NextResponse.json({ error: 'ไม่พบผู้ใช้' }, { status: 404 });
  }

  await db
    .prepare(`UPDATE users SET email_verified = 1, updated_at = datetime('now') WHERE id = ?`)
    .bind(payload.sub)
    .run();

  return NextResponse.json({ ok: true, email: payload.email });
}
