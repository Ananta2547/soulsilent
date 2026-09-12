import { NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { getCurrentUserWithRoles } from '@/lib/auth';
import { hasAnyRole } from '@/lib/roles';
import { parseInstructorIds } from '@/lib/workshop-utils';

// PUT /api/teacher/bookings/[id]/note — a facilitator's private note about the
// participant. Body: { facilitator_note }.
//
// Any facilitator listed on the workshop may write it (not just the owning
// teacher), plus admins. The note is staff-only and is never returned on a
// participant-facing endpoint.
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await getCurrentUserWithRoles();
  if (!u) return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });
  if (!hasAnyRole(u.roles, ['teacher'])) {
    return NextResponse.json({ error: 'เฉพาะผู้สอน' }, { status: 403 });
  }
  const { id } = await params;
  const body = (await request.json()) as { facilitator_note?: string };
  const note = (body.facilitator_note || '').trim() || null;

  const db = await getDB();
  const row = await db
    .prepare(
      `SELECT w.instructor_id AS instructor_id, w.instructor_ids_json AS instructor_ids_json
         FROM bookings b JOIN workshops w ON b.workshop_id = w.id
        WHERE b.id = ?`,
    )
    .bind(id)
    .first<{ instructor_id: string | null; instructor_ids_json: string | null }>();

  if (!row) return NextResponse.json({ error: 'ไม่พบการจอง' }, { status: 404 });

  const facilitators = parseInstructorIds(row);
  if (!u.roles.includes('admin') && !facilitators.includes(u.sub)) {
    return NextResponse.json({ error: 'ไม่มีสิทธิ์' }, { status: 403 });
  }

  await db.prepare('UPDATE bookings SET facilitator_note = ? WHERE id = ?').bind(note, id).run();

  return NextResponse.json({ ok: true, facilitator_note: note });
}
