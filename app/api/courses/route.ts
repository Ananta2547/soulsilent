import { NextResponse } from 'next/server';
import { v4 as uuid } from 'uuid';
import { getDB } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';
import type { Course } from '@/lib/types';

export async function GET(request: Request) {
  try {
    const db = await getDB();
    const url = new URL(request.url);
    const status = url.searchParams.get('status');
    const all = url.searchParams.get('all');

    let query = 'SELECT * FROM courses';
    const params: string[] = [];

    if (status) {
      query += ' WHERE status = ?';
      params.push(status);
    } else if (!all) {
      query += " WHERE status = 'published'";
    }

    query += ' ORDER BY created_at DESC';

    const stmt = params.length > 0
      ? db.prepare(query).bind(...params)
      : db.prepare(query);

    const result = await stmt.all<Course>();
    return NextResponse.json({ courses: result.results });
  } catch (error) {
    console.error('Get courses error:', error);
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
      price: number;
      thumbnail_url?: string;
      thumbnail_meta?: import('@/lib/types').ImageMeta | null;
      category?: string;
      level?: string;
      status?: string;
    };
    const db = await getDB();
    const id = uuid();

    await db
      .prepare(
        `INSERT INTO courses (id, title, description, short_description, instructor_id, price, thumbnail_url, thumbnail_meta, category, level, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        id,
        body.title,
        body.description || null,
        body.short_description || null,
        body.instructor_id || null,
        body.price,
        body.thumbnail_url || null,
        body.thumbnail_meta ? JSON.stringify(body.thumbnail_meta) : null,
        body.category || null,
        body.level || 'beginner',
        body.status || 'draft'
      )
      .run();

    return NextResponse.json({ id }, { status: 201 });
  } catch (error: any) {
    if (error.message === 'Unauthorized' || error.message === 'Forbidden') {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 });
  }
}
