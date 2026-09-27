/**
 * Free-seat invitations (บัตรเชิญที่นั่งฟรี) — who covers the seat, and how
 * much of it reaches the host's revenue. See migrations/061_comp_invites.sql.
 */

export type CompKind = 'teacher' | 'asl' | 'special';

export const COMP_KINDS: { key: CompKind; label: string; hint: string }[] = [
  { key: 'teacher', label: 'ที่นั่งฟรีจาก Teacher', hint: 'ไม่รวมค่าสมัครในรายได้ Host — รายได้จากที่นั่งนี้เป็น ฿0' },
  { key: 'asl', label: 'ที่นั่งฟรีจาก ASL (admin)', hint: 'ASL จ่ายให้ Host เต็มราคาบัตรที่แสดงอยู่ตอนออกบัตร — รวมในรายได้ก่อนหักค่าธรรมเนียม' },
  { key: 'special', label: 'ที่นั่งฟรีเงื่อนไขพิเศษ', hint: 'ASL จ่ายให้ Host ตามราคาพิเศษที่กรอก — รวมในรายได้ก่อนหักค่าธรรมเนียม' },
];

export const COMP_LABEL: Record<CompKind, string> = Object.fromEntries(COMP_KINDS.map((k) => [k.key, k.label])) as Record<CompKind, string>;

export function isCompKind(v: unknown): v is CompKind {
  return v === 'teacher' || v === 'asl' || v === 'special';
}

/** Largest special price accepted, in baht — a typo guard, not a business rule. */
export const MAX_SPECIAL_PRICE = 1_000_000;

/** What a collected booking adds to the host's gross: what the participant
 *  paid plus whatever AllSoulLearn covers for an invitation seat. */
export function hostGrossOf(b: { amount?: number | null; host_credit?: number | null }): number {
  return (Number(b.amount) || 0) + (Number(b.host_credit) || 0);
}

/** Same as hostGrossOf, as SQL over a bookings alias. */
export function hostGrossSql(b = 'b'): string {
  return `(${b}.amount + COALESCE(${b}.host_credit, 0))`;
}
