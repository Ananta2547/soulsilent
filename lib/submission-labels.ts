/** Words for host submissions (lib/submissions), safe to import in the browser. */

export type SubKind = 'single' | 'round';
export type ReviewStatus = 'draft' | 'pending' | 'changes_requested' | 'approved' | 'rejected';

export const REVIEW_LABEL: Record<ReviewStatus, string> = {
  draft: 'ร่าง',
  pending: 'รออนุมัติ',
  changes_requested: 'ขอให้แก้',
  approved: 'อนุมัติแล้ว',
  rejected: 'ไม่อนุมัติ',
};

/** The price / date fields whose change on a live activity waits for admin. */
export const GATED_LABEL: Record<string, string> = {
  price: 'ราคา',
  promo_price: 'ราคาโปร',
  promo_start: 'เริ่มโปร',
  promo_end: 'สิ้นสุดโปร',
  payment_type: 'รูปแบบการชำระ',
  deposit_amount: 'มัดจำ',
  workshop_type: 'รูปแบบวัน',
  date: 'วันที่',
  end_date: 'วันสิ้นสุด',
  dates: 'วันที่จัด',
  time_start: 'เวลาเริ่ม',
  time_end: 'เวลาจบ',
  day_times: 'เวลาแต่ละวัน',
  price_group: 'ราคา/คน',
  price_private: 'ราคาเหมารอบ',
  price_group_booking: 'ราคากลุ่ม',
  price_tiers: 'ราคาแบบต่าง ๆ',
};
