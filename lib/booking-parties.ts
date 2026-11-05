/**
 * The paid parties holding seats in one workshop (a seat, a group with its
 * members folded in, or a whole-round booking) — what a host chooses to move
 * or refund when a round is cancelled or a single activity is postponed.
 */
import { applicantName } from '@/lib/applicant';
import { seatsOfRowSql } from '@/lib/seats';
import type { getDB } from '@/lib/db';

export type Party = {
  id: string;
  user_id: string | null;
  name: string;
  email: string | null;
  seats: number;
  kind: 'seat' | 'group' | 'private';
  amount: number;
  members: string[];
};

/** Paid parties of the workshop, members folded into their group. */
export async function partiesOf(db: Awaited<ReturnType<typeof getDB>>, roundId: string): Promise<Party[]> {
  const rows =
    (
      await db
        .prepare(
          `SELECT b.id, b.user_id, b.parent_booking_id, b.booking_kind, b.amount, b.application_json,
                  ${seatsOfRowSql('b', 'w.max_participants')} AS seats,
                  COALESCE(NULLIF(TRIM(u.nickname), ''), u.name) AS user_name, u.email AS user_email
             FROM bookings b JOIN workshops w ON w.id = b.workshop_id LEFT JOIN users u ON u.id = b.user_id
            WHERE b.workshop_id = ? AND b.status != 'cancelled' AND (b.payment_status = 'paid' OR b.status = 'confirmed')
            ORDER BY b.created_at ASC`,
        )
        .bind(roundId)
        .all<{
          id: string;
          user_id: string | null;
          parent_booking_id: string | null;
          booking_kind: string | null;
          amount: number;
          application_json: string | null;
          seats: number;
          user_name: string | null;
          user_email: string | null;
        }>()
    ).results || [];
  const parties: Party[] = rows
    .filter((r) => !r.parent_booking_id)
    .map((r) => ({
      id: r.id,
      user_id: r.user_id,
      name: applicantName(r.application_json, r.user_name),
      email: r.user_email,
      seats: Number(r.seats) || 1,
      kind: r.booking_kind === 'private' ? 'private' : (Number(r.seats) || 1) > 1 ? 'group' : 'seat',
      amount: Number(r.amount) || 0,
      members: [],
    }));
  for (const m of rows.filter((r) => r.parent_booking_id)) {
    const p = parties.find((x) => x.id === m.parent_booking_id);
    if (p) p.members.push(applicantName(m.application_json, m.user_name));
  }
  return parties;
}
