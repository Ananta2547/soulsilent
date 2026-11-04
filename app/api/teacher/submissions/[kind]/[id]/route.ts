import { NextResponse } from 'next/server';
import { getDB, getEnv } from '@/lib/db';
import { requireRoles } from '@/lib/auth';
import { updateWorkshop, type WorkshopBody } from '@/lib/workshop-write';
import { updateMaster, type MasterBody } from '@/lib/master-write';
import {
  bodyFromMaster,
  bodyFromWorkshop,
  GATED_LABEL,
  hostMasterBody,
  hostWorkshopBody,
  isLive,
  routeError,
  splitGated,
  tellAdminsSubmitted,
  type SubKind,
} from '@/lib/submissions';
import type { Workshop, WorkshopMaster } from '@/lib/types';

type Ctx = { params: Promise<{ kind: string; id: string }> };
type Row = (Workshop | WorkshopMaster) & { created_by?: string | null; review_status?: string | null; pending_json?: string | null; status?: string; activity_status?: string };

/** The host's own row of that kind, or why not. */
async function own(db: D1Database, kind: string, id: string, me: string) {
  if (kind !== 'single' && kind !== 'round') return { error: NextResponse.json({ error: 'ไม่รู้จักประเภทกิจกรรม' }, { status: 400 }) };
  const row = await db
    .prepare(kind === 'single' ? 'SELECT * FROM workshops WHERE id = ? AND master_id IS NULL' : "SELECT * FROM workshop_masters WHERE id = ? AND kind = 'round'")
    .bind(id)
    .first<Row>();
  if (!row || row.created_by !== me) return { error: NextResponse.json({ error: 'ไม่พบกิจกรรม' }, { status: 404 }) };
  return { kind: kind as SubKind, row };
}

/** GET — the whole row, to fill the form. */
export async function GET(_req: Request, { params }: Ctx) {
  try {
    const me = await requireRoles('teacher', 'session_host');
    const { kind, id } = await params;
    const o = await own(await getDB(), kind, id, me.sub);
    if ('error' in o) return o.error;
    return NextResponse.json({ row: o.row });
  } catch (e) {
    return routeError(e, 'Get submission');
  }
}

/**
 * PUT — save the form. Before approval everything is saved as is. Once the
 * activity is live, text and pictures go live now, while a price or date
 * change waits for admin (pending_json) and admin is told on LINE.
 */
export async function PUT(request: Request, { params }: Ctx) {
  try {
    const me = await requireRoles('teacher', 'session_host');
    const { kind, id } = await params;
    const db = await getDB();
    const o = await own(db, kind, id, me.sub);
    if ('error' in o) return o.error;
    const data = (await request.json()) as unknown;

    if (o.kind === 'single') {
      const live = bodyFromWorkshop(o.row as Workshop);
      const next = hostWorkshopBody(data as WorkshopBody, me.sub, live);
      if (!next.title?.trim()) return NextResponse.json({ error: 'กรุณากรอกชื่อกิจกรรม' }, { status: 400 });
      if (!isLive('single', o.row)) {
        await updateWorkshop(db, id, next);
        return NextResponse.json({ ok: true });
      }
      const was = o.row.pending_json ? (JSON.parse(o.row.pending_json) as Partial<WorkshopBody>) : null;
      const split = splitGated('single', live, next, was);
      await updateWorkshop(db, id, split.save);
      return NextResponse.json(await settlePending(db, 'workshops', o.kind, id, next.title, split.pending, me.sub));
    }

    const live = bodyFromMaster(o.row as WorkshopMaster);
    const next = hostMasterBody(data as MasterBody, me.sub, live);
    if (!isLive('round', o.row)) {
      const r = await updateMaster(db, id, next);
      if (r.error) return NextResponse.json({ error: r.error }, { status: 400 });
      return NextResponse.json({ ok: true });
    }
    const was = o.row.pending_json ? (JSON.parse(o.row.pending_json) as Partial<MasterBody>) : null;
    const split = splitGated('round', live, next, was);
    const r = await updateMaster(db, id, split.save);
    if (r.error) return NextResponse.json({ error: r.error }, { status: 400 });
    return NextResponse.json(await settlePending(db, 'workshop_masters', o.kind, id, next.title, split.pending, me.sub));
  } catch (e) {
    return routeError(e, 'Save submission');
  }
}

/** Store what waits for admin and say so; with nothing waiting it is simply approved. */
async function settlePending(db: D1Database, table: 'workshops' | 'workshop_masters', kind: SubKind, id: string, title: string, pending: object | null, me: string) {
  if (!pending) {
    await db.prepare(`UPDATE ${table} SET pending_json = NULL, review_status = 'approved' WHERE id = ?`).bind(id).run();
    return { ok: true, waiting: [] as string[] };
  }
  await db
    .prepare(`UPDATE ${table} SET pending_json = ?, review_status = 'pending', review_note = NULL, submitted_at = datetime('now') WHERE id = ?`)
    .bind(JSON.stringify(pending), id)
    .run();
  const changed = Object.keys(pending).map((k) => GATED_LABEL[k] || k);
  const host = await db.prepare("SELECT COALESCE(NULLIF(TRIM(nickname), ''), name) AS n FROM users WHERE id = ?").bind(me).first<{ n: string | null }>();
  const env = (await getEnv()) as unknown as Parameters<typeof tellAdminsSubmitted>[1];
  await tellAdminsSubmitted(db, env, { kind, id, title, host: host?.n || 'ผู้จัด', edit: true, changed });
  return { ok: true, waiting: changed };
}

/** DELETE — a host may throw away an activity that never went live and has no bookings. */
export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    const me = await requireRoles('teacher', 'session_host');
    const { kind, id } = await params;
    const db = await getDB();
    const o = await own(db, kind, id, me.sub);
    if ('error' in o) return o.error;
    if (isLive(o.kind, o.row)) return NextResponse.json({ error: 'กิจกรรมที่เปิดแล้วลบเองไม่ได้ — ติดต่อทีมงาน' }, { status: 400 });
    const booked = await db
      .prepare(
        o.kind === 'single'
          ? 'SELECT COUNT(*) AS n FROM bookings WHERE workshop_id = ?'
          : 'SELECT COUNT(*) AS n FROM bookings WHERE workshop_id IN (SELECT id FROM workshops WHERE master_id = ?)',
      )
      .bind(id)
      .first<{ n: number }>();
    if (booked?.n) return NextResponse.json({ error: 'มีการจองแล้ว ลบไม่ได้' }, { status: 400 });
    if (o.kind === 'single') await db.prepare('DELETE FROM workshops WHERE id = ?').bind(id).run();
    else
      await db.batch([
        db.prepare('DELETE FROM workshops WHERE master_id = ?').bind(id),
        db.prepare('DELETE FROM workshop_masters WHERE id = ?').bind(id),
      ]);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return routeError(e, 'Delete submission');
  }
}
