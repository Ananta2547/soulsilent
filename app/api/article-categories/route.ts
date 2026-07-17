import { NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';
import type { ArticleCategory } from '@/lib/types';

export async function GET() {
  try {
    const db = await getDB();
    const result = await db
      .prepare('SELECT * FROM article_categories ORDER BY sort_order, key')
      .all<ArticleCategory>();
    return NextResponse.json({ categories: result.results });
  } catch (error) {
    console.error('List categories error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await requireAdmin();
    const body = (await request.json()) as Partial<ArticleCategory>;
    if (!body.key || !body.th || !body.en) {
      return NextResponse.json({ error: 'key, th, en จำเป็น' }, { status: 400 });
    }
    // slugify key — only allow lowercase a-z 0-9 and dash
    const key = body.key.toLowerCase().replace(/[^a-z0-9-]/g, '');
    if (!key) {
      return NextResponse.json({ error: 'key ต้องเป็น a-z 0-9 -' }, { status: 400 });
    }
    const db = await getDB();
    try {
      await db
        .prepare(
          'INSERT INTO article_categories (key, th, en, sort_order) VALUES (?, ?, ?, ?)'
        )
        .bind(key, body.th, body.en, body.sort_order ?? 100)
        .run();
    } catch (e) {
      const msg = (e as Error).message;
      if (/UNIQUE/i.test(msg)) {
        return NextResponse.json({ error: 'key ซ้ำ' }, { status: 409 });
      }
      throw e;
    }
    return NextResponse.json({ ok: true, key }, { status: 201 });
  } catch (error) {
    const err = error as Error;
    if (err.message === 'Unauthorized' || err.message === 'Forbidden') {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 });
  }
}
