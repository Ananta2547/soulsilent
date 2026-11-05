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

/** Text / picture fields a host changes straight away on a live activity;
 *  admin is told which ones on LINE. Anything not listed reads "ข้อมูลอื่น". */
export const FIELD_LABEL: Record<string, string> = {
  title: 'ชื่อกิจกรรม',
  description: 'รายละเอียด',
  short_description: 'คำโปรย',
  image_url: 'รูปกิจกรรม',
  cover_image_url: 'รูปปก',
  location_id: 'สถานที่',
  location_ids: 'สถานที่',
  is_online: 'ออนไลน์/ออนไซต์',
  online_platform: 'แพลตฟอร์มออนไลน์',
  online_url: 'ลิงก์ห้องประชุม',
  schedule: 'กำหนดการ',
  learn_items: 'สิ่งที่จะได้',
  target_items: 'เหมาะกับใคร',
  target: 'เหมาะกับใคร',
  takeaways: 'สิ่งที่จะได้',
  category: 'หมวดหมู่',
  tags: 'แท็ก',
  map_url: 'ลิงก์แผนที่',
  theme_color: 'สีธีม',
  max_participants: 'จำนวนที่นั่ง',
  default_max_participants: 'จำนวนที่นั่ง',
  min_age: 'อายุ',
  max_age: 'อายุ',
  age_min: 'อายุ',
  age_max: 'อายุ',
  admission_type: 'วิธีรับสมัคร',
  announce_at: 'วันประกาศผล',
  close_at: 'ปิดรับสมัคร',
  close_days_before: 'ปิดรับจอง',
  close_time: 'ปิดรับจอง',
  require_consent: 'ข้อตกลง',
};
