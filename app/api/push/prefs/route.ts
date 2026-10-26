import { NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { getCurrentUserWithRoles } from '@/lib/auth';
import { hasAnyRole } from '@/lib/roles';
import { mutedKinds, saveMutedKinds } from '@/lib/push';

/**
 * GET /api/push/prefs — which notification kinds the signed-in member switched
 * off, and whether they run rounds (so the "someone booked your round" switch
 * is shown). PUT { off: string[] } saves the list (push_prefs, migration 066).
 * Moves and cancellations are not switchable and never appear here.
 */
export async function GET() {
  const me = await getCurrentUserWithRoles();
  if (!me) return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });
  const db = await getDB();
  return NextResponse.json({ off: await mutedKinds(db, me.sub), host: hasAnyRole(me.roles, ['teacher', 'session_host']), admin: me.role === 'admin' });
}

export async function PUT(req: Request) {
  const me = await getCurrentUserWithRoles();
  if (!me) return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { off?: unknown };
  if (!Array.isArray(body.off) || !body.off.every((k) => typeof k === 'string')) {
    return NextResponse.json({ error: 'ข้อมูลไม่ถูกต้อง' }, { status: 400 });
  }
  try {
    const db = await getDB();
    return NextResponse.json({ off: await saveMutedKinds(db, me.sub, body.off as string[]) });
  } catch (error) {
    console.error('Push prefs error:', error);
    return NextResponse.json({ error: 'บันทึกไม่สำเร็จ' }, { status: 500 });
  }
}
