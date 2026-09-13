import { NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { getCurrentUserWithRoles } from '@/lib/auth';
import { hasAnyRole } from '@/lib/roles';
import type { Workshop } from '@/lib/types';

// GET /api/teacher/workshops — workshops the current teacher organizes.
export async function GET() {
  const u = await getCurrentUserWithRoles();
  if (!u) return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });
  if (!hasAnyRole(u.roles, ['teacher'])) {
    return NextResponse.json({ error: 'เฉพาะผู้สอน' }, { status: 403 });
  }

  const db = await getDB();
  const rows = await db
    .prepare(
      `SELECT w.*, m.kind AS master_kind,
              (SELECT COUNT(*) FROM bookings b
                WHERE b.workshop_id = w.id
                  AND (b.payment_status = 'paid' OR b.status = 'confirmed')) AS booked
         FROM workshops w
         LEFT JOIN workshop_masters m ON m.id = w.master_id
        WHERE w.instructor_id = ?
           OR EXISTS (
                SELECT 1 FROM json_each(COALESCE(w.dashboard_access_json, '[]'))
                 WHERE json_each.value = ?
              )
        ORDER BY w.date DESC`,
    )
    // Owner, or a co-facilitator the admin ticked (migration 046). COALESCE
    // keeps json_each from choking on the NULL every pre-046 row still has.
    .bind(u.sub, u.sub)
    .all<Workshop & { booked: number }>();

  return NextResponse.json({ workshops: rows.results || [] });
}
