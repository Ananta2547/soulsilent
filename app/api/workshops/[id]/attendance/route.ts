import { NextResponse } from 'next/server';
import { v4 as uuid } from 'uuid';
import { getDB } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';

/**
 * POST /api/workshops/[id]/attendance
 *
 * Admin adds a participant to a workshop manually (walk-in / missed booking).
 * Creates a secured booking (confirmed + paid, ฿0) so the person shows up in
 * the attendance roster with a "ยังไม่ตรวจ" state the admin can then check in.
 * Body: { user_id }.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const { id: workshopId } = await params;
    const { user_id } = (await request.json()) as { user_id?: string };
    if (!user_id) {
      return NextResponse.json({ error: 'กรุณาเลือกผู้ใช้' }, { status: 400 });
    }
    const db = await getDB();

    const workshop = await db
      .prepare('SELECT id FROM workshops WHERE id = ?')
      .bind(workshopId)
      .first<{ id: string }>();
    if (!workshop) {
      return NextResponse.json({ error: 'ไม่พบ Workshop' }, { status: 404 });
    }

    const target = await db
      .prepare('SELECT id, name, email FROM users WHERE id = ?')
      .bind(user_id)
      .first<{ id: string; name: string | null; email: string | null }>();
    if (!target) {
      return NextResponse.json({ error: 'ไม่พบผู้ใช้' }, { status: 404 });
    }

    // Reuse an existing row: a live (non-cancelled) booking means they're
    // already on the list; a cancelled one gets revived instead of duplicated.
    // Any live booking wins over a newer cancelled one, so a person with
    // both is reported as already listed instead of getting a second row.
    const existing = await db
      .prepare(
        "SELECT id, status FROM bookings WHERE workshop_id = ? AND user_id = ? ORDER BY (status != 'cancelled') DESC, created_at DESC LIMIT 1",
      )
      .bind(workshopId, user_id)
      .first<{ id: string; status: string }>();

    let bookingId: string;
    if (existing && existing.status !== 'cancelled') {
      return NextResponse.json({ error: 'ผู้ใช้นี้อยู่ในรายชื่อแล้ว' }, { status: 409 });
    } else if (existing) {
      bookingId = existing.id;
      await db
        .prepare(
          "UPDATE bookings SET status = 'confirmed', payment_status = 'paid', app_status = 'approved', cancel_reason = NULL, expires_at = NULL WHERE id = ?",
        )
        .bind(bookingId)
        .run();
    } else {
      bookingId = uuid();
      await db
        .prepare(
          `INSERT INTO bookings (id, workshop_id, user_id, status, payment_status, amount, app_status)
           VALUES (?, ?, ?, 'confirmed', 'paid', 0, 'approved')`,
        )
        .bind(bookingId, workshopId, user_id)
        .run();
    }

    // Return the row in the same shape the attendance table consumes.
    const row = await db
      .prepare(
        `SELECT b.id, u.name AS user_name, u.email AS user_email, b.status, b.payment_status,
                b.amount, b.attended, b.application_json, b.attendance_json,
                b.refund_slip_url, b.refund_slip_meta, b.created_at
           FROM bookings b LEFT JOIN users u ON b.user_id = u.id WHERE b.id = ?`,
      )
      .bind(bookingId)
      .first();

    return NextResponse.json({ booking: row });
  } catch (error) {
    const err = error as Error;
    if (err.message === 'Unauthorized' || err.message === 'Forbidden') {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    console.error('Add participant error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 });
  }
}
