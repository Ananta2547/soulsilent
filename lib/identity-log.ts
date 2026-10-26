/**
 * The log of a member's own changes to their full name and date of birth
 * (migration 075), behind Admin Insights' "changed identity more than 3 times
 * in 12 months" alert. Best-effort: a failed log must never fail the save.
 */

export type IdentitySnap = { name: string | null; dob: string | null };

const clean = (v: string | null | undefined) => (v ?? '').replace(/\s+/g, ' ').trim();

/** Log the fields that changed between two snapshots. Filling an empty field
 *  is not a change (onboarding), and neither is clearing one to empty. */
export async function logIdentityChanges(db: D1Database, userId: string, source: 'profile' | 'vault', before: IdentitySnap, after: IdentitySnap): Promise<void> {
  const rows: [string, string, string][] = [];
  for (const field of ['name', 'dob'] as const) {
    const a = clean(before[field]);
    const b = clean(after[field]);
    if (a && b && a !== b) rows.push([field, a, b]);
  }
  if (!rows.length) return;
  try {
    await db.batch(
      rows.map(([field, a, b]) =>
        db.prepare('INSERT INTO identity_changes (id, user_id, field, old_value, new_value, source) VALUES (?, ?, ?, ?, ?, ?)').bind(crypto.randomUUID(), userId, field, a, b, source),
      ),
    );
  } catch (e) {
    console.error('[identity-log]', e);
  }
}

/** The vault's identity as a snapshot: first + last name, date of birth. */
export function vaultIdentity(v: Record<string, unknown> | null | undefined): IdentitySnap {
  const s = (k: string) => String(v?.[k] ?? '').trim();
  return { name: [s('firstName'), s('lastName')].filter(Boolean).join(' ') || null, dob: s('dob') || null };
}
