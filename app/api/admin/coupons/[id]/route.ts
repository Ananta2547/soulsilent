import { NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';
import { aliveSql, cleanCouponInput, type Coupon } from '@/lib/coupons';

type Ctx = { params: Promise<{ id: string }> };

/** GET — one coupon, its codes and every booking that used it. */
export async function GET(_request: Request, { params }: Ctx) {
  try {
    await requireAdmin();
    const { id } = await params;
    const db = await getDB();
    const coupon = await db.prepare('SELECT * FROM coupons WHERE id = ?').bind(id).first<Coupon>();
    if (!coupon) return NextResponse.json({ error: 'ไม่พบคูปอง' }, { status: 404 });
    const [codes, uses] = await db.batch([
      db.prepare(
        `SELECT cc.*, u.name AS owner_name, u.email AS owner_email,
                (SELECT b.id FROM bookings b WHERE b.coupon_code = cc.code AND ${aliveSql('b')} LIMIT 1) AS used_booking
           FROM coupon_codes cc LEFT JOIN users u ON u.id = cc.owner_user_id
          WHERE cc.coupon_id = ? ORDER BY cc.created_at DESC, cc.code`,
      ).bind(id),
      db.prepare(
        `SELECT b.id, b.workshop_id, b.coupon_code, b.amount, b.list_amount, b.discount_amount, b.host_discount, b.host_credit,
                b.status, b.payment_status, b.created_at, w.title AS workshop_title, w.date AS workshop_date,
                u.name AS user_name, u.email AS user_email,
                CASE WHEN ${aliveSql('b')} THEN 1 ELSE 0 END AS alive
           FROM bookings b JOIN workshops w ON w.id = b.workshop_id LEFT JOIN users u ON u.id = b.user_id
          WHERE b.coupon_id = ? ORDER BY b.created_at DESC`,
      ).bind(id),
    ]);
    return NextResponse.json({ coupon, codes: codes.results || [], uses: uses.results || [] });
  } catch (error) {
    return fail(error);
  }
}

/** PUT — edit the rules. The way it is handed out cannot change once codes exist. */
export async function PUT(request: Request, { params }: Ctx) {
  try {
    await requireAdmin();
    const { id } = await params;
    const db = await getDB();
    const cur = await db.prepare('SELECT * FROM coupons WHERE id = ?').bind(id).first<Coupon>();
    if (!cur) return NextResponse.json({ error: 'ไม่พบคูปอง' }, { status: 404 });
    const cleaned = cleanCouponInput((await request.json()) as Record<string, unknown>);
    if ('error' in cleaned) return NextResponse.json({ error: cleaned.error }, { status: 400 });
    const d = cleaned.data;
    if (d.distribution !== cur.distribution) {
      const n = await db.prepare('SELECT COUNT(*) AS n FROM coupon_codes WHERE coupon_id = ?').bind(id).first<{ n: number }>();
      if ((n?.n || 0) > 0) return NextResponse.json({ error: 'คูปองนี้มีรหัสแจกไปแล้ว จึงเปลี่ยนรูปแบบการแจกไม่ได้' }, { status: 400 });
    }
    if (d.public_code && d.public_code !== cur.public_code) {
      const clash = await db
        .prepare('SELECT 1 FROM coupons WHERE public_code = ? AND id != ? UNION SELECT 1 FROM coupon_codes WHERE code = ?')
        .bind(d.public_code, id, d.public_code)
        .first();
      if (clash) return NextResponse.json({ error: 'รหัสนี้มีอยู่แล้ว' }, { status: 409 });
    }
    await db
      .prepare(
        `UPDATE coupons SET name = ?, description = ?, kind = ?, value = ?, max_discount = ?, distribution = ?, public_code = ?,
           show_at_checkout = ?, stack_with_promo = ?, funded_by = ?, host_share_pct = ?, starts_at = ?, ends_at = ?, max_uses = ?,
           per_user_limit = ?, min_spend = ?, scope = ?, scope_json = ?, kinds_json = ?, first_booking_only = ?,
           updated_at = datetime('now')
         WHERE id = ?`,
      )
      .bind(
        d.name, d.description, d.kind, d.value, d.max_discount, d.distribution, d.public_code, d.show_at_checkout, d.stack_with_promo,
        d.funded_by, d.host_share_pct, d.starts_at, d.ends_at, d.max_uses, d.per_user_limit, d.min_spend, d.scope, d.scope_json,
        d.kinds_json, d.first_booking_only, id,
      )
      .run();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}

/** PATCH { status } — turn a coupon off (or back on). Bookings already made keep their price. */
export async function PATCH(request: Request, { params }: Ctx) {
  try {
    await requireAdmin();
    const { id } = await params;
    const { status } = (await request.json()) as { status?: string };
    if (status !== 'active' && status !== 'disabled') return NextResponse.json({ error: 'สถานะไม่ถูกต้อง' }, { status: 400 });
    const db = await getDB();
    await db.prepare("UPDATE coupons SET status = ?, updated_at = datetime('now') WHERE id = ?").bind(status, id).run();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}

/** DELETE — only a coupon nobody has used yet. */
export async function DELETE(_request: Request, { params }: Ctx) {
  try {
    await requireAdmin();
    const { id } = await params;
    const db = await getDB();
    const used = await db.prepare('SELECT 1 FROM bookings WHERE coupon_id = ? LIMIT 1').bind(id).first();
    if (used) return NextResponse.json({ error: 'คูปองนี้มีการใช้แล้ว ลบไม่ได้ ให้ปิดใช้งานแทน' }, { status: 400 });
    await db.batch([
      db.prepare('DELETE FROM coupon_codes WHERE coupon_id = ?').bind(id),
      db.prepare('DELETE FROM coupons WHERE id = ?').bind(id),
    ]);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}

function fail(error: unknown) {
  const msg = (error as Error)?.message;
  if (msg === 'Unauthorized' || msg === 'Forbidden') return NextResponse.json({ error: msg }, { status: 403 });
  console.error('Admin coupon error:', error);
  return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 });
}
