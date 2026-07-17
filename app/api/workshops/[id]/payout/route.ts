import { NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';
import type { ImageMeta } from '@/lib/types';

// PUT /api/workshops/[id]/payout — admin configures deduction + payout status,
// remark and transfer slip for the organizer.
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const { id } = await params;
    const body = (await request.json()) as {
      deduction_type?: 'none' | 'fixed' | 'percent';
      deduction_value?: number;
      status?: 'pending' | 'paid';
      remark?: string | null;
      slip_url?: string | null;
      slip_meta?: ImageMeta | null;
    };

    const db = await getDB();
    await db
      .prepare(
        `UPDATE workshops SET
           payout_deduction_type = ?,
           payout_deduction_value = ?,
           payout_status = ?,
           payout_remark = ?,
           payout_slip_url = ?,
           payout_slip_meta = ?,
           updated_at = datetime('now')
         WHERE id = ?`,
      )
      .bind(
        body.deduction_type || 'none',
        Number.isFinite(body.deduction_value) ? body.deduction_value : 0,
        body.status === 'paid' ? 'paid' : 'pending',
        body.remark?.trim() || null,
        body.slip_url || null,
        body.slip_meta ? JSON.stringify(body.slip_meta) : null,
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
