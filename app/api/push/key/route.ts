import { NextResponse } from 'next/server';
import { getEnv } from '@/lib/db';

/** GET /api/push/key — the VAPID public key browsers subscribe with, or 404
 *  when push is not configured on this deployment. Not a secret. */
export async function GET() {
  const env = await getEnv();
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return NextResponse.json({ error: 'not configured' }, { status: 404 });
  return NextResponse.json({ publicKey: env.VAPID_PUBLIC_KEY });
}
