import { NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';
import { thaiDay } from '@/lib/host-analytics';
import { computeAdminAnalytics, loadAdminData, makeRange } from '@/lib/admin-analytics';

const fail = (error: unknown, tag: string) => {
  const msg = (error as Error).message;
  if (msg === 'Unauthorized' || msg === 'Forbidden') return NextResponse.json({ error: msg }, { status: 403 });
  console.error(tag, error);
  return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 });
};
const KEY = /^[\w:. -]{1,200}$/;

/** GET /api/admin/alerts — how many alerts are open, for the menu badge. */
export async function GET() {
  try {
    await requireAdmin();
    const db = await getDB();
    const today = thaiDay(Date.now());
    const a = computeAdminAnalytics(await loadAdminData(db), makeRange(today, today));
    return NextResponse.json(a.alerts.counts);
  } catch (error) {
    return fail(error, '[admin/alerts GET]');
  }
}

/** POST /api/admin/alerts — { key, note? }: mark an alert as seen for every admin. */
export async function POST(request: Request) {
  try {
    const user = await requireAdmin();
    const body = (await request.json()) as { key?: unknown; note?: unknown };
    const key = String(body.key ?? '');
    if (!KEY.test(key)) return NextResponse.json({ error: 'แจ้งเตือนไม่ถูกต้อง' }, { status: 400 });
    const note = String(body.note ?? '').trim().slice(0, 300) || null;
    const db = await getDB();
    await db
      .prepare(
        `INSERT INTO admin_alert_acks (alert_key, acked_by, note, acked_at) VALUES (?, ?, ?, datetime('now'))
         ON CONFLICT(alert_key) DO UPDATE SET acked_by = excluded.acked_by, note = excluded.note, acked_at = excluded.acked_at`,
      )
      .bind(key, user.sub, note)
      .run();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return fail(error, '[admin/alerts POST]');
  }
}

/** DELETE /api/admin/alerts?key= — bring an acknowledged alert back. */
export async function DELETE(request: Request) {
  try {
    await requireAdmin();
    const key = new URL(request.url).searchParams.get('key') || '';
    if (!KEY.test(key)) return NextResponse.json({ error: 'แจ้งเตือนไม่ถูกต้อง' }, { status: 400 });
    const db = await getDB();
    await db.prepare('DELETE FROM admin_alert_acks WHERE alert_key = ?').bind(key).run();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return fail(error, '[admin/alerts DELETE]');
  }
}
