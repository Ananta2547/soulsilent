import { NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { isWorkshopOngoing } from '@/lib/workshop-utils';
import type { Workshop } from '@/lib/types';

/**
 * POST /api/bookings/[id]/consent  { consent: 'granted' | 'denied' }
 *
 * Updates ONLY the PDPA photo/video consent inside the booking's
 * application_json. Allowed only while the workshop is ongoing — from the start
 * until the final day's end (multi-day aware). Everything else stays read-only.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth();
    const { id } = await params;
    const { consent } = (await request.json()) as { consent?: 'granted' | 'denied' };

    if (consent !== 'granted' && consent !== 'denied') {
      return NextResponse.json({ error: 'ค่าความยินยอมไม่ถูกต้อง' }, { status: 400 });
    }

    const db = await getDB();
    const booking = await db
      .prepare('SELECT id, user_id, workshop_id, application_json FROM bookings WHERE id = ?')
      .bind(id)
      .first<{ id: string; user_id: string; workshop_id: string; application_json: string | null }>();

    if (!booking || booking.user_id !== user.sub) {
      return NextResponse.json({ error: 'ไม่พบการจอง' }, { status: 404 });
    }

    const workshop = await db
      .prepare('SELECT * FROM workshops WHERE id = ?')
      .bind(booking.workshop_id)
      .first<Workshop>();
    if (!workshop) {
      return NextResponse.json({ error: 'ไม่พบกิจกรรม' }, { status: 404 });
    }

    // Editable only while the event is happening (start → last-day end).
    if (!isWorkshopOngoing(workshop)) {
      return NextResponse.json(
        { error: 'แก้ไขความยินยอมได้เฉพาะช่วงที่กิจกรรมกำลังดำเนินอยู่เท่านั้น' },
        { status: 403 },
      );
    }

    let app: Record<string, unknown> = {};
    try {
      const parsed = booking.application_json ? JSON.parse(booking.application_json) : {};
      if (parsed && typeof parsed === 'object') app = parsed as Record<string, unknown>;
    } catch {
      app = {};
    }
    app.consent = { photoVideo: consent, label: consent === 'granted' ? 'ยินยอม' : 'ไม่ยินยอม' };

    await db
      .prepare('UPDATE bookings SET application_json = ? WHERE id = ?')
      .bind(JSON.stringify(app), id)
      .run();

    return NextResponse.json({ ok: true, consent });
  } catch (error) {
    const err = error as Error;
    if (err.message === 'Unauthorized') {
      return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });
    }
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 });
  }
}
