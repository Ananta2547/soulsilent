import { NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { canAccessTeacherDashboard } from '@/lib/workshop-utils';
import type { TicketTransfer } from '@/lib/transfers';
import type { Workshop } from '@/lib/types';

/**
 * GET /api/workshops/{id}/transfers — the handover history for one workshop:
 * who gave a seat away and who took it up.
 *
 * Staff only. It carries both parties' phone numbers, which is exactly what
 * the desk needs on the day and exactly what nobody else should see.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });

  const { id } = await params;
  const db = await getDB();

  if (user.role !== 'admin') {
    const workshop = await db.prepare('SELECT * FROM workshops WHERE id = ?').bind(id).first<Workshop>();
    if (!workshop) return NextResponse.json({ error: 'ไม่พบกิจกรรม' }, { status: 404 });
    // Owner, or a co-facilitator the admin ticked (migration 046).
    if (!canAccessTeacherDashboard(workshop, user.sub)) {
      return NextResponse.json({ error: 'ไม่มีสิทธิ์เข้าถึง' }, { status: 403 });
    }
  }

  const res = await db
    .prepare(
      `SELECT t.id, t.booking_id, t.kind, t.status, t.created_at, t.claimed_at,
              t.from_name, t.from_phone, t.to_name, t.to_phone,
              fu.email AS from_email, tu.email AS to_email
         FROM ticket_transfers t
         LEFT JOIN users fu ON fu.id = t.from_user_id
         LEFT JOIN users tu ON tu.id = t.to_user_id
        WHERE t.workshop_id = ?
        ORDER BY t.created_at DESC`,
    )
    .bind(id)
    .all<
      Pick<
        TicketTransfer,
        | 'id'
        | 'booking_id'
        | 'kind'
        | 'status'
        | 'created_at'
        | 'claimed_at'
        | 'from_name'
        | 'from_phone'
        | 'to_name'
        | 'to_phone'
      > & { from_email: string | null; to_email: string | null }
    >();

  return NextResponse.json({ transfers: res.results || [] });
}
