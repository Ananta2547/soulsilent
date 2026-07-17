import { NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { getCurrentUser, requireAdmin } from '@/lib/auth';
import type { Course } from '@/lib/types';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = await getDB();

    const course = await db
      .prepare('SELECT * FROM courses WHERE id = ?')
      .bind(id)
      .first<Course>();

    if (!course) {
      return NextResponse.json({ error: 'ไม่พบคอร์ส' }, { status: 404 });
    }

    let enrolled = false;
    const user = await getCurrentUser();
    if (user) {
      const enrollment = await db
        .prepare("SELECT id FROM enrollments WHERE course_id = ? AND user_id = ? AND payment_status = 'paid'")
        .bind(id, user.sub)
        .first();
      enrolled = !!enrollment;
    }

    const enrollmentCount = await db
      .prepare("SELECT COUNT(*) as count FROM enrollments WHERE course_id = ? AND payment_status = 'paid'")
      .bind(id)
      .first<{ count: number }>();

    return NextResponse.json({
      course,
      enrolled,
      enrollmentCount: enrollmentCount?.count || 0,
    });
  } catch (error) {
    console.error('Get course error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const { id } = await params;
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

    await db
      .prepare(
        `UPDATE courses SET title = ?, description = ?, short_description = ?, instructor_id = ?,
         price = ?, thumbnail_url = ?, thumbnail_meta = ?, category = ?, level = ?, status = ?, updated_at = datetime('now')
         WHERE id = ?`
      )
      .bind(
        body.title,
        body.description || null,
        body.short_description || null,
        body.instructor_id || null,
        body.price,
        body.thumbnail_url || null,
        body.thumbnail_meta ? JSON.stringify(body.thumbnail_meta) : null,
        body.category || null,
        body.level || 'beginner',
        body.status || 'draft',
        id
      )
      .run();

    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error.message === 'Unauthorized' || error.message === 'Forbidden') {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const { id } = await params;
    const db = await getDB();

    await db.prepare('DELETE FROM lessons WHERE course_id = ?').bind(id).run();
    await db.prepare('DELETE FROM enrollments WHERE course_id = ?').bind(id).run();
    await db.prepare('DELETE FROM courses WHERE id = ?').bind(id).run();

    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error.message === 'Unauthorized' || error.message === 'Forbidden') {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 });
  }
}
