import { NextResponse } from 'next/server';
import { v4 as uuid } from 'uuid';
import { getDB } from '@/lib/db';
import { requireRoles } from '@/lib/auth';
import { insertWorkshop, type WorkshopBody } from '@/lib/workshop-write';
import { insertMaster, type MasterBody } from '@/lib/master-write';
import { grantSessionHost, hostMasterBody, hostWorkshopBody, routeError, type SubKind } from '@/lib/submissions';

export type SubmissionRow = {
  kind: SubKind;
  id: string;
  title: string;
  review_status: string;
  review_note: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  pending_json: string | null;
  /** workshops.status or workshop_masters.activity_status — 'draft' until approved. */
  live_status: string;
  date: string | null;
  image_url: string | null;
  updated_at: string | null;
};

/** GET /api/teacher/submissions — the activities this host made, newest first. */
export async function GET() {
  try {
    const me = await requireRoles('teacher', 'session_host');
    const db = await getDB();
    const rows = await db
      .prepare(
        `SELECT 'single' AS kind, id, title, review_status, review_note, submitted_at, reviewed_at, pending_json,
                status AS live_status, date, image_url, updated_at
           FROM workshops WHERE created_by = ? AND master_id IS NULL AND review_status IS NOT NULL
         UNION ALL
         SELECT 'round' AS kind, id, title, review_status, review_note, submitted_at, reviewed_at, pending_json,
                activity_status AS live_status, NULL AS date, cover_image_url AS image_url, updated_at
           FROM workshop_masters WHERE created_by = ? AND review_status IS NOT NULL
         ORDER BY updated_at DESC`,
      )
      .bind(me.sub, me.sub)
      .all<SubmissionRow>();
    return NextResponse.json({ submissions: rows.results || [] });
  } catch (e) {
    return routeError(e, 'List submissions');
  }
}

/** POST /api/teacher/submissions { kind, data } — a new activity, saved as a draft. */
export async function POST(request: Request) {
  try {
    const me = await requireRoles('teacher', 'session_host');
    const { kind, data } = (await request.json()) as { kind?: SubKind; data?: unknown };
    const db = await getDB();
    const id = uuid();
    if (kind === 'single') {
      const body = hostWorkshopBody(data as WorkshopBody, me.sub, null);
      if (!body.title?.trim()) return NextResponse.json({ error: 'กรุณากรอกชื่อกิจกรรม' }, { status: 400 });
      if (!body.date) return NextResponse.json({ error: 'กรุณาเลือกวันที่จัดกิจกรรม' }, { status: 400 });
      await insertWorkshop(db, id, body);
      await db.prepare("UPDATE workshops SET created_by = ?, review_status = 'draft' WHERE id = ?").bind(me.sub, id).run();
    } else if (kind === 'round') {
      const body = hostMasterBody(data as MasterBody, me.sub, null);
      const r = await insertMaster(db, id, body);
      if (r.error) return NextResponse.json({ error: r.error }, { status: 400 });
      await db.prepare("UPDATE workshop_masters SET created_by = ?, review_status = 'draft' WHERE id = ?").bind(me.sub, id).run();
      // Opening rounds takes the ผู้จัดรอบ role; it only reaches masters they organise.
      await grantSessionHost(db, me.sub);
    } else {
      return NextResponse.json({ error: 'ไม่รู้จักประเภทกิจกรรม' }, { status: 400 });
    }
    return NextResponse.json({ id }, { status: 201 });
  } catch (e) {
    return routeError(e, 'Create submission');
  }
}
