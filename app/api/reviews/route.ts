import { NextResponse } from 'next/server';
import { v4 as uuid } from 'uuid';
import { getDB } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';
import type { Review } from '@/lib/types';

/**
 * GET /api/reviews — public list of reviews (joined with author + workshop).
 *   ?limit=N  → newest N reviews that HAVE a comment (for the landing wall).
 *   (no limit)→ all reviews (admin management table).
 * Always returns `total` = count of all reviews. No emails are exposed.
 */
export async function GET(request: Request) {
  try {
    const db = await getDB();
    const url = new URL(request.url);
    const limitRaw = url.searchParams.get('limit');
    const limit = limitRaw ? Math.min(50, Math.max(1, parseInt(limitRaw, 10) || 0)) : null;
    const featuredOnly = url.searchParams.get('featured') === '1';

    let sql = `
      SELECT r.id, r.rating, r.comment, r.featured, r.created_at,
             u.name AS user_name,
             w.id AS workshop_id, w.title AS workshop_title, w.master_id AS master_id
      FROM reviews r
      LEFT JOIN users u ON r.user_id = u.id
      LEFT JOIN workshops w ON r.workshop_id = w.id`;
    const where: string[] = [];
    // A limited (public) list only shows reviews that have a comment.
    if (limit) where.push(`r.comment IS NOT NULL AND trim(r.comment) != ''`);
    if (featuredOnly) where.push(`r.featured = 1`);
    if (where.length) sql += ` WHERE ${where.join(' AND ')}`;
    sql += ` ORDER BY r.created_at DESC`;
    if (limit) sql += ` LIMIT ${limit}`;

    const rows = await db.prepare(sql).all();
    const totalRow = await db.prepare('SELECT COUNT(*) AS c FROM reviews').first<{ c: number }>();

    return NextResponse.json({ reviews: rows.results || [], total: totalRow?.c || 0 });
  } catch (error) {
    console.error('List reviews error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 });
  }
}

/** POST /api/reviews — admin creates/updates a review on a user's behalf. */
export async function POST(request: Request) {
  try {
    await requireAdmin();
    const { workshop_id, user_id, rating, comment } = (await request.json()) as {
      workshop_id?: string;
      user_id?: string;
      rating?: number;
      comment?: string;
    };
    const r = Math.round(Number(rating));
    if (!workshop_id || !user_id) {
      return NextResponse.json({ error: 'กรุณาเลือก Workshop และผู้ใช้' }, { status: 400 });
    }
    if (!r || r < 1 || r > 5) {
      return NextResponse.json({ error: 'กรุณาให้คะแนน 1-5 ดาว' }, { status: 400 });
    }

    const db = await getDB();
    const ws = await db.prepare('SELECT id FROM workshops WHERE id = ?').bind(workshop_id).first();
    const us = await db.prepare('SELECT id FROM users WHERE id = ?').bind(user_id).first();
    if (!ws || !us) {
      return NextResponse.json({ error: 'ไม่พบ Workshop หรือผู้ใช้' }, { status: 404 });
    }

    const text = (comment || '').trim() || null;
    await db
      .prepare(
        `INSERT INTO reviews (id, workshop_id, user_id, rating, comment)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(workshop_id, user_id)
         DO UPDATE SET rating = excluded.rating, comment = excluded.comment, updated_at = datetime('now')`
      )
      .bind(uuid(), workshop_id, user_id, r, text)
      .run();

    const review = await db
      .prepare('SELECT * FROM reviews WHERE workshop_id = ? AND user_id = ?')
      .bind(workshop_id, user_id)
      .first<Review>();
    return NextResponse.json({ review }, { status: 201 });
  } catch (error) {
    const err = error as Error;
    if (err.message === 'Unauthorized' || err.message === 'Forbidden') {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    console.error('Create review error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 });
  }
}
