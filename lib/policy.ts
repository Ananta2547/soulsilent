/**
 * The site's published policy values, in one place so the terms page, the
 * privacy page, the help page and the booking notes never disagree.
 */

/** Who runs the service, as named in the terms and the privacy notice. Not a
 *  registered company yet: run by its owner under the AllSoulLearn name. */
export const PROVIDER = {
  name: 'AllSoulLearn ดำเนินการโดย นาย ปัณณ์ เล้าวัชระ',
  email: 'allsoullearn@gmail.com',
  phone: '093-398-4488',
  /** Contact for personal-data requests (PDPA). */
  privacyEmail: 'allsoullearn@gmail.com',
};

/** Date the current terms and privacy notice took effect (Thai display). */
export const POLICY_UPDATED = '27 ตุลาคม 2569';

/** A seat waits this long for payment before it is released. Type-only DB
 *  import in lib/holds, so this is safe in client components. */
export { HOLD_MINUTES } from './holds';

/** Shortest password accepted for a new or changed password. Existing
 *  shorter passwords still sign in. */
export const MIN_PASSWORD = 8;

/** Refunds: a participant who cancels gets nothing back (they may transfer
 *  the seat instead). Only when the host or we cancel or move a round is the
 *  money returned in full. */
export const REFUND = {
  /** Business days to transfer a refund once it is due. */
  payoutDays: 7,
};
