import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getDB } from '@/lib/db';
import type { User } from '@/lib/types';

export async function GET() {
  try {
    const payload = await getCurrentUser();
    if (!payload) {
      return NextResponse.json({ user: null }, { status: 401 });
    }

    const db = await getDB();
    const user = await db
      .prepare(
        `SELECT id, email, name, role, avatar_url, avatar_meta,
                cover_image_url, cover_image_meta, nickname, date_of_birth, bio, phone,
                email_verified, account_status, created_at
           FROM users WHERE id = ?`,
      )
      .bind(payload.sub)
      .first<Partial<User>>();

    // Block suspended / self-deleted accounts from active sessions.
    if (!user || (user.account_status && user.account_status !== 'active')) {
      return NextResponse.json({ user: null }, { status: 401 });
    }

    return NextResponse.json({ user });
  } catch {
    return NextResponse.json({ user: null }, { status: 401 });
  }
}
