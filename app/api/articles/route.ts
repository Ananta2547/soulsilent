import { NextResponse } from 'next/server';
import { v4 as uuid } from 'uuid';
import { getDB } from '@/lib/db';
import { requireAdmin, getCurrentUser } from '@/lib/auth';
import type { Article } from '@/lib/types';

export async function GET(request: Request) {
  try {
    const db = await getDB();
    const url = new URL(request.url);
    const all = url.searchParams.get('all') === '1';
    const category = url.searchParams.get('category');

    // Admins can list drafts via ?all=1; everyone else only sees published
    const me = await getCurrentUser();
    const includeDrafts = all && me?.role === 'admin';

    const wheres: string[] = [];
    const params: string[] = [];
    if (!includeDrafts) wheres.push('published = 1');
    if (category && category !== 'all') {
      wheres.push('category = ?');
      params.push(category);
    }

    let query = 'SELECT * FROM articles';
    if (wheres.length) query += ' WHERE ' + wheres.join(' AND ');
    query += ' ORDER BY date DESC';

    const stmt = params.length ? db.prepare(query).bind(...params) : db.prepare(query);
    const result = await stmt.all<Article>();
    return NextResponse.json({ articles: result.results });
  } catch (error) {
    console.error('List articles error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await requireAdmin();
    const body = (await request.json()) as Partial<Article> & {
      tags?: string[];
      body?: unknown[];
    };

    if (!body.title || !body.slug || !body.date) {
      return NextResponse.json({ error: 'title, slug, date จำเป็น' }, { status: 400 });
    }

    const db = await getDB();
    const id = uuid();
    await db
      .prepare(
        `INSERT INTO articles (
           id, slug, category, tags_json, title, excerpt,
           cover_swatch, cover_image_url, cover_image_meta, body_json, author_id,
           read_minutes, featured, published, date
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        id,
        body.slug,
        body.category || 'slow',
        JSON.stringify(body.tags || []),
        body.title,
        body.excerpt || null,
        body.cover_swatch || 'teal',
        body.cover_image_url || null,
        (body as { cover_image_meta?: unknown }).cover_image_meta
          ? JSON.stringify((body as { cover_image_meta?: unknown }).cover_image_meta)
          : null,
        JSON.stringify(body.body || []),
        body.author_id || null,
        body.read_minutes ?? 5,
        body.featured ? 1 : 0,
        body.published == null ? 1 : body.published ? 1 : 0,
        body.date
      )
      .run();
    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    const err = error as Error;
    if (err.message === 'Unauthorized' || err.message === 'Forbidden') {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    if (/UNIQUE/.test(err.message)) {
      return NextResponse.json({ error: 'slug ซ้ำกับบทความอื่น' }, { status: 409 });
    }
    console.error('Create article error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 });
  }
}
