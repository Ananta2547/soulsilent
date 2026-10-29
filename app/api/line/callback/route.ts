import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getDB, getEnv } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { lineLoginReady, type LineEnv } from '@/lib/line';

/**
 * GET /api/line/callback — LINE Login returns here. Exchanges the code for a
 * token, reads the LINE user id, and saves it on the signed-in member
 * (migration 079). One LINE account belongs to one member: linking it here
 * unlinks it anywhere else. Whether they are friends with the Official
 * Account decides line_blocked — LINE only delivers to friends.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = url.origin;
  const back = (r: string) => {
    const res = NextResponse.redirect(`${origin}/me/settings?tab=notify&line=${r}`);
    res.cookies.set('line_state', '', { path: '/api/line', maxAge: 0 });
    return res;
  };

  const jar = await cookies();
  const [state, owner] = (jar.get('line_state')?.value || '').split('.');
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(`${origin}/auth/login?redirect=${encodeURIComponent('/me/settings?tab=notify')}`);
  if (url.searchParams.get('error')) return back('cancelled');
  if (!state || state !== url.searchParams.get('state') || owner !== user.sub) return back('failed');

  const env = (await getEnv()) as LineEnv;
  if (!lineLoginReady(env)) return back('unavailable');
  const code = url.searchParams.get('code');
  if (!code) return back('failed');

  try {
    const tok = await fetch('https://api.line.me/oauth2/v2.1/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: `${origin}/api/line/callback`,
        client_id: (env.LINE_LOGIN_CHANNEL_ID || '').trim(),
        client_secret: (env.LINE_LOGIN_CHANNEL_SECRET || '').trim(),
      }),
    });
    if (!tok.ok) {
      console.warn('[line] token exchange', tok.status, (await tok.text().catch(() => '')).slice(0, 200));
      return back('failed');
    }
    const { access_token } = (await tok.json()) as { access_token?: string };
    if (!access_token) return back('failed');
    const auth = { Authorization: `Bearer ${access_token}` };
    const [profile, friendship] = await Promise.all([
      fetch('https://api.line.me/v2/profile', { headers: auth }).then((r) => (r.ok ? (r.json() as Promise<{ userId?: string }>) : null)),
      fetch('https://api.line.me/friendship/v1/status', { headers: auth }).then((r) => (r.ok ? (r.json() as Promise<{ friendFlag?: boolean }>) : null)),
    ]);
    const lineId = profile?.userId;
    if (!lineId || !/^U[0-9a-f]{32}$/.test(lineId)) return back('failed');
    const friend = friendship?.friendFlag !== false;

    const db = await getDB();
    await db.batch([
      db.prepare('UPDATE users SET line_user_id = NULL, line_linked_at = NULL, line_blocked = 0 WHERE line_user_id = ? AND id != ?').bind(lineId, user.sub),
      db.prepare("UPDATE users SET line_user_id = ?, line_linked_at = datetime('now'), line_blocked = ? WHERE id = ?").bind(lineId, friend ? 0 : 1, user.sub),
    ]);
    return back(friend ? 'linked' : 'notfriend');
  } catch (e) {
    console.error('[line] callback', e);
    return back('failed');
  }
}
