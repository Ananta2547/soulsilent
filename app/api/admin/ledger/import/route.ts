import { NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';
import { importLegacySlips, syncBeamPayments } from '@/lib/ledger';

/** POST /api/admin/ledger/import — bring in what existed before the ledger:
 *  Beam payments plus the refund and payout slips. Safe to run again; rows
 *  already in the ledger are skipped. */
export async function POST() {
  try {
    const admin = await requireAdmin();
    const db = await getDB();
    let beam = 0;
    for (let n = await syncBeamPayments(db, 500); n > 0; n = await syncBeamPayments(db, 500)) beam += n;
    const slips = await importLegacySlips(db, admin.sub);
    return NextResponse.json({ beam, ...slips });
  } catch (error) {
    const msg = (error as Error).message;
    if (msg === 'Unauthorized' || msg === 'Forbidden') return NextResponse.json({ error: msg }, { status: 403 });
    console.error('[ledger] import', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 });
  }
}
