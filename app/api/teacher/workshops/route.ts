import { NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import type { Workshop } from '@/lib/types';

// GET /api/teacher/workshops — workshops the current teacher organizes.
export async function GET() {
  const u = await getCurrentUser();
  if (!u) return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });
  if (u.role !== 'teacher' && u.role !== 'admin') {
    return NextResponse.json({ error: 'เฉพาะผู้สอน' }, { status: 403 });
  }

  const db = await getDB();
  const rows = await db
    .prepare(
      `SELECT w.*,
              (SELECT COUNT(*) FROM bookings b
                WHERE b.workshop_id = w.id
                  AND (b.payment_status = 'paid' OR b.status = 'confirmed')) AS booked
         FROM workshops w
        WHERE w.instructor_id = ?
        ORDER BY w.date DESC`,
    )
    .bind(u.sub)
    .all<Workshop & { booked: number }>();

  return NextResponse.json({ workshops: rows.results || [] });
}
