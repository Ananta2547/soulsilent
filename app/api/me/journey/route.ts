import { NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { hasWorkshopEnded } from '@/lib/workshop-utils';

/**
 * GET /api/me/journey
 *
 * My Journey shows a workshop ONLY when all three hold (per requirement):
 *   1. secured seat  — confirmed / paid (not cancelled/rejected)
 *   2. attended      — checked in (attended = 1)
 *   3. event ended   — the workshop's end date/time is in the past
 * Missing any one → excluded.
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
                b.attended, b.attendance_json, b.refund_slip_url, b.application_json, b.journey_note, b.created_at,
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

    const items = (rows.results || [])
      .filter((b) => {
        // 1. secured seat
        const secured = b.payment_status === 'paid' || b.status === 'confirmed';
        // 2. attended (checked in)
        const attended = b.attended === 1;
        // 3. event ended (multi-day aware)
        const ended = hasWorkshopEnded({
          workshop_type: (b.workshop_type as 'one_day') || 'one_day',
          date: (b.date as string) || '',
          end_date: (b.end_date as string | null) ?? null,
          dates_json: (b.dates_json as string) || '[]',
          time_end: (b.time_end as string) || '23:59',
        });
        return secured && attended && ended;
      })
      .map((b) => ({
        ...b,
        // attended is guaranteed by the filter → always reveal the Drive link.
        photos_drive_url: (b.photos_drive_url as string | null) ?? null,
      }));

    // Seats bought for workshops that have not ended yet: the Diary book shows
    // them on their day ahead of time (writing opens on the day itself).
    const upcoming = (rows.results || [])
      .filter((b) => {
        const secured = b.payment_status === 'paid' || b.status === 'confirmed';
        const ended = hasWorkshopEnded({
          workshop_type: (b.workshop_type as 'one_day') || 'one_day',
          date: (b.date as string) || '',
          end_date: (b.end_date as string | null) ?? null,
          dates_json: (b.dates_json as string) || '[]',
          time_end: (b.time_end as string) || '23:59',
        });
        return secured && !ended;
      })
      .map((b) => ({
        workshop_id: b.workshop_id as string,
        title: b.title as string,
        image_url: (b.image_url as string | null) ?? null,
        date: b.date as string,
        time_start: b.time_start as string,
        time_end: b.time_end as string,
      }));

    return NextResponse.json({ items, upcoming });
  } catch (error) {
    const err = error as Error;
    if (err.message === 'Unauthorized') {
      return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });
    }
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 });
  }
}

/**
 * PATCH /api/me/journey — save the caller's personal memory note for one of
 * their bookings. Scoped by user_id so a user can only write on their own row.
 */
export async function PATCH(request: Request) {
  try {
    const user = await requireAuth();
    const { booking_id, note } = (await request.json()) as {
      booking_id?: string;
      note?: string;
    };
    if (!booking_id) {
      return NextResponse.json({ error: 'ไม่พบรายการ' }, { status: 400 });
    }
    // Cap length defensively; trim so an all-whitespace note clears to null.
    const clean = typeof note === 'string' ? note.slice(0, 5000).trim() : '';
    const db = await getDB();
    const res = await db
      .prepare('UPDATE bookings SET journey_note = ? WHERE id = ? AND user_id = ?')
      .bind(clean || null, booking_id, user.sub)
      .run();
    if (!res.meta.changes) {
      return NextResponse.json({ error: 'ไม่พบรายการของคุณ' }, { status: 404 });
    }
    return NextResponse.json({ ok: true, note: clean || null });
  } catch (error) {
    const err = error as Error;
    if (err.message === 'Unauthorized') {
      return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });
    }
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 });
  }
}
