import { NextResponse } from 'next/server';
import { rolesOf } from '@/lib/roles';
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
        `SELECT id, email, name, role, roles_json, avatar_url, avatar_meta,
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

    // Every role they hold, so the header and dashboards can gate on extras
    // (teacher, session_host) without re-reading the row.
    const { roles_json, ...rest } = user as Partial<User> & { roles_json?: string | null };
    return NextResponse.json({ user: { ...rest, roles: rolesOf({ role: user.role, roles_json }) } });
  } catch {
    return NextResponse.json({ user: null }, { status: 401 });
  }
}
