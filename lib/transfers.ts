/**
 * Gift + transfer of a seat. Server-side helpers shared by the routes that mint
 * a handover link and the one that claims it.
 *
 * A "handover" is one row in `ticket_transfers`. Two kinds start it:
 *   gift     — someone pays for a seat they never intend to use
 *   transfer — a ticket holder passes on the seat they already own
 * Both end the same way: the receiver opens the link, fills the application
 * form, and the booking's user_id becomes theirs.
 */

export type TransferKind = 'gift' | 'transfer';
export type TransferStatus = 'pending' | 'claimed' | 'cancelled';

export type TicketTransfer = {
  id: string;
  booking_id: string;
  workshop_id: string;
  kind: TransferKind;
  token: string;
  status: TransferStatus;
  from_user_id: string | null;
  from_name: string | null;
  from_phone: string | null;
  to_user_id: string | null;
  to_name: string | null;
  to_phone: string | null;
  created_at: string;
  claimed_at: string | null;
};

/** URL-safe random token. 32 hex chars — unguessable, and it is the only key
 *  the receiver has, so it must not be derived from the booking id. */
export function newTransferToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** The link handed to the receiver. */
export function claimUrl(siteUrl: string, token: string): string {
  return `${siteUrl.replace(/\/$/, '')}/claim/${token}`;
}

type NamedProfile = { fullName?: string; firstName?: string; lastName?: string; phone?: string };

/** Name + phone of whoever a booking currently belongs to.
 *
 *  The application snapshot is preferred: it is what the person wrote for THIS
 *  workshop. A gift booking has no application (the buyer never filled one), so
 *  the account's own name and phone stand in. */
export function partyFromBooking(
  applicationJson: string | null | undefined,
  account: { name?: string | null; phone?: string | null; vault_json?: string | null },
): { name: string | null; phone: string | null } {
  let name: string | null = null;
  let phone: string | null = null;
  try {
    const p = (JSON.parse(applicationJson || 'null') as { profile?: NamedProfile } | null)?.profile;
    const full = (p?.fullName || '').trim() || [p?.firstName, p?.lastName].filter(Boolean).join(' ').trim();
    if (full) name = full;
    if ((p?.phone || '').trim()) phone = (p as NamedProfile).phone!.trim();
  } catch {
    /* fall through to the account */
  }
  if (!name || !phone) {
    let vault: NamedProfile = {};
    try {
      vault = (JSON.parse(account.vault_json || 'null') as NamedProfile) || {};
    } catch {
      vault = {};
    }
    const vaultName = [vault.firstName, vault.lastName].filter(Boolean).join(' ').trim();
    if (!name) name = vaultName || (account.name || '').trim() || null;
    if (!phone) phone = (vault.phone || '').trim() || (account.phone || '').trim() || null;
  }
  return { name, phone };
}

/** Whole years from a YYYY-MM-DD birthdate, or null. Mirrors the booking API. */
export function ageFromDob(dob: string | null | undefined): number | null {
  if (!dob) return null;
  const d = new Date(dob.length === 10 ? `${dob}T00:00:00` : dob);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let a = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) a--;
  return a >= 0 ? a : null;
}
