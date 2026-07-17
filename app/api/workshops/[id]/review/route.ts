import { NextResponse } from 'next/server';
import { v4 as uuid } from 'uuid';
import { getDB } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { hasWorkshopEnded } from '@/lib/workshop-utils';
import type { Workshop, Review } from '@/lib/types';

/** GET the current user's review for this workshop (or null). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth();
    const { id } = await params;
    const db = await getDB();
    const review = await db
      .prepare('SELECT * FROM reviews WHERE workshop_id = ? AND user_id = ?')
      .bind(id, user.sub)
      .first<Review>();
    return NextResponse.json({ review: review || null });
  } catch (error) {
    const err = error as Error;
    if (err.message === 'Unauthorized') {
      return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });
    }
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 });
  }
}

/**
 * Create the current user's review. Allowed only when the workshop has ended
 * AND the user actually attended (checked in). A review is **one-time and
 * immutable** — once submitted it cannot be edited or re-submitted.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth();
    const { id } = await params;
    const { rating, comment } = (await request.json()) as { rating?: number; comment?: string };

    const r = Math.round(Number(rating));
    if (!r || r < 1 || r > 5) {
      return NextResponse.json({ error: 'กรุณาให้คะแนน 1-5 ดาว' }, { status: 400 });
    }

    const db = await getDB();
    const workshop = await db.prepare('SELECT * FROM workshops WHERE id = ?').bind(id).first<Workshop>();
    if (!workshop) {
      return NextResponse.json({ error: 'ไม่พบ Workshop' }, { status: 404 });
    }
    if (!hasWorkshopEnded(workshop)) {
      return NextResponse.json({ error: 'รีวิวได้หลังกิจกรรมจบเท่านั้น' }, { status: 400 });
    }

    // Must have actually attended (checked in at least one day).
    const attended = await db
      .prepare(
        `SELECT id FROM bookings
         WHERE workshop_id = ? AND user_id = ? AND attended = 1
           AND (payment_status = 'paid' OR status = 'confirmed')
         LIMIT 1`
      )
      .bind(id, user.sub)
      .first<{ id: string }>();
    if (!attended) {
      return NextResponse.json({ error: 'เฉพาะผู้ที่เข้าร่วมกิจกรรมเท่านั้นที่รีวิวได้' }, { status: 403 });
    }

    // One-time review: reject if the user has already reviewed (no editing).
    const existing = await db
      .prepare('SELECT id FROM reviews WHERE workshop_id = ? AND user_id = ?')
      .bind(id, user.sub)
      .first<{ id: string }>();
    if (existing) {
      return NextResponse.json(
        { error: 'คุณได้รีวิวกิจกรรมนี้ไปแล้ว ไม่สามารถแก้ไขได้' },
        { status: 409 }
      );
    }

    const text = (comment || '').trim() || null;
    // Insert only — the UNIQUE(workshop_id, user_id) constraint is the final
    // guard against a duplicate from a race.
    await db
      .prepare(
        `INSERT INTO reviews (id, workshop_id, user_id, rating, comment)
         VALUES (?, ?, ?, ?, ?)`
      )
      .bind(uuid(), id, user.sub, r, text)
      .run();

    const review = await db
      .prepare('SELECT * FROM reviews WHERE workshop_id = ? AND user_id = ?')
      .bind(id, user.sub)
      .first<Review>();
    return NextResponse.json({ review });
  } catch (error) {
    const err = error as Error;
    if (err.message === 'Unauthorized') {
      return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });
    }
    console.error('Review error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 });
  }
}
