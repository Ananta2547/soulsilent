import { NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { getCurrentUser, createToken, setAuthCookie } from '@/lib/auth';
import type { ImageMeta, User } from '@/lib/types';

const isStr = (v: unknown): v is string => typeof v === 'string';

/** YYYY-MM-DD or empty. Rejects anything else to keep the column clean. */
function normalizeDob(v: unknown): string | null {
  if (!isStr(v) || v.trim() === '') return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

function stringifyMeta(meta: unknown): string | null {
  if (meta == null) return null;
  try {
    return JSON.stringify(meta as ImageMeta);
  } catch {
    return null;
  }
}

// PUT /api/me/profile — update own profile (name, nickname, dob, bio, avatar, cover)
export async function PUT(request: Request) {
  const payload = await getCurrentUser();
  if (!payload) {
    return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });
  }

  const body = (await request.json()) as {
    name?: string;
    nickname?: string;
    date_of_birth?: string;
    bio?: string;
    avatar_url?: string | null;
    avatar_meta?: ImageMeta | null;
    cover_image_url?: string | null;
    cover_image_meta?: ImageMeta | null;
  };

  const name = (body.name || '').trim();
  if (!name) {
    return NextResponse.json({ error: 'กรุณากรอกชื่อ' }, { status: 400 });
  }

  const nickname = isStr(body.nickname) && body.nickname.trim() !== '' ? body.nickname.trim() : null;
  const dob = normalizeDob(body.date_of_birth);
  const bio = isStr(body.bio) && body.bio.trim() !== '' ? body.bio.trim() : null;

  const db = await getDB();
  await db
    .prepare(
      `UPDATE users SET
         name = ?,
         nickname = ?,
         date_of_birth = ?,
         bio = ?,
         avatar_url = ?,
         avatar_meta = ?,
         cover_image_url = ?,
         cover_image_meta = ?,
         updated_at = datetime('now')
       WHERE id = ?`,
    )
    .bind(
      name,
      nickname,
      dob,
      bio,
      body.avatar_url ?? null,
      stringifyMeta(body.avatar_meta),
      body.cover_image_url ?? null,
      stringifyMeta(body.cover_image_meta),
      payload.sub,
    )
    .run();

  const user = await db
    .prepare(
      `SELECT id, email, name, role, avatar_url, avatar_meta,
              cover_image_url, cover_image_meta, nickname, date_of_birth, bio, created_at
         FROM users WHERE id = ?`,
    )
    .bind(payload.sub)
    .first<Partial<User>>();

  // Name lives inside the JWT — re-issue so the header/profile menu stay fresh.
  if (user) {
    const token = await createToken({
      sub: user.id as string,
      email: user.email as string,
      name: user.name as string,
      role: user.role as User['role'],
    });
    await setAuthCookie(token);
  }

  return NextResponse.json({ user });
}
