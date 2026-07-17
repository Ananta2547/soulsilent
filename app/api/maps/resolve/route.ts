import { NextResponse } from 'next/server';

/**
 * GET /api/maps/resolve?url=<short-link>
 *
 * Short links like `maps.app.goo.gl/abc` don't contain coordinates — they
 * just redirect to the real Google Maps page. This proxy follows the
 * redirect server-side (so it isn't blocked by the browser's CORS) and
 * returns the final URL, which the client can then parse with parseMapCoords.
 *
 * Cached at the edge for a day — same short link always points to the same
 * place.
 */
export async function GET(request: Request) {
  const url = new URL(request.url).searchParams.get('url');
  if (!url) {
    return NextResponse.json({ error: 'missing url' }, { status: 400 });
  }

  // Allow only Google Maps short links — no SSRF to arbitrary hosts
  if (!/^https?:\/\/(maps\.app\.goo\.gl|goo\.gl\/maps)/i.test(url)) {
    return NextResponse.json({ error: 'unsupported host' }, { status: 400 });
  }

  try {
    const res = await fetch(url, {
      redirect: 'follow',
      // a real UA — some short-link services return different markup to bots
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; soulsilent-bot/1.0)' },
    });
    return NextResponse.json(
      { finalUrl: res.url },
      { headers: { 'Cache-Control': 'public, max-age=86400' } }
    );
  } catch {
    return NextResponse.json({ error: 'resolve failed' }, { status: 502 });
  }
}
