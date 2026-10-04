import { NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { requireAdmin, getCurrentUser } from '@/lib/auth';
import type { Article } from '@/lib/types';
import { publishedCode } from '@/lib/article-visibility';

type AuthorJoined = { author_name: string | null; author_email: string | null };

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const db = await getDB();

    const article = await db
      .prepare(
        `SELECT a.*, u.name as author_name, u.email as author_email
         FROM articles a LEFT JOIN users u ON a.author_id = u.id
         WHERE a.slug = ?`
      )
      .bind(slug)
      .first<Article & AuthorJoined>();

    if (!article) {
      return NextResponse.json({ error: 'not found' }, { status: 404 });
    }
    // Public (1) and unlisted (2) open for anyone with the link; private (0)
    // only for admins.
    if (Number(article.published) === 0) {
      const me = await getCurrentUser();
      if (me?.role !== 'admin') {
        return NextResponse.json({ error: 'not found' }, { status: 404 });
      }
    }
    return NextResponse.json({ article });
  } catch (error) {
    console.error('Get article error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    await requireAdmin();
    const { slug } = await params;
    const body = (await request.json()) as Partial<Article> & {
      tags?: string[];
      body?: unknown[];
    };
    if (!body.title || !body.slug || !body.date) {
      return NextResponse.json({ error: 'title, slug, date จำเป็น' }, { status: 400 });
    }
    const db = await getDB();
    await db
      .prepare(
        `UPDATE articles SET
           slug = ?, category = ?, tags_json = ?, title = ?, excerpt = ?,
           cover_swatch = ?, cover_image_url = ?, cover_image_meta = ?, body_json = ?, author_id = ?,
           read_minutes = ?, featured = ?, published = ?, date = ?,
           updated_at = datetime('now')
         WHERE slug = ?`
      )
      .bind(
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
        publishedCode(body.published),
        body.date,
        slug
      )
      .run();
    return NextResponse.json({ ok: true });
  } catch (error) {
    const err = error as Error;
    if (err.message === 'Unauthorized' || err.message === 'Forbidden') {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    console.error('Update article error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 });
  }
}

/** Quick edits from the admin list: share level and the lead star. */
export async function PATCH(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    await requireAdmin();
    const { slug } = await params;
    const body = (await request.json()) as { published?: unknown; featured?: unknown };
    const sets: string[] = [];
    const binds: unknown[] = [];
    if (body.published !== undefined) {
      sets.push('published = ?');
      binds.push(publishedCode(body.published));
    }
    if (body.featured !== undefined) {
      sets.push('featured = ?');
      binds.push(body.featured ? 1 : 0);
    }
    if (!sets.length) return NextResponse.json({ error: 'nothing to update' }, { status: 400 });
    const db = await getDB();
    const r = await db
      .prepare(`UPDATE articles SET ${sets.join(', ')}, updated_at = datetime('now') WHERE slug = ?`)
      .bind(...binds, slug)
      .run();
    if (!r.meta.changes) return NextResponse.json({ error: 'not found' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const err = error as Error;
    if (err.message === 'Unauthorized' || err.message === 'Forbidden') {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    console.error('Patch article error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    await requireAdmin();
    const { slug } = await params;
    const db = await getDB();
    await db.prepare('DELETE FROM articles WHERE slug = ?').bind(slug).run();
    return NextResponse.json({ ok: true });
  } catch (error) {
    const err = error as Error;
    if (err.message === 'Unauthorized' || err.message === 'Forbidden') {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 });
  }
}
