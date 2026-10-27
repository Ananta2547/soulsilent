import { NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { getCurrentUserWithRoles } from '@/lib/auth';
import { hasAnyRole } from '@/lib/roles';
import { cleanCloseRule, syncRounds } from '@/lib/round-rules';

/** PUT /api/teacher/masters/[id]/settings { close_days_before, close_time }
 *  — the host of a round activity (or admin) sets when booking for each round
 *  closes: so many days before its date, at this time. Empty days = open until
 *  the round starts. Written into every round that has not happened yet. */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await getCurrentUserWithRoles();
  if (!u) return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });
  if (!hasAnyRole(u.roles, ['session_host'])) return NextResponse.json({ error: 'เฉพาะผู้จัดรอบ (session_host)' }, { status: 403 });
  const { id } = await params;
  const db = await getDB();
  const m = await db.prepare('SELECT id, organizer FROM workshop_masters WHERE id = ?').bind(id).first<{ id: string; organizer: string | null }>();
  if (!m) return NextResponse.json({ error: 'ไม่พบกิจกรรม' }, { status: 404 });
  if (!u.roles.includes('admin') && m.organizer !== u.sub) return NextResponse.json({ error: 'คุณไม่ได้เป็นผู้จัดของกิจกรรมนี้' }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as { close_days_before?: unknown; close_time?: unknown };
  const rule = cleanCloseRule(body.close_days_before, body.close_time);
  if ('error' in rule) return NextResponse.json({ error: rule.error }, { status: 400 });
  await db
    .prepare("UPDATE workshop_masters SET close_days_before = ?, close_time = ?, updated_at = datetime('now') WHERE id = ?")
    .bind(rule.days, rule.time, id)
    .run();
  await syncRounds(db, id);
  return NextResponse.json({ ok: true, close_days_before: rule.days, close_time: rule.time });
}
