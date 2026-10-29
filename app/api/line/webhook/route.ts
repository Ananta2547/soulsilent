import { NextResponse } from 'next/server';
import { getDB, getEnv } from '@/lib/db';
import { verifyLineSignature, type LineEnv } from '@/lib/line';

type LineEvent = { type: string; source?: { type?: string; userId?: string } };

/**
 * POST /api/line/webhook — the Official Account's Messaging API calls this.
 * Only follow / unfollow matter: a member who blocks the account stops
 * getting LINE messages (and gets the app again), and one who adds it back
 * starts again. Everything else is acknowledged and ignored. Requests not
 * signed with our channel secret are refused.
 */
export async function POST(request: Request) {
  const env = (await getEnv()) as LineEnv;
  const raw = await request.text();
  if (!(await verifyLineSignature(env, raw, request.headers.get('x-line-signature')))) {
    return NextResponse.json({ error: 'bad signature' }, { status: 401 });
  }
  let events: LineEvent[] = [];
  try {
    events = ((JSON.parse(raw) as { events?: LineEvent[] }).events || []).filter((e) => e?.source?.userId);
  } catch {
    return NextResponse.json({ ok: true });
  }
  const db = await getDB();
  for (const e of events) {
    if (e.type !== 'follow' && e.type !== 'unfollow') continue;
    await db
      .prepare('UPDATE users SET line_blocked = ? WHERE line_user_id = ?')
      .bind(e.type === 'unfollow' ? 1 : 0, e.source!.userId)
      .run()
      .catch((err) => console.warn('[line] webhook update', err));
  }
  return NextResponse.json({ ok: true });
}
