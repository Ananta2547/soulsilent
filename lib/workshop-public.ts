/**
 * What a workshop row may show to someone who is not an admin.
 *
 * The workshops table also holds the organizer's payout (slip, deduction,
 * remark), the event photo folder, the co-host access list and the meeting
 * link. Public reads (GET /api/workshops, GET /api/workshops/[id]) go through
 * here so none of that reaches a browser. Admin reads keep the full row.
 */

/** Columns never sent to a non-admin. Any `payout_*` column is dropped too,
 *  so a new payout field is private without touching this list. */
const PRIVATE_KEYS = new Set([
  'photos_drive_url',
  'dashboard_access_json',
  'online_url',
  'created_by',
]);

/** Statuses a non-admin may list: drafts are unpublished and cancelled rounds
 *  were withdrawn. */
export const PUBLIC_STATUSES = ['active', 'closed', 'completed'] as const;

export function publicWorkshop<T extends object>(row: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (PRIVATE_KEYS.has(k) || k.startsWith('payout_')) continue;
    out[k] = v;
  }
  return out as T;
}
