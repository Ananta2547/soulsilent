/**
 * Pure selection-status helpers — safe to import from client components.
 * No DB / server dependencies (only a type import), unlike `lib/selection.ts`
 * which holds the DB-driven `settleSelection`.
 */
import type { Workshop } from './types';

function ts(v: string | null | undefined): number | null {
  if (!v) return null;
  const t = new Date(v).getTime();
  return Number.isNaN(t) ? null : t;
}

/** The absolute confirm-by date for an approved booking, by round. */
export function confirmDeadlineFor(
  w: Pick<Workshop, 'confirm_main_by' | 'confirm_waitlist_by'>,
  booking: { waitlist_rank: number | null }
): string | null {
  return booking.waitlist_rank != null ? w.confirm_waitlist_by : w.confirm_main_by;
}

/**
 * What the USER is allowed to see. Selection results stay masked as 'applied'
 * until the announcement date passes. Direct bookings are never masked.
 */
export function visibleAppStatus(
  w: Pick<Workshop, 'admission_type' | 'announce_at'>,
  rawStatus: string
): string {
  if (w.admission_type !== 'selection') return rawStatus;
  const announce = ts(w.announce_at);
  if (announce == null || Date.now() < announce) return 'applied';
  return rawStatus;
}
