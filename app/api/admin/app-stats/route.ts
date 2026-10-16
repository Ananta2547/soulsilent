import { NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

export type AppStats = {
  /** Devices that installed the app, all time and in the last 30 days. */
  installs: number;
  installs30d: number;
  /** Days-with-an-open summed over devices, last 30 days. */
  opens30d: number;
  /** Devices / members with notifications switched on right now. */
  pushDevices: number;
  pushMembers: number;
  /** Notifications sent in the last 30 days. */
  sent30d: number;
};

/**
 * GET /api/admin/app-stats — how the installed app (PWA) is used, for the
 * admin dashboard. Counters come from app_stats (migration 065); push numbers
 * from push_subscriptions / push_sent (064). Missing tables read as zero.
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
  const since = `date('now', '+7 hours', '-29 days')`;
  const [installs, installs30d, opens30d, pushDevices, pushMembers, sent30d] = await Promise.all([
    num(`SELECT SUM(n) AS n FROM app_stats WHERE metric = 'install'`),
    num(`SELECT SUM(n) AS n FROM app_stats WHERE metric = 'install' AND day >= ${since}`),
    num(`SELECT SUM(n) AS n FROM app_stats WHERE metric = 'open' AND day >= ${since}`),
    num(`SELECT COUNT(*) AS n FROM push_subscriptions`),
    num(`SELECT COUNT(DISTINCT user_id) AS n FROM push_subscriptions`),
    num(`SELECT COUNT(*) AS n FROM push_sent WHERE sent_at >= datetime('now', '-30 days')`),
  ]);
  const stats: AppStats = { installs, installs30d, opens30d, pushDevices, pushMembers, sent30d };
  return NextResponse.json(stats);
}
