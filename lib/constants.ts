/**
 * The primary owner / super-admin account. This account is protected: its role
 * cannot be changed away from `admin`, and it cannot be suspended or deleted.
 * Kept as a plain constant so both client and server code can import it.
 */
export const OWNER_EMAIL = 'soulsilent.official@gmail.com';

export function isOwnerEmail(email: string | null | undefined): boolean {
  return !!email && email.toLowerCase() === OWNER_EMAIL;
}
