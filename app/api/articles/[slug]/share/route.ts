import { NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';
import { articleShareToken } from '@/lib/article-share';

/** GET /api/articles/[slug]/share — admin only: the share link of a draft,
 *  as a path (/articles/<slug>?share=<token>) the page prefixes with its origin. */
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    await requireAdmin();
    const { slug } = await params;
    const db = await getDB();
    const a = await db.prepare('SELECT id, slug FROM articles WHERE slug = ?').bind(slug).first<{ id: string; slug: string }>();
    if (!a) return NextResponse.json({ error: 'not found' }, { status: 404 });
    const token = await articleShareToken(a.id);
    return NextResponse.json({ path: `/articles/${encodeURIComponent(a.slug)}?share=${token}` });
  } catch (error) {
    const err = error as Error;
    if (err.message === 'Unauthorized' || err.message === 'Forbidden') {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    console.error('Article share link error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 });
  }
}
