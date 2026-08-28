/**
 * 10-minute payment hold expiry (lazy, on-read).
 *
 * A pending booking holds its seat until `expires_at`. If the user hasn't paid
 * by then, the application is auto-cancelled and the seat is released. This runs
 * whenever bookings are read (no cron), so expired holds are cancelled before
 * anyone sees them. Idempotent.
 *
 * Note: selection applications awaiting the announcement have `expires_at = NULL`
 * and are never touched here — their timing is governed by the round deadlines
 * in `lib/selection.ts`.
 */
type Db = Awaited<ReturnType<typeof import('./db').getDB>>;

/**
 * How long a pending booking holds its seat, and the life of the payment QR —
 * the two are always set to the same value so the QR dies exactly when the seat
 * is released.
 *
 * Declared here as the single source of truth: it used to be copied into each
 * route, which is how the modal ended up telling Thai users "10 นาที" while the
 * English string beside it said "1 hour".
 *
 * It was 60 only because the old gateway refused a checkout shorter than 30
 * minutes. Beam has no such floor, so this is a free product decision now.
 * Changing it also means changing the copy that names the duration
 * (BookingModal, the workshop detail perks list).
 */
export const HOLD_MINUTES = 10;

export async function expireStaleHolds(db: Db): Promise<void> {
  await db
    .prepare(
      `UPDATE bookings SET status = 'cancelled',
         payment_status = 'expired',
         cancel_reason = COALESCE(cancel_reason, 'payment_failed')
       WHERE status != 'cancelled'
         AND payment_status = 'pending'
         AND expires_at IS NOT NULL
         AND datetime(expires_at) <= datetime('now')`
    )
    .run();
}
