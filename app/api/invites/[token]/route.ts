import { NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { partyFromBooking } from '@/lib/transfers';
import { loadInvite } from '@/lib/invites';
import { hasWorkshopStarted } from '@/lib/workshop-utils';
import type { Workshop } from '@/lib/types';

/**
 * GET /api/invites/{token} — what a friend sees before joining a group: the
 * workshop, who booked, and whether a seat is still free for them.
 *
 * Open to signed-out visitors on purpose — the friend has to see what they
 * are being offered before being asked to create an account. The token is
 * the only secret, and nothing here names anyone but the booker.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const db = await getDB();

  const parent = await loadInvite(db, token);
  if (!parent) return NextResponse.json({ error: 'ลิงก์นี้ไม่ถูกต้องหรือถูกยกเลิกแล้ว' }, { status: 404 });

  const workshop = await db
    .prepare('SELECT * FROM workshops WHERE id = ?')
    .bind(parent.workshop_id)
    .first<Workshop>();
  if (!workshop) return NextResponse.json({ error: 'ไม่พบกิจกรรม' }, { status: 404 });

  const booker = await db
    .prepare('SELECT name, phone FROM users WHERE id = ?')
    .bind(parent.user_id)
    .first<{ name: string | null; phone: string | null }>();
  const from = partyFromBooking(parent.application_json, booker || {});

  // The group is paid for as a whole; until then there is nothing to join.
  const secured =
    parent.status !== 'cancelled' && (parent.payment_status === 'paid' || parent.status === 'confirmed');
  // Seats for friends = the group minus the booker's own.
  const slots = Math.max(0, (parent.group_size || 1) - 1);
  const left = Math.max(0, slots - parent.claimed);

  const user = await getCurrentUser();
  let isMember = false;
  if (user) {
    const own = await db
      .prepare(`SELECT id FROM bookings WHERE workshop_id = ? AND user_id = ? AND status != 'cancelled' LIMIT 1`)
      .bind(parent.workshop_id, user.sub)
      .first<{ id: string }>();
    isMember = !!own;
  }

  const claimable = secured && left > 0 && workshop.status === 'active' && !hasWorkshopStarted(workshop);

  return NextResponse.json({
    invite: {
      from_name: from.name,
      tier_label: parent.booking_tier_label,
      slots,
      claimed: parent.claimed,
      left,
      status: parent.status === 'cancelled' ? 'cancelled' : left <= 0 ? 'full' : 'open',
    },
    // `online_url` belongs to whoever holds a seat, and the friend does not
    // hold one yet — it reaches them from the workshop page once they join.
    workshop: { ...workshop, online_url: null },
    claimable,
    unpaid: !secured,
    isBooker: !!user && user.sub === parent.user_id,
    isMember,
    signedIn: !!user,
  });
}
