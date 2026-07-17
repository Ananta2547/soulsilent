import { NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

/**
 * GET /api/me/credentials — the signed-in user's "earned" workshops (paid or
 * marked attended), used to populate real credential badges in the portfolio
 * builder. The selected badge is snapshotted into the document so the public
 * page never needs to re-fetch.
 */
export async function GET() {
  const payload = await getCurrentUser();
  if (!payload) {
    return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });
  }

  const db = await getDB();
  const rows = await db
    .prepare(
      `SELECT w.id AS id, w.title AS title, w.date AS date,
              MAX(CASE WHEN b.attended = 1 THEN 1 ELSE 0 END) AS attended
         FROM bookings b
         JOIN workshops w ON b.workshop_id = w.id
        WHERE b.user_id = ?
          AND (b.payment_status = 'paid' OR b.status = 'confirmed' OR b.attended = 1)
        GROUP BY w.id
        ORDER BY w.date DESC`,
    )
    .bind(payload.sub)
    .all<{ id: string; title: string; date: string; attended: number }>();

  return NextResponse.json({ credentials: rows.results || [] });
}
