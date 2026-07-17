import { NextResponse } from 'next/server';
import { v4 as uuid } from 'uuid';
import { getDB, getEnv } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { createCourseCheckout } from '@/lib/stripe';
import type { Course } from '@/lib/types';

export async function POST(request: Request) {
  try {
    const user = await requireAuth();
    const { course_id } = (await request.json()) as { course_id: string };
    const db = await getDB();

    const course = await db
      .prepare("SELECT * FROM courses WHERE id = ? AND status = 'published'")
      .bind(course_id)
      .first<Course>();

    if (!course) {
      return NextResponse.json({ error: 'คอร์สนี้ไม่สามารถซื้อได้' }, { status: 400 });
    }

    const existing = await db
      .prepare("SELECT id FROM enrollments WHERE course_id = ? AND user_id = ? AND payment_status = 'paid'")
      .bind(course_id, user.sub)
      .first();

    if (existing) {
      return NextResponse.json({ error: 'คุณซื้อคอร์สนี้แล้ว' }, { status: 400 });
    }

    const enrollmentId = uuid();
    await db
      .prepare(
        'INSERT INTO enrollments (id, course_id, user_id, payment_status, amount) VALUES (?, ?, ?, ?, ?)'
      )
      .bind(enrollmentId, course_id, user.sub, 'pending', course.price)
      .run();

    const env = await getEnv();
    const siteUrl = env.SITE_URL || 'http://localhost:3000';
    const checkoutUrl = await createCourseCheckout({
      courseTitle: course.title,
      amount: course.price,
      enrollmentId,
      userId: user.sub,
      successUrl: `${siteUrl}/allsoullearn/courses/${course_id}/learn?enrolled=success`,
      cancelUrl: `${siteUrl}/allsoullearn/courses/${course_id}?enrolled=cancelled`,
    });

    return NextResponse.json({ checkoutUrl, enrollmentId });
  } catch (error: any) {
    if (error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });
    }
    console.error('Create enrollment error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 });
  }
}
