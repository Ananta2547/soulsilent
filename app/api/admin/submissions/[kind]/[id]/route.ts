import { NextResponse } from 'next/server';
import { getDB, getEnv } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';
import { updateWorkshop, type WorkshopBody } from '@/lib/workshop-write';
import { updateMaster, type MasterBody } from '@/lib/master-write';
import { syncRounds } from '@/lib/round-rules';
import { bodyFromMaster, bodyFromWorkshop, isLive, routeError, tellHostDecision } from '@/lib/submissions';
import type { Workshop, WorkshopMaster } from '@/lib/types';

type Action = 'approve' | 'changes' | 'reject';
type Row = (Workshop | WorkshopMaster) & { created_by?: string | null; review_status?: string | null; pending_json?: string | null; status?: string; activity_status?: string };

/**
 * POST /api/admin/submissions/[kind]/[id] { action, note } — admin decides on
 * a host's activity, or on the price / date edit waiting on a live one.
 *   approve  a new one goes live (single: active; round: open); a waiting edit
 *            is applied to the live row
 *   changes  sent back to the host with a note; the host edits and resends
 *   reject   a new one stays hidden; a waiting edit is dropped (live stays)
 * The host hears about it on LINE.
 */
export async function POST(request: Request, { params }: { params: Promise<{ kind: string; id: string }> }) {
  try {
    const admin = await requireAdmin();
    const { kind, id } = await params;
    if (kind !== 'single' && kind !== 'round') return NextResponse.json({ error: 'ไม่รู้จักประเภทกิจกรรม' }, { status: 400 });
    const { action, note } = (await request.json()) as { action?: Action; note?: string };
    const text = (note || '').trim().slice(0, 1000);
    if (action !== 'approve' && action !== 'changes' && action !== 'reject') return NextResponse.json({ error: 'ไม่รู้จักคำสั่ง' }, { status: 400 });
    if (action === 'changes' && !text) return NextResponse.json({ error: 'กรุณาเขียนหมายเหตุว่าต้องแก้อะไร' }, { status: 400 });

    const table = kind === 'single' ? 'workshops' : 'workshop_masters';
    const db = await getDB();
    const row = await db.prepare(`SELECT * FROM ${table} WHERE id = ?`).bind(id).first<Row>();
    if (!row || !row.review_status) return NextResponse.json({ error: 'ไม่พบกิจกรรมที่รออนุมัติ' }, { status: 404 });
    const live = isLive(kind, row);
    const pending = row.pending_json ? (JSON.parse(row.pending_json) as Record<string, unknown>) : null;

    if (action === 'approve') {
      if (kind === 'round' && !live) {
        const rounds = await db.prepare("SELECT COUNT(*) AS n FROM workshops WHERE master_id = ? AND status != 'cancelled'").bind(id).first<{ n: number }>();
        if (!rounds?.n) return NextResponse.json({ error: 'ยังไม่มีรอบ — รอผู้จัดเพิ่มรอบก่อนอนุมัติ' }, { status: 400 });
      }
      if (kind === 'single') {
        const body = { ...bodyFromWorkshop(row as Workshop), ...(pending || {}) } as WorkshopBody;
        if (!live) body.status = 'active';
        await updateWorkshop(db, id, body);
      } else {
        const body = { ...bodyFromMaster(row as WorkshopMaster), ...(pending || {}) } as MasterBody;
        if (!live) body.activity_status = 'open';
        const r = await updateMaster(db, id, body);
        if (r.error) return NextResponse.json({ error: r.error }, { status: 400 });
        await syncRounds(db, id);
      }
      await db
        .prepare(`UPDATE ${table} SET review_status = 'approved', review_note = NULL, pending_json = NULL, reviewed_at = datetime('now'), reviewed_by = ? WHERE id = ?`)
        .bind(admin.sub, id)
        .run();
    } else if (action === 'changes') {
      await db
        .prepare(`UPDATE ${table} SET review_status = 'changes_requested', review_note = ?, reviewed_at = datetime('now'), reviewed_by = ? WHERE id = ?`)
        .bind(text, admin.sub, id)
        .run();
    } else {
      // Turning down a waiting edit keeps the live activity as it was.
      await db
        .prepare(
          live
            ? `UPDATE ${table} SET review_status = 'approved', review_note = ?, pending_json = NULL, reviewed_at = datetime('now'), reviewed_by = ? WHERE id = ?`
            : `UPDATE ${table} SET review_status = 'rejected', review_note = ?, reviewed_at = datetime('now'), reviewed_by = ? WHERE id = ?`,
        )
        .bind(text || null, admin.sub, id)
        .run();
    }

    if (row.created_by) {
      const env = (await getEnv()) as unknown as Parameters<typeof tellHostDecision>[1];
      await tellHostDecision(db, env, row.created_by, { kind, id, title: row.title, action, note: text, edit: live });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return routeError(e, 'Admin decide');
  }
}

/**
 * DELETE /api/admin/submissions/[kind]/[id] — admin removes for good a host
 * activity the host cancelled. Only one nobody ever booked: a booking row
 * (even cancelled or refunded) is money history, so that activity stays hidden.
 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ kind: string; id: string }> }) {
  try {
    await requireAdmin();
    const { kind, id } = await params;
    if (kind !== 'single' && kind !== 'round') return NextResponse.json({ error: 'ไม่รู้จักประเภทกิจกรรม' }, { status: 400 });
    const db = await getDB();
    const row =
      kind === 'single'
        ? await db.prepare("SELECT id FROM workshops WHERE id = ? AND master_id IS NULL AND review_status IS NOT NULL AND status = 'cancelled'").bind(id).first()
        : await db.prepare("SELECT id FROM workshop_masters WHERE id = ? AND review_status IS NOT NULL AND activity_status = 'archived'").bind(id).first();
    if (!row) return NextResponse.json({ error: 'ลบได้เฉพาะกิจกรรมของผู้จัดที่ยกเลิกแล้ว' }, { status: 400 });
    const used = await db
      .prepare(
        kind === 'single'
          ? 'SELECT COUNT(*) AS n FROM bookings WHERE workshop_id = ?'
          : 'SELECT COUNT(*) AS n FROM bookings WHERE workshop_id IN (SELECT id FROM workshops WHERE master_id = ?)',
      )
      .bind(id)
      .first<{ n: number }>();
    if (used?.n) return NextResponse.json({ error: `มีประวัติการจอง ${used.n} รายการ — ลบไม่ได้ ปิดไว้แบบนี้แทน` }, { status: 409 });
    if (kind === 'single') await db.prepare('DELETE FROM workshops WHERE id = ?').bind(id).run();
    else
      await db.batch([
        db.prepare('DELETE FROM workshops WHERE master_id = ?').bind(id),
        db.prepare('DELETE FROM workshop_masters WHERE id = ?').bind(id),
      ]);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return routeError(e, 'Admin delete submission');
  }
}
