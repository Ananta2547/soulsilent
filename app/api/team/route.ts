import { NextResponse } from 'next/server';
import { getDB } from '@/lib/db';

/**
 * GET /api/team — public list of the people behind soulsilent.
 * Admin-curated via the `is_team` flag (any role). Only active accounts show.
 * Exposes only display-safe fields (name, avatar) — never email/role internals.
 */
export async function GET() {
  try {
    const db = await getDB();
    const rows = await db
      .prepare(
        // Display name = nickname (what users edit everywhere) falling back to
        // the registration name — always fresh from the users table.
        `SELECT COALESCE(NULLIF(TRIM(nickname), ''), name) AS name, avatar_url FROM users
          WHERE is_team = 1 AND (account_status = 'active' OR account_status IS NULL)
          ORDER BY name`,
      )
      .all<{ name: string; avatar_url: string | null }>();
    return NextResponse.json({ team: rows.results || [] });
  } catch {
    return NextResponse.json({ team: [] });
  }
}
