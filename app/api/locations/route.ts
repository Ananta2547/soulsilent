import { NextResponse } from 'next/server';
import { v4 as uuid } from 'uuid';
import { getDB } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';
import type { Location } from '@/lib/types';

export async function GET() {
  try {
    const db = await getDB();
    const result = await db
      .prepare('SELECT * FROM locations ORDER BY province, name')
      .all<Location>();
    return NextResponse.json({ locations: result.results });
  } catch (error) {
    console.error('Get locations error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await requireAdmin();
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
    const id = uuid();
    await db
      .prepare(
        `INSERT INTO locations (
           id, name, province, district, subdistrict, address_detail,
           details, map_url, car_parking, motorcycle_parking,
           internal_note, owner_id, gallery_json, graphic_map_url, graphic_map_meta
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        id,
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
          : null
      )
      .run();

    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    const err = error as Error;
    if (err.message === 'Unauthorized' || err.message === 'Forbidden') {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    console.error('Create location error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 });
  }
}
