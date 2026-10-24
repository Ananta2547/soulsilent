import { NextResponse } from 'next/server';
import { getDB, getEnv } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';
import { emailVoucher, type MoneyTx } from '@/lib/ledger';

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
      const sent = await emailVoucher(db, tx, env.SITE_URL || new URL(request.url).origin);
      return NextResponse.json({ sent });
    }
    return NextResponse.json({ error: 'unknown action' }, { status: 400 });
  } catch (error) {
    const msg = (error as Error).message;
    if (msg === 'Unauthorized' || msg === 'Forbidden') return NextResponse.json({ error: msg }, { status: 403 });
    console.error('[ledger] patch', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 });
  }
}
