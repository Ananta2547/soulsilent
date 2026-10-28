import { NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';
import { PAYOUT_FIELDS, type HostPayoutInfo } from '@/lib/host-payout';

export type { HostPayoutInfo } from '@/lib/host-payout';

function fail(error: unknown) {
  const msg = (error as Error).message;
  if (msg === 'Unauthorized' || msg === 'Forbidden') return NextResponse.json({ error: msg }, { status: 403 });
  console.error('[payout-info]', error);
  return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 });
}

const COLS = PAYOUT_FIELDS.map((f) => `p.${f}`).join(', ');

/** GET /api/admin/hosts/[id]/payout-info — where admin sends this host's
 *  earnings and how to reach them (migrations 077 + 078), or null when
 *  nothing is saved yet. Admin only. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const { id } = await params;
    const db = await getDB();
    const row = await db
      .prepare(`SELECT ${COLS}, p.updated_at, u.name AS updated_by_name FROM host_payout_info p LEFT JOIN users u ON u.id = p.updated_by WHERE p.user_id = ?`)
      .bind(id)
      .first<HostPayoutInfo>();
    return NextResponse.json({ info: row || null });
  } catch (error) {
    return fail(error);
  }
}

const text = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
const digits = (v: unknown) => text(v, 40)?.replace(/[^0-9-]/g, '') || null;

/** PUT /api/admin/hosts/[id]/payout-info — every field at once; empty clears it. */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin();
    const { id } = await params;
    const db = await getDB();
    const host = await db.prepare('SELECT id FROM users WHERE id = ?').bind(id).first();
    if (!host) return NextResponse.json({ error: 'ไม่พบผู้จัด' }, { status: 404 });
    const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const v: Record<(typeof PAYOUT_FIELDS)[number], string | null> = {
      full_name: text(b.full_name, 120),
      nickname: text(b.nickname, 60),
      bank: text(b.bank, 80),
      account_no: digits(b.account_no),
      account_name: text(b.account_name, 120),
      promptpay: digits(b.promptpay),
      phone: digits(b.phone),
      facebook: text(b.facebook, 200),
      line_id: text(b.line_id, 100),
      instagram: text(b.instagram, 100),
      note: text(b.note, 2000),
    };
    await db
      .prepare(
        `INSERT INTO host_payout_info (user_id, ${PAYOUT_FIELDS.join(', ')}, updated_by, updated_at)
         VALUES (?, ${PAYOUT_FIELDS.map(() => '?').join(', ')}, ?, datetime('now'))
         ON CONFLICT(user_id) DO UPDATE SET ${PAYOUT_FIELDS.map((f) => `${f} = excluded.${f}`).join(', ')},
           updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
      )
      .bind(id, ...PAYOUT_FIELDS.map((f) => v[f]), admin.sub)
      .run();
    return GET(request, { params: Promise.resolve({ id }) });
  } catch (error) {
    return fail(error);
  }
}
