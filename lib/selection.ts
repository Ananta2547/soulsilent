/**
 * Round-based selection settlement (lazy, on-read).
 *
 * Type A workshops announce results, then collect confirmations in fixed
 * ROUNDS with absolute deadlines (no per-user rolling timer):
 *
 *   announce_at         → results unmask (Phase 2)
 *   confirm_main_by     → round 1: original "approved" must confirm by this date
 *   confirm_waitlist_by → round 2: promoted waitlist must confirm by this date
 *
 * At each deadline we (a) reject un-confirmed approved seats and (b) promote
 * the next waitlisted applicants into the freed slots. Promoted rows keep their
 * non-null waitlist_rank, which is how we tell a round-2 seat (deadline =
 * confirm_waitlist_by) from a round-1 seat (deadline = confirm_main_by).
 *
 * This runs whenever selection data is read (user / admin / teacher), so no
 * background cron is required. All operations are idempotent.
 */
import type { Workshop } from './types';

// Pure status helpers live in a client-safe module; re-export for existing
// server-side consumers that import them from here.
export { visibleAppStatus, confirmDeadlineFor } from './selection-status';

/** Minimal workshop shape the settler needs. */
export type SettleWorkshop = Pick<
  Workshop,
  'id' | 'admission_type' | 'announce_at' | 'confirm_main_by' | 'confirm_waitlist_by' | 'max_participants'
>;

type Db = Awaited<ReturnType<typeof import('./db').getDB>>;

function ts(v: string | null | undefined): number | null {
  if (!v) return null;
  const t = new Date(v).getTime();
  return Number.isNaN(t) ? null : t;
}

export async function settleSelection(db: Db, w: SettleWorkshop): Promise<void> {
  if (w.admission_type !== 'selection') return;
  const now = Date.now();
  const announce = ts(w.announce_at);
  // Before the announcement, statuses are still admin-mutable — no auto actions.
  if (announce == null || now < announce) return;

  const mainBy = ts(w.confirm_main_by);
  const waitBy = ts(w.confirm_waitlist_by);

  // ---- Round 1: main confirmation deadline ----
  if (mainBy != null && now >= mainBy) {
    // Reject un-confirmed ORIGINAL approved seats (waitlist_rank IS NULL).
    await db
      .prepare(
        `UPDATE bookings SET app_status='rejected', status='cancelled',
           cancel_reason=COALESCE(cancel_reason,'seat_full')
         WHERE workshop_id=? AND app_status='approved' AND waitlist_rank IS NULL AND confirmed_at IS NULL`
      )
      .bind(w.id)
      .run();

    // Promote waitlisted applicants into the freed slots (by queue rank).
    const filled = await db
      .prepare(
        `SELECT COUNT(*) as c FROM bookings WHERE workshop_id=? AND app_status='approved' AND status!='cancelled'`
      )
      .bind(w.id)
      .first<{ c: number }>();
    const slots = (w.max_participants || 0) - (filled?.c || 0);
    if (slots > 0) {
      const promote = await db
        .prepare(
          `SELECT id FROM bookings WHERE workshop_id=? AND app_status='waitlisted' AND status!='cancelled'
           ORDER BY waitlist_rank ASC LIMIT ?`
        )
        .bind(w.id, slots)
        .all<{ id: string }>();
      for (const row of promote.results || []) {
        // Keep waitlist_rank (non-null) → marks this as a round-2 seat.
        await db
          .prepare(`UPDATE bookings SET app_status='approved', status='pending' WHERE id=?`)
          .bind(row.id)
          .run();
      }
    }
  }

  // ---- Round 2: waitlist confirmation deadline ----
  if (waitBy != null && now >= waitBy) {
    await db
      .prepare(
        `UPDATE bookings SET app_status='rejected', status='cancelled',
           cancel_reason=COALESCE(cancel_reason,'seat_full')
         WHERE workshop_id=? AND app_status='approved' AND waitlist_rank IS NOT NULL AND confirmed_at IS NULL`
      )
      .bind(w.id)
      .run();
  }
}
