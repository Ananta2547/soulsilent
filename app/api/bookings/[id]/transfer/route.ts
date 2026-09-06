import { NextResponse } from 'next/server';
import { v4 as uuid } from 'uuid';
import { getDB, getEnv } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { claimUrl, newTransferToken, partyFromBooking, type TicketTransfer } from '@/lib/transfers';
import { hasWorkshopStarted } from '@/lib/workshop-utils';
import type { Workshop } from '@/lib/types';

/**
 * POST /api/bookings/{id}/transfer — mint (or return) the link that passes this
 * seat to someone else.
 *
 * Idempotent on purpose: pressing the button twice must not leave two live
 * links for one seat, so an unclaimed link is handed back as-is.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth();
    const { id } = await params;
    const db = await getDB();

    const booking = await db
      .prepare(
        `SELECT id, user_id, workshop_id, status, payment_status, application_json
           FROM bookings WHERE id = ?`,
      )
      .bind(id)
      .first<{
        id: string;
        user_id: string;
        workshop_id: string;
        status: string;
        payment_status: string;
        application_json: string | null;
      }>();

    if (!booking || booking.user_id !== user.sub) {
      return NextResponse.json({ error: 'ไม่พบการจองนี้' }, { status: 404 });
    }
    // Only a secured seat can be handed on. A pending hold is not yours yet,
    // and a cancelled one is nobody's.
    const secured = booking.payment_status === 'paid' || booking.status === 'confirmed';
    if (!secured || booking.status === 'cancelled') {
      return NextResponse.json({ error: 'ที่นั่งนี้ยังไม่ได้ชำระเงิน จึงยังโอนสิทธิ์ไม่ได้' }, { status: 400 });
    }

    const workshop = await db
      .prepare('SELECT * FROM workshops WHERE id = ?')
      .bind(booking.workshop_id)
      .first<Workshop>();
    if (!workshop) return NextResponse.json({ error: 'ไม่พบกิจกรรม' }, { status: 404 });
    // Once the event is under way the receiver could never take the seat up,
    // so the link is refused rather than minted and left dead.
    if (hasWorkshopStarted(workshop)) {
      return NextResponse.json({ error: 'กิจกรรมเริ่มแล้ว ไม่สามารถโอนสิทธิ์ได้' }, { status: 400 });
    }

    const env = await getEnv();
    const site = env.SITE_URL || 'http://localhost:3000';

    const live = await db
      .prepare(
        `SELECT * FROM ticket_transfers
          WHERE booking_id = ? AND status = 'pending'
          ORDER BY created_at DESC LIMIT 1`,
      )
      .bind(booking.id)
      .first<TicketTransfer>();
    if (live) {
      return NextResponse.json({ token: live.token, url: claimUrl(site, live.token), kind: live.kind, reused: true });
    }

    const account = await db
      .prepare('SELECT name, phone, vault_json FROM users WHERE id = ?')
      .bind(user.sub)
      .first<{ name: string | null; phone: string | null; vault_json: string | null }>();
    const from = partyFromBooking(booking.application_json, account || {});
    const token = newTransferToken();
    await db
      .prepare(
        `INSERT INTO ticket_transfers
           (id, booking_id, workshop_id, kind, token, status, from_user_id, from_name, from_phone)
         VALUES (?, ?, ?, 'transfer', ?, 'pending', ?, ?, ?)`,
      )
      .bind(uuid(), booking.id, booking.workshop_id, token, user.sub, from.name, from.phone)
      .run();

    return NextResponse.json({ token, url: claimUrl(site, token), kind: 'transfer', reused: false });
  } catch (error) {
    const err = error as Error;
    if (err.message === 'Unauthorized') {
      return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });
    }
    console.error('Create transfer error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 });
  }
}
