import { getCloudflareContext } from '@opennextjs/cloudflare';
import { getFromR2 } from '@/lib/r2';
import { getDB } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { canAccessTeacherDashboard } from '@/lib/workshop-utils';

const PRIVATE_PREFIXES = ['images/payout/', 'images/refund/'];

function isPrivateKey(key: string): boolean {
  return PRIVATE_PREFIXES.some((p) => key.startsWith(p));
}

/** Admins see every slip. A payout slip is also open to the hosts of its
 *  workshop, and a refund slip to the person who was refunded. The key is
 *  matched against the stored url and against the meta, which holds the
 *  uncropped original's url. */
async function maySeePrivate(key: string): Promise<boolean> {
  const user = await getCurrentUser();
  if (!user) return false;
  if (user.role === 'admin') return true;
  const url = `/api/media/${key}`;
  const db = await getDB();
  if (key.startsWith('images/payout/')) {
    const rows = await db
      .prepare(
        `SELECT instructor_id, instructor_ids_json, dashboard_access_json FROM workshops
          WHERE payout_slip_url = ?1 OR instr(COALESCE(payout_slip_meta, ''), ?1) > 0`
      )
      .bind(url)
      .all<{ instructor_id: string | null; instructor_ids_json: string | null; dashboard_access_json: string | null }>();
    return (rows.results || []).some((w) => canAccessTeacherDashboard(w, user.sub));
  }
  const row = await db
    .prepare(
      `SELECT 1 AS ok FROM bookings
        WHERE user_id = ?2 AND (refund_slip_url = ?1 OR instr(COALESCE(refund_slip_meta, ''), ?1) > 0)
        LIMIT 1`
    )
    .bind(url, user.sub)
    .first<{ ok: number }>();
  return !!row;
}

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

  // Payout and refund slips are bank transfer receipts: never public, and
  // never put in the shared edge cache (a cache hit would skip this check).
  if (isPrivateKey(key)) {
    if (!(await maySeePrivate(key))) return new Response('Not Found', { status: 404 });
    const object = await getFromR2(key);
    if (!object) return new Response('Not Found', { status: 404 });
    return new Response(object.body as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': object.httpMetadata?.contentType || 'application/octet-stream',
        'Cache-Control': 'private, no-store',
      },
    });
  }

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
