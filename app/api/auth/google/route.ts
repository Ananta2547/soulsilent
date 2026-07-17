import { NextResponse } from 'next/server';
import { v4 as uuid } from 'uuid';
import { getDB, getEnv } from '@/lib/db';
import { createToken, setAuthCookie } from '@/lib/auth';
import type { User } from '@/lib/types';

/** True when Google OAuth credentials are absent or still the placeholder. */
function isGoogleConfigured(clientId: string, clientSecret: string): boolean {
  return (
    !!clientId &&
    !!clientSecret &&
    !clientId.startsWith('placeholder') &&
    clientSecret !== 'placeholder'
  );
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const env = await getEnv();
  const siteUrl = env.SITE_URL || 'http://localhost:3000';
  const clientId = env.GOOGLE_CLIENT_ID || '';
  const clientSecret = env.GOOGLE_CLIENT_SECRET || '';
  const redirectUri = `${siteUrl}/auth/callback/google`;
  const fromPath = url.searchParams.get('redirect') || '/';

  // Guard: without real credentials Google returns an "invalid_client" error
  // page. Bounce back to login with a clear message instead.
  if (!isGoogleConfigured(clientId, clientSecret)) {
    return NextResponse.redirect(
      `${siteUrl}/auth/login?error=google_not_configured&redirect=${encodeURIComponent(fromPath)}`,
    );
  }

  const googleAuthUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  googleAuthUrl.searchParams.set('client_id', clientId);
  googleAuthUrl.searchParams.set('redirect_uri', redirectUri);
  googleAuthUrl.searchParams.set('response_type', 'code');
  googleAuthUrl.searchParams.set('scope', 'openid email profile');
  googleAuthUrl.searchParams.set('state', fromPath);

  return NextResponse.redirect(googleAuthUrl.toString());
}

export async function POST(request: Request) {
  try {
    const { code, redirect } = (await request.json()) as { code: string; redirect?: string };
    const env = await getEnv();
    const siteUrl = env.SITE_URL || 'http://localhost:3000';
    const clientId = env.GOOGLE_CLIENT_ID || '';
    const clientSecret = env.GOOGLE_CLIENT_SECRET || '';
    const redirectUri = `${siteUrl}/auth/callback/google`;

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    const tokenData = (await tokenRes.json()) as {
      access_token?: string;
      error?: string;
      error_description?: string;
    };
    if (!tokenData.access_token) {
      console.error('Google token exchange failed:', tokenData.error, tokenData.error_description);
      return NextResponse.json(
        { error: tokenData.error_description || tokenData.error || 'Google auth failed' },
        { status: 400 },
      );
    }

    const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const googleUser = (await userInfoRes.json()) as {
      id: string;
      email: string;
      name: string;
      picture?: string;
    };

    const db = await getDB();

    let user = await db
      .prepare('SELECT * FROM users WHERE google_id = ? OR email = ?')
      .bind(googleUser.id, googleUser.email)
      .first<User>();

    if (!user) {
      const id = uuid();
      await db
        .prepare(
          'INSERT INTO users (id, email, name, role, google_id, avatar_url) VALUES (?, ?, ?, ?, ?, ?)'
        )
        .bind(id, googleUser.email, googleUser.name, 'user', googleUser.id, googleUser.picture)
        .run();
      user = { id, email: googleUser.email, name: googleUser.name, role: 'user' } as User;
    } else if (!user.google_id) {
      await db
        .prepare('UPDATE users SET google_id = ?, avatar_url = COALESCE(avatar_url, ?) WHERE id = ?')
        .bind(googleUser.id, googleUser.picture, user.id)
        .run();
    }

    const token = await createToken({
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    });
    await setAuthCookie(token);

    return NextResponse.json({
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
      redirect: redirect || '/',
    });
  } catch (error) {
    console.error('Google auth error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 });
  }
}
