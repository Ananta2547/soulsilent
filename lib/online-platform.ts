/** Meeting platforms an ONLINE workshop can run on.
 *
 * Stored in `workshops.online_platform`. 'other' additionally uses
 * `workshops.online_platform_other` for the admin-typed name.
 */

export type OnlinePlatform = 'zoom' | 'meet' | 'teams' | 'other';

export interface PlatformStyle {
  value: OnlinePlatform;
  label: string;
  /** Button background + text, picked to match each brand. */
  bg: string;
  fg: string;
  /** Border only matters for the light Google Meet button. */
  border?: string;
}

export const ONLINE_PLATFORMS: PlatformStyle[] = [
  { value: 'zoom', label: 'Zoom', bg: '#0B5CFF', fg: '#ffffff' },
  { value: 'meet', label: 'Google Meet', bg: '#ffffff', fg: '#1f7a45', border: '#dadce0' },
  { value: 'teams', label: 'Microsoft Teams', bg: '#5059C9', fg: '#ffffff' },
  // No brand mark — the button falls back to the site's own colour and shows
  // whatever name the admin typed.
  { value: 'other', label: 'อื่นๆ', bg: 'var(--teal)', fg: '#ffffff' },
];

/** Normalise the online fields coming from the admin form before storing.
 *  An offline workshop clears all three extras, and a non-'other' platform
 *  clears the free-text name, so stale values can never resurface. */
export function normalizeOnlineFields(body: {
  is_online?: boolean | number;
  online_platform?: string | null;
  online_platform_other?: string | null;
  online_url?: string | null;
}): { is_online: number; platform: string | null; platform_other: string | null; url: string | null } {
  const isOnline = body.is_online ? 1 : 0;
  if (!isOnline) return { is_online: 0, platform: null, platform_other: null, url: null };
  const platform = ONLINE_PLATFORMS.find((p) => p.value === body.online_platform)?.value || null;
  return {
    is_online: 1,
    platform,
    platform_other: platform === 'other' ? (body.online_platform_other || '').trim() || null : null,
    url: (body.online_url || '').trim() || null,
  };
}

export function platformStyle(p: string | null | undefined): PlatformStyle {
  return ONLINE_PLATFORMS.find((x) => x.value === p) || ONLINE_PLATFORMS[3];
}

/** What the join button should read, e.g. "เข้าร่วมทาง Zoom".
 *  For 'other' the admin-typed name is used; blank falls back to a neutral
 *  label so the button never renders as "เข้าร่วมทาง". */
export function platformLabel(
  platform: string | null | undefined,
  other: string | null | undefined,
): string {
  if (platform === 'other') return (other || '').trim() || 'ห้องเรียนออนไลน์';
  return platformStyle(platform).label;
}
