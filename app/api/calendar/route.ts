import { NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import type { Workshop } from '@/lib/types';

/**
 * GET /api/calendar
 *
 * Returns all active workshops plus the current user's bookings (if logged in),
 * so the calendar can colour each chip by status (available / starred / attended
 * / noshow). Public — auth is optional.
 */
export async function GET() {
  try {
    const db = await getDB();

    const wsResult = await db
      .prepare(
        `SELECT w.*, l.map_url AS l_map_url, l.name AS l_name
           FROM workshops w
           LEFT JOIN locations l ON w.location_id = l.id
          WHERE w.status = 'active'
          ORDER BY w.date`,
      )
      .all<Workshop & { l_map_url: string | null; l_name: string | null }>();

    // Fall back to the venue's map pin / name when the workshop has none set,
    // so "Add to Google Calendar" can link the exact location.
    const workshops = wsResult.results.map((row) => {
      const { l_map_url, l_name, ...w } = row;
      return {
        ...w,
        map_url: w.map_url || l_map_url || null,
        location: w.location || l_name || null,
      };
    });

    // Taken-seat count per workshop (paid + confirmed + live pending holds) so
    // the calendar can flag "fully booked". Same rule as the detail page.
    const seatRows = await db
      .prepare(
        `SELECT workshop_id, COUNT(*) AS taken FROM bookings
          WHERE status != 'cancelled' AND (
            payment_status = 'paid' OR status = 'confirmed'
            OR (payment_status = 'pending' AND expires_at IS NOT NULL
                AND datetime(expires_at) > datetime('now'))
          )
          GROUP BY workshop_id`
      )
      .all<{ workshop_id: string; taken: number }>();
    const seatCounts: Record<string, number> = {};
    for (const r of seatRows.results) seatCounts[r.workshop_id] = r.taken;

    const user = await getCurrentUser();
    let bookings: Array<{
      workshop_id: string;
      status: string;
      payment_status: string;
      attended: number | null;
      app_status: string;
    }> = [];
    if (user) {
      // Any ACTIVE booking counts as "applied/registered" (yellow) — applied,
      // pending hold, paid/confirmed, or attended. Excludes cancelled/rejected.
      const bResult = await db
        .prepare(
          `SELECT workshop_id, status, payment_status, attended, app_status FROM bookings
           WHERE user_id = ? AND status != 'cancelled' AND app_status != 'rejected'`
        )
        .bind(user.sub)
        .all<{
          workshop_id: string;
          status: string;
          payment_status: string;
          attended: number | null;
          app_status: string;
        }>();
      bookings = bResult.results;
    }

    return NextResponse.json({
      workshops,
      bookings,
      seatCounts,
      isLoggedIn: !!user,
    });
  } catch (error) {
    console.error('Calendar error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 });
  }
}
