import { NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';

export type HostPayoutInfo = {
  bank: string | null;
  account_no: string | null;
  account_name: string | null;
  promptpay: string | null;
  note: string | null;
  updated_at: string | null;
  updated_by_name: string | null;
};

function fail(error: unknown) {
  const msg = (error as Error).message;
  if (msg === 'Unauthorized' || msg === 'Forbidden') return NextResponse.json({ error: msg }, { status: 403 });
  console.error('[payout-info]', error);
  return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 });
}

/** GET /api/admin/hosts/[id]/payout-info — where admin sends this host's
 *  earnings (migration 077), or null when nothing is saved yet. Admin only. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const { id } = await params;
    const db = await getDB();
    const row = await db
      .prepare(
        `SELECT p.bank, p.account_no, p.account_name, p.promptpay, p.note, p.updated_at, u.name AS updated_by_name
           FROM host_payout_info p LEFT JOIN users u ON u.id = p.updated_by WHERE p.user_id = ?`,
      )
      .bind(id)
      .first<HostPayoutInfo>();
    return NextResponse.json({ info: row || null });
  } catch (error) {
    return fail(error);
  }
}

const text = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);

/** PUT /api/admin/hosts/[id]/payout-info { bank, account_no, account_name, promptpay, note } */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin();
    const { id } = await params;
    const db = await getDB();
    const host = await db.prepare('SELECT id FROM users WHERE id = ?').bind(id).first();
    if (!host) return NextResponse.json({ error: 'ไม่พบผู้จัด' }, { status: 404 });
    const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const accountNo = text(b.account_no, 40)?.replace(/[^0-9-]/g, '') || null;
    const promptpay = text(b.promptpay, 40)?.replace(/[^0-9-]/g, '') || null;
    await db
      .prepare(
        `INSERT INTO host_payout_info (user_id, bank, account_no, account_name, promptpay, note, updated_by, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT(user_id) DO UPDATE SET bank = excluded.bank, account_no = excluded.account_no,
           account_name = excluded.account_name, promptpay = excluded.promptpay, note = excluded.note,
           updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
      )
      .bind(id, text(b.bank, 80), accountNo, text(b.account_name, 120), promptpay, text(b.note, 1000), admin.sub)
      .run();
    return GET(request, { params: Promise.resolve({ id }) });
  } catch (error) {
    return fail(error);
  }
}
