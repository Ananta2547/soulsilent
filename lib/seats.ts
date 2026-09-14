/** Seat arithmetic shared by every query that asks "how full is this round".
 *
 * A booking row holds a seat while it is paid, confirmed, or still inside its
 * hold window. How many seats it holds depends on what it is:
 *   - a member of a group (parent_booking_id set) → 0, the parent counts them
 *   - a private / whole-round booking            → every seat of the round
 *   - a group parent                             → group_size
 *   - anything else                              → 1
 * Cancelled rows never count, and a lapsed hold stops counting by itself, so
 * no sweep is needed for the numbers to be right.
 */

/** WHERE-fragment: the row currently holds its seat(s). `b` is the bookings alias. */
export function seatTakenSql(b = 'b'): string {
  return `${b}.status != 'cancelled' AND (
    ${b}.payment_status = 'paid' OR ${b}.status = 'confirmed'
    OR (${b}.payment_status = 'pending' AND ${b}.expires_at IS NOT NULL AND datetime(${b}.expires_at) > datetime('now'))
  )`;
}

/** SELECT-fragment: how many seats this one row holds. `cap` is an SQL
 *  expression for the round's capacity (a column or a bound `?`). */
export function seatsOfRowSql(b = 'b', cap = 'w.max_participants'): string {
  return `CASE
    WHEN ${b}.parent_booking_id IS NOT NULL THEN 0
    WHEN ${b}.booking_kind = 'private' THEN ${cap}
    ELSE COALESCE(${b}.group_size, 1)
  END`;
}

/** Subquery: seats held on workshop `w` (alias of the outer workshops row). */
export function seatsHeldSubquery(w = 'w', cap = `${w}.max_participants`): string {
  return `(SELECT COALESCE(SUM(${seatsOfRowSql('b', cap)}), 0) FROM bookings b
            WHERE b.workshop_id = ${w}.id AND ${seatTakenSql('b')})`;
}
