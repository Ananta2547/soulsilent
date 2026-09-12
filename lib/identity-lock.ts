/** Identity in the autofill vault can change once every 30 days.
 *
 * Shared by the vault API (which enforces it) and the settings panel (which
 * greys the form out ahead of time). The first fill — onboarding, when the
 * vault holds no identity yet — is free and does not start the clock; the next
 * save is allowed straight away and is the one that starts it.
 */

import { sqliteToMs } from '@/lib/datetime';

export const IDENTITY_LOCK_DAYS = 30;
export const IDENTITY_LOCK_MS = IDENTITY_LOCK_DAYS * 24 * 60 * 60 * 1000;

/** Every vault key that belongs to the identity section. Mirrors the settings
 *  panel's SECTION_FIELDS.identity — keep the two in step. */
export const IDENTITY_FIELDS = [
  'prefix',
  'firstName',
  'lastName',
  'nickname',
  'dob',
  'gender',
  'genderOther',
  'phone',
  'lineId',
  'facebook',
] as const;

type Vault = Record<string, unknown> | null | undefined;

const str = (v: unknown) => String(v ?? '').trim();

/** True when any identity field differs between the two vaults. */
export function identityChanged(before: Vault, after: Vault): boolean {
  return IDENTITY_FIELDS.some((k) => str(before?.[k]) !== str(after?.[k]));
}

/** True when the vault already carries a name — i.e. onboarding is behind us. */
export function hasIdentity(vault: Vault): boolean {
  return str(vault?.firstName).length > 0 || str(vault?.lastName).length > 0;
}

/** When the lock lifts, in epoch ms — or null when there is no lock in force. */
export function identityLockedUntil(lockedAt: string | null | undefined, now = Date.now()): number | null {
  if (!lockedAt) return null;
  const until = sqliteToMs(lockedAt) + IDENTITY_LOCK_MS;
  return Number.isFinite(until) && until > now ? until : null;
}
