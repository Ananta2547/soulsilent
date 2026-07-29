import { NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';

export async function GET() {
  try {
    await requireAdmin();
    const db = await getDB();

    const workshopRevenue = await db
      .prepare(
        "SELECT COALESCE(SUM(amount), 0) as total, COUNT(*) as count FROM bookings WHERE payment_status = 'paid'"
      )
      .first<{ total: number; count: number }>();

    const monthlyWorkshop = await db
      .prepare(
        `SELECT strftime('%Y-%m', created_at) as month, SUM(amount) as total, COUNT(*) as count
         FROM bookings WHERE payment_status = 'paid'
         GROUP BY month ORDER BY month DESC LIMIT 12`
      )
      .all<{ month: string; total: number; count: number }>();

    return NextResponse.json({
      soulsilent: {
        total: workshopRevenue?.total || 0,
        count: workshopRevenue?.count || 0,
        monthly: monthlyWorkshop.results,
      },
    });
  } catch (error: any) {
    if (error.message === 'Unauthorized' || error.message === 'Forbidden') {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 });
  }
}
