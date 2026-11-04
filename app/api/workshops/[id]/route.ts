import { NextResponse } from 'next/server';
import { seatsOfRowSql } from '@/lib/seats';
import { getDB, getEnv } from '@/lib/db';
import { requireAdmin, getCurrentUser } from '@/lib/auth';
import { expireStaleHolds } from '@/lib/holds';
import {
  hasWorkshopEnded,
  getWorkshopDays,
  parseInstructorIds,
} from '@/lib/workshop-utils';
import { updateWorkshop, type WorkshopBody } from '@/lib/workshop-write';
import type { Workshop, Location, User } from '@/lib/types';
import { publicWorkshop } from '@/lib/workshop-public';

type InstructorPublic = Pick<User, 'id' | 'name' | 'role' | 'avatar_url'> & {
  portfolio_id: string | null;
};

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = await getDB();

    // Auto-cancel expired 10-min holds so counts + the user's booking are current.
    await expireStaleHolds(db);

    const workshop = await db
      .prepare('SELECT * FROM workshops WHERE id = ?')
      .bind(id)
      .first<Workshop>();

    // A draft is unpublished: only an admin may open it.
    const viewer = await getCurrentUser();
    const isAdmin = viewer?.role === 'admin';
    if (!workshop || (workshop.status === 'draft' && !isAdmin)) {
      return NextResponse.json({ error: 'ไม่พบกิจกรรม' }, { status: 404 });
    }

    // Public location fields — explicitly exclude internal_note (admin-only)
    // and owner_id (privacy).
    let location: Location | null = null;
    if (workshop.location_id) {
      location = await db
        .prepare(
          `SELECT id, name, province, district, subdistrict, details, map_url,
                  car_parking, motorcycle_parking, gallery_json, graphic_map_url,
                  created_at, updated_at
           FROM locations WHERE id = ?`
        )
        .bind(workshop.location_id)
        .first<Location>();
    }

    // Public facilitator info (no password_hash, no google_id). A workshop can
    // have several — `instructors` is the full ordered list; `instructor` stays
    // the first one so older clients keep working.
    const instructorIds = parseInstructorIds(workshop);
    let instructors: InstructorPublic[] = [];
    if (instructorIds.length > 0) {
      const placeholders = instructorIds.map(() => '?').join(', ');
      const rows = await db
        .prepare(
          // Display name = nickname (what the teacher edits in their profile)
          // falling back to the registration name — always the latest from users.
          `SELECT u.id, COALESCE(NULLIF(TRIM(u.nickname), ''), u.name) AS name, u.role, u.avatar_url,
                  (SELECT p.id FROM portfolios p
                    WHERE p.user_id = u.id AND p.published = 1 LIMIT 1) AS portfolio_id
             FROM users u WHERE u.id IN (${placeholders})`
        )
        .bind(...instructorIds)
        .all<InstructorPublic>();
      // SQL `IN` loses the order, so re-apply the admin's chosen sequence and
      // silently skip ids whose user has since been deleted.
      const byId = new Map((rows.results || []).map((r) => [r.id, r]));
      instructors = instructorIds
        .map((id) => byId.get(id))
        .filter((r): r is InstructorPublic => !!r);
    }
    const instructor: InstructorPublic | null = instructors[0] || null;

    // Count "taken" seats: paid + holds that haven't expired yet
    const countResult = await db
      .prepare(
        `SELECT COALESCE(SUM(${seatsOfRowSql('bookings', '?')}), 0) as count
         FROM bookings WHERE workshop_id = ?
         AND status != 'cancelled' AND (
           payment_status = 'paid' OR status = 'confirmed'
           OR (payment_status = 'pending' AND expires_at IS NOT NULL
               AND datetime(expires_at) > datetime('now'))
         )`
      )
      .bind(workshop.max_participants, id)
      .first<{ count: number }>();

    // Include the current user's booking — include expires_at so the UI can
    // show a hold-countdown for pending rows.
    let userBooking: {
      id: string;
      status: string;
      payment_status: string;
      expires_at: string | null;
      app_status: string | null;
      application_json: string | null;
      group_size: number | null;
      invite_token: string | null;
      parent_booking_id: string | null;
      group_claimed: number;
    } | null = null;
    const user = viewer;
    if (user) {
      userBooking = await db
        .prepare(
          // Surface a live booking OR a rejected one (which is cancelled) so the
          // page can show the "not selected — can't re-apply" state. Plain
          // abandoned/auto-cancelled holds stay hidden (user may book again).
          `SELECT id, status, payment_status, expires_at, app_status, application_json,
                  group_size, invite_token, parent_booking_id,
                  (SELECT COUNT(*) FROM bookings m WHERE m.parent_booking_id = bookings.id AND m.status != 'cancelled') AS group_claimed
             FROM bookings
           WHERE workshop_id = ? AND user_id = ? AND (status != 'cancelled' OR app_status = 'rejected')
           ORDER BY created_at DESC LIMIT 1`
        )
        .bind(id, user.sub)
        .first<{
          id: string;
          status: string;
          payment_status: string;
          expires_at: string | null;
          app_status: string | null;
          application_json: string | null;
          group_size: number | null;
          invite_token: string | null;
          parent_booking_id: string | null;
          group_claimed: number;
        }>();
    }

    // Review eligibility + the user's existing review (for the review button).
    // "Completed" = secured seat + event ended + checked in for EVERY day. A
    // partial attendance reads as incomplete_days, no check-in as not_registered
    // (mirrors the My Bookings outcome). Only a completed booking may review.
    let userAttended = false;
    let userCompleted = false;
    let userIncompleteReason: 'not_registered' | 'incomplete_days' | null = null;
    let userReview: import('@/lib/types').Review | null = null;
    if (user) {
      const bk = await db
        .prepare(
          `SELECT attended, attendance_json FROM bookings
           WHERE workshop_id = ? AND user_id = ? AND (payment_status = 'paid' OR status = 'confirmed')
           ORDER BY created_at DESC LIMIT 1`
        )
        .bind(id, user.sub)
        .first<{ attended: number | null; attendance_json: string | null }>();
      if (bk) {
        userAttended = bk.attended === 1;
        let present = 0;
        try {
          const m = bk.attendance_json ? JSON.parse(bk.attendance_json) : null;
          if (m && typeof m === 'object') present = Object.values(m).filter((v) => v === 1).length;
        } catch {}
        if (present === 0 && bk.attended === 1) present = 1;
        const totalDays = Math.max(1, getWorkshopDays(workshop).length);
        if (hasWorkshopEnded(workshop)) {
          if (present >= totalDays) userCompleted = true;
          else userIncompleteReason = present <= 0 ? 'not_registered' : 'incomplete_days';
        }
      }
      userReview = await db
        .prepare('SELECT * FROM reviews WHERE workshop_id = ? AND user_id = ?')
        .bind(id, user.sub)
        .first<import('@/lib/types').Review>();
    }

    // A secured seat = paid, or confirmed (free / selection workshops never
    // pay). A pending hold does not count.
    const mayJoinOnline =
      !!userBooking &&
      userBooking.status !== 'cancelled' &&
      (userBooking.payment_status === 'paid' || userBooking.status === 'confirmed');

    return NextResponse.json({
      // The meeting link is only for people holding a secured seat (paid, or
      // confirmed on a free/selection workshop). Everyone else — including
      // signed-out visitors and users with a pending hold — gets it stripped,
      // so the URL never reaches a browser that shouldn't have it.
      // An admin gets the whole row (the edit form loads from here); everyone
      // else the public columns only — see lib/workshop-public.
      workshop: isAdmin
        ? workshop
        : { ...publicWorkshop(workshop), online_url: mayJoinOnline ? workshop.online_url : null },
      // The invite link exists from the moment the group is booked, but is
      // only handed out once the seats are actually paid for.
      groupInvite:
        userBooking && mayJoinOnline && (userBooking.group_size || 1) > 1 && userBooking.invite_token && !userBooking.parent_booking_id
          ? { url: `${(await getEnv()).SITE_URL || 'http://localhost:3000'}/invite/${userBooking.invite_token}`, size: userBooking.group_size, claimed: userBooking.group_claimed }
          : null,
      location,
      instructor,
      instructors,
      bookingCount: countResult?.count || 0,
      userBooking: userBooking ? { ...userBooking, invite_token: undefined } : null,
      userAttended,
      userCompleted,
      userIncompleteReason,
      userReview: userReview || null,
    });
  } catch (error) {
    console.error('Get workshop error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const { id } = await params;
    const body = (await request.json()) as WorkshopBody;
    const db = await getDB();
    await updateWorkshop(db, id, body);

    // Organizer cancelled the event → cascade-cancel every live booking with a
    // remark, so participants see "กิจกรรมมีการเปลี่ยนแปลงกำหนดการ".
    if ((body.status || 'active') === 'cancelled') {
      await db
        .prepare(
          `UPDATE bookings SET status='cancelled',
             cancel_reason=COALESCE(cancel_reason,'workshop_changed')
           WHERE workshop_id=? AND status!='cancelled'`,
        )
        .bind(id)
        .run();
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const err = error as Error;
    if (err.message === 'Unauthorized' || err.message === 'Forbidden') {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 });
  }
}

/** PATCH — lightweight admin toggles (e.g. featured/star). */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const { id } = await params;
    const body = (await request.json()) as { featured?: boolean | number };
    if (body.featured === undefined) {
      return NextResponse.json({ error: 'ไม่มีข้อมูลให้แก้ไข' }, { status: 400 });
    }
    const featured = body.featured ? 1 : 0;
    const db = await getDB();
    const res = await db
      .prepare("UPDATE workshops SET featured = ?, updated_at = datetime('now') WHERE id = ?")
      .bind(featured, id)
      .run();
    if (!res.meta.changes) {
      return NextResponse.json({ error: 'ไม่พบกิจกรรม' }, { status: 404 });
    }
    return NextResponse.json({ ok: true, featured });
  } catch (error) {
    const err = error as Error;
    if (err.message === 'Unauthorized' || err.message === 'Forbidden') {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    console.error('Toggle featured error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const { id } = await params;
    const db = await getDB();

    await db.prepare('DELETE FROM bookings WHERE workshop_id = ?').bind(id).run();
    await db.prepare('DELETE FROM workshops WHERE id = ?').bind(id).run();

    return NextResponse.json({ success: true });
  } catch (error) {
    const err = error as Error;
    if (err.message === 'Unauthorized' || err.message === 'Forbidden') {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 });
  }
}
