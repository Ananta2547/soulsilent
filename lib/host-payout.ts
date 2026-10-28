/**
 * Where admin pays each host and how to reach them (migrations 077 + 078),
 * shared by the "บัญชีผู้จัด" page, the payout form and their API. Admin only.
 */

export type HostPayoutInfo = {
  full_name: string | null;
  nickname: string | null;
  bank: string | null;
  account_no: string | null;
  account_name: string | null;
  promptpay: string | null;
  phone: string | null;
  facebook: string | null;
  line_id: string | null;
  instagram: string | null;
  note: string | null;
  updated_at: string | null;
  updated_by_name: string | null;
};

export const PAYOUT_FIELDS = ['full_name', 'nickname', 'bank', 'account_no', 'account_name', 'promptpay', 'phone', 'facebook', 'line_id', 'instagram', 'note'] as const;
export type PayoutField = (typeof PAYOUT_FIELDS)[number];

/** What the host wrote in their own profile, used where admin left a field empty. */
export type ProfileDefaults = Partial<Record<'full_name' | 'nickname' | 'phone' | 'line_id', string | null>>;

/** Thai and English titles that do not count when names are compared. */
const TITLES = /^(นาย|นางสาว|นาง|น\.ส\.|ด\.ช\.|ด\.ญ\.|mr\.?|mrs\.?|ms\.?|miss)\s*/i;
const norm = (s: string) => s.trim().toLowerCase().replace(TITLES, '').replace(/[\s.]+/g, '');

/** The account holder's name is not the host's own name (titles and spaces
 *  aside). False when either is missing — nothing to compare yet. */
export function accountNameMismatch(fullName: string | null | undefined, accountName: string | null | undefined): boolean {
  if (!fullName?.trim() || !accountName?.trim()) return false;
  const a = norm(fullName);
  const b = norm(accountName);
  return !(a === b || a.includes(b) || b.includes(a));
}
