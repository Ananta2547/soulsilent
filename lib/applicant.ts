/** The `profile` block of a submitted application, as far as naming needs it. */
type NamedProfile = {
  fullName?: string;
  firstName?: string;
  lastName?: string;
};

/**
 * The name to head a participant with: the one they typed on their application
 * ("ชื่อจริง นามสกุล"), not the display name their account happens to carry —
 * that is often a handle, an initial or a school username ("Miracle21"), none
 * of which help staff calling a room to order or checking someone in.
 *
 * Falls back to the account name only when the application carries no name or
 * cannot be parsed, so a row never renders blank.
 *
 * Shared by the admin and teacher check-in screens: both show the same people
 * and have to call them the same thing.
 */
export function applicantName(json: string | null | undefined, fallback: string | null): string {
  try {
    const p = (JSON.parse(json || 'null') as { profile?: NamedProfile } | null)?.profile;
    const full =
      (p?.fullName || '').trim() || [p?.firstName, p?.lastName].filter(Boolean).join(' ').trim();
    if (full) return full;
  } catch {
    // Unparseable application — fall through to the account name.
  }
  return fallback || '—';
}
