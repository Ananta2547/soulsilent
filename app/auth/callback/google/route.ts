import { NextResponse } from 'next/server';
import { getEnv } from '@/lib/db';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state') || '/';
  const env = await getEnv();
  const siteUrl = env.SITE_URL || 'http://localhost:3000';

  if (!code) {
    return NextResponse.redirect(`${siteUrl}/auth/login?error=google_failed`);
  }

  const html = `<!DOCTYPE html><html><body><script>
    fetch('/api/auth/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: '${code}', redirect: '${state}' })
    })
    .then(r => r.json())
    .then(data => {
      if (data.user) {
        window.location.href = data.redirect || '/';
      } else {
        window.location.href = '/auth/login?error=google_failed';
      }
    })
    .catch(() => window.location.href = '/auth/login?error=google_failed');
  </script></body></html>`;

  return new NextResponse(html, { headers: { 'Content-Type': 'text/html' } });
}
