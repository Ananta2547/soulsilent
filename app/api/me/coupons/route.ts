import { NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { aliveSql, couponBig, couponHeadline, thaiNow, type Coupon } from '@/lib/coupons';

/** GET /api/me/coupons — the member's wallet: usable, used and expired codes. */
export async function GET() {
  try {
    const user = await requireAuth();
    const db = await getDB();
    const rows =
      (
        await db
          .prepare(
            `SELECT cc.code, c.name, c.description, c.kind, c.value, c.max_discount, c.starts_at, c.ends_at, c.min_spend, c.status,
                    (SELECT w.title FROM bookings b JOIN workshops w ON w.id = b.workshop_id
                      WHERE b.coupon_code = cc.code AND ${aliveSql('b')} LIMIT 1) AS used_on
               FROM coupon_codes cc JOIN coupons c ON c.id = cc.coupon_id
              WHERE cc.owner_user_id = ?
              ORDER BY COALESCE(cc.claimed_at, cc.created_at) DESC`,
          )
          .bind(user.sub)
          .all<Pick<Coupon, 'name' | 'description' | 'kind' | 'value' | 'max_discount' | 'starts_at' | 'ends_at' | 'min_spend' | 'status'> & { code: string; used_on: string | null }>()
      ).results || [];
    const now = thaiNow();
    const coupons = rows.map((r) => ({
      code: r.code,
      name: r.name,
      description: r.description,
      headline: couponHeadline(r),
      big: couponBig(r),
      kind: r.kind,
      starts_at: r.starts_at,
      ends_at: r.ends_at,
      min_spend: r.min_spend,
      used_on: r.used_on,
      state: r.used_on ? 'used' : r.status !== 'active' || (r.ends_at && now > r.ends_at) ? 'expired' : 'ready',
    }));
    return NextResponse.json({ coupons });
  } catch (error) {
    const err = error as Error;
    if (err.message === 'Unauthorized') return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });
    console.error('My coupons error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 });
  }
}
