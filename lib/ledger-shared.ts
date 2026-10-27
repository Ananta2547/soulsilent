/* Types and labels of the money ledger that client components can import
 * without pulling in the server side (lib/ledger.ts re-exports them). */

export type Direction = 'in' | 'out';
export type TxKind = 'booking_payment' | 'refund' | 'host_payout' | 'host_return' | 'expense' | 'payroll';
export type TxMethod = 'beam' | 'bank_transfer' | 'promptpay' | 'cash' | 'bank_api' | 'other';
export type RefSource = 'beam' | 'bank_slip' | 'bank_api' | 'manual' | 'legacy';

export type MoneyTx = {
  id: string;
  doc_no: string;
  direction: Direction;
  kind: TxKind;
  status: 'done' | 'void';
  gross: number;
  withholding: number;
  net: number;
  method: TxMethod;
  ref_id: string | null;
  ref_source: RefSource | null;
  no_ref_reason: string | null;
  occurred_at: string;
  payee_name: string | null;
  payee_bank: string | null;
  payee_account: string | null;
  payee_email: string | null;
  user_id: string | null;
  booking_id: string | null;
  workshop_id: string | null;
  host_id: string | null;
  category_id: string | null;
  description: string | null;
  slip_url: string | null;
  slip_meta: string | null;
  legacy: number;
  voucher_token: string;
  emailed_at: string | null;
  created_by: string | null;
  created_at: string;
  voided_by: string | null;
  voided_at: string | null;
  void_reason: string | null;
};

export const KIND_LABEL: Record<TxKind, string> = {
  booking_payment: 'รับชำระค่ากิจกรรม',
  refund: 'คืนเงินผู้จอง',
  host_payout: 'จ่ายรายได้ผู้จัด',
  host_return: 'ผู้จัดคืนเงิน',
  expense: 'ค่าใช้จ่ายธุรกิจ',
  payroll: 'เงินเดือน',
};
export const DIRECTION_OF: Record<TxKind, Direction> = {
  booking_payment: 'in',
  refund: 'out',
  host_payout: 'out',
  // A host paying back what was overpaid (a refund after their payout).
  host_return: 'in',
  expense: 'out',
  payroll: 'out',
};
export const METHOD_LABEL: Record<TxMethod, string> = {
  beam: 'Beam',
  bank_transfer: 'โอนผ่านธนาคาร',
  promptpay: 'PromptPay',
  cash: 'เงินสด',
  bank_api: 'API ธนาคาร',
  other: 'อื่น ๆ',
};
/** Methods whose transfer always leaves a reference to record. */
export const NEEDS_REF: TxMethod[] = ['bank_transfer', 'promptpay', 'bank_api', 'beam'];
/** Kinds admin enters by hand (Beam rows are written by the system). */
export const MANUAL_KINDS: TxKind[] = ['refund', 'host_payout', 'host_return', 'expense'];
