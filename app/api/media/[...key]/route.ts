import { getCloudflareContext } from '@opennextjs/cloudflare';
import { getFromR2 } from '@/lib/r2';

/**
 * GET /api/media/[...key]
 *
 * Public media proxy — streams an object out of R2 with its original
 * Content-Type. Used by admin-uploaded workshop/course images so they
 * stay behind our domain (no R2 public bucket needed).
 *
 * Every upload gets a fresh uuid key (ImageUploader), so a key never changes
 * what it points at and the response can sit in Cloudflare's edge cache for
 * as long as the browser keeps it. Without that, each card image on every
 * visit is a Worker invocation reading R2 — the slowest part of a page load.
 * (The edge cache is a no-op on *.workers.dev; it applies on the real domain.)
 */
export async function GET(request: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const { key: keyParts } = await params;
  const key = keyParts.join('/');

  const { ctx } = await getCloudflareContext();
  // DOM's CacheStorage type shadows the Workers one, which has `default`.
  const cache = (caches as unknown as { default: Cache }).default;
  const cacheKey = new Request(new URL(request.url).toString(), { method: 'GET' });
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  const object = await getFromR2(key);
  if (!object) {
    return new Response('Not Found', { status: 404 });
  }

  const contentType =
    object.httpMetadata?.contentType || 'application/octet-stream';

  const response = new Response(object.body as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      // Public images — cache aggressively on browsers + CDN
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Content-Length': String(object.size ?? ''),
    },
  });
  ctx.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}
