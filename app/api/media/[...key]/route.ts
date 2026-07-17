import { getFromR2 } from '@/lib/r2';

/**
 * GET /api/media/[...key]
 *
 * Public media proxy — streams an object out of R2 with its original
 * Content-Type. Used by admin-uploaded workshop/course images so they
 * stay behind our domain (no R2 public bucket needed).
 */
export async function GET(_request: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const { key: keyParts } = await params;
  const key = keyParts.join('/');

  const object = await getFromR2(key);
  if (!object) {
    return new Response('Not Found', { status: 404 });
  }

  const contentType =
    object.httpMetadata?.contentType || 'application/octet-stream';

  return new Response(object.body as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      // Public images — cache aggressively on browsers + CDN
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Content-Length': String(object.size ?? ''),
    },
  });
}
