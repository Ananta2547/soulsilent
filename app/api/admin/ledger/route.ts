import { NextResponse } from 'next/server';
import { getDB, getEnv } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';
import { KIND_LABEL, METHOD_LABEL, applyTxEffects, checkManual, emailVoucher, insertTx, syncBeamPayments, type MoneyTx, type TxKind, type TxMethod } from '@/lib/ledger';

type Row = MoneyTx & { category_name: string | null; workshop_title: string | null; workshop_date: string | null };

/** GET /api/admin/ledger — the money ledger, newest first. Filters: kind,
 *  direction, status (done|void|all), from/to (YYYY-MM-DD, by occurred_at),
 *  q (doc no, reference, payee, description, round). `format=csv` downloads
 *  the same rows. Beam payments not yet in the ledger are pulled in first. */
export async function GET(request: Request) {
  try {
    await requireAdmin();
    const db = await getDB();
    await syncBeamPayments(db);
    const sp = new URL(request.url).searchParams;
    const where: string[] = [];
    const args: (string | number)[] = [];
    const kind = sp.get('kind');
    if (kind && kind in KIND_LABEL) { where.push('t.kind = ?'); args.push(kind); }
    const dir = sp.get('direction');
    if (dir === 'in' || dir === 'out') { where.push('t.direction = ?'); args.push(dir); }
    const workshopId = sp.get('workshop_id');
    if (workshopId) { where.push('t.workshop_id = ?'); args.push(workshopId); }
    const status = sp.get('status') || 'done';
    if (status !== 'all') { where.push('t.status = ?'); args.push(status === 'void' ? 'void' : 'done'); }
    const from = sp.get('from');
    if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) { where.push('t.occurred_at >= ?'); args.push(from); }
    const to = sp.get('to');
    if (to && /^\d{4}-\d{2}-\d{2}$/.test(to)) { where.push('t.occurred_at <= ?'); args.push(to + 'T23:59'); }
    const q = (sp.get('q') || '').trim();
    if (q) {
      where.push('(t.doc_no LIKE ? OR t.ref_id LIKE ? OR t.payee_name LIKE ? OR t.description LIKE ? OR w.title LIKE ?)');
      const like = `%${q}%`;
      args.push(like, like, like, like, like);
    }
    const sql = `SELECT t.*, c.name AS category_name, w.title AS workshop_title, w.date AS workshop_date
                   FROM money_tx t
                   LEFT JOIN expense_categories c ON c.id = t.category_id
                   LEFT JOIN workshops w ON w.id = t.workshop_id
                  ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                  ORDER BY t.occurred_at DESC, t.created_at DESC
                  LIMIT 2000`;
    const all = (await db.prepare(sql).bind(...args).all<Row>()).results || [];
    const live = all.filter((r) => r.status === 'done');
    const totals = {
      in: live.filter((r) => r.direction === 'in').reduce((a, r) => a + r.net, 0),
      out: live.filter((r) => r.direction === 'out').reduce((a, r) => a + r.net, 0),
      withholding: live.reduce((a, r) => a + (r.withholding || 0), 0),
      count: all.length,
    };

    if (sp.get('format') === 'csv') {
      const cell = (v: unknown) => {
        const s = v == null ? '' : String(v);
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const head = ['เลขที่เอกสาร', 'วันเวลา', 'ทิศทาง', 'ประเภท', 'หมวด', 'ยอดรวม', 'หัก ณ ที่จ่าย', 'สุทธิ', 'ช่องทาง', 'เลขอ้างอิง', 'แหล่งอ้างอิง', 'เหตุผลไม่มีเลขอ้างอิง', 'ผู้รับ', 'ธนาคาร', 'บัญชี', 'รายละเอียด', 'กิจกรรม', 'สถานะ', 'เหตุผลยกเลิก', 'รายการเก่า'];
      const lines = all.map((r) =>
        [
          r.doc_no, r.occurred_at.replace('T', ' '), r.direction === 'in' ? 'รับ' : 'จ่าย', KIND_LABEL[r.kind as TxKind], r.category_name,
          r.gross, r.withholding, r.net, METHOD_LABEL[r.method as TxMethod], r.ref_id, r.ref_source, r.no_ref_reason,
          r.payee_name, r.payee_bank, r.payee_account, r.description, r.workshop_title,
          r.status === 'void' ? 'ยกเลิก' : 'สำเร็จ', r.void_reason, r.legacy ? 'ใช่' : '',
        ]
          .map(cell)
          .join(','),
      );
      return new Response('﻿' + [head.join(','), ...lines].join('\r\n'), {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="ledger-${new Date().toISOString().slice(0, 10)}.csv"`,
        },
      });
    }
    // For one round, also say who its host is, so the payout form opened from
    // that round starts with the payee filled in.
    const host = workshopId
      ? await db
          .prepare(
            `SELECT u.id, COALESCE(NULLIF(TRIM(u.name), ''), u.nickname) AS name, u.email
               FROM workshops w JOIN users u ON u.id = w.instructor_id WHERE w.id = ?`,
          )
          .bind(workshopId)
          .first<{ id: string; name: string | null; email: string | null }>()
      : null;
    return NextResponse.json({ items: all, totals, host });
  } catch (error) {
    const msg = (error as Error).message;
    if (msg === 'Unauthorized' || msg === 'Forbidden') return NextResponse.json({ error: msg }, { status: 403 });
    console.error('[ledger] list', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 });
  }
}

/** POST /api/admin/ledger — admin records a transfer made by hand (refund,
 *  host payout, business expense). Emails the payee the voucher link when
 *  there is an email and `send_email` is not false. */
export async function POST(request: Request) {
  try {
    const admin = await requireAdmin();
    const body = (await request.json()) as Record<string, unknown>;
    const checked = checkManual(body);
    if ('error' in checked) return NextResponse.json({ error: checked.error }, { status: 400 });
    const db = await getDB();
    const input = checked.input;
    if (input.ref_id) {
      const dup = await db
        .prepare("SELECT doc_no FROM money_tx WHERE ref_id = ? AND status = 'done'")
        .bind(input.ref_id)
        .first<{ doc_no: string }>();
      if (dup) return NextResponse.json({ error: `เลขอ้างอิงนี้บันทึกไปแล้วในเอกสาร ${dup.doc_no}` }, { status: 409 });
    }
    // The links come from the booking / round when the form was opened from one.
    if (input.booking_id) {
      const b = await db
        .prepare('SELECT user_id, workshop_id FROM bookings WHERE id = ?')
        .bind(input.booking_id)
        .first<{ user_id: string; workshop_id: string }>();
      if (!b) return NextResponse.json({ error: 'ไม่พบการจอง' }, { status: 404 });
      input.user_id = b.user_id;
      input.workshop_id = b.workshop_id;
    }
    if (input.kind === 'host_payout' && input.workshop_id && !input.host_id) {
      const w = await db.prepare('SELECT instructor_id FROM workshops WHERE id = ?').bind(input.workshop_id).first<{ instructor_id: string | null }>();
      input.host_id = w?.instructor_id ?? null;
    }
    input.created_by = admin.sub;
    let tx: MoneyTx;
    try {
      tx = await insertTx(db, input);
    } catch (e) {
      if (String(e).includes('UNIQUE')) return NextResponse.json({ error: 'เลขอ้างอิงนี้บันทึกไปแล้ว' }, { status: 409 });
      throw e;
    }
    await applyTxEffects(db, tx);
    let emailed = false;
    if (body.send_email !== false) {
      const env = await getEnv();
      emailed = await emailVoucher(db, tx, env.SITE_URL || new URL(request.url).origin);
    }
    return NextResponse.json({ tx, emailed });
  } catch (error) {
    const msg = (error as Error).message;
    if (msg === 'Unauthorized' || msg === 'Forbidden') return NextResponse.json({ error: msg }, { status: 403 });
    console.error('[ledger] create', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 });
  }
}
