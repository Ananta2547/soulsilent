import { NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import type { TicketTransfer } from '@/lib/transfers';

export type AdminTransferRow = Pick<
  TicketTransfer,
  | 'id'
  | 'booking_id'
  | 'workshop_id'
  | 'kind'
  | 'status'
  | 'created_at'
  | 'claimed_at'
  | 'from_name'
  | 'from_phone'
  | 'to_name'
  | 'to_phone'
> & {
  workshop_title: string | null;
  workshop_date: string | null;
  from_email: string | null;
  to_email: string | null;
};

/**
 * GET /api/admin/transfers — every seat handover on the platform, newest first.
 *
 * Admin only. It carries both parties' phone numbers across all workshops, so
 * it is deliberately not the teacher's view: a teacher sees their own roster,
 * not who gave a seat to whom on somebody else's event.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });
  if (user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const db = await getDB();
  const res = await db
    .prepare(
      `SELECT t.id, t.booking_id, t.workshop_id, t.kind, t.status, t.created_at, t.claimed_at,
              t.from_name, t.from_phone, t.to_name, t.to_phone,
              w.title AS workshop_title, w.date AS workshop_date,
              fu.email AS from_email, tu.email AS to_email
         FROM ticket_transfers t
         LEFT JOIN workshops w ON w.id = t.workshop_id
         LEFT JOIN users fu ON fu.id = t.from_user_id
         LEFT JOIN users tu ON tu.id = t.to_user_id
        ORDER BY t.created_at DESC`,
    )
    .all<AdminTransferRow>();

  return NextResponse.json({ transfers: res.results || [] });
}
