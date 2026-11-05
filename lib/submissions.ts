/**
 * Hosts submitting their own activities for admin approval (migration 080).
 * A single activity is a workshops row (master_id NULL), a round activity a
 * workshop_masters row with kind 'round'. Until approved they stay hidden the
 * way drafts already are: workshops.status 'draft', masters.activity_status
 * 'draft'. Once approved, text and pictures change straight away, but a price
 * or date change waits in pending_json for admin while the live row keeps the
 * old values.
 */
import { NextResponse } from 'next/server';
import { safeParseArray } from '@/lib/workshop-utils';
import { ONLINE_VENUE } from '@/lib/online-platform';
import { sendPushToUser, subscribedUsers } from '@/lib/push';
import type { WorkshopBody } from '@/lib/workshop-write';
import type { MasterBody } from '@/lib/master-write';
import type { DayTime, Workshop, WorkshopMaster } from '@/lib/types';

import type { SubKind } from '@/lib/submission-labels';
import { FIELD_LABEL } from '@/lib/submission-labels';
export { FIELD_LABEL, GATED_LABEL, REVIEW_LABEL, type ReviewStatus, type SubKind } from '@/lib/submission-labels';

/**
 * What a host may set on their single activity. Who runs it, the co-host
 * list, the photo folder and the status stay as admin left them (a new one
 * is the host alone, as a draft); it never joins a round activity.
 */
export function hostWorkshopBody(data: WorkshopBody, me: string, existing: WorkshopBody | null): WorkshopBody {
  return {
    ...data,
    instructor_id: undefined,
    instructor_ids: existing?.instructor_ids?.length ? existing.instructor_ids : [me],
    dashboard_access: existing?.dashboard_access || [],
    master_id: null,
    photos_drive_url: existing?.photos_drive_url || null,
    status: existing?.status || 'draft',
  };
}

/** What a host may set on their round activity: they organise it, and its
 *  status stays as it is (a new one waits as a draft). */
export function hostMasterBody(data: MasterBody, me: string, existing: MasterBody | null): MasterBody {
  return { ...data, organizer: me, kind: 'round', activity_status: existing?.activity_status || 'draft' };
}

/**
 * A host picks venues from admin's list only (or online): a single activity's
 * location text is rebuilt from its location row, a round activity keeps only
 * ids that exist. A venue that is not on the list is dropped.
 */
export async function lockVenue<B extends WorkshopBody | MasterBody>(db: D1Database, kind: SubKind, body: B): Promise<B> {
  if (kind === 'single') {
    const b = body as WorkshopBody;
    if (b.is_online) return { ...body, location_id: '', location: '' };
    const loc = b.location_id
      ? await db.prepare('SELECT name, subdistrict, district, province FROM locations WHERE id = ?').bind(b.location_id).first<{ name: string; subdistrict: string; district: string; province: string }>()
      : null;
    return { ...body, location_id: loc ? b.location_id : '', location: loc ? `${loc.name}, ${loc.subdistrict}, ${loc.district}, ${loc.province}` : '' };
  }
  const ids = ((body as MasterBody).location_ids || []).filter((x): x is string => typeof x === 'string');
  if (!ids.length) return body;
  const known = new Set(
    ((await db.prepare(`SELECT id FROM locations WHERE id IN (${ids.map(() => '?').join(',')})`).bind(...ids).all<{ id: string }>()).results || []).map((r) => r.id),
  );
  return { ...body, location_ids: ids.filter((x) => x === ONLINE_VENUE || known.has(x)) };
}

/** Live on the site already (approved once), so edits split into now / waiting. */
export const isLive = (kind: SubKind, row: { status?: string | null; activity_status?: string | null }) =>
  kind === 'single' ? row.status !== 'draft' : row.activity_status !== 'draft';

/** The usual auth / unexpected-error answers for these routes. */
export function routeError(e: unknown, what: string) {
  const msg = (e as Error)?.message;
  if (msg === 'Unauthorized') return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });
  if (msg === 'Forbidden') return NextResponse.json({ error: 'เฉพาะผู้จัดกิจกรรม' }, { status: 403 });
  console.error(`[submissions] ${what}`, e);
  return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 });
}
/** Fields whose change on an approved activity waits for admin. */
const SINGLE_GATED = ['price', 'promo_price', 'promo_start', 'promo_end', 'payment_type', 'deposit_amount', 'workshop_type', 'date', 'end_date', 'dates', 'time_start', 'time_end', 'day_times'] as const;
// price_group is worked out from the tiers, so the tiers stand for it.
const MASTER_GATED = ['price_private', 'price_group_booking', 'price_tiers'] as const;

/** A workshops row as the form's body, so it can be compared and re-saved. */
export function bodyFromWorkshop(w: Workshop): WorkshopBody {
  const ids = safeParseArray<string>(w.instructor_ids_json, []);
  const x = w as Workshop & { dashboard_access_json?: string | null; online_url?: string | null; photos_drive_url?: string | null; image_meta?: string | null };
  return {
    title: w.title,
    description: w.description || '',
    short_description: w.short_description || '',
    instructor_ids: ids.length ? ids : w.instructor_id ? [w.instructor_id] : [],
    dashboard_access: safeParseArray<string>(x.dashboard_access_json, []),
    workshop_type: (w.workshop_type || 'one_day') as WorkshopBody['workshop_type'],
    date: w.date,
    end_date: w.end_date || null,
    dates: safeParseArray<string>(w.dates_json, []),
    time_start: w.time_start,
    time_end: w.time_end,
    day_times: safeParseArray<DayTime>(w.day_times_json, []),
    location: w.location || '',
    location_id: w.location_id || '',
    is_online: w.is_online ? 1 : 0,
    online_platform: w.online_platform || null,
    online_platform_other: w.online_platform_other || null,
    online_url: x.online_url || null,
    schedule: safeParseArray(w.schedule_json, []),
    learn_items: safeParseArray<string>(w.learn_json, []),
    target_items: safeParseArray<string>(w.target_json, []),
    category: w.category || '',
    tags: safeParseArray<string>(w.tags_json, []),
    promo_price: w.promo_price ?? null,
    promo_start: w.promo_start || null,
    promo_end: w.promo_end || null,
    map_url: w.map_url || '',
    theme_color: w.theme_color || '',
    max_participants: w.max_participants,
    min_age: w.min_age ?? null,
    max_age: w.max_age ?? null,
    price: w.price,
    image_url: w.image_url || '',
    image_meta: x.image_meta ? JSON.parse(x.image_meta) : null,
    status: w.status,
    admission_type: w.admission_type || 'direct',
    payment_type: w.payment_type || 'paid',
    deposit_amount: w.deposit_amount || 0,
    announce_at: w.announce_at || null,
    close_at: w.close_at || null,
    confirm_main_by: w.confirm_main_by || null,
    confirm_waitlist_by: w.confirm_waitlist_by || null,
    require_consent: w.require_consent ? 1 : 0,
    photos_drive_url: x.photos_drive_url || null,
    master_id: w.master_id || null,
  };
}

/** A workshop_masters row as the form's body. */
export function bodyFromMaster(m: WorkshopMaster): MasterBody {
  return {
    title: m.title,
    description: m.description || '',
    organizer: m.organizer || '',
    cover_image_url: m.cover_image_url || null,
    cover_image_meta: m.cover_image_meta ? JSON.parse(m.cover_image_meta) : null,
    target: safeParseArray<string>(m.target_json, []),
    takeaways: safeParseArray<string>(m.takeaways_json, []),
    price_group: m.price_group ?? null,
    price_private: m.price_private ?? null,
    default_max_participants: m.default_max_participants ?? 20,
    kind: m.kind,
    location_ids: safeParseArray<string>(m.location_ids_json, []),
    price_group_booking: m.price_group_booking ?? null,
    price_tiers: safeParseArray(m.price_tiers_json, []),
    activity_status: m.activity_status || 'open',
    age_min: m.age_min ?? null,
    age_max: m.age_max ?? null,
    close_days_before: m.close_days_before ?? null,
    close_time: m.close_time ?? null,
  };
}

/** "Nothing" in its many spellings (missing, null, '', [], a 0 deposit) compares equal. */
const blank = (k: string, v: unknown) =>
  v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0) || (k === 'deposit_amount' && Number(v) === 0) ? null : v;
const same = (k: string, a: unknown, b: unknown) => JSON.stringify(blank(k, a)) === JSON.stringify(blank(k, b));

/**
 * Split an edit to an approved activity: the body to save now (gated fields
 * keep their live values) and the gated changes that wait for admin.
 */
export function splitGated<B extends object>(kind: SubKind, live: B, next: B, alreadyPending: Partial<B> | null) {
  const keys = (kind === 'single' ? SINGLE_GATED : MASTER_GATED) as readonly string[];
  const save = { ...next } as Record<string, unknown>;
  const pending: Record<string, unknown> = { ...(alreadyPending || {}) };
  for (const k of keys) {
    const want = (next as Record<string, unknown>)[k];
    const now = (live as Record<string, unknown>)[k];
    save[k] = now;
    if (same(k, want, now)) delete pending[k];
    else pending[k] = want;
  }
  return { save: save as B, pending: Object.keys(pending).length ? (pending as Partial<B>) : null };
}

/** Fields that only follow another one (the picture's crop, the venue's text)
 *  or that the host cannot set, left out when telling admin what changed. */
const NOT_NEWS = new Set(['image_meta', 'cover_image_meta', 'location', 'online_platform_other', 'status', 'activity_status', 'organizer', 'kind', 'instructor_ids', 'instructor_id', 'dashboard_access', 'master_id', 'photos_drive_url', 'price_group']);

/** Labels of the text / picture fields that differ between live and next
 *  (gated price and date fields are left to splitGated). */
export function textChanges(kind: SubKind, live: object, next: object): string[] {
  const gated = new Set<string>(kind === 'single' ? SINGLE_GATED : MASTER_GATED);
  const out = new Set<string>();
  for (const k of Object.keys(next)) {
    if (gated.has(k) || NOT_NEWS.has(k)) continue;
    if (!same(k, (next as Record<string, unknown>)[k], (live as Record<string, unknown>)[k])) out.add(FIELD_LABEL[k] || 'ข้อมูลอื่น');
  }
  return [...out];
}

/** Make sure a host who submits a round activity can open its rounds. */
export async function grantSessionHost(db: D1Database, userId: string): Promise<void> {
  const u = await db.prepare('SELECT role, roles_json FROM users WHERE id = ?').bind(userId).first<{ role: string; roles_json: string | null }>();
  if (!u || u.role === 'admin') return;
  const roles = safeParseArray<string>(u.roles_json, []);
  if (roles.includes('session_host')) return;
  const next = [...new Set([...(roles.length ? roles : [u.role]), 'teacher', 'session_host'])];
  await db.prepare('UPDATE users SET roles_json = ? WHERE id = ?').bind(JSON.stringify(next), userId).run();
}

type Env = Parameters<typeof sendPushToUser>[1];

/** LINE to every admin: a host sent an activity (or a price/date edit) to check. */
export async function tellAdminsSubmitted(
  db: D1Database,
  env: Env,
  s: { kind: SubKind; id: string; title: string; host: string; edit: boolean; changed?: string[] },
): Promise<void> {
  try {
    const admins = ((await db.prepare("SELECT id FROM users WHERE role = 'admin' AND deleted_at IS NULL").all<{ id: string }>()).results || []).map((a) => a.id);
    const reach = await subscribedUsers(db, admins);
    const url = `/admin/submissions?focus=${encodeURIComponent(`sub:${s.kind}:${s.id}`)}`;
    const title = s.edit ? `ขอแก้ราคา/วันเวลา: ${s.title}` : `กิจกรรมใหม่รออนุมัติ: ${s.title}`;
    for (const id of admins.filter((a) => reach.has(a))) {
      await sendPushToUser(
        db,
        env,
        id,
        {
          title,
          body: `${s.host} · ${s.kind === 'round' ? 'กิจกรรมจองรอบ' : 'กิจกรรมเดี่ยว'}`,
          url,
          card: {
            topic: 'admin',
            band: { text: s.edit ? 'ADMIN · ขอแก้กิจกรรม' : 'ADMIN · รออนุมัติ', dot: '#f5c243' },
            title,
            rows: [
              { k: 'ผู้จัด', v: s.host },
              { k: 'แบบ', v: s.kind === 'round' ? 'กิจกรรมจองรอบ' : 'กิจกรรมเดี่ยว' },
              ...(s.changed?.length ? [{ k: 'แก้', v: s.changed.join(', ') }] : []),
            ],
            cta: { label: 'ตรวจกิจกรรม', url, dark: true },
          },
        },
        { kind: 'admin' },
      );
    }
  } catch (e) {
    console.error('[submissions] tell admins', e);
  }
}

/** LINE to the host: what admin decided. */
export async function tellHostDecision(
  db: D1Database,
  env: Env,
  hostId: string,
  d: { kind: SubKind; id: string; title: string; action: 'approve' | 'changes' | 'reject'; note: string; edit: boolean },
): Promise<void> {
  try {
    const url = '/host/submissions';
    const head =
      d.action === 'approve'
        ? d.edit
          ? 'อนุมัติการแก้ไขแล้ว'
          : 'กิจกรรมของคุณได้รับอนุมัติแล้ว'
        : d.action === 'changes'
          ? 'ทีมงานขอให้แก้กิจกรรม'
          : d.edit
            ? 'การแก้ไขไม่ได้รับอนุมัติ'
            : 'กิจกรรมไม่ได้รับอนุมัติ';
    const sub =
      d.action === 'approve'
        ? d.edit
          ? 'ราคาหรือวันเวลาที่แก้ใช้กับหน้ากิจกรรมแล้ว'
          : d.kind === 'round'
            ? 'กิจกรรมเปิดให้เห็นแล้ว — เปิดรอบเพิ่มได้ที่หน้าจัดรอบกิจกรรม'
            : 'กิจกรรมเปิดรับจองบนเว็บแล้ว'
        : d.action === 'changes'
          ? 'แก้ตามหมายเหตุแล้วกดส่งให้ทีมตรวจอีกครั้ง'
          : 'ดูเหตุผลจากทีมงานด้านล่าง';
    await sendPushToUser(
      db,
      env,
      hostId,
      {
        title: `${head}: ${d.title}`,
        body: d.note || sub,
        url,
        card: {
          topic: d.action === 'approve' ? 'host' : d.action === 'changes' ? 'change' : 'cancel',
          topicLabel: d.action === 'approve' ? 'อนุมัติแล้ว' : d.action === 'changes' ? 'ขอให้แก้' : 'ไม่อนุมัติ',
          title: head,
          sub: `${d.title}\n${sub}`,
          quote: d.note || undefined,
          cta: { label: d.action === 'approve' ? 'ดูกิจกรรมของฉัน' : 'เปิดกิจกรรม', url, dark: d.action !== 'approve' },
        },
      },
      { kind: 'host' },
    );
  } catch (e) {
    console.error('[submissions] tell host', e);
  }
}
