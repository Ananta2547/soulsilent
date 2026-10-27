import { NextResponse } from 'next/server';
import { getDB, getEnv } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';
import { checkManual, emailProblem, emailVoucher, maskAccount, type MoneyTx } from '@/lib/ledger';

const fail = (error: unknown, tag: string) => {
  const msg = (error as Error).message;
  if (msg === 'Unauthorized' || msg === 'Forbidden') return NextResponse.json({ error: msg }, { status: 403 });
  console.error(tag, error);
  return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 });
};

/** Fields an edit may change on a hand-entered row (not its kind, nor the
 *  booking / round / host it belongs to). */
const EDITABLE = [
  'gross',
  'withholding',
  'net',
  'method',
  'ref_id',
  'ref_source',
  'no_ref_reason',
  'occurred_at',
  'payee_name',
  'payee_bank',
  'payee_account',
  'payee_email',
  'category_id',
  'description',
  'slip_url',
  'slip_meta',
] as const;
type Editable = (typeof EDITABLE)[number];

/** GET /api/admin/ledger/[id] — the row's edit history, newest first. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const { id } = await params;
    const db = await getDB();
    const rows = await db
      .prepare(
        `SELECT e.id, e.edited_at, e.before_json, e.after_json, e.note, COALESCE(NULLIF(TRIM(u.nickname), ''), u.name) AS editor
           FROM money_tx_edits e LEFT JOIN users u ON u.id = e.edited_by WHERE e.tx_id = ? ORDER BY e.edited_at DESC`,
      )
      .bind(id)
      .all<{ id: string; edited_at: string; before_json: string; after_json: string; note: string | null; editor: string | null }>()
      .then((r) => r.results || [])
      .catch(() => []); // before migration 076
    return NextResponse.json({ edits: rows.map((r) => ({ ...r, before: JSON.parse(r.before_json), after: JSON.parse(r.after_json) })) });
  } catch (error) {
    return fail(error, '[ledger] history');
  }
}

/** PUT /api/admin/ledger/[id] — correct a row in place. A hand-entered row
 *  takes the same fields (and checks) as when it was recorded; a row Beam
 *  wrote takes only its description. What changed is kept in money_tx_edits
 *  with who, when and the note given. */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin();
    const { id } = await params;
    const body = (await request.json()) as Record<string, unknown>;
    const db = await getDB();
    const tx = await db.prepare('SELECT * FROM money_tx WHERE id = ?').bind(id).first<MoneyTx>();
    if (!tx) return NextResponse.json({ error: 'ไม่พบรายการ' }, { status: 404 });
    if (tx.status === 'void') return NextResponse.json({ error: 'รายการที่ยกเลิกแล้วแก้ไขไม่ได้' }, { status: 400 });

    const next: Partial<Record<Editable, unknown>> = {};
    if (tx.ref_source === 'beam' || tx.method === 'beam') {
      next.description = String(body.description ?? '').trim() || null;
    } else {
      const checked = checkManual({ ...body, kind: tx.kind, host_id: tx.host_id, category_id: tx.kind === 'expense' ? body.category_id : null });
      if ('error' in checked) return NextResponse.json({ error: checked.error }, { status: 400 });
      const i = checked.input;
      if (i.ref_id && i.ref_id !== tx.ref_id) {
        const dup = await db.prepare("SELECT doc_no FROM money_tx WHERE ref_id = ? AND status = 'done' AND id != ?").bind(i.ref_id, id).first<{ doc_no: string }>();
        if (dup) return NextResponse.json({ error: `เลขอ้างอิงนี้บันทึกไปแล้วในเอกสาร ${dup.doc_no}` }, { status: 409 });
      }
      const withholding = Math.max(0, Number(i.withholding) || 0);
      const gross = Math.round(Number(i.gross) * 100) / 100;
      Object.assign(next, {
        gross,
        withholding,
        net: Math.round((gross - withholding) * 100) / 100,
        method: i.method,
        ref_id: i.ref_id,
        ref_source: i.ref_id ? (i.ref_id === tx.ref_id ? tx.ref_source : 'bank_slip') : null,
        no_ref_reason: i.no_ref_reason,
        occurred_at: i.occurred_at,
        payee_name: i.payee_name,
        payee_bank: i.payee_bank,
        // Only the last 4 digits are kept; an empty box keeps what is there.
        payee_account: i.payee_account ? maskAccount(i.payee_account) : tx.payee_account,
        payee_email: i.payee_email,
        category_id: i.category_id,
        description: i.description,
        slip_url: i.slip_url,
        slip_meta: i.slip_meta,
      });
    }

    const keys = EDITABLE.filter((k) => k in next && String(next[k] ?? '') !== String((tx as Record<string, unknown>)[k] ?? ''));
    if (!keys.length) return NextResponse.json({ tx, changed: [] });
    const before = Object.fromEntries(keys.map((k) => [k, (tx as Record<string, unknown>)[k] ?? null]));
    const after = Object.fromEntries(keys.map((k) => [k, next[k] ?? null]));
    await db.batch([
      db.prepare(`UPDATE money_tx SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).bind(...keys.map((k) => next[k] ?? null), id),
      db
        .prepare('INSERT INTO money_tx_edits (id, tx_id, edited_by, before_json, after_json, note) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(crypto.randomUUID(), id, admin.sub, JSON.stringify(before), JSON.stringify(after), String(body.note ?? '').trim().slice(0, 300) || null),
    ]);
    const updated = (await db.prepare('SELECT * FROM money_tx WHERE id = ?').bind(id).first<MoneyTx>())!;
    let mail: { status: string } | null = null;
    if (body.send_email === true && updated.payee_email) {
      const env = await getEnv();
      mail = await emailVoucher(db, updated, env.SITE_URL || new URL(request.url).origin);
    }
    return NextResponse.json({ tx: updated, changed: keys, emailed: mail?.status === 'sent' });
  } catch (error) {
    return fail(error, '[ledger] edit');
  }
}

/** PATCH /api/admin/ledger/[id]
 *  { action: 'void', reason } — cancel a row (never deleted; keeps who/when/why)
 *  { action: 'email' }        — send the payee the voucher link again */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin();
    const { id } = await params;
    const body = (await request.json()) as { action?: string; reason?: string };
    const db = await getDB();
    const tx = await db.prepare('SELECT * FROM money_tx WHERE id = ?').bind(id).first<MoneyTx>();
    if (!tx) return NextResponse.json({ error: 'ไม่พบรายการ' }, { status: 404 });

    if (body.action === 'void') {
      const reason = (body.reason || '').trim();
      if (!reason) return NextResponse.json({ error: 'ใส่เหตุผลที่ยกเลิก' }, { status: 400 });
      if (tx.status === 'void') return NextResponse.json({ error: 'รายการนี้ถูกยกเลิกแล้ว' }, { status: 400 });
      if (tx.ref_source === 'beam') return NextResponse.json({ error: 'รายการจาก Beam ยกเลิกไม่ได้' }, { status: 400 });
      await db
        .prepare("UPDATE money_tx SET status = 'void', voided_by = ?, voided_at = datetime('now'), void_reason = ? WHERE id = ?")
        .bind(admin.sub, reason, id)
        .run();
      // A voided host payout puts the round back to "not paid yet".
      if (tx.kind === 'host_payout' && tx.workshop_id) {
        const other = await db
          .prepare("SELECT 1 FROM money_tx WHERE workshop_id = ? AND kind = 'host_payout' AND status = 'done'")
          .bind(tx.workshop_id)
          .first();
        if (!other) await db.prepare("UPDATE workshops SET payout_status = 'pending' WHERE id = ?").bind(tx.workshop_id).run();
      }
      return NextResponse.json({ success: true });
    }
    if (body.action === 'email') {
      if (tx.status !== 'done') return NextResponse.json({ error: 'รายการนี้ถูกยกเลิกแล้ว' }, { status: 400 });
      if (!tx.payee_email) return NextResponse.json({ error: 'ไม่มีอีเมลผู้รับ' }, { status: 400 });
      const env = await getEnv();
      const mail = await emailVoucher(db, tx, env.SITE_URL || new URL(request.url).origin);
      return NextResponse.json({ sent: mail.status === 'sent', email_problem: emailProblem(mail) });
    }
    return NextResponse.json({ error: 'unknown action' }, { status: 400 });
  } catch (error) {
    const msg = (error as Error).message;
    if (msg === 'Unauthorized' || msg === 'Forbidden') return NextResponse.json({ error: msg }, { status: 403 });
    console.error('[ledger] patch', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 });
  }
}
