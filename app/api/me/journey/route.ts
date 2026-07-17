import { NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { requireAuth } from '@/lib/auth';

/**
 * GET /api/me/journey
 *
 * Every workshop the signed-in user applied to or attended (active bookings —
 * excludes cancelled/rejected), joined with the workshop + the user's review.
 *
 * The event-photos Drive link is returned ONLY to users who attended/checked in
 * (attended = 1) — enforced here so it can't be read from the network otherwise.
 */
export async function GET() {
  try {
    const user = await requireAuth();
    const db = await getDB();

    const rows = await db
      .prepare(
        `SELECT b.id AS booking_id, b.workshop_id, b.status, b.payment_status, b.app_status,
                b.attended, b.attendance_json, b.refund_slip_url, b.application_json, b.created_at,
                w.title, w.image_url, w.date, w.end_date, w.dates_json, w.workshop_type,
                w.time_start, w.time_end, w.day_times_json, w.master_id,
                w.require_consent, w.photos_drive_url,
                r.rating AS review_rating, r.comment AS review_comment, r.created_at AS review_created_at
           FROM bookings b
           JOIN workshops w ON b.workshop_id = w.id
           LEFT JOIN reviews r ON r.workshop_id = w.id AND r.user_id = b.user_id
          WHERE b.user_id = ? AND b.status != 'cancelled'
          ORDER BY w.date DESC`,
      )
      .bind(user.sub)
      .all<Record<string, unknown>>();

    const items = (rows.results || []).map((b) => {
      const attended = b.attended === 1;
      return {
        ...b,
        // Only reveal the Drive link to attended users (requirement).
        photos_drive_url: attended ? (b.photos_drive_url as string | null) : null,
      };
    });

    return NextResponse.json({ items });
  } catch (error) {
    const err = error as Error;
    if (err.message === 'Unauthorized') {
      return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });
    }
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 });
  }
}
