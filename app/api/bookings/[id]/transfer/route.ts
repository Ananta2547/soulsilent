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
        `SELECT id, user_id, workshop_id, status, payment_status, amount, application_json,
                group_size, parent_booking_id
           FROM bookings WHERE id = ?`,
      )
      .bind(id)
      .first<{
        id: string;
        user_id: string;
        workshop_id: string;
        status: string;
        payment_status: string;
        amount: number | null;
        application_json: string | null;
        group_size: number | null;
        parent_booking_id: string | null;
      }>();

    if (!booking || booking.user_id !== user.sub) {
      return NextResponse.json({ error: 'ไม่พบการจองนี้' }, { status: 404 });
    }
    // A group's seats travel by its own invite link; a member's seat was
    // never theirs to sell on.
    if ((booking.group_size || 1) > 1 || booking.parent_booking_id) {
      return NextResponse.json({ error: 'ที่นั่งแบบกลุ่มโอนสิทธิ์ไม่ได้ ใช้ลิงก์เชิญเพื่อนแทน' }, { status: 400 });
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
    // A free seat is not worth handing over: whoever wants it can book it
    // directly, and passing it through a link only adds a step that can be
    // lost. `amount` is what was actually charged, so a 100%-off promo counts
    // as free here too.
    if ((workshop.payment_type || 'paid') === 'free' || (booking.amount || 0) <= 0) {
      return NextResponse.json(
        { error: 'กิจกรรมนี้เข้าร่วมฟรี ให้เพื่อนจองเองได้เลย ไม่ต้องโอนสิทธิ์' },
        { status: 400 },
      );
    }
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

/**
 * GET /api/bookings/{id}/transfer — the live handover link for this seat, if
 * one has been minted and nobody has claimed it yet.
 *
 * Read-only: unlike POST it never mints, so the pay page can ask "is this a
 * gift?" without creating a link for an ordinary booking.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth();
    const { id } = await params;
    const db = await getDB();

    const booking = await db
      .prepare('SELECT id, user_id FROM bookings WHERE id = ?')
      .bind(id)
      .first<{ id: string; user_id: string }>();
    if (!booking || (booking.user_id !== user.sub && user.role !== 'admin')) {
      return NextResponse.json({ error: 'ไม่พบการจองนี้' }, { status: 404 });
    }

    const live = await db
      .prepare(
        `SELECT * FROM ticket_transfers
          WHERE booking_id = ? AND status = 'pending'
          ORDER BY created_at DESC LIMIT 1`,
      )
      .bind(id)
      .first<TicketTransfer>();
    if (!live) return NextResponse.json({ url: null });

    const env = await getEnv();
    const site = env.SITE_URL || 'http://localhost:3000';
    return NextResponse.json({
      url: claimUrl(site, live.token),
      kind: live.kind,
      recipient: live.to_name,
    });
  } catch (error) {
    const err = error as Error;
    if (err.message === 'Unauthorized') {
      return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });
    }
    console.error('Read transfer error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 });
  }
}
