import { NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';

// PUT /api/workshops/[id]/payout — admin configures deduction + payout status
// and the remark for the organizer. The transfer itself is recorded in the
// money ledger (/api/admin/ledger); payout_slip_* are kept only for the slips
// attached before it existed.
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const { id } = await params;
    const body = (await request.json()) as {
      deduction_type?: 'none' | 'fixed' | 'percent';
      deduction_value?: number;
      status?: 'pending' | 'paid';
      remark?: string | null;
    };

    const db = await getDB();
    await db
      .prepare(
        `UPDATE workshops SET
           payout_deduction_type = ?,
           payout_deduction_value = ?,
           payout_status = ?,
           payout_remark = ?,
           updated_at = datetime('now')
         WHERE id = ?`,
      )
      .bind(
        body.deduction_type || 'none',
        Number.isFinite(body.deduction_value) ? body.deduction_value : 0,
        body.status === 'paid' ? 'paid' : 'pending',
        body.remark?.trim() || null,
        id,
      )
      .run();

    return NextResponse.json({ success: true });
  } catch (error) {
    const err = error as Error;
    if (err.message === 'Unauthorized' || err.message === 'Forbidden') {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 });
  }
}
