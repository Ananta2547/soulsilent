import { redirect } from 'next/navigation';

/** ตรวจเงินเข้า moved into บัญชีการเงิน (the refund queue and the payments
 *  that matched no booking sit at the top of the ledger). Old links land there. */
export default function AdminPaymentsPage() {
  redirect('/admin/ledger');
}
