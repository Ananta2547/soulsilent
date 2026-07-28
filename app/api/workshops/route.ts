import { NextResponse } from 'next/server';
import { v4 as uuid } from 'uuid';
import { getDB } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';
import type { Workshop } from '@/lib/types';

export async function GET(request: Request) {
  try {
    const db = await getDB();
    const url = new URL(request.url);
    const status = url.searchParams.get('status');
    const category = url.searchParams.get('category');
    const tag = url.searchParams.get('tag');
    const withCounts = url.searchParams.get('counts') === '1';

    // Applicant counts reveal per-workshop demand — admin only.
    if (withCounts) {
      try {
        await requireAdmin();
      } catch {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    const where: string[] = [];
    const params: string[] = [];

    // Public pages show open + closed workshops, never drafts.
    if (url.searchParams.get('public') === '1') {
      where.push("status IN ('active', 'closed')");
    }
    if (status) {
      where.push('status = ?');
      params.push(status);
    }
    // Only admin-starred workshops (homepage Hero fan).
    if (url.searchParams.get('featured') === '1') {
      where.push('featured = 1');
    }
    if (category) {
      where.push('category = ?');
      params.push(category);
    }
    if (tag) {
      // tags_json is a JSON array of strings — match if any element equals the tag
      where.push("EXISTS (SELECT 1 FROM json_each(tags_json) WHERE value = ?)");
      params.push(tag);
    }

    const countSelect = withCounts
      ? ", (SELECT COUNT(*) FROM bookings WHERE bookings.workshop_id = workshops.id AND bookings.status != 'cancelled') AS booking_count"
      : '';
    // Join the linked location so cards can format "name-province, district"
    // without a second round-trip (public read of name/province/district only).
    let query = `SELECT workshops.*, l.name AS loc_name, l.province AS loc_province, l.district AS loc_district${countSelect}
       FROM workshops LEFT JOIN locations l ON workshops.location_id = l.id`;
    if (where.length > 0) query += ' WHERE ' + where.join(' AND ');
    query += ' ORDER BY date DESC';

    const stmt =
      params.length > 0 ? db.prepare(query).bind(...params) : db.prepare(query);
    const result = await stmt.all<Workshop>();
    return NextResponse.json({ workshops: result.results });
  } catch (error) {
    console.error('Get workshops error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await requireAdmin();
    const body = (await request.json()) as {
      title: string;
      description?: string;
      short_description?: string;
      instructor_id?: string;
      workshop_type?: 'one_day' | 'multi_day' | 'multi_part';
      date: string;
      end_date?: string | null;
      dates?: string[];
      time_start: string;
      time_end: string;
      day_times?: import('@/lib/types').DayTime[];
      location?: string;
      location_id?: string;
      schedule?: { label: string; items: { time: string; detail: string }[] }[];
      learn_items?: string[];
      target_items?: string[];
      category?: string;
      tags?: string[];
      promo_price?: number | null;
      promo_start?: string | null;
      promo_end?: string | null;
      map_url?: string;
      theme_color?: string;
      max_participants?: number;
      min_age?: number | null;
      max_age?: number | null;
      price: number;
      image_url?: string;
      image_meta?: import('@/lib/types').ImageMeta | null;
      status?: string;
      admission_type?: string;
      payment_type?: string;
      deposit_amount?: number;
      announce_at?: string | null;
      confirm_main_by?: string | null;
      confirm_waitlist_by?: string | null;
      require_consent?: boolean | number;
      photos_drive_url?: string | null;
      master_id?: string | null;
    };
    const db = await getDB();
    const id = uuid();

    await db
      .prepare(
        `INSERT INTO workshops (
          id, title, description, short_description, instructor_id,
          workshop_type, date, end_date, dates_json,
          time_start, time_end, location, location_id,
          schedule_json, learn_json, target_json, category, tags_json,
          promo_price, promo_start, promo_end, map_url, theme_color,
          max_participants, min_age, max_age, price, image_url, image_meta, status,
          admission_type, payment_type, deposit_amount, announce_at, confirm_main_by, confirm_waitlist_by,
          require_consent, master_id, day_times_json, photos_drive_url
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        id,
        body.title,
        body.description || null,
        body.short_description || null,
        body.instructor_id || null,
        body.workshop_type || 'one_day',
        body.date,
        body.end_date || null,
        JSON.stringify(body.dates || []),
        body.time_start,
        body.time_end,
        body.location || null,
        body.location_id || null,
        JSON.stringify(body.schedule || []),
        JSON.stringify(body.learn_items || []),
        JSON.stringify(body.target_items || []),
        body.category || null,
        JSON.stringify((body.tags || []).filter((t) => t.trim().length > 0)),
        body.promo_price ?? null,
        body.promo_start || null,
        body.promo_end || null,
        body.map_url || null,
        body.theme_color || null,
        body.max_participants || 20,
        body.min_age ?? null,
        body.max_age ?? null,
        body.price,
        body.image_url || null,
        body.image_meta ? JSON.stringify(body.image_meta) : null,
        body.status || 'active',
        body.admission_type || 'direct',
        body.payment_type || 'paid',
        body.deposit_amount || 0,
        body.announce_at || null,
        body.confirm_main_by || null,
        body.confirm_waitlist_by || null,
        body.require_consent ? 1 : 0,
        body.master_id || null,
        JSON.stringify(body.day_times || []),
        body.photos_drive_url || null
      )
      .run();

    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    const err = error as Error;
    if (err.message === 'Unauthorized' || err.message === 'Forbidden') {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    console.error('Create workshop error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 });
  }
}
