import { NextResponse } from 'next/server';
import { v4 as uuid } from 'uuid';
import { getDB } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';
import type { Lesson } from '@/lib/types';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = await getDB();

    const result = await db
      .prepare('SELECT * FROM lessons WHERE course_id = ? ORDER BY sort_order ASC')
      .bind(id)
      .all<Lesson>();

    return NextResponse.json({ lessons: result.results });
  } catch (error) {
    console.error('Get lessons error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const { id: courseId } = await params;
    const body = (await request.json()) as {
      title: string;
      description?: string;
      video_key?: string;
      duration_seconds?: number;
      sort_order?: number;
      is_preview?: boolean;
    };
    const db = await getDB();
    const id = uuid();

    const maxOrder = await db
      .prepare('SELECT MAX(sort_order) as max_order FROM lessons WHERE course_id = ?')
      .bind(courseId)
      .first<{ max_order: number | null }>();

    await db
      .prepare(
        `INSERT INTO lessons (id, course_id, title, description, video_key, duration_seconds, sort_order, is_preview)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        id,
        courseId,
        body.title,
        body.description || null,
        body.video_key || null,
        body.duration_seconds || null,
        body.sort_order ?? (maxOrder?.max_order ?? -1) + 1,
        body.is_preview ? 1 : 0
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
