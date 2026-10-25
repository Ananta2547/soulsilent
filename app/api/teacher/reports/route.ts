import { NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { getCurrentUserWithRoles } from '@/lib/auth';
import { hasAnyRole } from '@/lib/roles';
import { computeAnalytics, loadHostData, makeRange } from '@/lib/host-analytics';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
/** What a report may show, in the order it shows them. */
const REPORT_KEYS = ['views', 'participants', 'repeat90', 'fill', 'soldOutDaysBefore', 'csat', 'responseRate', 'rounds', 'ageBand'] as const;

async function host() {
  const u = await getCurrentUserWithRoles();
  if (!u) return { error: NextResponse.json({ error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 }) };
  if (!hasAnyRole(u.roles, ['teacher'])) return { error: NextResponse.json({ error: 'เฉพาะผู้จัด' }, { status: 403 }) };
  return { u };
}

/** GET — this host's reports, newest first. */
export async function GET() {
  const { u, error } = await host();
  if (error) return error;
  const db = await getDB();
  const rows =
    (
      await db
        .prepare(
          `SELECT id, period_from, period_to, activity_title, created_at, expires_at, revoked,
                  CASE WHEN revoked = 0 AND datetime(expires_at) > datetime('now') THEN 1 ELSE 0 END AS live
             FROM host_reports WHERE host_id = ? ORDER BY created_at DESC LIMIT 50`,
        )
        .bind(u.sub)
        .all()
    ).results || [];
  return NextResponse.json({ items: rows });
}

/** POST { from, to, activity?, show: string[], intro?, days? } — snapshot the
 *  figures for that window and return the public id. Figures withheld for
 *  privacy (too few people) are left out even when ticked. */
export async function POST(request: Request) {
  const { u, error } = await host();
  if (error) return error;
  const body = (await request.json()) as { from?: string; to?: string; activity?: string | null; show?: string[]; intro?: string; days?: number };
  if (!body.from || !body.to || !DATE.test(body.from) || !DATE.test(body.to) || body.from > body.to) {
    return NextResponse.json({ error: 'เลือกช่วงเวลาให้ถูกต้อง' }, { status: 400 });
  }
  const show = (body.show || []).filter((k): k is (typeof REPORT_KEYS)[number] => (REPORT_KEYS as readonly string[]).includes(k));
  if (!show.length) return NextResponse.json({ error: 'เลือกตัวเลขอย่างน้อย 1 ตัว' }, { status: 400 });
  const db = await getDB();
  const a = computeAnalytics(await loadHostData(db, u.sub), makeRange(body.from, body.to), body.activity || null);
  const figures: Record<string, unknown> = {};
  for (const k of show) {
    const v = a.report[k];
    if (v != null && v !== 0) figures[k] = v;
  }
  if (!Object.keys(figures).length) return NextResponse.json({ error: 'ตัวเลขที่เลือกยังมีข้อมูลไม่พอในช่วงนี้' }, { status: 400 });
  const me = await db
    .prepare("SELECT COALESCE(NULLIF(TRIM(nickname), ''), name) AS name, avatar_url FROM users WHERE id = ?")
    .bind(u.sub)
    .first<{ name: string; avatar_url: string | null }>();
  figures._host = { name: me?.name || '', avatar: me?.avatar_url || null };
  const activityTitle = body.activity ? a.activityOptions.find((o) => o.key === body.activity)?.title || null : null;
  const b = new Uint8Array(8);
  crypto.getRandomValues(b);
  const id = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  const days = Math.min(365, Math.max(7, Number(body.days) || 180));
  await db
    .prepare(
      `INSERT INTO host_reports (id, host_id, period_from, period_to, activity, activity_title, figures_json, intro, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now', ?))`,
    )
    .bind(id, u.sub, body.from, body.to, body.activity || null, activityTitle, JSON.stringify(figures), (body.intro || '').trim().slice(0, 400) || null, `+${days} days`)
    .run();
  return NextResponse.json({ id });
}

/** PATCH { id } — revoke a report; its link then says so. */
export async function PATCH(request: Request) {
  const { u, error } = await host();
  if (error) return error;
  const body = (await request.json()) as { id?: string };
  const db = await getDB();
  const res = await db.prepare('UPDATE host_reports SET revoked = 1 WHERE id = ? AND host_id = ?').bind(body.id || '', u.sub).run();
  if (!res.meta.changes) return NextResponse.json({ error: 'ไม่พบรายงาน' }, { status: 404 });
  return NextResponse.json({ success: true });
}
