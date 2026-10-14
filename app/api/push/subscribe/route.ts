import { NextResponse } from 'next/server';
import { getDB, getEnv } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { parseSubscription, removeSubscription, saveSubscription, sendPushToUser, vapidKeys } from '@/lib/push';

/**
 * POST /api/push/subscribe — save this device's push subscription for the
 * signed-in member (body: PushSubscription.toJSON()). `?test=1` also sends a
 * test notification right away.
 * DELETE /api/push/subscribe — forget a device (body: { endpoint }). No sign-in
 * needed: the endpoint is an unguessable URL only that browser knows, and
 * sign-out calls this after the session is gone.
 */
export async function POST(req: Request) {
  try {
    const me = await getCurrentUser();
    if (!me) return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });
    const env = await getEnv();
    if (!vapidKeys(env)) return NextResponse.json({ error: 'ยังไม่เปิดใช้การแจ้งเตือน' }, { status: 503 });
    const sub = parseSubscription(await req.json().catch(() => null));
    if (!sub) return NextResponse.json({ error: 'ข้อมูลไม่ถูกต้อง' }, { status: 400 });
    const db = await getDB();
    await saveSubscription(db, me.sub, sub, req.headers.get('user-agent'));
    if (new URL(req.url).searchParams.get('test') === '1') {
      await sendPushToUser(db, env, me.sub, {
        title: 'เปิดการแจ้งเตือนแล้ว',
        body: 'เราจะเตือนก่อนวันกิจกรรม และแจ้งเมื่อจองสำเร็จ',
        url: '/me/bookings',
        tag: 'welcome',
      });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Push subscribe error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as { endpoint?: unknown } | null;
    const endpoint = typeof body?.endpoint === 'string' ? body.endpoint : '';
    if (!endpoint.startsWith('https://')) return NextResponse.json({ error: 'ข้อมูลไม่ถูกต้อง' }, { status: 400 });
    await removeSubscription(await getDB(), endpoint);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Push unsubscribe error:', error);
    return NextResponse.json({ ok: true }); // nothing to undo on the device side
  }
}
