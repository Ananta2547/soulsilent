import { NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { computePayout } from '@/lib/workshop-utils';

// GET /api/teacher/overview — the numbers behind the teacher dashboard's
// overview: totals, revenue by month, participant ages and recent bookings,
// all scoped to the workshops this teacher actually leads.
//
// The admin dashboard shows similar figures for the whole platform; none of it
// is reused here, because every query below is restricted to one teacher's
// workshops and a platform-wide total would be the wrong number entirely.

/** Owner, or a co-facilitator an admin ticked (migration 046). Written out the
 *  same way as in the workshops route so both scope on exactly one rule. */
const OWNED = `(w.instructor_id = ?
    OR EXISTS (
         SELECT 1 FROM json_each(COALESCE(w.dashboard_access_json, '[]'))
          WHERE json_each.value = ?
       ))`;

/** Money counts only once it has actually been collected. */
const COLLECTED = `(b.payment_status = 'paid' OR b.status = 'confirmed')`;

type BookingRow = {
  id: string;
  user_id: string | null;
  amount: number;
  status: string;
  payment_status: string;
  created_at: string;
  application_json: string | null;
  user_name: string | null;
  workshop_title: string | null;
};

export async function GET() {
  const u = await getCurrentUser();
  if (!u) return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });
  if (u.role !== 'teacher' && u.role !== 'admin') {
    return NextResponse.json({ error: 'เฉพาะผู้สอน' }, { status: 403 });
  }

  const db = await getDB();

  // Payout deductions differ per workshop, so a teacher's net cannot be one sum
  // over all bookings — it is worked out per workshop and then added up.
  const wsRes = await db
    .prepare(
      `SELECT w.id, w.payout_deduction_type, w.payout_deduction_value,
              (SELECT COALESCE(SUM(b.amount), 0) FROM bookings b
                WHERE b.workshop_id = w.id AND ${COLLECTED}) AS gross,
              (SELECT COUNT(*) FROM bookings b
                WHERE b.workshop_id = w.id AND ${COLLECTED}) AS booked
         FROM workshops w
        WHERE ${OWNED}`,
    )
    .bind(u.sub, u.sub)
    .all<{
      id: string;
      payout_deduction_type: 'none' | 'fixed' | 'percent';
      payout_deduction_value: number;
      gross: number;
      booked: number;
    }>();

  const workshops = wsRes.results || [];
  const gross = workshops.reduce((s, w) => s + (w.gross || 0), 0);
  const net = workshops.reduce(
    (s, w) => s + computePayout(w.gross || 0, w.payout_deduction_type, w.payout_deduction_value).net,
    0,
  );
  const participants = workshops.reduce((s, w) => s + (w.booked || 0), 0);

  // Twelve months of collected money, newest first — the same shape the admin
  // revenue endpoint returns, so the chart reads the same way.
  const monthlyRes = await db
    .prepare(
      `SELECT strftime('%Y-%m', b.created_at) AS month,
              COALESCE(SUM(b.amount), 0) AS total,
              COUNT(*) AS count
         FROM bookings b
         JOIN workshops w ON w.id = b.workshop_id
        WHERE ${OWNED} AND ${COLLECTED}
        GROUP BY month
        ORDER BY month DESC
        LIMIT 12`,
    )
    .bind(u.sub, u.sub)
    .all<{ month: string; total: number; count: number }>();

  // Every collected payment of the last year, as (when, how much). The chart's
  // range filter buckets these itself — a monthly roll-up cannot answer "the
  // last 7 days", and these rows are few enough to send whole.
  const paidRes = await db
    .prepare(
      `SELECT b.created_at AS at, b.amount AS amount
         FROM bookings b
         JOIN workshops w ON w.id = b.workshop_id
        WHERE ${OWNED} AND ${COLLECTED}
          AND b.created_at >= datetime('now', '-1 year')
        ORDER BY b.created_at ASC`,
    )
    .bind(u.sub, u.sub)
    .all<{ at: string; amount: number }>();

  // Every booking on this teacher's workshops, newest first. Cancelled rows are
  // included: the page decides what to hide, and the activity a teacher reads
  // as history must not quietly lose entries.
  const bookingsRes = await db
    .prepare(
      `SELECT b.id, b.user_id, b.amount, b.status, b.payment_status, b.created_at,
              b.application_json,
              us.name AS user_name, w.title AS workshop_title
         FROM bookings b
         JOIN workshops w ON w.id = b.workshop_id
         LEFT JOIN users us ON us.id = b.user_id
        WHERE ${OWNED}
        ORDER BY b.created_at DESC
        LIMIT 200`,
    )
    .bind(u.sub, u.sub)
    .all<BookingRow>();

  const bookings = bookingsRes.results || [];

  // Ages come off the applications, where each was worked out from that
  // applicant's date of birth when they applied. One person counts once,
  // however many of this teacher's workshops they booked.
  const agesByPerson = new Map<string, number>();
  for (const b of bookings) {
    if (!b.application_json) continue;
    try {
      const age = (JSON.parse(b.application_json) as { profile?: { age?: number | null } }).profile?.age;
      if (typeof age !== 'number' || age <= 0 || age > 120) continue;
      agesByPerson.set(b.user_id || b.id, age);
    } catch {
      // An unparseable application simply does not vote.
    }
  }

  return NextResponse.json({
    totals: { workshops: workshops.length, participants, gross, net },
    monthly: monthlyRes.results || [],
    paidPoints: paidRes.results || [],
    // The band is worked out on the page; the raw ages travel so it can also
    // say how many people the average rests on.
    ages: [...agesByPerson.values()],
    // Nothing else needs the application snapshot, and it holds phone numbers
    // and medical notes — it stays on the server.
    bookings: bookings.map(({ application_json: _drop, ...rest }) => rest),
  });
}
