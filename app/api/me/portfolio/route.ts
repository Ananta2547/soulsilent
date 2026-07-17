import { NextResponse } from 'next/server';
import { v4 as uuid } from 'uuid';
import { getDB } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import type { Portfolio } from '@/lib/types';

// GET /api/me/portfolio — fetch (or lazily create) the signed-in user's portfolio.
export async function GET() {
  const payload = await getCurrentUser();
  if (!payload) {
    return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });
  }

  const db = await getDB();
  let portfolio = await db
    .prepare('SELECT * FROM portfolios WHERE user_id = ?')
    .bind(payload.sub)
    .first<Portfolio>();

  if (!portfolio) {
    const id = uuid();
    await db
      .prepare('INSERT INTO portfolios (id, user_id, title) VALUES (?, ?, ?)')
      .bind(id, payload.sub, payload.name || 'My Portfolio')
      .run();
    portfolio = await db
      .prepare('SELECT * FROM portfolios WHERE id = ?')
      .bind(id)
      .first<Portfolio>();
  }

  return NextResponse.json({ portfolio });
}

// PUT /api/me/portfolio — save canvas + settings.
export async function PUT(request: Request) {
  const payload = await getCurrentUser();
  if (!payload) {
    return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });
  }

  const body = (await request.json()) as {
    title?: string;
    bg_color?: string;
    bg_image_url?: string | null;
    canvas_width?: number;
    canvas_height?: number;
    blocks?: unknown;
    doc?: unknown;
    published?: boolean;
  };

  const db = await getDB();

  // Ensure a row exists (mirrors GET's lazy create).
  const existing = await db
    .prepare('SELECT id FROM portfolios WHERE user_id = ?')
    .bind(payload.sub)
    .first<{ id: string }>();
  if (!existing) {
    await db
      .prepare('INSERT INTO portfolios (id, user_id) VALUES (?, ?)')
      .bind(uuid(), payload.sub)
      .run();
  }

  // New Canva-class builder: save the whole document JSON. When `doc` is present
  // we only touch doc_json + published + title (read from the doc), leaving the
  // legacy block columns untouched.
  if (body.doc && typeof body.doc === 'object') {
    const docJson = JSON.stringify(body.doc);
    const docTitle =
      typeof (body.doc as { title?: { th?: string; en?: string } }).title === 'object'
        ? (body.doc as { title?: { th?: string } }).title?.th || 'My Portfolio'
        : 'My Portfolio';
    await db
      .prepare(
        `UPDATE portfolios SET doc_json = ?, title = ?, published = ?, updated_at = datetime('now') WHERE user_id = ?`,
      )
      .bind(docJson, docTitle, body.published ? 1 : 0, payload.sub)
      .run();

    const portfolio = await db
      .prepare('SELECT * FROM portfolios WHERE user_id = ?')
      .bind(payload.sub)
      .first<Portfolio>();
    return NextResponse.json({ portfolio });
  }

  const blocksJson = JSON.stringify(Array.isArray(body.blocks) ? body.blocks : []);
  const height =
    Number.isFinite(body.canvas_height) && (body.canvas_height as number) > 0
      ? Math.round(body.canvas_height as number)
      : 1400;
  const width =
    Number.isFinite(body.canvas_width) && (body.canvas_width as number) > 0
      ? Math.round(body.canvas_width as number)
      : 880;

  await db
    .prepare(
      `UPDATE portfolios SET
         title = ?,
         bg_color = ?,
         bg_image_url = ?,
         canvas_width = ?,
         canvas_height = ?,
         blocks_json = ?,
         published = ?,
         updated_at = datetime('now')
       WHERE user_id = ?`,
    )
    .bind(
      body.title?.trim() || 'My Portfolio',
      body.bg_color || '#ffffff',
      body.bg_image_url ?? null,
      width,
      height,
      blocksJson,
      body.published ? 1 : 0,
      payload.sub,
    )
    .run();

  const portfolio = await db
    .prepare('SELECT * FROM portfolios WHERE user_id = ?')
    .bind(payload.sub)
    .first<Portfolio>();

  return NextResponse.json({ portfolio });
}
