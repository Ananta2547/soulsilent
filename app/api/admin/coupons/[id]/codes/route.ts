import { NextResponse } from 'next/server';
import { v4 as uuid } from 'uuid';
import { getDB, getEnv } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';
import { sendPushToUser } from '@/lib/push';
import { couponBig, couponHeadline, randomCode, type Coupon } from '@/lib/coupons';

type Ctx = { params: Promise<{ id: string }> };

const MAX_BATCH = 500;

/**
 * POST — hand out codes.
 *   { count }     unique coupon: a batch of single-use printed cards
 *   { user_ids }  wallet coupon: one code into each member's "คูปองของฉัน"
 */
export async function POST(request: Request, { params }: Ctx) {
  try {
    await requireAdmin();
    const { id } = await params;
    const body = (await request.json()) as { count?: number; user_ids?: string[] };
    const db = await getDB();
    const coupon = await db.prepare('SELECT * FROM coupons WHERE id = ?').bind(id).first<Coupon>();
    if (!coupon) return NextResponse.json({ error: 'ไม่พบคูปอง' }, { status: 404 });

    if (coupon.distribution === 'unique') {
      const count = Math.round(Number(body.count) || 0);
      if (count < 1 || count > MAX_BATCH) return NextResponse.json({ error: `สร้างได้ครั้งละ 1–${MAX_BATCH} ใบ` }, { status: 400 });
      const batch = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 16).replace('T', ' ');
      const codes = await freshCodes(db, count);
      await db.batch(codes.map((code) => db.prepare('INSERT INTO coupon_codes (id, coupon_id, code, batch) VALUES (?, ?, ?, ?)').bind(uuid(), id, code, batch)));
      return NextResponse.json({ created: codes.length, batch });
    }

    if (coupon.distribution === 'wallet') {
      const ids = [...new Set((body.user_ids || []).map(String).filter(Boolean))].slice(0, MAX_BATCH);
      if (ids.length === 0) return NextResponse.json({ error: 'เลือกผู้ใช้อย่างน้อย 1 คน' }, { status: 400 });
      // Members who already hold this coupon are skipped, so pressing grant
      // twice does not hand anyone a second copy.
      const found =
        (
          await db
            .prepare(
              `SELECT id FROM users WHERE id IN (${ids.map(() => '?').join(',')})
                 AND id NOT IN (SELECT owner_user_id FROM coupon_codes WHERE coupon_id = ? AND owner_user_id IS NOT NULL)`,
            )
            .bind(...ids, id)
            .all<{ id: string }>()
        ).results || [];
      if (found.length === 0) return NextResponse.json({ error: 'ผู้ใช้ที่เลือกมีคูปองนี้อยู่แล้ว' }, { status: 400 });
      const codes = await freshCodes(db, found.length);
      await db.batch(
        found.map((u, i) =>
          db
            .prepare("INSERT INTO coupon_codes (id, coupon_id, code, owner_user_id, claimed_at) VALUES (?, ?, ?, ?, datetime('now'))")
            .bind(uuid(), id, codes[i], u.id),
        ),
      );
      // Tell them — reaches only members who turned app notifications on.
      const env = (await getEnv()) as unknown as Parameters<typeof sendPushToUser>[1];
      for (const u of found) {
        try {
          await sendPushToUser(db, env, u.id, {
            title: 'คุณได้รับคูปอง',
            body: `${coupon.name} · ${couponHeadline(coupon)}`,
            url: '/me/coupons',
            tag: `coupon-${id}`,
            card: {
              topic: 'gift',
              hero: { kind: 'coupon', discount: coupon.kind === 'percent' || coupon.kind === 'amount' ? `−${couponBig(coupon)}` : couponBig(coupon) },
              title: 'คุณได้รับคูปอง',
              sub: `${coupon.name} · ${couponHeadline(coupon)}`,
              cta: { label: 'ดูคูปองของฉัน', url: '/me/coupons' },
            },
          }, { kind: 'booking' });
        } catch {}
      }
      return NextResponse.json({ created: found.length });
    }

    return NextResponse.json({ error: 'คูปองรหัสสาธารณะไม่ต้องสร้างรหัสเพิ่ม' }, { status: 400 });
  } catch (error) {
    const msg = (error as Error)?.message;
    if (msg === 'Unauthorized' || msg === 'Forbidden') return NextResponse.json({ error: msg }, { status: 403 });
    console.error('Coupon codes error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 });
  }
}

/** DELETE { code } — withdraw one code nobody has used. */
export async function DELETE(request: Request, { params }: Ctx) {
  try {
    await requireAdmin();
    const { id } = await params;
    const { code } = (await request.json()) as { code?: string };
    const db = await getDB();
    const used = await db.prepare('SELECT 1 FROM bookings WHERE coupon_code = ? LIMIT 1').bind(code || '').first();
    if (used) return NextResponse.json({ error: 'รหัสนี้ถูกใช้แล้ว ลบไม่ได้' }, { status: 400 });
    await db.prepare('DELETE FROM coupon_codes WHERE coupon_id = ? AND code = ?').bind(id, code || '').run();
    return NextResponse.json({ ok: true });
  } catch (error) {
    const msg = (error as Error)?.message;
    if (msg === 'Unauthorized' || msg === 'Forbidden') return NextResponse.json({ error: msg }, { status: 403 });
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 });
  }
}

/** `n` codes that exist nowhere yet (neither as a card nor as a public code). */
async function freshCodes(db: D1Database, n: number): Promise<string[]> {
  const out = new Set<string>();
  while (out.size < n) {
    const want = Array.from({ length: Math.min(50, n - out.size) * 2 }, () => randomCode(8)).filter((c) => !out.has(c));
    const placeholders = want.map(() => '?').join(',');
    const taken = new Set(
      (
        (await db
          .prepare(`SELECT code FROM coupon_codes WHERE code IN (${placeholders}) UNION SELECT public_code FROM coupons WHERE public_code IN (${placeholders})`)
          .bind(...want, ...want)
          .all<{ code: string }>()).results || []
      ).map((r) => r.code),
    );
    for (const c of want) if (!taken.has(c) && out.size < n) out.add(c);
  }
  return [...out];
}
