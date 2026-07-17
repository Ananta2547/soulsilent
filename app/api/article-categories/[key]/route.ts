import { NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';
import type { ArticleCategory } from '@/lib/types';

export async function PUT(request: Request, { params }: { params: Promise<{ key: string }> }) {
  try {
    await requireAdmin();
    const { key } = await params;
    const body = (await request.json()) as Partial<ArticleCategory>;
    if (!body.th || !body.en) {
      return NextResponse.json({ error: 'th, en จำเป็น' }, { status: 400 });
    }
    const db = await getDB();
    await db
      .prepare('UPDATE article_categories SET th = ?, en = ?, sort_order = ? WHERE key = ?')
      .bind(body.th, body.en, body.sort_order ?? 100, key)
      .run();
    return NextResponse.json({ ok: true });
  } catch (error) {
    const err = error as Error;
    if (err.message === 'Unauthorized' || err.message === 'Forbidden') {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ key: string }> }) {
  try {
    await requireAdmin();
    const { key } = await params;
    const db = await getDB();
    // Block delete if any article still uses this category
    const inUse = await db
      .prepare('SELECT COUNT(*) as count FROM articles WHERE category = ?')
      .bind(key)
      .first<{ count: number }>();
    if ((inUse?.count || 0) > 0) {
      return NextResponse.json(
        { error: `ลบไม่ได้ — มีบทความ ${inUse?.count} ชิ้นที่ใช้หมวดนี้อยู่` },
        { status: 409 }
      );
    }
    await db.prepare('DELETE FROM article_categories WHERE key = ?').bind(key).run();
    return NextResponse.json({ ok: true });
  } catch (error) {
    const err = error as Error;
    if (err.message === 'Unauthorized' || err.message === 'Forbidden') {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 });
  }
}
