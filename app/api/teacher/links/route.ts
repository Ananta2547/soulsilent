import { NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { getCurrentUserWithRoles } from '@/lib/auth';
import { hasAnyRole } from '@/lib/roles';
import { canAccessTeacherDashboard } from '@/lib/workshop-utils';

const TAG = /^[\w\-.]{1,40}$/;

function newId() {
  const abc = 'abcdefghijkmnpqrstuvwxyz23456789';
  const b = new Uint8Array(8);
  crypto.getRandomValues(b);
  return [...b].map((x) => abc[x % abc.length]).join('');
}

async function host() {
  const u = await getCurrentUserWithRoles();
  if (!u) return { error: NextResponse.json({ error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 }) };
  if (!hasAnyRole(u.roles, ['teacher'])) return { error: NextResponse.json({ error: 'เฉพาะผู้จัด' }, { status: 403 }) };
  return { u };
}

/** POST /api/teacher/links — a host's own booking link (?ref=<id>), for one
 *  activity page or their profile, optionally tagged with UTM.
 *  { label, target?: 'm:<master id>' | 'w:<workshop id>', utm_source?, utm_medium?, utm_campaign? } */
export async function POST(request: Request) {
  const { u, error } = await host();
  if (error) return error;
  const body = (await request.json()) as { label?: string; target?: string | null; utm_source?: string; utm_medium?: string; utm_campaign?: string };
  const label = (body.label || '').trim().slice(0, 60);
  if (!label) return NextResponse.json({ error: 'ตั้งชื่อลิงก์ เช่น "โพสต์เฟซบุ๊กเดือนนี้"' }, { status: 400 });
  const tags = ['utm_source', 'utm_medium', 'utm_campaign'] as const;
  for (const t of tags) {
    const v = (body[t] || '').trim();
    if (v && !TAG.test(v)) return NextResponse.json({ error: `${t} ใช้ได้เฉพาะตัวอักษรอังกฤษ ตัวเลข และ - _ .` }, { status: 400 });
  }
  const db = await getDB();
  // Where the link opens: one of this host's activities, or (none) their profile.
  const target = body.target || null;
  if (target) {
    const [kind, id] = [target.slice(0, 2), target.slice(2)];
    const rows =
      kind === 'w:' || kind === 'm:'
        ? (
            await db
              .prepare(`SELECT instructor_id, instructor_ids_json, dashboard_access_json FROM workshops WHERE ${kind === 'w:' ? 'id' : 'master_id'} = ?`)
              .bind(id)
              .all<{ instructor_id: string | null; instructor_ids_json: string | null; dashboard_access_json: string | null }>()
          ).results || []
        : [];
    if (!rows.some((w) => canAccessTeacherDashboard(w, u.sub))) return NextResponse.json({ error: 'ไม่พบกิจกรรม' }, { status: 404 });
  }
  const id = newId();
  await db
    .prepare('INSERT INTO host_links (id, host_id, target, label, utm_source, utm_medium, utm_campaign) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(id, u.sub, target, label, body.utm_source?.trim() || null, body.utm_medium?.trim() || null, body.utm_campaign?.trim() || null)
    .run();
  return NextResponse.json({ id });
}

/** PATCH /api/teacher/links — { id, active } turns a link off or on again.
 *  Links are never deleted: bookings already made through them keep the tie. */
export async function PATCH(request: Request) {
  const { u, error } = await host();
  if (error) return error;
  const body = (await request.json()) as { id?: string; active?: boolean };
  if (!body.id) return NextResponse.json({ error: 'missing id' }, { status: 400 });
  const db = await getDB();
  const res = await db.prepare('UPDATE host_links SET active = ? WHERE id = ? AND host_id = ?').bind(body.active ? 1 : 0, body.id, u.sub).run();
  if (!res.meta.changes) return NextResponse.json({ error: 'ไม่พบลิงก์' }, { status: 404 });
  return NextResponse.json({ success: true });
}
