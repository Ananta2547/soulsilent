import { NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import type { TicketTransfer } from '@/lib/transfers';
import { hasWorkshopStarted } from '@/lib/workshop-utils';
import type { Workshop } from '@/lib/types';

/**
 * GET /api/transfers/{token} — what the receiver needs to decide whether to
 * take the seat: which workshop it is, who is handing it over, and whether the
 * link is still live.
 *
 * Open to signed-out visitors on purpose — the receiver has to see what they
 * are being offered before being asked to create an account. The token is the
 * only secret, and nothing here identifies anyone but the sender by name.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const db = await getDB();

  const tr = await db
    .prepare('SELECT * FROM ticket_transfers WHERE token = ?')
    .bind(token)
    .first<TicketTransfer>();
  if (!tr) return NextResponse.json({ error: 'ลิงก์นี้ไม่ถูกต้องหรือถูกยกเลิกแล้ว' }, { status: 404 });

  const workshop = await db
    .prepare('SELECT * FROM workshops WHERE id = ?')
    .bind(tr.workshop_id)
    .first<Workshop>();
  if (!workshop) return NextResponse.json({ error: 'ไม่พบกิจกรรม' }, { status: 404 });

  const booking = await db
    .prepare('SELECT status, payment_status, user_id FROM bookings WHERE id = ?')
    .bind(tr.booking_id)
    .first<{ status: string; payment_status: string; user_id: string }>();
  // A gift nobody paid for is not a seat yet — the buyer abandoned the QR, or
  // the hold lapsed and the seat went back on sale.
  const secured =
    !!booking &&
    booking.status !== 'cancelled' &&
    (booking.payment_status === 'paid' || booking.status === 'confirmed');

  const user = await getCurrentUser();
  const claimable =
    tr.status === 'pending' && secured && workshop.status === 'active' && !hasWorkshopStarted(workshop);

  return NextResponse.json({
    transfer: {
      kind: tr.kind,
      status: tr.status,
      from_name: tr.from_name,
      to_name: tr.to_name,
      claimed_at: tr.claimed_at,
    },
    // `online_url` belongs to whoever holds the seat, and the receiver does not
    // hold it yet — it reaches them from the workshop page once they claim.
    workshop: { ...workshop, online_url: null },
    claimable,
    unpaid: !secured,
    isSender: !!user && user.sub === tr.from_user_id,
    signedIn: !!user,
  });
}
