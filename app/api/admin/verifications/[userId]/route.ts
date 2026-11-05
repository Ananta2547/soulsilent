import { NextResponse } from 'next/server';
import { getDB, getEnv } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';
import { routeError } from '@/lib/submissions';
import { copyToPayout, setExtraRole, tellHostVerified, type VerificationRow } from '@/lib/host-verification';

/**
 * POST /api/admin/verifications/[userId] { action, note } — admin decides on a
 * host's "ยืนยันข้อมูลเพื่อลงกิจกรรมเอง" form, after phoning them.
 *   approve  self_publisher role added; contact + bank copied to บัญชีผู้จัด
 *   changes  sent back with a note (required); the host fixes and resends
 *   reject   turned down (note optional); the host cannot resend
 * The host hears about it on LINE.
 */
export async function POST(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  try {
    const admin = await requireAdmin();
    const { userId } = await params;
    const { action, note } = (await request.json()) as { action?: string; note?: string };
    const text = (note || '').trim().slice(0, 1000);
    if (action !== 'approve' && action !== 'changes' && action !== 'reject') return NextResponse.json({ error: 'ไม่รู้จักคำสั่ง' }, { status: 400 });
    if (action === 'changes' && !text) return NextResponse.json({ error: 'กรุณาเขียนหมายเหตุว่าต้องแก้อะไร' }, { status: 400 });

    const db = await getDB();
    const row = await db.prepare('SELECT * FROM host_verifications WHERE user_id = ?').bind(userId).first<VerificationRow>();
    if (!row) return NextResponse.json({ error: 'ไม่พบใบยืนยันข้อมูล' }, { status: 404 });

    const status = action === 'approve' ? 'approved' : action === 'changes' ? 'changes_requested' : 'rejected';
    await db
      .prepare("UPDATE host_verifications SET status = ?, review_note = ?, reviewed_at = datetime('now'), reviewed_by = ? WHERE user_id = ?")
      .bind(status, text || null, admin.sub, userId)
      .run();
    if (action === 'approve') {
      await setExtraRole(db, userId, 'self_publisher', true);
      await copyToPayout(db, userId, row, admin.sub);
    }

    const env = (await getEnv()) as unknown as Parameters<typeof tellHostVerified>[1];
    await tellHostVerified(db, env, userId, action, text);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return routeError(e, 'Admin verify host');
  }
}
