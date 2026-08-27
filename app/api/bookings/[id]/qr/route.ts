import { NextResponse } from 'next/server';
import { getDB, getEnv } from '@/lib/db';
import { sqliteToMs } from '@/lib/datetime';
import { requireAuth } from '@/lib/auth';
import { createQrCharge, fetchCharge, BeamError } from '@/lib/beam';
import type { Booking } from '@/lib/types';

/**
 * GET /api/bookings/{id}/qr — the one PromptPay QR this booking is paid with,
 * plus where the payment currently stands. Backs the /pay/{id} page, which uses
 * it both to draw the QR and to poll.
 *
 * The QR is created once and then stored. Beam's hosted page mints a new one on
 * every switch of payment method, all of them payable at once, which is how the
 * same seat got paid for twice; serving a stored image is what makes "one QR per
 * booking" true rather than merely intended.
 *
 * ?deep=1 additionally asks Beam about the charge. The page sends it every few
 * polls so a payment still lands even if the webhook never arrives — the same
 * safety net /api/payments/verify gives the card lane.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  // Declared out here so the catch below can still say WHAT failed to be paid
  // for. When Beam refused the charge the page lost the booking panel too, and
  // an error screen with no context reads like the booking itself vanished.
  let summary: Record<string, string | null> | null = null;
  let owed = 0;

  try {
    const user = await requireAuth();
    const { id } = await params;
    const db = await getDB();

    // The workshop comes along for the ride: the payment page shows what is
    // being paid for beside the QR — poster, date, time, place — so someone with
    // three tabs open can see they are paying for the right seat. Fetching it
    // here keeps the page to one request per poll instead of two.
    const booking = await db
      .prepare(
        `SELECT b.*, w.title AS w_title, w.date AS w_date, w.end_date AS w_end_date,
                w.workshop_type AS w_type, w.time_start AS w_time_start, w.time_end AS w_time_end,
                w.location AS w_location, w.image_url AS w_image_url,
                l.name AS loc_name, l.province AS loc_province, l.district AS loc_district
           FROM bookings b
           LEFT JOIN workshops w ON b.workshop_id = w.id
           LEFT JOIN locations l ON w.location_id = l.id
          WHERE b.id = ? AND b.user_id = ?`,
      )
      .bind(id, user.sub)
      .first<Booking & Record<string, string | null>>();
    if (!booking) {
      return NextResponse.json({ error: 'ไม่พบการจอง' }, { status: 404 });
    }

    // Sent with every outcome, not only the payable one: the page keeps the
    // booking panel on screen while it says "paid" or "time is up", and a panel
    // that empties out at exactly that moment reads like something broke.
    summary = {
      title: booking.w_title,
      date: booking.w_date,
      endDate: booking.w_end_date,
      workshopType: booking.w_type,
      timeStart: booking.w_time_start,
      timeEnd: booking.w_time_end,
      location: booking.w_location,
      locName: booking.loc_name,
      locProvince: booking.loc_province,
      locDistrict: booking.loc_district,
      imageUrl: booking.w_image_url,
    };

    if (booking.payment_status === 'paid' || booking.status === 'confirmed') {
      return NextResponse.json({ paid: true, bookingId: id, booking: summary });
    }

    // `expires_at` is the authority, not the status flags: the sweep that sets
    // them runs lazily on reads and on a cron a minute apart, so a row can read
    // "pending" well past its deadline. Going by the flags handed a seat to a
    // payment that arrived too late.
    const holdMs = booking.expires_at ? sqliteToMs(booking.expires_at) : NaN;
    const lapsed =
      booking.status === 'cancelled' ||
      booking.payment_status === 'expired' ||
      (Number.isFinite(holdMs) && holdMs <= Date.now());
    if (lapsed) {
      return NextResponse.json({ expired: true, bookingId: id, booking: summary });
    }

    // No hold at all means this booking is not payable yet — a selection
    // application still waiting on the announcement carries an amount but no
    // deadline, and minting a QR for it would sell a seat nobody has been
    // offered. Those users pay through /confirm, which sets the hold first.
    if (!booking.expires_at) {
      return NextResponse.json(
        { error: 'ยังไม่สามารถชำระเงินได้', booking: summary },
        { status: 400 },
      );
    }

    const amount = booking.amount || 0;
    owed = amount;
    if (amount <= 0) {
      return NextResponse.json(
        { error: 'ไม่มียอดที่ต้องชำระ', booking: summary },
        { status: 400 },
      );
    }

    // Ask Beam directly when the page requests it. Cheap insurance: the QR is
    // scanned on a phone while this tab sits idle, and if the webhook is late
    // the user is left staring at a live countdown for money we already have.
    const deep = new URL(request.url).searchParams.get('deep') === '1';
    if (deep && booking.beam_qr_charge_id) {
      try {
        const charge = await fetchCharge(booking.beam_qr_charge_id);
        if (charge.paid) {
          await db
            .prepare(
              `UPDATE bookings SET status='confirmed', payment_status='paid', expires_at=NULL,
                 beam_charge_id = COALESCE(beam_charge_id, ?)
               WHERE id = ?`,
            )
            .bind(booking.beam_qr_charge_id, id)
            .run();
          return NextResponse.json({ paid: true, bookingId: id, booking: summary });
        }
      } catch (e) {
        // Beam being unreachable must not break the page — the stored QR is
        // still valid and the webhook is still the primary path.
        console.error('QR deep check failed', id, e);
      }
    }

    // Hand back the stored QR whenever there is one that has not expired. This
    // is the entire point of the route: reload the page, switch devices, come
    // back later inside the hold — the same image every time.
    const qrMs = booking.beam_qr_expires_at ? new Date(booking.beam_qr_expires_at).getTime() : NaN;
    const qrAlive = !Number.isFinite(qrMs) || qrMs > Date.now();
    if (booking.beam_qr_charge_id && booking.beam_qr_image && qrAlive) {
      return NextResponse.json({
        image: booking.beam_qr_image,
        chargeId: booking.beam_qr_charge_id,
        amount,
        expiresAt: booking.expires_at,
        booking: summary,
        reused: true,
      });
    }

    const env = await getEnv();
    const siteUrl = env.SITE_URL || 'http://localhost:3000';
    const qr = await createQrCharge({ amount, bookingId: id, siteUrl });

    await db
      .prepare(
        'UPDATE bookings SET beam_qr_charge_id = ?, beam_qr_image = ?, beam_qr_expires_at = ? WHERE id = ?',
      )
      .bind(qr.chargeId, qr.imageBase64, qr.expiry, id)
      .run();

    return NextResponse.json({
      image: qr.imageBase64,
      chargeId: qr.chargeId,
      amount,
      booking: summary,
      // The seat hold, NOT the QR's own expiry. Beam grants the QR 30 minutes
      // whatever we ask for, and showing that number would promise 20 minutes
      // the seat does not have.
      expiresAt: booking.expires_at,
    });
  } catch (error) {
    const err = error as Error;
    if (err.message === 'Unauthorized') {
      return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });
    }
    if (error instanceof BeamError && error.retryable) {
      console.error('QR charge: Beam unavailable', error.status);
      return NextResponse.json(
        {
          error: 'ระบบชำระเงินขัดข้องชั่วคราว กรุณากดอีกครั้ง',
          retryable: true,
          booking: summary,
          amount: owed,
        },
        { status: 503 },
      );
    }
    console.error('QR charge error:', error);
    return NextResponse.json(
      { error: 'เกิดข้อผิดพลาด', booking: summary, amount: owed },
      { status: 500 },
    );
  }
}
