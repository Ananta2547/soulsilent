import { NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

export type NotifyStats = {
  /** Members linked to LINE and not blocking the Official Account. */
  linked: number;
  /** Linked in the last 30 days. */
  linked30d: number;
  /** Linked, but blocked / unfriended the Official Account. */
  blocked: number;
  /** Notifications sent in the last 30 days. */
  sent30d: number;
};

/**
 * GET /api/admin/notify-stats — how many members get notifications on LINE
 * (migration 079), for the admin dashboard. Missing columns read as zero.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });
  if (user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const db = await getDB();
  const num = async (sql: string) => {
    try {
      return (await db.prepare(sql).first<{ n: number | null }>())?.n ?? 0;
    } catch {
      return 0;
    }
  };
  const [linked, linked30d, blocked, sent30d] = await Promise.all([
    num(`SELECT COUNT(*) AS n FROM users WHERE line_user_id IS NOT NULL AND COALESCE(line_blocked, 0) = 0`),
    num(`SELECT COUNT(*) AS n FROM users WHERE line_user_id IS NOT NULL AND line_linked_at >= datetime('now', '-30 days')`),
    num(`SELECT COUNT(*) AS n FROM users WHERE line_user_id IS NOT NULL AND COALESCE(line_blocked, 0) = 1`),
    num(`SELECT COUNT(*) AS n FROM push_sent WHERE sent_at >= datetime('now', '-30 days')`),
  ]);
  const stats: NotifyStats = { linked, linked30d, blocked, sent30d };
  return NextResponse.json(stats);
}
