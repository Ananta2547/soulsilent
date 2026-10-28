import { NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';

/** PUT /api/admin/workshops/[id]/photos { url } — the Google Drive folder of
 *  an activity's photos (one-day or a round), set by admin only. Empty clears
 *  it. Photos are only kept where the booking form asked for PDPA consent. */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const { id } = await params;
    const db = await getDB();
    const w = await db.prepare('SELECT id, require_consent FROM workshops WHERE id = ?').bind(id).first<{ id: string; require_consent: number | null }>();
    if (!w) return NextResponse.json({ error: 'ไม่พบกิจกรรม' }, { status: 404 });
    const body = (await request.json().catch(() => ({}))) as { url?: unknown };
    const url = typeof body.url === 'string' ? body.url.trim() : '';
    if (url && !/^https:\/\/\S+$/i.test(url)) return NextResponse.json({ error: 'ลิงก์ต้องขึ้นต้นด้วย https://' }, { status: 400 });
    if (url && !w.require_consent) {
      return NextResponse.json({ error: 'กิจกรรมนี้ไม่ได้ขอความยินยอมถ่ายภาพ (PDPA) — เปิด PDPA ก่อนจึงใส่ลิงก์รูปได้' }, { status: 400 });
    }
    await db.prepare("UPDATE workshops SET photos_drive_url = ?, updated_at = datetime('now') WHERE id = ?").bind(url || null, id).run();
    return NextResponse.json({ ok: true, photos_drive_url: url || null });
  } catch (error) {
    const msg = (error as Error).message;
    if (msg === 'Unauthorized' || msg === 'Forbidden') return NextResponse.json({ error: msg }, { status: 403 });
    console.error('[admin/photos]', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 });
  }
}
