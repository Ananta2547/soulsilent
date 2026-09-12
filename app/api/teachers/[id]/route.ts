import { NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { expireStaleHolds } from '@/lib/holds';

/* Public profile of a teacher: who they are, and every round they run from
 * today on — the rows the profile page's calendar lights up. Only fields a
 * visitor may see leave here. */

const SEAT_TAKEN = `
  b.status != 'cancelled' AND (
    b.payment_status = 'paid' OR b.status = 'confirmed'
    OR (b.payment_status = 'pending' AND b.expires_at IS NOT NULL AND datetime(b.expires_at) > datetime('now'))
  )`;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = await getDB();
    await expireStaleHolds(db);

    const teacher = await db
      .prepare(
        `SELECT id, name, nickname, avatar_url, cover_image_url, bio
           FROM users
          WHERE id = ? AND role IN ('teacher', 'admin') AND (account_status IS NULL OR account_status = 'active')`
      )
      .bind(id)
      .first<{ id: string; name: string; nickname: string | null; avatar_url: string | null; cover_image_url: string | null; bio: string | null }>();
    if (!teacher) return NextResponse.json({ error: 'ไม่พบผู้สอน' }, { status: 404 });

    // Rounds they lead: listed as an instructor on the row, or organizer of
    // the master the row belongs to.
    const rounds = await db
      .prepare(
        `SELECT w.id, w.master_id, w.title, w.date, w.end_date, w.workshop_type, w.dates_json,
                w.time_start, w.time_end, w.image_url, w.price, w.max_participants, w.is_online,
                l.name AS loc_name, l.province AS loc_province,
                (SELECT COUNT(*) FROM bookings b WHERE b.workshop_id = w.id AND ${SEAT_TAKEN}) AS booked,
                (SELECT COALESCE(SUM(CASE WHEN b.booking_kind = 'private' THEN 1 ELSE 0 END), 0)
                   FROM bookings b WHERE b.workshop_id = w.id AND ${SEAT_TAKEN}) AS private_taken
           FROM workshops w
           LEFT JOIN locations l ON l.id = w.location_id
           LEFT JOIN workshop_masters m ON m.id = w.master_id
          WHERE w.status = 'active'
            AND w.date >= date('now')
            AND (
              w.instructor_id = ?
              OR EXISTS (SELECT 1 FROM json_each(COALESCE(w.instructor_ids_json, '[]')) WHERE json_each.value = ?)
              OR m.organizer = ?
            )
          ORDER BY w.date ASC, w.time_start ASC`
      )
      .bind(id, id, id)
      .all();

    return NextResponse.json({ teacher, rounds: rounds.results || [] });
  } catch (error) {
    console.error('Teacher profile error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 });
  }
}
