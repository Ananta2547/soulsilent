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
