import { NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import type { Portfolio } from '@/lib/types';

// GET /api/portfolios/[id] — public read. Only returns published portfolios.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await getDB();

  const portfolio = await db
    .prepare('SELECT * FROM portfolios WHERE id = ? AND published = 1')
    .bind(id)
    .first<Portfolio>();

  if (!portfolio) {
    return NextResponse.json({ error: 'ไม่พบ Portfolio' }, { status: 404 });
  }

  // Pull the owner's display name for the page header.
  const owner = await db
    .prepare('SELECT name, nickname, avatar_url FROM users WHERE id = ?')
    .bind(portfolio.user_id)
    .first<{ name: string; nickname: string | null; avatar_url: string | null }>();

  return NextResponse.json({ portfolio, owner });
}
