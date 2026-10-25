import { NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';

/** Settings admin may change here, each with what a valid value is. */
const KEYS: Record<string, (v: string) => boolean> = {
  // Beam fee in percent of the amount charged (migration 074).
  beam_fee_qr: (v) => v === '' || (Number.isFinite(Number(v)) && Number(v) >= 0 && Number(v) <= 20),
  beam_fee_card: (v) => v === '' || (Number.isFinite(Number(v)) && Number(v) >= 0 && Number(v) <= 20),
};

const fail = (error: unknown, tag: string) => {
  const msg = (error as Error).message;
  if (msg === 'Unauthorized' || msg === 'Forbidden') return NextResponse.json({ error: msg }, { status: 403 });
  console.error(tag, error);
  return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 });
};

/** GET /api/admin/settings — every known setting ('' when unset). */
export async function GET() {
  try {
    await requireAdmin();
    const db = await getDB();
    const rows = (await db.prepare('SELECT key, value FROM admin_settings').all<{ key: string; value: string }>()).results || [];
    return NextResponse.json(Object.fromEntries(Object.keys(KEYS).map((k) => [k, rows.find((r) => r.key === k)?.value ?? ''])));
  } catch (error) {
    return fail(error, '[admin/settings GET]');
  }
}

/** PUT /api/admin/settings — { key: value, … } for the keys above. */
export async function PUT(request: Request) {
  try {
    const user = await requireAdmin();
    const body = (await request.json()) as Record<string, unknown>;
    const entries = Object.entries(body).filter(([k]) => k in KEYS);
    if (!entries.length) return NextResponse.json({ error: 'ไม่มีค่าที่จะบันทึก' }, { status: 400 });
    for (const [k, v] of entries) {
      if (!KEYS[k](String(v ?? '').trim())) return NextResponse.json({ error: 'ค่าไม่ถูกต้อง (0–20%)' }, { status: 400 });
    }
    const db = await getDB();
    await db.batch(
      entries.map(([k, v]) =>
        db
          .prepare(
            `INSERT INTO admin_settings (key, value, updated_by, updated_at) VALUES (?, ?, ?, datetime('now'))
             ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
          )
          .bind(k, String(v ?? '').trim(), user.sub),
      ),
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    return fail(error, '[admin/settings PUT]');
  }
}
