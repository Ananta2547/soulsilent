import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getDB } from '@/lib/db';
import { ISSUER, KIND_LABEL, METHOD_LABEL, fmtBaht, type MoneyTx, type TxKind, type TxMethod } from '@/lib/ledger';
import { PrintButton } from './PrintButton';
import './voucher.css';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'ใบสำคัญ', robots: { index: false, follow: false } };

type Row = MoneyTx & { category_name: string | null; workshop_title: string | null; workshop_date: string | null };

const DIGIT = ['', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า'];
const PLACE = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน'];

/** Up to 999,999 in Thai words; millions recurse. */
function thaiNum(n: number): string {
  if (n === 0) return '';
  if (n >= 1_000_000) return thaiNum(Math.floor(n / 1_000_000)) + 'ล้าน' + thaiNum(n % 1_000_000);
  const s = String(n);
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const d = Number(s[i]);
    const pos = s.length - i - 1;
    if (d === 0) continue;
    if (pos === 0 && d === 1 && s.length > 1) out += 'เอ็ด';
    else if (pos === 1 && d === 2) out += 'ยี่';
    else if (pos === 1 && d === 1) out += '';
    else out += DIGIT[d];
    out += PLACE[pos];
  }
  return out;
}

/** "หนึ่งพันห้าร้อยบาทถ้วน" — the amount in words, as on a cheque. */
function bahtText(amount: number): string {
  const satang = Math.round(amount * 100);
  const baht = Math.floor(satang / 100);
  const st = satang % 100;
  const b = baht === 0 ? 'ศูนย์' : thaiNum(baht);
  return st ? `${b}บาท${thaiNum(st)}สตางค์` : `${b}บาทถ้วน`;
}

const MONTH = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const thaiWall = (s: string) => {
  const [d, t] = s.split('T');
  const [y, m, day] = d.split('-').map(Number);
  return `${day} ${MONTH[m - 1]} ${y + 543}${t ? ` · ${t} น.` : ''}`;
};
const money = (n: number) => n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** The voucher for one ledger row, reachable only by the unguessable link
 *  emailed to the payee (and from the admin ledger). Never listed anywhere. */
export default async function VoucherPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[0-9a-f]{32}$/.test(token)) notFound();
  const db = await getDB();
  const tx = await db
    .prepare(
      `SELECT t.*, c.name AS category_name, w.title AS workshop_title, w.date AS workshop_date
         FROM money_tx t
         LEFT JOIN expense_categories c ON c.id = t.category_id
         LEFT JOIN workshops w ON w.id = t.workshop_id
        WHERE t.voucher_token = ?`,
    )
    .bind(token)
    .first<Row>();
  if (!tx) notFound();

  const out = tx.direction === 'out';
  const what =
    tx.kind === 'expense'
      ? `${KIND_LABEL.expense}${tx.category_name ? ` · ${tx.category_name}` : ''}`
      : KIND_LABEL[tx.kind as TxKind];

  return (
    <main className="vc-page">
      <div className="vc-tools">
        <PrintButton />
      </div>
      <article className={`vc-sheet${tx.status === 'void' ? ' is-void' : ''}`}>
        {tx.status === 'void' && <div className="vc-stamp">ยกเลิก</div>}
        <header className="vc-head">
          <div>
            <div className="vc-brand">
              {ISSUER.name}
              <span>.</span>
            </div>
            {ISSUER.legalName && <div className="vc-legal">{ISSUER.legalName}</div>}
            {ISSUER.address && <div className="vc-legal">{ISSUER.address}</div>}
            {ISSUER.taxId && <div className="vc-legal">เลขประจำตัวผู้เสียภาษี {ISSUER.taxId}</div>}
          </div>
          <div className="vc-title">
            <h1>{out ? 'ใบสำคัญจ่าย' : 'ใบสำคัญรับ'}</h1>
            <div className="vc-sub">{out ? 'Payment Voucher' : 'Receipt Voucher'}</div>
            <div className="vc-note">{ISSUER.note}</div>
          </div>
        </header>

        <dl className="vc-meta">
          <div>
            <dt>เลขที่</dt>
            <dd className="vc-mono">{tx.doc_no}</dd>
          </div>
          <div>
            <dt>วันที่</dt>
            <dd>{thaiWall(tx.occurred_at)}</dd>
          </div>
          <div>
            <dt>{out ? 'จ่ายให้' : 'รับจาก'}</dt>
            <dd>{tx.payee_name || '—'}</dd>
          </div>
          {(tx.payee_bank || tx.payee_account) && (
            <div>
              <dt>บัญชีปลายทาง</dt>
              <dd>
                {tx.payee_bank} <span className="vc-mono">{tx.payee_account}</span>
              </dd>
            </div>
          )}
        </dl>

        <table className="vc-table">
          <thead>
            <tr>
              <th>รายการ</th>
              <th className="r">จำนวนเงิน (บาท)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <div className="vc-item">{what}</div>
                {tx.description && <div className="vc-desc">{tx.description}</div>}
                {tx.workshop_title && tx.workshop_title !== tx.description && (
                  <div className="vc-desc">
                    กิจกรรม: {tx.workshop_title}
                    {tx.workshop_date ? ` (${thaiWall(tx.workshop_date)})` : ''}
                  </div>
                )}
              </td>
              <td className="r vc-mono">{money(tx.gross)}</td>
            </tr>
          </tbody>
          <tfoot>
            {tx.withholding > 0 && (
              <tr>
                <td className="r">หัก ณ ที่จ่าย</td>
                <td className="r vc-mono">−{money(tx.withholding)}</td>
              </tr>
            )}
            <tr className="vc-total">
              <td className="r">{out ? 'จ่ายสุทธิ' : 'รับสุทธิ'}</td>
              <td className="r vc-mono">{money(tx.net)}</td>
            </tr>
          </tfoot>
        </table>
        <div className="vc-words">({bahtText(tx.net)})</div>

        <dl className="vc-meta vc-pay">
          <div>
            <dt>ช่องทาง</dt>
            <dd>{METHOD_LABEL[tx.method as TxMethod]}</dd>
          </div>
          <div>
            <dt>เลขอ้างอิงการโอน</dt>
            <dd className="vc-mono">{tx.ref_id || '—'}</dd>
          </div>
          {!tx.ref_id && tx.no_ref_reason && (
            <div className="vc-wide">
              <dt>หมายเหตุ</dt>
              <dd>{tx.no_ref_reason}</dd>
            </div>
          )}
          {tx.status === 'void' && (
            <div className="vc-wide">
              <dt>ยกเลิกเอกสาร</dt>
              <dd>{tx.void_reason}</dd>
            </div>
          )}
        </dl>

        <footer className="vc-foot">
          <div className="vc-sign">
            <div className="vc-line" />
            <div>
              {out ? 'ผู้จ่ายเงิน' : 'ผู้รับเงิน'} · {ISSUER.name}
            </div>
          </div>
          <p className="vc-fine">
            ออกจากระบบบันทึกการเงินของ {ISSUER.name} เป็นหลักฐานการ{out ? 'จ่าย' : 'รับ'}เงิน {fmtBaht(tx.net)} แทนสลิปโอนเงิน
          </p>
        </footer>
      </article>
    </main>
  );
}
