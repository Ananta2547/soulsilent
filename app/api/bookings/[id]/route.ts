import { NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { requireAuth } from '@/lib/auth';

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth();
    const { id } = await params;
    const body = (await request.json()) as {
      status?: string;
      attended?: number | null;
      app_status?: 'applied' | 'approved' | 'waitlisted' | 'rejected';
      waitlist_rank?: number | null;
      refund_slip_url?: string | null;
      refund_slip_meta?: import('@/lib/types').ImageMeta | null;
      /** Per-day check-in: mark day index `attendance_day` present/absent. */
      attendance_day?: number;
      present?: boolean;
      /** Private staff note about this participant. Never sent to the user. */
      facilitator_note?: string | null;
    };
    const db = await getDB();

    // Build dynamic update — admin can change both status and attended
    const sets: string[] = [];
    const args: (string | number | null)[] = [];

    if (typeof body.status === 'string') {
      sets.push('status = ?');
      args.push(body.status);
    }
    if (Object.prototype.hasOwnProperty.call(body, 'facilitator_note')) {
      const note = (body.facilitator_note || '').trim();
      sets.push('facilitator_note = ?');
      args.push(note || null);
    }
    if (Object.prototype.hasOwnProperty.call(body, 'attended')) {
      if (user.role !== 'admin') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      // accept null (clear), 0 (no-show), 1 (attended)
      const v = body.attended;
      sets.push('attended = ?');
      args.push(v === null || v === undefined ? null : v ? 1 : 0);
    }
    // Per-day check-in (multi-day workshops): merge into attendance_json so each
    // day is tracked independently. Present sets day→1; absent removes the key.
    if (typeof body.attendance_day === 'number') {
      if (user.role !== 'admin') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      const row = await db
        .prepare('SELECT attendance_json FROM bookings WHERE id = ?')
        .bind(id)
        .first<{ attendance_json: string | null }>();
      let map: Record<string, number> = {};
      try {
        const parsed = row?.attendance_json ? JSON.parse(row.attendance_json) : {};
        if (parsed && typeof parsed === 'object') map = parsed as Record<string, number>;
      } catch { map = {}; }
      const key = String(body.attendance_day);
      if (body.present) map[key] = 1;
      else delete map[key];
      sets.push('attendance_json = ?');
      args.push(JSON.stringify(map));
      // Keep the single `attended` flag sensible for the calendar/my-bookings:
      // present on any day → attended; otherwise leave it unmarked.
      const anyPresent = Object.values(map).some((v) => v === 1);
      sets.push('attended = ?');
      args.push(anyPresent ? 1 : null);
    }
    // Selection review: admin assigns the application decision. Approved/
    // waitlisted seats stay live (status pending); rejected releases the seat.
    if (typeof body.app_status === 'string') {
      if (user.role !== 'admin') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      sets.push('app_status = ?');
      args.push(body.app_status);
      sets.push('status = ?');
      args.push(body.app_status === 'rejected' ? 'cancelled' : 'pending');
      // Rejected in selection = didn't make the cut → "seat full" remark; a fresh
      // approve/waitlist clears any prior reason.
      sets.push('cancel_reason = ?');
      args.push(body.app_status === 'rejected' ? 'seat_full' : null);
      // Keep a rank only while waitlisted; clear it on a fresh approve so the
      // seat is treated as a round-1 (main) approval.
      sets.push('waitlist_rank = ?');
      args.push(
        body.app_status === 'waitlisted'
          ? (body.waitlist_rank ?? null)
          : null
      );
    } else if (Object.prototype.hasOwnProperty.call(body, 'waitlist_rank') && user.role === 'admin') {
      sets.push('waitlist_rank = ?');
      args.push(body.waitlist_rank ?? null);
    }

    // Admin attaches (or clears) a refund slip for this booking.
    if (Object.prototype.hasOwnProperty.call(body, 'refund_slip_url')) {
      if (user.role !== 'admin') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      sets.push('refund_slip_url = ?');
      args.push(body.refund_slip_url || null);
      sets.push('refund_slip_meta = ?');
      args.push(body.refund_slip_meta ? JSON.stringify(body.refund_slip_meta) : null);

      // Attaching a FULL refund slip (non-deposit workshop) means the booking is
      // being refunded → auto-move it to the user's "ดำเนินการไม่สำเร็จ" tab.
      // Deposit refunds are a normal success (deposit returned on event day) and
      // must NOT change status. Skip if the caller already set status explicitly.
      if (body.refund_slip_url && typeof body.status !== 'string') {
        const info = await db
          .prepare(
            'SELECT w.payment_type AS pt, b.status AS st FROM bookings b JOIN workshops w ON b.workshop_id = w.id WHERE b.id = ?',
          )
          .bind(id)
          .first<{ pt: string | null; st: string }>();
        if (info && (info.pt || 'paid') !== 'deposit' && info.st !== 'cancelled') {
          sets.push('status = ?');
          args.push('cancelled');
          sets.push('cancel_reason = ?');
          args.push('refunded');
        }
      }
    }

    if (sets.length === 0) {
      return NextResponse.json({ error: 'nothing to update' }, { status: 400 });
    }

    // Hard rule: paid bookings can NOT be cancelled — neither by the user
    // nor by themselves through the API. Refunds are out of scope; the seat
    // is sold. (Admin can still flip status via this endpoint for ops needs.)
    if (user.role !== 'admin' && body.status === 'cancelled') {
      const booking = await db
        .prepare('SELECT status, payment_status FROM bookings WHERE id = ? AND user_id = ?')
        .bind(id, user.sub)
        .first<{ status: string; payment_status: string }>();
      if (!booking) {
        return NextResponse.json({ error: 'booking not found' }, { status: 404 });
      }
      if (booking.status === 'cancelled') {
        return NextResponse.json({ error: 'already cancelled' }, { status: 400 });
      }
      if (booking.payment_status === 'paid' || booking.status === 'confirmed') {
        return NextResponse.json(
          { error: 'การจองที่ชำระเงินแล้วยกเลิกไม่ได้' },
          { status: 400 }
        );
      }
      // Only pending holds can be cancelled by the user (basically "abandon")
    }

    if (user.role === 'admin') {
      args.push(id);
      await db.prepare(`UPDATE bookings SET ${sets.join(', ')} WHERE id = ?`).bind(...args).run();
    } else {
      args.push(id, user.sub);
      await db
        .prepare(`UPDATE bookings SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`)
        .bind(...args)
        .run();
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const err = error as Error;
    if (err.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 });
  }
}

/**
 * DELETE /api/bookings/{id} — take a participant off a workshop for good.
 *
 * Admin only, and only for a seat that took no money. Revenue, payouts and the
 * reconcile screens are all read off the booking row itself — there is no
 * separate payments table — so deleting a row that was paid for would erase the
 * money with it. Those are cancelled instead (PUT status), which frees the seat
 * and keeps the books intact.
 */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth();
    if (user.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const { id } = await params;
    const db = await getDB();

    const booking = await db
      .prepare('SELECT id, amount, payment_status FROM bookings WHERE id = ?')
      .bind(id)
      .first<{ id: string; amount: number | null; payment_status: string }>();
    if (!booking) return NextResponse.json({ error: 'ไม่พบการจองนี้' }, { status: 404 });

    if (booking.payment_status === 'paid' && (booking.amount || 0) > 0) {
      return NextResponse.json(
        {
          error: 'ที่นั่งนี้มีการชำระเงินแล้ว ลบถาวรไม่ได้ — ให้ยกเลิกที่นั่งแทน เพื่อเก็บประวัติการเงินไว้',
          paid: true,
        },
        { status: 400 },
      );
    }

    // A handover link points at this booking; leaving it behind would hand the
    // receiver a claim on a seat that no longer exists.
    await db.prepare('DELETE FROM ticket_transfers WHERE booking_id = ?').bind(id).run();
    await db.prepare('DELETE FROM bookings WHERE id = ?').bind(id).run();

    return NextResponse.json({ deleted: true });
  } catch (error) {
    const err = error as Error;
    if (err.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Delete booking error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 });
  }
}
