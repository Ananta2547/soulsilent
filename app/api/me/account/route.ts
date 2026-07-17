import { NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import type { User } from '@/lib/types';

const isStr = (v: unknown): v is string => typeof v === 'string';

/** Loose phone validation — keep digits, +, space, -, parentheses; 6–20 chars. */
function normalizePhone(v: unknown): string | null {
  if (!isStr(v)) return null;
  const trimmed = v.trim();
  if (trimmed === '') return null;
  return trimmed.slice(0, 20);
}

// PUT /api/me/account — update username (nickname) + phone. Email is immutable.
export async function PUT(request: Request) {
  const payload = await getCurrentUser();
  if (!payload) {
    return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });
  }

  const body = (await request.json()) as { nickname?: string; phone?: string };

  const nickname =
    isStr(body.nickname) && body.nickname.trim() !== '' ? body.nickname.trim() : null;
  const phone = normalizePhone(body.phone);

  const db = await getDB();
  await db
    .prepare(
      `UPDATE users SET nickname = ?, phone = ?, updated_at = datetime('now') WHERE id = ?`,
    )
    .bind(nickname, phone, payload.sub)
    .run();

  const user = await db
    .prepare(
      `SELECT id, email, name, role, nickname, phone, created_at FROM users WHERE id = ?`,
    )
    .bind(payload.sub)
    .first<Partial<User>>();

  return NextResponse.json({ user });
}
