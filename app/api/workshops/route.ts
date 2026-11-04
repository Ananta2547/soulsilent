import { NextResponse } from 'next/server';
import { v4 as uuid } from 'uuid';
import { getDB } from '@/lib/db';
import { requireAdmin, getCurrentUser } from '@/lib/auth';
import { publicWorkshop, PUBLIC_STATUSES } from '@/lib/workshop-public';
import { insertWorkshop, type WorkshopBody } from '@/lib/workshop-write';
import type { Workshop } from '@/lib/types';
import { workshopListSql } from '@/lib/home-data';
import { visibleMasterSql } from '@/lib/round-rules';

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

    // Everyone but an admin gets published rows only, minus the private
    // columns (payout, photo folder, meeting link) — see lib/workshop-public.
    const isAdmin = (await getCurrentUser())?.role === 'admin';

    const where: string[] = [];
    const params: string[] = [];
    if (!isAdmin) {
      where.push(`status IN (${PUBLIC_STATUSES.map((s) => `'${s}'`).join(', ')})`);
      // A draft or archived round activity hides its rounds too.
      where.push(visibleMasterSql('m'));
    }

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

    // booking_count is always included so cards can show a "full" state (it's
    // already exposed per-workshop on the public detail page). The `counts=1`
    // admin flag still gates other admin-only concerns but no longer this.
    // The venue is joined so cards can format "name-province, district"
    // without a second round-trip (public read of name/province/district only).
    const query = workshopListSql(where);

    const stmt =
      params.length > 0 ? db.prepare(query).bind(...params) : db.prepare(query);
    const result = await stmt.all<Workshop>();
    const rows = result.results || [];
    return NextResponse.json({ workshops: isAdmin ? rows : rows.map(publicWorkshop) });
  } catch (error) {
    console.error('Get workshops error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await requireAdmin();
    const body = (await request.json()) as WorkshopBody;
    const db = await getDB();
    const id = uuid();
    await insertWorkshop(db, id, body);

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
