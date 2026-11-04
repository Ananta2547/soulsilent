import { NextResponse } from 'next/server';
import { getDB, getEnv } from '@/lib/db';
import { requireRoles } from '@/lib/auth';
import { GATED_LABEL, isLive, routeError, tellAdminsSubmitted } from '@/lib/submissions';

/**
 * POST /api/teacher/submissions/[kind]/[id]/submit — send a draft (or one
 * admin asked to change) to admin, who hears about it on LINE.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ kind: string; id: string }> }) {
  try {
    const me = await requireRoles('teacher', 'session_host');
    const { kind, id } = await params;
    if (kind !== 'single' && kind !== 'round') return NextResponse.json({ error: 'ไม่รู้จักประเภทกิจกรรม' }, { status: 400 });
    const table = kind === 'single' ? 'workshops' : 'workshop_masters';
    const db = await getDB();
    const row = await db
      .prepare(`SELECT id, title, created_by, review_status, pending_json, ${kind === 'single' ? 'status' : 'activity_status'} AS s FROM ${table} WHERE id = ?`)
      .bind(id)
      .first<{ id: string; title: string; created_by: string | null; review_status: string | null; pending_json: string | null; s: string }>();
    if (!row || row.created_by !== me.sub) return NextResponse.json({ error: 'ไม่พบกิจกรรม' }, { status: 404 });
    if (row.review_status === 'pending') return NextResponse.json({ error: 'ส่งให้ทีมตรวจแล้ว รอผลอยู่' }, { status: 400 });

    const live = isLive(kind, kind === 'single' ? { status: row.s } : { activity_status: row.s });
    // A live activity is only sent again for the price / date edit that waits.
    if (live && !row.pending_json) return NextResponse.json({ error: 'ไม่มีการแก้ไขที่ต้องรออนุมัติ' }, { status: 400 });
    if (kind === 'round' && !live) {
      const rounds = await db.prepare('SELECT COUNT(*) AS n FROM workshops WHERE master_id = ?').bind(id).first<{ n: number }>();
      if (!rounds?.n) return NextResponse.json({ error: 'เพิ่มรอบอย่างน้อย 1 รอบก่อนส่งให้ทีมตรวจ' }, { status: 400 });
    }

    await db
      .prepare(`UPDATE ${table} SET review_status = 'pending', submitted_at = datetime('now') WHERE id = ?`)
      .bind(id)
      .run();
    const host = await db.prepare("SELECT COALESCE(NULLIF(TRIM(nickname), ''), name) AS n FROM users WHERE id = ?").bind(me.sub).first<{ n: string | null }>();
    const env = (await getEnv()) as unknown as Parameters<typeof tellAdminsSubmitted>[1];
    await tellAdminsSubmitted(db, env, {
      kind,
      id,
      title: row.title,
      host: host?.n || 'ผู้จัด',
      edit: live,
      changed: live && row.pending_json ? Object.keys(JSON.parse(row.pending_json)).map((k) => GATED_LABEL[k] || k) : undefined,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return routeError(e, 'Submit');
  }
}
