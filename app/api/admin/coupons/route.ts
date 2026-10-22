import { NextResponse } from 'next/server';
import { v4 as uuid } from 'uuid';
import { getDB } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';
import { aliveSql, cleanCouponInput } from '@/lib/coupons';

/** GET /api/admin/coupons — every coupon with how often it is in use. */
export async function GET() {
  try {
    await requireAdmin();
    const db = await getDB();
    const rows = await db
      .prepare(
        `SELECT c.*,
                (SELECT COUNT(*) FROM bookings b WHERE b.coupon_id = c.id AND ${aliveSql('b')}) AS used,
                (SELECT COALESCE(SUM(b.discount_amount), 0) FROM bookings b
                  WHERE b.coupon_id = c.id AND b.status != 'cancelled' AND (b.payment_status = 'paid' OR b.status = 'confirmed')) AS discount_total,
                (SELECT COUNT(*) FROM coupon_codes cc WHERE cc.coupon_id = c.id) AS codes,
                (SELECT COUNT(*) FROM coupon_codes cc WHERE cc.coupon_id = c.id AND cc.owner_user_id IS NOT NULL) AS claimed
           FROM coupons c ORDER BY c.created_at DESC`,
      )
      .all();
    return NextResponse.json({ coupons: rows.results || [] });
  } catch (error) {
    return fail(error);
  }
}

/** POST /api/admin/coupons — create a coupon. */
export async function POST(request: Request) {
  try {
    const admin = await requireAdmin();
    const body = (await request.json()) as Record<string, unknown>;
    const cleaned = cleanCouponInput(body);
    if ('error' in cleaned) return NextResponse.json({ error: cleaned.error }, { status: 400 });
    const d = cleaned.data;
    const db = await getDB();
    if (d.public_code) {
      const clash = await db
        .prepare('SELECT 1 FROM coupons WHERE public_code = ? UNION SELECT 1 FROM coupon_codes WHERE code = ?')
        .bind(d.public_code, d.public_code)
        .first();
      if (clash) return NextResponse.json({ error: 'รหัสนี้มีอยู่แล้ว' }, { status: 409 });
    }
    const id = uuid();
    await db
      .prepare(
        `INSERT INTO coupons (id, name, description, kind, value, max_discount, distribution, public_code, show_at_checkout,
           stack_with_promo, funded_by, host_share_pct, starts_at, ends_at, max_uses, per_user_limit, min_spend, scope,
           scope_json, kinds_json, first_booking_only, status, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
      )
      .bind(
        id, d.name, d.description, d.kind, d.value, d.max_discount, d.distribution, d.public_code, d.show_at_checkout,
        d.stack_with_promo, d.funded_by, d.host_share_pct, d.starts_at, d.ends_at, d.max_uses, d.per_user_limit, d.min_spend,
        d.scope, d.scope_json, d.kinds_json, d.first_booking_only, admin.sub,
      )
      .run();
    return NextResponse.json({ id });
  } catch (error) {
    return fail(error);
  }
}

function fail(error: unknown) {
  const msg = (error as Error)?.message;
  if (msg === 'Unauthorized' || msg === 'Forbidden') return NextResponse.json({ error: msg }, { status: 403 });
  console.error('Admin coupons error:', error);
  return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 });
}
