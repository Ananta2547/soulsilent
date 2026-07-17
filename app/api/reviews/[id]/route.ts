import { NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';

/** PUT /api/reviews/[id] — admin toggles the "featured" (ติดดาว) flag. */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const { id } = await params;
    const { featured } = (await request.json()) as { featured?: boolean | number };
    const db = await getDB();
    await db
      .prepare("UPDATE reviews SET featured = ?, updated_at = datetime('now') WHERE id = ?")
      .bind(featured ? 1 : 0, id)
      .run();
    return NextResponse.json({ success: true, featured: featured ? 1 : 0 });
  } catch (error) {
    const err = error as Error;
    if (err.message === 'Unauthorized' || err.message === 'Forbidden') {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 });
  }
}

/** DELETE /api/reviews/[id] — admin removes any user's review. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const { id } = await params;
    const db = await getDB();
    await db.prepare('DELETE FROM reviews WHERE id = ?').bind(id).run();
    return NextResponse.json({ success: true });
  } catch (error) {
    const err = error as Error;
    if (err.message === 'Unauthorized' || err.message === 'Forbidden') {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 });
  }
}
