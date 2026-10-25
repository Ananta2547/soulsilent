import { NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { getCurrentUserWithRoles } from '@/lib/auth';
import { hasAnyRole } from '@/lib/roles';
import { computeAnalytics, loadHostData, makeRange, thaiDay } from '@/lib/host-analytics';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** GET /api/teacher/analytics?from=YYYY-MM-DD&to=YYYY-MM-DD&activity=<key>
 *  Every figure of the Host Dashboard for one window (Thai dates, inclusive;
 *  default the last 30 days), scoped to the rounds this host leads. */
export async function GET(request: Request) {
  const u = await getCurrentUserWithRoles();
  if (!u) return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });
  if (!hasAnyRole(u.roles, ['teacher'])) return NextResponse.json({ error: 'เฉพาะผู้จัด' }, { status: 403 });
  try {
    const sp = new URL(request.url).searchParams;
    const today = thaiDay(Date.now());
    let to = sp.get('to') || today;
    let from = sp.get('from') || thaiDay(Date.now() - 29 * 86400000);
    if (!DATE.test(from) || !DATE.test(to)) return NextResponse.json({ error: 'ช่วงวันที่ไม่ถูกต้อง' }, { status: 400 });
    if (from > to) [from, to] = [to, from];
    const db = await getDB();
    const data = await loadHostData(db, u.sub);
    const activity = sp.get('activity') || null;
    return NextResponse.json(computeAnalytics(data, makeRange(from, to), activity));
  } catch (e) {
    console.error('[teacher/analytics]', e);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 });
  }
}
