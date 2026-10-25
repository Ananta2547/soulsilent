import { NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';
import { thaiDay } from '@/lib/host-analytics';
import { computeAdminAnalytics, loadAdminData, makeRange } from '@/lib/admin-analytics';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** GET /api/admin/insights?from=YYYY-MM-DD&to=YYYY-MM-DD — every figure of
 *  Admin Insights for one window (Thai dates, inclusive; default the last 30
 *  days), compared with the equally long window before it. */
export async function GET(request: Request) {
  try {
    await requireAdmin();
    const sp = new URL(request.url).searchParams;
    let to = sp.get('to') || thaiDay(Date.now());
    let from = sp.get('from') || thaiDay(Date.now() - 29 * 86400000);
    if (!DATE.test(from) || !DATE.test(to)) return NextResponse.json({ error: 'ช่วงวันที่ไม่ถูกต้อง' }, { status: 400 });
    if (from > to) [from, to] = [to, from];
    const db = await getDB();
    return NextResponse.json(computeAdminAnalytics(await loadAdminData(db), makeRange(from, to)));
  } catch (error) {
    const msg = (error as Error).message;
    if (msg === 'Unauthorized' || msg === 'Forbidden') return NextResponse.json({ error: msg }, { status: 403 });
    console.error('[admin/insights]', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 });
  }
}
