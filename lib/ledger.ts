import { v4 as uuid } from 'uuid';
import { hostGrossSql } from '@/lib/comp';
import { computePayout } from '@/lib/workshop-utils';
import { DIRECTION_OF, MANUAL_KINDS, NEEDS_REF, type Direction, type MoneyTx, type RefSource, type TxKind, type TxMethod } from '@/lib/ledger-shared';

/* The money ledger (migration 070): every movement of money, kept by its
 * transaction reference rather than by a pasted slip. Beam payments and
 * Beam refunds are written by the system; transfers done by hand (refunds,
 * host payouts, business expenses) are entered by admin. A money-out row is
 * also the payment voucher (ใบสำคัญจ่าย), linked by voucher_token. */

export * from '@/lib/ledger-shared';

const WALL_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

/** Thai wall clock now, 'YYYY-MM-DDTHH:MM'. */
export const thaiWallNow = () => new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 16);
/** SQLite UTC 'YYYY-MM-DD HH:MM:SS' → Thai wall clock. */
export const sqliteToThaiWall = (s: string | null | undefined) => {
  if (!s) return thaiWallNow();
  const d = new Date(s.replace(' ', 'T') + 'Z');
  return Number.isNaN(d.getTime()) ? thaiWallNow() : new Date(d.getTime() + 7 * 3600 * 1000).toISOString().slice(0, 16);
};

/** "xxx-x-x1234": only the last four digits of an account are kept. */
export function maskAccount(raw: string | null | undefined): string | null {
  const digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return null;
  return digits.length <= 4 ? digits : `xxx-x-x${digits.slice(-4)}`;
}

const token = () => {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
};

/** Next running document number: PV-2569-0001 (out) or RV-2569-0001 (in),
 *  by the Buddhist year of when the money moved. */
export async function nextDocNo(db: D1Database, direction: Direction, occurredAt: string): Promise<string> {
  const year = Number(occurredAt.slice(0, 4)) + 543;
  const prefix = `${direction === 'out' ? 'PV' : 'RV'}-${year}`;
  const row = await db
    .prepare('INSERT INTO doc_counters (prefix, n) VALUES (?, 1) ON CONFLICT(prefix) DO UPDATE SET n = n + 1 RETURNING n')
    .bind(prefix)
    .first<{ n: number }>();
  return `${prefix}-${String(row?.n ?? 1).padStart(4, '0')}`;
}

export type TxInput = {
  kind: TxKind;
  gross: number;
  withholding?: number;
  method: TxMethod;
  ref_id?: string | null;
  ref_source?: RefSource | null;
  no_ref_reason?: string | null;
  occurred_at: string;
  payee_name?: string | null;
  payee_bank?: string | null;
  payee_account?: string | null;
  payee_email?: string | null;
  user_id?: string | null;
  booking_id?: string | null;
  workshop_id?: string | null;
  host_id?: string | null;
  category_id?: string | null;
  description?: string | null;
  slip_url?: string | null;
  slip_meta?: string | null;
  legacy?: boolean;
  created_by?: string | null;
};

/** Write one row (doc number and voucher token assigned here). */
export async function insertTx(db: D1Database, t: TxInput): Promise<MoneyTx> {
  const direction = DIRECTION_OF[t.kind];
  const withholding = Math.max(0, Number(t.withholding) || 0);
  const gross = Math.round(Number(t.gross) * 100) / 100;
  const net = Math.round((gross - withholding) * 100) / 100;
  const id = uuid();
  const doc = await nextDocNo(db, direction, t.occurred_at);
  await db
    .prepare(
      `INSERT INTO money_tx (
         id, doc_no, direction, kind, status, gross, withholding, net, method, ref_id, ref_source, no_ref_reason, occurred_at,
         payee_name, payee_bank, payee_account, payee_email, user_id, booking_id, workshop_id, host_id, category_id, description,
         slip_url, slip_meta, legacy, voucher_token, created_by)
       VALUES (?, ?, ?, ?, 'done', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      doc,
      direction,
      t.kind,
      gross,
      withholding,
      net,
      t.method,
      t.ref_id?.trim() || null,
      t.ref_id?.trim() ? t.ref_source || 'manual' : t.legacy ? 'legacy' : null,
      t.no_ref_reason?.trim() || null,
      t.occurred_at,
      t.payee_name?.trim() || null,
      t.payee_bank?.trim() || null,
      maskAccount(t.payee_account),
      t.payee_email?.trim() || null,
      t.user_id || null,
      t.booking_id || null,
      t.workshop_id || null,
      t.host_id || null,
      t.category_id || null,
      t.description?.trim() || null,
      t.slip_url || null,
      t.slip_meta || null,
      t.legacy ? 1 : 0,
      token(),
      t.created_by || null,
    )
    .run();
  return (await db.prepare('SELECT * FROM money_tx WHERE id = ?').bind(id).first<MoneyTx>())!;
}

/** Check a hand-entered row. A transfer needs its reference; cash (or an
 *  "other" method) gives a reason instead. */
export function checkManual(body: Record<string, unknown>): { input: TxInput } | { error: string } {
  const kind = String(body.kind) as TxKind;
  if (!MANUAL_KINDS.includes(kind)) return { error: 'เลือกประเภทรายการ' };
  const gross = Number(body.gross);
  if (!Number.isFinite(gross) || gross <= 0) return { error: 'ใส่ยอดเงินให้ถูกต้อง' };
  const withholding = Number(body.withholding) || 0;
  if (withholding < 0 || withholding >= gross) return { error: 'ยอดหัก ณ ที่จ่ายต้องน้อยกว่ายอดรวม' };
  const method = String(body.method) as TxMethod;
  if (!(['bank_transfer', 'promptpay', 'cash', 'other'] as TxMethod[]).includes(method)) return { error: 'เลือกช่องทางการจ่าย' };
  const ref = String(body.ref_id ?? '').trim();
  const reason = String(body.no_ref_reason ?? '').trim();
  if (NEEDS_REF.includes(method) && !ref) return { error: 'การโอนต้องใส่ Transaction Reference ID (เลขที่รายการบนสลิป)' };
  if (!NEEDS_REF.includes(method) && !ref && !reason) return { error: 'ไม่มีเลขอ้างอิง — ใส่เหตุผลแทน' };
  if (ref && !/^[A-Za-z0-9\-_.:/]{4,80}$/.test(ref)) return { error: 'เลขอ้างอิงใช้ได้เฉพาะตัวอักษรอังกฤษ ตัวเลข และ - _ . : /' };
  const occurred = String(body.occurred_at ?? '');
  if (!WALL_RE.test(occurred)) return { error: 'ใส่วันเวลาที่โอน' };
  if (occurred > thaiWallNow().slice(0, 10) + 'T23:59') return { error: 'วันที่โอนอยู่ในอนาคต' };
  const payee = String(body.payee_name ?? '').trim();
  if (!payee) return { error: 'ใส่ชื่อผู้รับเงิน' };
  if (kind === 'expense' && !body.category_id) return { error: 'เลือกหมวดค่าใช้จ่าย' };
  const s = (k: string) => (body[k] == null || body[k] === '' ? null : String(body[k]));
  return {
    input: {
      kind,
      gross,
      withholding,
      method,
      ref_id: ref || null,
      ref_source: ref ? 'bank_slip' : null,
      no_ref_reason: ref ? null : reason,
      occurred_at: occurred,
      payee_name: payee,
      payee_bank: s('payee_bank'),
      payee_account: s('payee_account'),
      payee_email: s('payee_email'),
      user_id: s('user_id'),
      booking_id: s('booking_id'),
      workshop_id: s('workshop_id'),
      host_id: s('host_id'),
      category_id: kind === 'expense' ? s('category_id') : null,
      description: s('description'),
      slip_url: s('slip_url'),
      slip_meta: body.slip_meta ? JSON.stringify(body.slip_meta) : null,
    },
  };
}

/** A Beam movement, recorded once per Beam transaction id. */
export async function recordBeam(
  db: D1Database,
  t: { kind: 'booking_payment' | 'refund'; ref: string; amount: number; bookingId?: string | null; occurredAt?: string; description?: string },
): Promise<void> {
  if (!t.ref || !(t.amount > 0)) return;
  const seen = await db.prepare("SELECT 1 FROM money_tx WHERE ref_source = 'beam' AND ref_id = ?").bind(t.ref).first();
  if (seen) return;
  const b = t.bookingId
    ? await db
        .prepare(
          `SELECT b.user_id, b.workshop_id, w.title, u.name, u.email FROM bookings b
             LEFT JOIN workshops w ON w.id = b.workshop_id LEFT JOIN users u ON u.id = b.user_id WHERE b.id = ?`,
        )
        .bind(t.bookingId)
        .first<{ user_id: string | null; workshop_id: string | null; title: string | null; name: string | null; email: string | null }>()
    : null;
  try {
    await insertTx(db, {
      kind: t.kind,
      gross: t.amount,
      method: 'beam',
      ref_id: t.ref,
      ref_source: 'beam',
      occurred_at: t.occurredAt || thaiWallNow(),
      payee_name: t.kind === 'refund' ? b?.name ?? null : null,
      payee_email: t.kind === 'refund' ? b?.email ?? null : null,
      user_id: b?.user_id ?? null,
      booking_id: t.bookingId ?? null,
      workshop_id: b?.workshop_id ?? null,
      description: t.description || b?.title || null,
    });
  } catch (e) {
    // Two webhook deliveries can race to the same reference; the unique
    // index keeps one row and the other insert lands here.
    if (!String(e).includes('UNIQUE')) throw e;
  }
}

/** Every Beam payment on a booking that the ledger does not have yet — the
 *  webhook writes them as they land; this catches any confirmed elsewhere
 *  (the pay page's own check) and the payments made before the ledger. */
export async function syncBeamPayments(db: D1Database, limit = 300): Promise<number> {
  const rows =
    (
      await db
        .prepare(
          `SELECT b.id, b.beam_charge_id, b.amount, COALESCE(b.confirmed_at, b.created_at) AS at, w.title
             FROM bookings b LEFT JOIN workshops w ON w.id = b.workshop_id
            WHERE b.beam_charge_id IS NOT NULL AND b.amount > 0 AND b.payment_status IN ('paid', 'refunded')
              AND NOT EXISTS (SELECT 1 FROM money_tx t WHERE t.ref_source = 'beam' AND t.ref_id = b.beam_charge_id)
            ORDER BY b.created_at ASC LIMIT ?`,
        )
        .bind(limit)
        .all<{ id: string; beam_charge_id: string; amount: number; at: string; title: string | null }>()
    ).results || [];
  for (const r of rows) {
    await recordBeam(db, { kind: 'booking_payment', ref: r.beam_charge_id, amount: Number(r.amount), bookingId: r.id, occurredAt: sqliteToThaiWall(r.at), description: r.title || undefined });
  }
  return rows.length;
}

/** One-time import of the slips that existed before the ledger: refund slips
 *  on bookings and payout slips on rounds. Marked legacy, no reference. */
export async function importLegacySlips(db: D1Database, by: string): Promise<{ refunds: number; payouts: number }> {
  const refunds =
    (
      await db
        .prepare(
          `SELECT b.id, b.user_id, b.workshop_id, b.amount, b.refund_slip_url, b.refund_slip_meta, b.created_at, w.title,
                  COALESCE(NULLIF(TRIM(u.nickname), ''), u.name) AS name, u.email
             FROM bookings b LEFT JOIN workshops w ON w.id = b.workshop_id LEFT JOIN users u ON u.id = b.user_id
            WHERE b.refund_slip_url IS NOT NULL AND b.refund_slip_url != ''
              AND NOT EXISTS (SELECT 1 FROM money_tx t WHERE t.booking_id = b.id AND t.kind = 'refund' AND t.status = 'done')`,
        )
        .all<{ id: string; user_id: string; workshop_id: string; amount: number; refund_slip_url: string; refund_slip_meta: string | null; created_at: string; title: string | null; name: string | null; email: string | null }>()
    ).results || [];
  for (const r of refunds) {
    await insertTx(db, {
      kind: 'refund',
      gross: Math.max(0.01, Number(r.amount) || 0),
      method: 'bank_transfer',
      no_ref_reason: 'รายการเก่า — บันทึกจากสลิปก่อนมีระบบบัญชีการเงิน',
      occurred_at: sqliteToThaiWall(r.created_at),
      payee_name: r.name,
      payee_email: r.email,
      user_id: r.user_id,
      booking_id: r.id,
      workshop_id: r.workshop_id,
      description: r.title,
      slip_url: r.refund_slip_url,
      slip_meta: r.refund_slip_meta,
      legacy: true,
      created_by: by,
    });
  }
  const payouts =
    (
      await db
        .prepare(
          `SELECT w.id, w.title, w.instructor_id, w.payout_slip_url, w.payout_slip_meta, w.payout_deduction_type, w.payout_deduction_value, w.updated_at,
                  u.name, u.email,
                  (SELECT COALESCE(SUM(${hostGrossSql('b')}), 0) FROM bookings b
                    WHERE b.workshop_id = w.id AND b.status != 'cancelled' AND (b.payment_status = 'paid' OR b.status = 'confirmed')) AS gross
             FROM workshops w LEFT JOIN users u ON u.id = w.instructor_id
            WHERE w.payout_slip_url IS NOT NULL AND w.payout_slip_url != ''
              AND NOT EXISTS (SELECT 1 FROM money_tx t WHERE t.workshop_id = w.id AND t.kind = 'host_payout' AND t.status = 'done')`,
        )
        .all<{ id: string; title: string; instructor_id: string | null; payout_slip_url: string; payout_slip_meta: string | null; payout_deduction_type: string | null; payout_deduction_value: number | null; updated_at: string; name: string | null; email: string | null; gross: number }>()
    ).results || [];
  for (const w of payouts) {
    const { net } = computePayout(Number(w.gross) || 0, (w.payout_deduction_type as 'none' | 'fixed' | 'percent') || 'none', Number(w.payout_deduction_value) || 0);
    await insertTx(db, {
      kind: 'host_payout',
      gross: Math.max(0.01, net),
      method: 'bank_transfer',
      no_ref_reason: 'รายการเก่า — บันทึกจากสลิปก่อนมีระบบบัญชีการเงิน',
      occurred_at: sqliteToThaiWall(w.updated_at),
      payee_name: w.name,
      payee_email: w.email,
      host_id: w.instructor_id,
      workshop_id: w.id,
      description: `รายได้รอบ ${w.title}`,
      slip_url: w.payout_slip_url,
      slip_meta: w.payout_slip_meta,
      legacy: true,
      created_by: by,
    });
  }
  return { refunds: refunds.length, payouts: payouts.length };
}

export const fmtBaht = (n: number) => '฿' + (Math.round(n * 100) / 100).toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

/** Who issues the vouchers. Change the name and add the tax id here once the
 *  business is registered; the voucher page and the email read only this. */
export const ISSUER = {
  name: 'AllSoulLearn',
  legalName: null as string | null,
  taxId: null as string | null,
  address: null as string | null,
  note: 'เอกสารภายใน · ไม่ใช่ใบกำกับภาษี',
};

/** What a recorded transfer means for the rest of the site: a refund closes
 *  the booking the way the old refund slip did (a full refund moves a live
 *  booking to cancelled/refunded; a deposit return changes nothing), and a
 *  host payout marks the round paid. */
export async function applyTxEffects(db: D1Database, tx: MoneyTx): Promise<void> {
  if (tx.kind === 'refund' && tx.booking_id) {
    const info = await db
      .prepare('SELECT w.payment_type AS pt, b.status AS st FROM bookings b JOIN workshops w ON b.workshop_id = w.id WHERE b.id = ?')
      .bind(tx.booking_id)
      .first<{ pt: string | null; st: string }>();
    if (info && (info.pt || 'paid') !== 'deposit' && info.st !== 'cancelled') {
      await db.prepare("UPDATE bookings SET status = 'cancelled', cancel_reason = 'refunded' WHERE id = ?").bind(tx.booking_id).run();
    }
  }
  if (tx.kind === 'host_payout' && tx.workshop_id) {
    await db.prepare("UPDATE workshops SET payout_status = 'paid', updated_at = datetime('now') WHERE id = ?").bind(tx.workshop_id).run();
  }
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** sent · not_configured (no RESEND_API_KEY on this Worker) · failed (Resend
 *  refused, `error` says why) · no_email (nothing to send to). */
export type EmailResult = { status: 'sent' | 'not_configured' | 'failed' | 'no_email'; error?: string };

/** Email the payee the voucher link. The voucher is reachable only by this
 *  link; it is never listed on the website. */
export async function emailVoucher(db: D1Database, tx: MoneyTx, siteUrl: string): Promise<EmailResult> {
  if (tx.direction !== 'out' || !tx.payee_email) return { status: 'no_email' };
  const { sendEmail, emailTemplate } = await import('@/lib/email');
  const what = tx.kind === 'refund' ? 'คืนเงินค่ากิจกรรม' : tx.kind === 'host_payout' ? 'โอนรายได้ผู้จัด' : 'ชำระเงิน';
  const { ok, sent, error } = await sendEmail({
    to: tx.payee_email,
    subject: `${what} ${fmtBaht(tx.net)} · ${ISSUER.name}`,
    html: emailTemplate({
      heading: `${what}เรียบร้อยแล้ว`,
      body: `เรียนคุณ${esc(tx.payee_name || '')}<br>${ISSUER.name} ได้${what}ให้คุณจำนวน <b>${fmtBaht(tx.net)}</b>${
        tx.description ? ` (${esc(tx.description)})` : ''
      }<br>เลขที่เอกสาร ${tx.doc_no}${tx.ref_id ? `<br>เลขอ้างอิงการโอน ${esc(tx.ref_id)}` : ''}`,
      ctaLabel: 'ดูใบสำคัญจ่าย',
      ctaHref: `${siteUrl}/voucher/${tx.voucher_token}`,
      footnote: 'ลิงก์นี้เป็นของคุณคนเดียว โปรดเก็บอีเมลนี้ไว้เป็นหลักฐาน',
    }),
  });
  if (!sent) return ok ? { status: 'not_configured' } : { status: 'failed', error };
  await db.prepare("UPDATE money_tx SET emailed_at = datetime('now') WHERE id = ?").bind(tx.id).run();
  return { status: 'sent' };
}

/** What admin reads when the voucher email did not go out. */
export function emailProblem(r: EmailResult): string | null {
  if (r.status === 'not_configured') return 'ระบบส่งอีเมลยังไม่ได้ตั้งค่าบนเซิร์ฟเวอร์นี้ (ไม่มี RESEND_API_KEY) — บันทึกแล้ว แต่ผู้รับยังไม่ได้อีเมล';
  if (r.status === 'failed') return `ส่งอีเมลไม่สำเร็จ: ${r.error || 'ไม่ทราบสาเหตุ'} — บันทึกแล้ว กด "ส่งอีกครั้ง" ได้ในหน้าบัญชีการเงิน`;
  return null;
}
