import { NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const { id } = await params;
    const body = (await request.json()) as Partial<{
      name: string;
      province: string;
      district: string;
      subdistrict: string;
      address_detail: string;
      details: string;
      map_url: string;
      car_parking: number;
      motorcycle_parking: number;
      internal_note: string;
      owner_id: string;
      gallery: string[];
      graphic_map_url: string;
    }>;

    if (!body.name || !body.province || !body.district || !body.subdistrict) {
      return NextResponse.json({ error: 'กรอกข้อมูลที่อยู่ให้ครบ' }, { status: 400 });
    }

    const db = await getDB();
    await db
      .prepare(
        `UPDATE locations SET
           name = ?, province = ?, district = ?, subdistrict = ?, address_detail = ?,
           details = ?, map_url = ?, car_parking = ?, motorcycle_parking = ?,
           internal_note = ?, owner_id = ?, gallery_json = ?, graphic_map_url = ?, graphic_map_meta = ?,
           updated_at = datetime('now')
         WHERE id = ?`
      )
      .bind(
        body.name,
        body.province,
        body.district,
        body.subdistrict,
        body.address_detail || null,
        body.details || null,
        body.map_url || null,
        body.car_parking ?? 0,
        body.motorcycle_parking ?? 0,
        body.internal_note || null,
        body.owner_id || null,
        JSON.stringify(body.gallery || []),
        body.graphic_map_url || null,
        (body as { graphic_map_meta?: unknown }).graphic_map_meta
          ? JSON.stringify((body as { graphic_map_meta?: unknown }).graphic_map_meta)
          : null,
        id
      )
      .run();

    return NextResponse.json({ ok: true });
  } catch (error) {
    const err = error as Error;
    if (err.message === 'Unauthorized' || err.message === 'Forbidden') {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    console.error('Update location error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const { id } = await params;
    const db = await getDB();
    await db.prepare('UPDATE workshops SET location_id = NULL WHERE location_id = ?').bind(id).run();
    await db.prepare('DELETE FROM locations WHERE id = ?').bind(id).run();
    return NextResponse.json({ ok: true });
  } catch (error) {
    const err = error as Error;
    if (err.message === 'Unauthorized' || err.message === 'Forbidden') {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    console.error('Delete location error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 });
  }
}
