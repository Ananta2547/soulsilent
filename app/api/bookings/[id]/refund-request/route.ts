import { NextResponse } from 'next/server';
import { getDB, getEnv } from '@/lib/db';
import { notifyHostsRefundRequest } from '@/lib/push-events';
import { requireAuth } from '@/lib/auth';
import { getWorkshopStart } from '@/lib/workshop-utils';
import type { Workshop } from '@/lib/types';

/** POST — a member whose round the host moved takes the refund instead.
 *  Allowed for the booking's owner (a group's booker, not its members) until
 *  the new round starts. The booking and its group members are cancelled
 *  with 'refund_requested'; admin then transfers the money and attaches the
 *  slip from the refund list. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth();
    const { id } = await params;
    const db = await getDB();
    const b = await db
      .prepare('SELECT id, user_id, workshop_id, status, payment_status, parent_booking_id, moved_from FROM bookings WHERE id = ?')
      .bind(id)
      .first<{ id: string; user_id: string; workshop_id: string; status: string; payment_status: string; parent_booking_id: string | null; moved_from: string | null }>();
    if (!b || b.user_id !== user.sub) return NextResponse.json({ error: 'ไม่พบการจอง' }, { status: 404 });
    if (!b.moved_from) return NextResponse.json({ error: 'การจองนี้ไม่ได้ถูกย้ายรอบ' }, { status: 400 });
    if (b.parent_booking_id) return NextResponse.json({ error: 'ให้ผู้จองของกลุ่มเป็นคนขอคืนเงิน' }, { status: 400 });
    if (b.status === 'cancelled') return NextResponse.json({ error: 'การจองนี้ถูกยกเลิกไปแล้ว' }, { status: 400 });
    const w = await db.prepare('SELECT * FROM workshops WHERE id = ?').bind(b.workshop_id).first<Workshop>();
    if (!w || getWorkshopStart(w).getTime() <= Date.now()) {
      return NextResponse.json({ error: 'รอบใหม่เริ่มไปแล้ว — ขอคืนเงินไม่ได้' }, { status: 400 });
    }
    await db
      .prepare(
        `UPDATE bookings SET status = 'cancelled', cancel_reason = 'refund_requested'
          WHERE status != 'cancelled' AND (id = ? OR parent_booking_id = ?)`,
      )
      .bind(id, id)
      .run();
    await notifyHostsRefundRequest(db, await getEnv(), id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if ((error as Error).message === 'Unauthorized') return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });
    console.error('Refund request error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 });
  }
}
