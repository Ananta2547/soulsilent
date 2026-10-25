import { NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

const VID = /^[0-9a-f-]{36}$/;
const ID = /^[\w-]{1,64}$/;
const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|lighthouse|headless/i;

/** POST /api/track — the counters behind the Host Dashboard (migration 071).
 *  { vid, view?: workshopId, impressions?: workshopId[], ref?: linkId }
 *  `vid` is the browser's random visitor id. Admin traffic and a host looking
 *  at their own page are not counted. Always answers 204 — a counter must
 *  never break the page that sent it. */
export async function POST(request: Request) {
  try {
    if (BOT.test(request.headers.get('user-agent') || '')) return new Response(null, { status: 204 });
    const body = (await request.json()) as { vid?: string; view?: string; impressions?: string[]; ref?: string };
    if (!body.vid || !VID.test(body.vid)) return new Response(null, { status: 204 });
    const user = await getCurrentUser();
    if (user?.role === 'admin') return new Response(null, { status: 204 });
    const db = await getDB();
    const day = "date(datetime('now', '+7 hours'))";
    const stmts: D1PreparedStatement[] = [];

    if (body.view && ID.test(body.view)) {
      const w = await db
        .prepare('SELECT instructor_id, dashboard_access_json FROM workshops WHERE id = ?')
        .bind(body.view)
        .first<{ instructor_id: string | null; dashboard_access_json: string | null }>();
      const own = !!user && !!w && (w.instructor_id === user.sub || (w.dashboard_access_json || '').includes(user.sub));
      if (w && !own) {
        stmts.push(db.prepare(`INSERT OR IGNORE INTO activity_views (day, workshop_id, visitor) VALUES (${day}, ?, ?)`).bind(body.view, body.vid));
      }
    }
    const seen = [...new Set((body.impressions || []).filter((i) => typeof i === 'string' && ID.test(i)))].slice(0, 60);
    for (const id of seen) {
      stmts.push(
        db
          .prepare(
            `INSERT INTO activity_impressions (day, workshop_id, n)
             SELECT ${day}, id, 1 FROM workshops WHERE id = ?
             ON CONFLICT(day, workshop_id) DO UPDATE SET n = n + 1`,
          )
          .bind(id),
      );
    }
    if (body.ref && /^[\w-]{4,24}$/.test(body.ref)) {
      stmts.push(
        db
          .prepare(`INSERT OR IGNORE INTO link_clicks (day, link_id, visitor) SELECT ${day}, id, ? FROM host_links WHERE id = ? AND active = 1`)
          .bind(body.vid, body.ref),
      );
    }
    if (stmts.length) await db.batch(stmts);
  } catch (e) {
    console.error('[track]', e);
  }
  return new Response(null, { status: 204 });
}

export function GET() {
  return NextResponse.json({ error: 'POST only' }, { status: 405 });
}
