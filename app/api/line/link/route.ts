import { NextResponse } from 'next/server';
import { getDB, getEnv } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { lineLoginReady, lineMessagingReady, linePush, type LineEnv } from '@/lib/line';

/** GET /api/line/link — is LINE available here, and is this member linked
 *  (and still a friend of the Official Account)? */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });
  const env = (await getEnv()) as LineEnv;
  const available = lineLoginReady(env) && lineMessagingReady(env);
  const db = await getDB();
  const row = await db
    .prepare('SELECT line_user_id, line_linked_at, line_blocked FROM users WHERE id = ?')
    .bind(user.sub)
    .first<{ line_user_id: string | null; line_linked_at: string | null; line_blocked: number | null }>()
    .catch(() => null);
  return NextResponse.json({ available, linked: !!row?.line_user_id, blocked: !!row?.line_blocked, linkedAt: row?.line_linked_at || null });
}

/** POST /api/line/link — send a test message to this member's LINE. */
export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });
  const env = (await getEnv()) as LineEnv;
  const db = await getDB();
  const row = await db.prepare('SELECT line_user_id, line_blocked FROM users WHERE id = ?').bind(user.sub).first<{ line_user_id: string | null; line_blocked: number | null }>();
  if (!row?.line_user_id) return NextResponse.json({ error: 'ยังไม่ได้เชื่อม LINE' }, { status: 400 });
  if (row.line_blocked) return NextResponse.json({ error: 'ยังไม่ได้เพิ่มเพื่อน AllSoulLearn ใน LINE' }, { status: 400 });
  const ok = await linePush(env, row.line_user_id, {
    title: 'เชื่อม LINE สำเร็จ',
    body: 'จากนี้การแจ้งเตือนของ AllSoulLearn จะส่งมาที่นี่',
    url: '/me/settings?tab=notify',
  });
  return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'ส่งไม่สำเร็จ ลองใหม่อีกครั้ง' }, { status: 502 });
}

/** DELETE /api/line/link — unlink; notifications go back to the app. */
export async function DELETE() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });
  const db = await getDB();
  await db.prepare('UPDATE users SET line_user_id = NULL, line_linked_at = NULL, line_blocked = 0 WHERE id = ?').bind(user.sub).run();
  return NextResponse.json({ ok: true });
}
