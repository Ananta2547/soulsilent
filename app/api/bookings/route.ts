import { NextResponse } from 'next/server';
import { v4 as uuid } from 'uuid';
import { getDB, getEnv } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { getEffectivePrice, hasWorkshopStarted, getWorkshopStatusBadge } from '@/lib/workshop-utils';
import { parseTiers } from '@/lib/pricing';
import { settleSelection, visibleAppStatus, confirmDeadlineFor, type SettleWorkshop } from '@/lib/selection';
import { expireStaleHolds, HOLD_MINUTES } from '@/lib/holds';
import { claimUrl, newTransferToken, partyFromBooking } from '@/lib/transfers';
import type { Workshop } from '@/lib/types';


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

        // Display name = nickname (edited in the profile) falling back to the
        // registration name — the same rule used everywhere else.
        query =
          'SELECT b.*, COALESCE(NULLIF(TRIM(u.nickname), \'\'), u.name) AS user_name, u.email as user_email, w.title as workshop_title FROM bookings b LEFT JOIN users u ON b.user_id = u.id LEFT JOIN workshops w ON b.workshop_id = w.id WHERE b.workshop_id = ? ORDER BY b.created_at DESC';
        bindings = [workshopId];
      } else {
        // Display name = nickname (edited in the profile) falling back to the
        // registration name — the same rule used everywhere else.
        query =
          'SELECT b.*, COALESCE(NULLIF(TRIM(u.nickname), \'\'), u.name) AS user_name, u.email as user_email, w.title as workshop_title FROM bookings b LEFT JOIN users u ON b.user_id = u.id LEFT JOIN workshops w ON b.workshop_id = w.id ORDER BY b.created_at DESC';
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

    // `facilitator_note` is a private staff note about the participant and the
    // queries above use `b.*`, so drop it on every path except the admin
    // all-rows read. Participants must never receive it.
    const staffView = user.role === 'admin' && !mine;

    // For the personal page, attach the user-visible (masked) status + the
    // confirm-by deadline so the UI doesn't need the round logic.
    const rows = (result.results || []).map((b) => {
      if (!staffView) delete b.facilitator_note;
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
    const { workshop_id, application, gift, booking_kind, tier_id } = (await request.json()) as {
      workshop_id: string;
      application?: unknown;
      /** Buying the seat for someone else — who it is meant for. The buyer
       *  fills no application; the receiver does, when they claim the link. */
      gift?: { name?: string; phone?: string };
      /** Session-based activities: 'private' takes the whole round (migration 051). */
      booking_kind?: 'group' | 'private';
      /** Which of the master's price tiers was picked (lib/pricing); 'seat'
       *  or absent = the round's own per-seat price. */
      tier_id?: string;
    };
    let isPrivate = booking_kind === 'private';
    let tierLabel: string | null = null;
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
    // must not take joiners once it is under way — and, for selection, once
    // the results are announced. Same rule as the public "ปิดรับ" badge, but
    // judged on the server clock: a device clock wound back changes nothing.
    if (!getWorkshopStatusBadge(workshop).open) {
      return NextResponse.json(
        {
          error: hasWorkshopStarted(workshop)
            ? 'กิจกรรมเริ่มแล้ว ไม่สามารถสมัครได้'
            : 'ปิดรับสมัครแล้ว ไม่สามารถสมัครได้',
        },
        { status: 400 },
      );
    }

    // Age restriction (defense-in-depth — the BookingModal also blocks this).
    // DOB now lives in the autofill vault (vault_json.dob); fall back to the
    // legacy users.date_of_birth column.
    // A gift is age-checked against the RECEIVER when they claim it, not
    // against the buyer, who is not the one attending.
    if (!gift && (workshop.min_age != null || workshop.max_age != null)) {
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
    // A private booking took the whole round, so the round is full whatever
    // max_participants says; and private itself is only possible while the
    // round is still empty.
    let privatePrice: number | null = null;
    // A named tier sets the price, and whether it buys a seat or the round.
    let tierPrice: number | null = null;
    if (tier_id && tier_id !== 'seat') {
      if (!workshop.master_id) return NextResponse.json({ error: 'ราคานี้ใช้กับกิจกรรมนี้ไม่ได้' }, { status: 400 });
      const m = await db
        .prepare('SELECT price_group, price_tiers_json FROM workshop_masters WHERE id = ?')
        .bind(workshop.master_id)
        .first<{ price_group: number | null; price_tiers_json: string | null }>();
      const tier = m ? parseTiers(m.price_tiers_json).find((t) => t.id === tier_id) : undefined;
      if (!tier) return NextResponse.json({ error: 'ไม่พบราคาที่เลือก' }, { status: 400 });
      tierPrice = tier.price;
      tierLabel = tier.label;
      isPrivate = tier.mode === 'round';
    }
    if (!isSelection) {
      const countResult = await db
        .prepare(
          `SELECT COUNT(*) AS count,
                  COALESCE(SUM(CASE WHEN booking_kind = 'private' THEN 1 ELSE 0 END), 0) AS priv
             FROM bookings WHERE workshop_id = ? AND user_id != ? AND ${SEAT_TAKEN_SQL}`
        )
        .bind(workshop_id, user.sub)
        .first<{ count: number; priv: number }>();
      const taken = countResult?.count || 0;

      if ((countResult?.priv || 0) > 0 || taken >= workshop.max_participants) {
        return NextResponse.json({ error: 'ที่นั่งเต็มแล้ว' }, { status: 400 });
      }
      if (isPrivate) {
        // Whole-round buys come only through a round-mode tier.
        if (tierPrice == null) {
          return NextResponse.json({ error: 'กิจกรรมนี้ไม่เปิดจองแบบเหมาทั้งรอบ' }, { status: 400 });
        }
        if (taken > 0) {
          return NextResponse.json({ error: 'รอบนี้มีผู้จองแล้ว จึงเหมาทั้งรอบไม่ได้' }, { status: 400 });
        }
        privatePrice = tierPrice;
      }
    }

    // ---- Gift: the buyer pays, someone else attends -------------------
    //
    // Deliberately outside the "one live booking per user" logic below: the
    // buyer is not the participant, so a gift neither recycles nor blocks a
    // seat they hold themselves. The row starts owned by the buyer (they are
    // the one who pays for it) and changes hands when the receiver claims the
    // link.
    if (gift) {
      const toName = (gift.name || '').trim();
      const toPhone = (gift.phone || '').trim();
      if (!toName || !toPhone) {
        return NextResponse.json({ error: 'กรุณากรอกชื่อและเบอร์โทรศัพท์ผู้รับ' }, { status: 400 });
      }
      if (isSelection) {
        return NextResponse.json(
          { error: 'กิจกรรมนี้รับสมัครแบบคัดเลือก ยังไม่รองรับการส่งเป็นของขวัญ' },
          { status: 400 },
        );
      }

      const giftPrice = getEffectivePrice(workshop).price;
      const giftAmount =
        paymentType === 'free' ? 0 : paymentType === 'deposit' ? workshop.deposit_amount || 0 : giftPrice;
      // Nothing to pay, nothing to give: the receiver can take the seat
      // themselves in the same two taps, and a "gift" that costs the buyer
      // nothing only takes a seat out of circulation while it waits to be
      // claimed.
      if (paymentType === 'free' || giftAmount <= 0) {
        return NextResponse.json(
          { error: 'กิจกรรมนี้เข้าร่วมฟรี จองเองได้เลย ไม่ต้องส่งเป็นของขวัญ' },
          { status: 400 },
        );
      }
      const bookingId = uuid();
      await db
        .prepare(
          `INSERT INTO bookings (id, workshop_id, user_id, status, payment_status, amount, app_status, application_json, expires_at)
           VALUES (?, ?, ?, 'pending', 'pending', ?, 'approved', NULL, datetime('now', ?))`,
        )
        .bind(bookingId, workshop_id, user.sub, giftAmount, `+${HOLD_MINUTES} minutes`)
        .run();

      const buyer = await db
        .prepare('SELECT name, phone, vault_json FROM users WHERE id = ?')
        .bind(user.sub)
        .first<{ name: string | null; phone: string | null; vault_json: string | null }>();
      const from = partyFromBooking(null, buyer || {});
      const token = newTransferToken();
      await db
        .prepare(
          `INSERT INTO ticket_transfers
             (id, booking_id, workshop_id, kind, token, status, from_user_id, from_name, from_phone, to_name, to_phone)
           VALUES (?, ?, ?, 'gift', ?, 'pending', ?, ?, ?, ?, ?)`,
        )
        .bind(uuid(), bookingId, workshop_id, token, user.sub, from.name, from.phone, toName, toPhone)
        .run();

      const giftEnv = await getEnv();
      const giftSite = giftEnv.SITE_URL || 'http://localhost:3000';
      return NextResponse.json({
        bookingId,
        gift: true,
        mode: paymentType,
        amount: giftAmount,
        claimUrl: claimUrl(giftSite, token),
        checkoutUrl: `${giftSite}/pay/${bookingId}`,
        holdMinutes: HOLD_MINUTES,
      });
    }

    // Look up this user's existing booking for this workshop. We treat rows as:
    //   - PAID   → block, already booked
    //   - LIVE PENDING (expires_at > now) → recycle id + refresh hold window
    //   - EXPIRED PENDING → ignore, create a fresh booking with a new hold
    const existing = await db
      .prepare(
        `SELECT id, status, payment_status, expires_at, beam_payment_link_id FROM bookings
         WHERE workshop_id = ? AND user_id = ? AND status != 'cancelled'
         ORDER BY created_at DESC LIMIT 1`
      )
      .bind(workshop_id, user.sub)
      .first<{
        id: string;
        status: string;
        payment_status: string;
        expires_at: string | null;
        beam_payment_link_id: string | null;
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
    //   private → the master's whole-round price, promo-free
    const fullPrice = privatePrice != null ? privatePrice : tierPrice != null ? tierPrice : getEffectivePrice(workshop).price;
    const chargeAmount =
      paymentType === 'free' ? 0 : paymentType === 'deposit' ? workshop.deposit_amount || 0 : fullPrice;
    const kindValue = isPrivate ? 'private' : 'group';

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
             application_json = COALESCE(?, application_json), booking_kind = ?, booking_tier_label = ?,
             expires_at = ${holdExpr ? "datetime('now', ?)" : 'NULL'}
           WHERE id = ?`
        )
        .bind(
          ...(holdExpr
            ? [rowStatus, rowPayment, chargeAmount, appStatus, applicationJson, kindValue, tierLabel, holdExpr, bookingId]
            : [rowStatus, rowPayment, chargeAmount, appStatus, applicationJson, kindValue, tierLabel, bookingId])
        )
        .run();
    } else {
      bookingId = uuid();
      await db
        .prepare(
          `INSERT INTO bookings (id, workshop_id, user_id, status, payment_status, amount, app_status, application_json, booking_kind, booking_tier_label, expires_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ${holdExpr ? "datetime('now', ?)" : 'NULL'})`
        )
        .bind(
          ...(holdExpr
            ? [bookingId, workshop_id, user.sub, rowStatus, rowPayment, chargeAmount, appStatus, applicationJson, kindValue, tierLabel, holdExpr]
            : [bookingId, workshop_id, user.sub, rowStatus, rowPayment, chargeAmount, appStatus, applicationJson, kindValue, tierLabel])
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

    // Direct deposit / paid → send them to OUR payment page, not Beam's.
    //
    // Beam's hosted page mints a fresh PromptPay QR every time the shopper flips
    // payment method and back, each one payable and each on its own 30-minute
    // clock — one booking, several live QR images, and a seat that gets paid for
    // twice. /pay/{id} shows a single stored QR and has no switcher, so it
    // cannot happen; the card lane is a button there.
    //
    // Nothing is created at Beam here. The QR is minted by /api/bookings/{id}/qr
    // when the page actually opens, so a booking nobody follows through on costs
    // no charge at all.
    const env = await getEnv();
    const siteUrl = env.SITE_URL || 'http://localhost:3000';

    return NextResponse.json({
      checkoutUrl: `${siteUrl}/pay/${bookingId}`,
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
