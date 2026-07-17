import { NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { requireAuth, removeAuthCookie } from '@/lib/auth';

/**
 * User self-deletes their account. This is a soft delete: the account enters
 * `pending_deletion` and can be recovered within 30 days by logging back in.
 * The session is cleared immediately.
 */
export async function POST() {
  try {
    const user = await requireAuth();
    const db = await getDB();
    await db
      .prepare("UPDATE users SET account_status = 'pending_deletion', deleted_at = datetime('now') WHERE id = ?")
      .bind(user.sub)
      .run();
    await removeAuthCookie();
    return NextResponse.json({ success: true });
  } catch (error) {
    const err = error as Error;
    if (err.message === 'Unauthorized') {
      return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });
    }
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 });
  }
}
