import { NextResponse } from 'next/server';
import { getEnv } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { lineLoginReady, type LineEnv } from '@/lib/line';

/** GET /api/line/connect — start linking the signed-in member's LINE account
 *  (LINE Login). bot_prompt=aggressive asks them to add the Official Account
 *  as a friend in the same step; without that LINE cannot deliver to them. */
export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(`${origin}/auth/login?redirect=${encodeURIComponent('/me/settings?tab=notify')}`);
  const env = (await getEnv()) as LineEnv;
  if (!lineLoginReady(env)) return NextResponse.redirect(`${origin}/me/settings?tab=notify&line=unavailable`);

  const state = crypto.randomUUID().replace(/-/g, '');
  const url = new URL('https://access.line.me/oauth2/v2.1/authorize');
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', (env.LINE_LOGIN_CHANNEL_ID || '').trim());
  url.searchParams.set('redirect_uri', `${origin}/api/line/callback`);
  url.searchParams.set('state', state);
  url.searchParams.set('scope', 'profile openid');
  url.searchParams.set('bot_prompt', 'aggressive');

  const res = NextResponse.redirect(url.toString());
  // The state comes back on the callback and must match this cookie, which
  // also says whose account is being linked.
  res.cookies.set('line_state', `${state}.${user.sub}`, { httpOnly: true, secure: origin.startsWith('https'), sameSite: 'lax', path: '/api/line', maxAge: 600 });
  return res;
}
