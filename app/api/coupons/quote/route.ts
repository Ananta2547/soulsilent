import { NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import {
  findByCode,
  judge,
  newBookingPrice,
  offersFor,
  plainQuote,
  recordAttempt,
  selectionPrice,
  storedCode,
  tooManyAttempts,
  type PriceCtx,
} from '@/lib/coupons';
import type { Booking, Workshop } from '@/lib/types';

/**
 * POST /api/coupons/quote — the checkout screen's numbers.
 *
 * Body: { workshop_id, tier_id?, group_size?, gift? } for a new booking, or
 * { booking_id } for a selected applicant about to pay; plus `code` when a
 * coupon is typed or picked. Answers the price lines, the coupon applied (or
 * why it cannot be), and the coupons on offer. Nothing is saved: the booking
 * routes check the same code again when the booking is made.
 */
export async function POST(request: Request) {
  try {
    const user = await requireAuth();
    const body = (await request.json()) as {
      workshop_id?: string;
      booking_id?: string;
      tier_id?: string | null;
      group_size?: number | null;
      gift?: boolean;
      code?: string;
    };
    const db = await getDB();

    let workshop: Workshop | null = null;
    let price: { flow: PriceCtx['flow']; list: number; promo: number } | { error: string };
    let excludeBookingId: string | null = null;
    if (body.booking_id) {
      const booking = await db
        .prepare('SELECT * FROM bookings WHERE id = ? AND user_id = ?')
        .bind(body.booking_id, user.sub)
        .first<Booking>();
      if (!booking) return NextResponse.json({ error: 'ไม่พบการจอง' }, { status: 404 });
      workshop = await db.prepare('SELECT * FROM workshops WHERE id = ?').bind(booking.workshop_id).first<Workshop>();
      if (!workshop) return NextResponse.json({ error: 'ไม่พบกิจกรรม' }, { status: 404 });
      price = selectionPrice(workshop);
      excludeBookingId = booking.id;
    } else {
      workshop = await db.prepare('SELECT * FROM workshops WHERE id = ?').bind(body.workshop_id || '').first<Workshop>();
      if (!workshop) return NextResponse.json({ error: 'ไม่พบกิจกรรม' }, { status: 404 });
      price = await newBookingPrice(db, workshop, { tier_id: body.tier_id, group_size: body.group_size, gift: !!body.gift });
    }
    if ('error' in price) return NextResponse.json({ error: price.error }, { status: 400 });

    const ctx: PriceCtx = { ...price, workshop, userId: user.sub, excludeBookingId };
    const offers = await offersFor(db, ctx);

    let quote = plainQuote(ctx);
    let applied: { code: string; name: string } | null = null;
    let codeError: string | null = null;
    if (body.code) {
      if (await tooManyAttempts(db, user.sub)) {
        codeError = 'กรอกรหัสผิดหลายครั้งเกินไป ลองใหม่อีก 10 นาที';
      } else {
        const found = await findByCode(db, body.code);
        if (!found) {
          await recordAttempt(db, user.sub);
          codeError = 'ไม่พบรหัสคูปองนี้';
        } else {
          const v = await judge(db, found.coupon, found.code, ctx);
          if (v.ok) {
            quote = v.quote;
            applied = { code: storedCode(found), name: found.coupon.name };
          } else {
            codeError = v.reason;
          }
        }
      }
    }

    return NextResponse.json({ quote, applied, codeError, offers, flow: ctx.flow });
  } catch (error) {
    const err = error as Error;
    if (err.message === 'Unauthorized') return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });
    console.error('Coupon quote error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 });
  }
}
