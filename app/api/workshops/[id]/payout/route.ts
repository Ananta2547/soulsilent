import { NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';
import { roundFeesById } from '@/lib/gp';

const fail = (error: unknown) => {
  const err = error as Error;
  if (err.message === 'Unauthorized' || err.message === 'Forbidden') return NextResponse.json({ error: err.message }, { status: 403 });
  return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 });
};

// GET /api/workshops/[id]/payout — what the round owes its host: gross, the
// fee (GP by the table, or admin's manual deduction) and net, with the GP of
// each paid booking for the breakdown.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const { id } = await params;
    const fees = await roundFeesById(await getDB(), id);
    if (!fees) return NextResponse.json({ error: 'ไม่พบกิจกรรม' }, { status: 404 });
    return NextResponse.json(fees);
  } catch (error) {
    return fail(error);
  }
}

// PUT /api/workshops/[id]/payout — admin sets how the fee is worked out
// (fee_mode 'gp' = the table; 'manual' = none / fixed / percent below), the
// payout status and the remark for the organizer. The transfer itself is
// recorded in the money ledger (/api/admin/ledger); payout_slip_* are kept only
// for the slips attached before it existed.
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const { id } = await params;
    const body = (await request.json()) as {
      fee_mode?: 'gp' | 'manual';
      deduction_type?: 'none' | 'fixed' | 'percent';
      deduction_value?: number;
      status?: 'pending' | 'paid';
      remark?: string | null;
    };
    const manual = body.fee_mode === 'manual';

    const db = await getDB();
    await db
      .prepare(
        `UPDATE workshops SET
           fee_mode = ?,
           payout_deduction_type = ?,
           payout_deduction_value = ?,
           payout_status = ?,
           payout_remark = ?,
           updated_at = datetime('now')
         WHERE id = ?`,
      )
      .bind(
        manual ? 'manual' : 'gp',
        manual ? body.deduction_type || 'none' : 'none',
        manual && Number.isFinite(body.deduction_value) ? body.deduction_value : 0,
        body.status === 'paid' ? 'paid' : 'pending',
        body.remark?.trim() || null,
        id,
      )
      .run();

    return NextResponse.json({ success: true });
  } catch (error) {
    return fail(error);
  }
}
