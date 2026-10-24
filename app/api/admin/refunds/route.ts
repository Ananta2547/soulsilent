import { NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';
import { applicantName } from '@/lib/applicant';

/** GET /api/admin/refunds — paid seats in a cancelled round (or whose member
 *  took the refund instead of a moved round) that still have no refund recorded.
 *  Admin transfers the money and records the transfer in the ledger (from the
 *  payments page or the round attendance page); the row then leaves this list. */
export async function GET() {
  try {
    await requireAdmin();
    const db = await getDB();
    const rows =
      (
        await db
          .prepare(
            `SELECT b.id, b.workshop_id, b.amount, b.cancel_reason, b.application_json, b.created_at,
                    COALESCE(NULLIF(TRIM(u.nickname), ''), u.name) AS user_name, u.email AS user_email, u.phone AS user_phone,
                    w.title AS workshop_title, w.date AS workshop_date, w.time_start AS workshop_time, w.status AS workshop_status
               FROM bookings b
               JOIN workshops w ON w.id = b.workshop_id
               LEFT JOIN users u ON u.id = b.user_id
              WHERE b.status = 'cancelled' AND b.payment_status = 'paid' AND b.amount > 0
                AND b.cancel_reason IN ('workshop_changed', 'refund_requested')
                AND (b.refund_slip_url IS NULL OR b.refund_slip_url = '')
                AND NOT EXISTS (SELECT 1 FROM money_tx t WHERE t.booking_id = b.id AND t.kind = 'refund' AND t.status = 'done')
              ORDER BY w.date DESC, b.created_at ASC
              LIMIT 300`,
          )
          .all<{
            id: string;
            workshop_id: string;
            amount: number;
            cancel_reason: string;
            application_json: string | null;
            created_at: string;
            user_name: string | null;
            user_email: string | null;
            user_phone: string | null;
            workshop_title: string;
            workshop_date: string;
            workshop_time: string;
            workshop_status: string;
          }>()
      ).results || [];
    const items = rows.map(({ application_json, ...r }) => ({ ...r, name: applicantName(application_json, r.user_name) }));
    return NextResponse.json({ items, total: items.reduce((a, r) => a + (Number(r.amount) || 0), 0) });
  } catch (error) {
    const msg = (error as Error).message;
    if (msg === 'Unauthorized' || msg === 'Forbidden') return NextResponse.json({ error: msg }, { status: 403 });
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 });
  }
}
