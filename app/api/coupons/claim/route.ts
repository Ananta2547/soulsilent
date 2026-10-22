import { NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { couponBig, couponHeadline, findByCode, normalizeCode, recordAttempt, tooManyAttempts } from '@/lib/coupons';

/**
 * GET  /api/coupons/claim?code=… — what a scanned card is. Works signed out
 *      too, so it shows only the coupon's face, never who holds it.
 * POST /api/coupons/claim { code } — put a printed card into the signed-in
 *      member's "คูปองของฉัน". A public code needs no claiming: it is typed
 *      (or offered) at checkout.
 */
export async function GET(request: Request) {
  const code = normalizeCode(new URL(request.url).searchParams.get('code'));
  const db = await getDB();
  const found = await findByCode(db, code);
  if (!found) return NextResponse.json({ error: 'ไม่พบคูปองนี้' }, { status: 404 });
  const me = await getCurrentUser();
  const c = found.coupon;
  const owner = found.code?.owner_user_id || null;
  return NextResponse.json({
    coupon: { name: c.name, description: c.description, headline: couponHeadline(c), big: couponBig(c), ends_at: c.ends_at, active: c.status === 'active' },
    code,
    isPublic: !found.code,
    taken: !!owner && owner !== me?.sub,
    mine: !!me && owner === me.sub,
    signedIn: !!me,
  });
}

export async function POST(request: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });
  const db = await getDB();
  if (await tooManyAttempts(db, me.sub)) {
    return NextResponse.json({ error: 'กรอกรหัสผิดหลายครั้งเกินไป ลองใหม่อีก 10 นาที' }, { status: 429 });
  }
  const { code: raw } = (await request.json().catch(() => ({}))) as { code?: string };
  const found = await findByCode(db, raw);
  if (!found) {
    await recordAttempt(db, me.sub);
    return NextResponse.json({ error: 'ไม่พบรหัสคูปองนี้' }, { status: 404 });
  }
  if (found.coupon.status !== 'active') return NextResponse.json({ error: 'คูปองนี้ถูกปิดใช้งานแล้ว' }, { status: 400 });
  if (!found.code) return NextResponse.json({ ok: true, code: found.coupon.public_code, isPublic: true });

  if (found.code.owner_user_id && found.code.owner_user_id !== me.sub) {
    return NextResponse.json({ error: 'คูปองใบนี้มีคนเก็บไปแล้ว' }, { status: 409 });
  }
  if (!found.code.owner_user_id) {
    // Only take it if nobody took it a moment earlier.
    const r = await db
      .prepare("UPDATE coupon_codes SET owner_user_id = ?, claimed_at = datetime('now') WHERE id = ? AND owner_user_id IS NULL")
      .bind(me.sub, found.code.id)
      .run();
    if (!r.meta.changes) return NextResponse.json({ error: 'คูปองใบนี้มีคนเก็บไปแล้ว' }, { status: 409 });
  }
  return NextResponse.json({ ok: true, code: found.code.code });
}
