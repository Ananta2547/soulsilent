import { NextResponse } from 'next/server';
import { v4 as uuid } from 'uuid';
import { getDB, getEnv } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { createWorkshopCheckout } from '@/lib/stripe';
import { getEffectivePrice, hasWorkshopStarted } from '@/lib/workshop-utils';
import { settleSelection, visibleAppStatus, confirmDeadlineFor, type SettleWorkshop } from '@/lib/selection';
import { expireStaleHolds } from '@/lib/holds';
import type { Workshop } from '@/lib/types';

/** Minutes a booking holds its seat for after creation. */
const HOLD_MINUTES = 10;

/** Whole years from a YYYY-MM-DD birthdate, or null. Mirrors the client. */
function ageFromDob(dob: string | null): number | null {
  if (!dob) return null;
  const d = new Date(dob.length === 10 ? `${dob}T00:00:00` : dob);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let a = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) a--;
  return a >= 0 ? a : null;
}

/**
 * SQL fragment used everywhere we count "taken" seats. A row counts when:
 *   - it's been paid (status='confirmed' or payment_status='paid'), OR
 *   - it's still inside its hold window (payment_status='pending' AND expires_at > now)
 *
 * Cancelled rows never count. Stale pending rows (past expires_at) don't count
 * either, so the seat is auto-released without a background job.
 */
const SEAT_TAKEN_SQL = `
  status != 'cancelled' AND (
    payment_status = 'paid'
    OR status = 'confirmed'
    OR (payment_status = 'pending' AND expires_at IS NOT NULL AND datetime(expires_at) > datetime('now'))
  )
`;

export async function GET(request: Request) {
  try {
    const user = await requireAuth();
    const db = await getDB();
    const url = new URL(request.url);

    // Auto-cancel any pending holds that ran out their 10-min window.
    await expireStaleHolds(db);

    let query: string;
    let bindings: string[];

    // `mine=1` always scopes to the caller's own bookings (e.g. the personal
    // "My bookings" page) — even for admins, who otherwise see everyone's.
    const mine = url.searchParams.get('mine');

    if (user.role === 'admin' && !mine) {
      const workshopId = url.searchParams.get('workshop_id');
      if (workshopId) {
        // Run round-based settlement so promotions/timeouts are current.
        const w = await db
          .prepare(
            `SELECT id, admission_type, announce_at, confirm_main_by, confirm_waitlist_by, max_participants
             FROM workshops WHERE id = ?`
          )
          .bind(workshopId)
          .first<SettleWorkshop>();
        if (w) await settleSelection(db, w);

        query = 'SELECT b.*, u.name as user_name, u.email as user_email, w.title as workshop_title FROM bookings b LEFT JOIN users u ON b.user_id = u.id LEFT JOIN workshops w ON b.workshop_id = w.id WHERE b.workshop_id = ? ORDER BY b.created_at DESC';
        bindings = [workshopId];
      } else {
        query = 'SELECT b.*, u.name as user_name, u.email as user_email, w.title as workshop_title FROM bookings b LEFT JOIN users u ON b.user_id = u.id LEFT JOIN workshops w ON b.workshop_id = w.id ORDER BY b.created_at DESC';
        bindings = [];
      }
    } else {
      // Settle any selection workshops this user applied to before reading, so
      // round-based timeouts/promotions are reflected in what they see.
      const sel = await db
        .prepare(
          `SELECT DISTINCT w.id, w.admission_type, w.announce_at, w.confirm_main_by,
                  w.confirm_waitlist_by, w.max_participants
           FROM bookings b JOIN workshops w ON b.workshop_id = w.id
           WHERE b.user_id = ? AND w.admission_type = 'selection'`
        )
        .bind(user.sub)
        .all<SettleWorkshop>();
      for (const w of sel.results || []) {
        await settleSelection(db, w);
      }

      query =
        `SELECT b.*, w.title as workshop_title, w.date as ws_date, w.time_start as ws_time_start,
                w.end_date as ws_end_date, w.dates_json as ws_dates_json, w.workshop_type as ws_workshop_type,
                w.time_end as ws_time_end, w.day_times_json as ws_day_times_json, w.require_consent as ws_require_consent,
                w.admission_type as ws_admission_type, w.payment_type as ws_payment_type,
                w.deposit_amount as ws_deposit_amount, w.announce_at as ws_announce_at,
                w.confirm_main_by as ws_confirm_main_by, w.confirm_waitlist_by as ws_confirm_waitlist_by
         FROM bookings b LEFT JOIN workshops w ON b.workshop_id = w.id WHERE b.user_id = ? ORDER BY b.created_at DESC`;
      bindings = [user.sub];
    }

    const stmt = bindings.length > 0
      ? db.prepare(query).bind(...bindings)
      : db.prepare(query);

    const result = await stmt.all<Record<string, unknown>>();

    // For the personal page, attach the user-visible (masked) status + the
    // confirm-by deadline so the UI doesn't need the round logic.
    const rows = (result.results || []).map((b) => {
      const admission = (b.ws_admission_type as string) || 'direct';
      const w = {
        admission_type: admission as Workshop['admission_type'],
        announce_at: (b.ws_announce_at as string) || null,
        confirm_main_by: (b.ws_confirm_main_by as string) || null,
        confirm_waitlist_by: (b.ws_confirm_waitlist_by as string) || null,
      };
      const rawStatus = (b.app_status as string) || 'applied';
      const view_status = visibleAppStatus(w, rawStatus);
      const confirm_by =
        admission === 'selection' && view_status === 'approved'
          ? confirmDeadlineFor(w, { waitlist_rank: (b.waitlist_rank as number) ?? null })
          : null;
      return { ...b, view_status, confirm_by };
    });

    return NextResponse.json({ bookings: rows });
  } catch (error) {
    const err = error as Error;
    if (err.message === 'Unauthorized') {
      return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });
    }
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireAuth();
    const { workshop_id, application } = (await request.json()) as {
      workshop_id: string;
      application?: unknown;
    };
    const applicationJson = application != null ? JSON.stringify(application) : null;
    const db = await getDB();

    const workshop = await db
      .prepare('SELECT * FROM workshops WHERE id = ?')
      .bind(workshop_id)
      .first<Workshop>();

    if (!workshop || workshop.status !== 'active') {
      return NextResponse.json({ error: 'Workshop นี้ไม่สามารถจองได้' }, { status: 400 });
    }

    // Registration closes the moment the event starts — a multi-day workshop
    // must not take joiners once it is under way (matches the "ปิดรับ" badge).
    if (hasWorkshopStarted(workshop)) {
      return NextResponse.json(
        { error: 'กิจกรรมเริ่มแล้ว ไม่สามารถสมัครได้' },
        { status: 400 },
      );
    }

    // Age restriction (defense-in-depth — the BookingModal also blocks this).
    // DOB now lives in the autofill vault (vault_json.dob); fall back to the
    // legacy users.date_of_birth column.
    if (workshop.min_age != null || workshop.max_age != null) {
      const u = await db
        .prepare('SELECT vault_json, date_of_birth FROM users WHERE id = ?')
        .bind(user.sub)
        .first<{ vault_json: string | null; date_of_birth: string | null }>();
      let dob: string | null = u?.date_of_birth ?? null;
      try {
        const v = u?.vault_json ? (JSON.parse(u.vault_json) as { dob?: string }) : null;
        if (v?.dob) dob = v.dob;
      } catch {}
      const age = ageFromDob(dob);
      if (age == null) {
        return NextResponse.json({ error: 'กรุณาระบุวันเกิดในโปรไฟล์ก่อนสมัคร' }, { status: 400 });
      }
      if (workshop.min_age != null && age < workshop.min_age) {
        return NextResponse.json(
          { error: `กิจกรรมนี้จำกัดอายุผู้เข้าร่วมสำหรับผู้ที่มีอายุ ${workshop.min_age} ปีขึ้นไปเท่านั้น` },
          { status: 400 },
        );
      }
      if (workshop.max_age != null && age > workshop.max_age) {
        return NextResponse.json(
          { error: `กิจกรรมนี้จำกัดอายุผู้เข้าร่วมไม่เกิน ${workshop.max_age} ปี` },
          { status: 400 },
        );
      }
    }

    const admissionType = workshop.admission_type || 'direct';
    const paymentType = workshop.payment_type || 'paid';
    const isSelection = admissionType === 'selection';

    // A rejected applicant (admin declined, or missed a round deadline) cannot
    // re-apply. The rejected row is cancelled, so this is checked separately
    // from the "existing live booking" lookup below.
    const rejected = await db
      .prepare(`SELECT id FROM bookings WHERE workshop_id = ? AND user_id = ? AND app_status = 'rejected' LIMIT 1`)
      .bind(workshop_id, user.sub)
      .first<{ id: string }>();
    if (rejected) {
      return NextResponse.json(
        { error: 'คุณไม่ผ่านการคัดเลือกสำหรับกิจกรรมนี้ ไม่สามารถสมัครซ้ำได้' },
        { status: 400 }
      );
    }

    // Capacity check using the seat-taken predicate (paid + live holds only).
    // Selection workshops accept applications beyond capacity (that's what the
    // waitlist is for), so the limit is only enforced for direct booking.
    if (!isSelection) {
      const countResult = await db
        .prepare(`SELECT COUNT(*) as count FROM bookings WHERE workshop_id = ? AND ${SEAT_TAKEN_SQL}`)
        .bind(workshop_id)
        .first<{ count: number }>();

      if ((countResult?.count || 0) >= workshop.max_participants) {
        return NextResponse.json({ error: 'ที่นั่งเต็มแล้ว' }, { status: 400 });
      }
    }

    // Look up this user's existing booking for this workshop. We treat rows as:
    //   - PAID   → block, already booked
    //   - LIVE PENDING (expires_at > now) → recycle id + refresh hold window
    //   - EXPIRED PENDING → ignore, create a fresh booking with a new hold
    const existing = await db
      .prepare(
        `SELECT id, status, payment_status, expires_at FROM bookings
         WHERE workshop_id = ? AND user_id = ? AND status != 'cancelled'
         ORDER BY created_at DESC LIMIT 1`
      )
      .bind(workshop_id, user.sub)
      .first<{
        id: string;
        status: string;
        payment_status: string;
        expires_at: string | null;
      }>();

    if (existing && (existing.payment_status === 'paid' || existing.status === 'confirmed')) {
      return NextResponse.json({ error: 'คุณจองและชำระเงินไปแล้ว' }, { status: 400 });
    }
    // Selection: block a duplicate live application (already in the pool).
    if (isSelection && existing && existing.status !== 'cancelled') {
      // Update the snapshot but keep them in the pool — don't create a 2nd row.
      await db
        .prepare("UPDATE bookings SET application_json = COALESCE(?, application_json) WHERE id = ?")
        .bind(applicationJson, existing.id)
        .run();
      return NextResponse.json({ submitted: true, mode: 'selection', bookingId: existing.id });
    }

    // The amount eventually owed depends on the payment model:
    //   free    → 0
    //   deposit → fixed deposit_amount (refundable on event day)
    //   paid    → full effective (promo-aware) price
    const fullPrice = getEffectivePrice(workshop).price;
    const chargeAmount =
      paymentType === 'free' ? 0 : paymentType === 'deposit' ? workshop.deposit_amount || 0 : fullPrice;

    // Initial booking state by flow:
    //   selection → applied, no seat hold (decided later by admin)
    //   direct free → confirmed + paid immediately (seat consumed), no checkout
    //   direct deposit/paid → pending hold, app auto-approved, then checkout
    const appStatus = isSelection ? 'applied' : 'approved';
    // Nothing to charge (free type, OR deposit/paid that resolves to ฿0 — e.g.
    // deposit_amount 0 or a 100%-off promo) → confirm immediately, no Stripe
    // checkout and no seat hold. Prevents the broken "pay ฿0" state.
    const isFreeConfirm = !isSelection && (paymentType === 'free' || chargeAmount <= 0);
    const rowStatus = isFreeConfirm ? 'confirmed' : 'pending';
    const rowPayment = isFreeConfirm ? 'paid' : 'pending';
    // Hold a seat only for direct flows that still owe money; selection apps and
    // free confirmations don't need a 10-min hold.
    const holdExpr = isSelection || isFreeConfirm ? null : `+${HOLD_MINUTES} minutes`;

    let bookingId: string;
    const liveHold =
      existing &&
      existing.expires_at != null &&
      new Date(existing.expires_at).getTime() > Date.now();

    if (existing && (liveHold || existing.status !== 'cancelled')) {
      bookingId = existing.id;
      await db
        .prepare(
          `UPDATE bookings SET status = ?, payment_status = ?, amount = ?, app_status = ?,
             application_json = COALESCE(?, application_json),
             expires_at = ${holdExpr ? "datetime('now', ?)" : 'NULL'}
           WHERE id = ?`
        )
        .bind(
          ...(holdExpr
            ? [rowStatus, rowPayment, chargeAmount, appStatus, applicationJson, holdExpr, bookingId]
            : [rowStatus, rowPayment, chargeAmount, appStatus, applicationJson, bookingId])
        )
        .run();
    } else {
      bookingId = uuid();
      await db
        .prepare(
          `INSERT INTO bookings (id, workshop_id, user_id, status, payment_status, amount, app_status, application_json, expires_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ${holdExpr ? "datetime('now', ?)" : 'NULL'})`
        )
        .bind(
          ...(holdExpr
            ? [bookingId, workshop_id, user.sub, rowStatus, rowPayment, chargeAmount, appStatus, applicationJson, holdExpr]
            : [bookingId, workshop_id, user.sub, rowStatus, rowPayment, chargeAmount, appStatus, applicationJson])
        )
        .run();
    }

    // Selection apps + free direct bookings need no payment now.
    if (isSelection) {
      return NextResponse.json({ submitted: true, mode: 'selection', bookingId });
    }
    if (isFreeConfirm) {
      return NextResponse.json({ submitted: true, mode: 'free', bookingId });
    }

    // Direct deposit / paid → create the Stripe checkout. The modal decides
    // whether to redirect immediately (paid) or after a notice popup (deposit).
    const env = await getEnv();
    const siteUrl = env.SITE_URL || 'http://localhost:3000';
    const checkoutUrl = await createWorkshopCheckout({
      workshopTitle: workshop.title,
      amount: chargeAmount,
      bookingId,
      userId: user.sub,
      successUrl: `${siteUrl}/me/bookings?paid=1`,
      cancelUrl: `${siteUrl}/workshops/${workshop_id}?booking=cancelled`,
    });

    return NextResponse.json({
      checkoutUrl,
      bookingId,
      mode: paymentType, // 'deposit' | 'paid'
      amount: chargeAmount,
      holdMinutes: HOLD_MINUTES,
    });
  } catch (error) {
    const err = error as Error;
    if (err.message === 'Unauthorized') {
      return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });
    }
    console.error('Create booking error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 });
  }
}
