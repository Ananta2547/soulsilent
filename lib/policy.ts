/**
 * The site's published policy values, in one place so the terms page, the
 * privacy page, the help page and the booking notes never disagree.
 *
 * DRAFT: the refund tiers and the provider details are a standard draft the
 * owner still has to confirm. Anything in [brackets] must be replaced before
 * production.
 */

/** Who runs the service, as named in the terms and the privacy notice. */
export const PROVIDER = {
  name: '[ชื่อผู้ให้บริการ / นิติบุคคล]',
  address: '[ที่อยู่สำหรับติดต่อ]',
  email: '[อีเมลติดต่อ เช่น hello@allsoullearn.com]',
  /** Contact for personal-data requests (PDPA). */
  privacyEmail: '[อีเมลสำหรับเรื่องข้อมูลส่วนบุคคล]',
};

/** Date the current terms and privacy notice took effect (Thai display). */
export const POLICY_UPDATED = '20 ตุลาคม 2569';

/** A seat waits this long for payment before it is released. Type-only DB
 *  import in lib/holds, so this is safe in client components. */
export { HOLD_MINUTES } from './holds';

/** Shortest password accepted for a new or changed password. Existing
 *  shorter passwords still sign in. */
export const MIN_PASSWORD = 8;

/** Refund tiers when a participant cancels a paid booking themselves. */
export const REFUND = {
  /** Cancel at least this many days before the first day: full refund
   *  (less the payment fee). */
  fullDays: 7,
  /** Cancel at least this many days before: `partialPercent` back. */
  partialDays: 3,
  partialPercent: 50,
  /** Business days to transfer the refund once approved. */
  payoutDays: 7,
};
