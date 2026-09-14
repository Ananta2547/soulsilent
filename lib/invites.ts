/** The group booking an invite link points at (migration 056), with how many
 *  of its seats are already taken up by members. */
export type InviteParent = {
  id: string;
  user_id: string;
  workshop_id: string;
  status: string;
  payment_status: string;
  group_size: number | null;
  application_json: string | null;
  booking_tier_label: string | null;
  claimed: number;
};

export async function loadInvite(db: D1Database, token: string): Promise<InviteParent | null> {
  return db
    .prepare(
      `SELECT b.id, b.user_id, b.workshop_id, b.status, b.payment_status, b.group_size,
              b.application_json, b.booking_tier_label,
              (SELECT COUNT(*) FROM bookings m WHERE m.parent_booking_id = b.id AND m.status != 'cancelled') AS claimed
         FROM bookings b
        WHERE b.invite_token = ? AND b.parent_booking_id IS NULL`,
    )
    .bind(token)
    .first<InviteParent>();
}
