/**
 * "ยืนยันข้อมูลเพื่อลงกิจกรรมเอง" (migration 081) — the form's fields and labels.
 * No server imports, so both the host / admin pages and the API use it.
 */
export type VerificationStatus = 'pending' | 'changes_requested' | 'approved' | 'rejected';

export const VERIFY_FIELDS = [
  'full_name',
  'nickname',
  'phone',
  'email',
  'line_id',
  'page_url',
  'facebook',
  'instagram',
  'bank',
  'account_no',
  'account_name',
  'promptpay',
  'about',
] as const;
export type VerifyField = (typeof VERIFY_FIELDS)[number];
export type VerifyData = Record<VerifyField, string>;

export const VERIFY_LABEL: Record<VerifyField, string> = {
  full_name: 'ชื่อ-นามสกุลจริง',
  nickname: 'ชื่อเล่น',
  phone: 'เบอร์โทร',
  email: 'อีเมล',
  line_id: 'LINE ID',
  page_url: 'ลิงก์เพจ / เว็บไซต์',
  facebook: 'Facebook',
  instagram: 'Instagram',
  bank: 'ธนาคาร',
  account_no: 'เลขบัญชี',
  account_name: 'ชื่อบัญชี',
  promptpay: 'พร้อมเพย์',
  about: 'แนะนำตัว / กิจกรรมที่เคยจัด',
};

/** Must be filled before the form can be sent. */
export const VERIFY_REQUIRED: VerifyField[] = ['full_name', 'nickname', 'phone', 'email', 'line_id', 'page_url', 'bank', 'account_no', 'account_name'];

export const VERIFY_STATUS_LABEL: Record<VerificationStatus, string> = {
  pending: 'รอทีมงานตรวจ',
  changes_requested: 'ขอให้แก้ข้อมูล',
  approved: 'ยืนยันแล้ว',
  rejected: 'ไม่ผ่าน',
};

export type VerificationRow = Partial<VerifyData> & {
  user_id: string;
  status: VerificationStatus;
  review_note: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
};

/** Trimmed copy of what was sent, each field capped; plus the first missing required field. */
export function cleanVerify(raw: unknown): { data: VerifyData; missing: VerifyField | null } {
  const src = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const data = {} as VerifyData;
  for (const k of VERIFY_FIELDS) data[k] = String(src[k] ?? '').trim().slice(0, k === 'about' ? 2000 : 300);
  return { data, missing: VERIFY_REQUIRED.find((k) => !data[k]) || null };
}
