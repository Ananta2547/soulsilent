import { NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { verifyResetToken, hashPassword } from '@/lib/auth';

// GET /api/auth/reset-password?token=... — validate a link without consuming it.
// Lets the page show an "expired/used" state on load instead of a dead form.
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get('token') || '';
  if (!token) return NextResponse.json({ valid: false });

  const payload = await verifyResetToken(token);
  if (!payload) return NextResponse.json({ valid: false });

  const db = await getDB();
  const user = await db
    .prepare('SELECT reset_nonce FROM users WHERE id = ?')
    .bind(payload.sub)
    .first<{ reset_nonce: string | null }>();

  const valid = !!user?.reset_nonce && user.reset_nonce === payload.nonce;
  return NextResponse.json({ valid });
}

// POST /api/auth/reset-password { token, password }
// Confirms the emailed reset token and sets a new password. No session needed
// (the token IS the proof of identity). The token is single-use: its embedded
// nonce must match the one stored on the user row, and we clear that nonce on
// success so the same link can't be replayed.
export async function POST(request: Request) {
  const { token, password } = (await request.json()) as { token?: string; password?: string };

  if (!token) {
    return NextResponse.json({ error: 'ลิงก์ไม่ถูกต้อง' }, { status: 400 });
  }
  if (!password || password.length < 6) {
    return NextResponse.json({ error: 'รหัสผ่านอย่างน้อย 6 ตัวอักษร' }, { status: 400 });
  }

  const payload = await verifyResetToken(token);
  if (!payload) {
    return NextResponse.json({ error: 'ลิงก์หมดอายุหรือไม่ถูกต้อง' }, { status: 400 });
  }

  const db = await getDB();
  const user = await db
    .prepare('SELECT id, reset_nonce FROM users WHERE id = ?')
    .bind(payload.sub)
    .first<{ id: string; reset_nonce: string | null }>();
  if (!user) {
    return NextResponse.json({ error: 'ไม่พบผู้เข้าร่วม' }, { status: 404 });
  }

  // Reject links that were already used or superseded by a newer request.
  if (!user.reset_nonce || user.reset_nonce !== payload.nonce) {
    return NextResponse.json(
      { error: 'ลิงก์นี้ถูกใช้ไปแล้วหรือไม่สามารถใช้ได้ — กรุณาขอลิงก์ใหม่อีกครั้ง' },
      { status: 400 },
    );
  }

  const hash = await hashPassword(password);
  // Clear the nonce in the same write so the link becomes single-use.
  await db
    .prepare(`UPDATE users SET password_hash = ?, reset_nonce = NULL, updated_at = datetime('now') WHERE id = ?`)
    .bind(hash, payload.sub)
    .run();

  return NextResponse.json({ ok: true });
}
