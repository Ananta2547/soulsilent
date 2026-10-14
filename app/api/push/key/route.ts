import { NextResponse } from 'next/server';
import { getEnv } from '@/lib/db';
import { vapidKeys } from '@/lib/push';

/** GET /api/push/key — the VAPID public key browsers subscribe with, or 404
 *  when push is not configured on this deployment. Not a secret. */
export async function GET() {
  const env = await getEnv();
  const keys = vapidKeys(env);
  if (!keys) return NextResponse.json({ error: 'not configured' }, { status: 404 });
  return NextResponse.json({ publicKey: keys.publicKey });
}
