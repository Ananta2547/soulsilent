/**
 * Push notifications for the installed app: storing subscriptions, sending
 * to every device of a member, and remembering what was already sent.
 * Tables: migration 064 (push_subscriptions, push_sent).
 *
 * Every function here is best-effort. Before migration 064 runs, or without
 * VAPID keys, they quietly do nothing — a notification must never break a
 * booking or a page.
 */
import { sendWebPush, type VapidKeys } from '@/lib/webpush';
import { LINE_REACHABLE_SQL, lineIdOf, linePush, lineMessagingReady, type LineEnv } from '@/lib/line';

export type PushPayload = {
  title: string;
  body: string;
  /** Opened when the notification is tapped (same-origin path). */
  url?: string;
  /** Notifications with the same tag replace each other on the device. */
  tag?: string;
};

type Env = { VAPID_PUBLIC_KEY?: string; VAPID_PRIVATE_KEY?: string; SITE_URL?: string } & LineEnv;

/**
 * Kinds of notification a member can switch off (push_prefs, migration 066).
 * 'change' — a round moved or was cancelled — is not among them: it is always
 * sent, so nobody turns up on the wrong day.
 */
export const PUSH_KINDS = ['booking', 'reminder', 'host', 'admin'] as const;
export type PushKind = (typeof PUSH_KINDS)[number] | 'change' | 'test';

/** The kinds this member switched off. Empty when none (or before 066). */
export async function mutedKinds(db: D1Database, userId: string): Promise<string[]> {
  try {
    const row = await db.prepare('SELECT off FROM push_prefs WHERE user_id = ?').bind(userId).first<{ off: string }>();
    return (row?.off || '').split(',').filter((k) => (PUSH_KINDS as readonly string[]).includes(k));
  } catch {
    return [];
  }
}

export async function saveMutedKinds(db: D1Database, userId: string, off: string[]): Promise<string[]> {
  const clean = [...new Set(off.filter((k) => (PUSH_KINDS as readonly string[]).includes(k)))];
  await db
    .prepare(
      `INSERT INTO push_prefs (user_id, off, updated_at) VALUES (?, ?, datetime('now'))
       ON CONFLICT(user_id) DO UPDATE SET off = excluded.off, updated_at = excluded.updated_at`,
    )
    .bind(userId, clean.join(','))
    .run();
  return clean;
}

/** The VAPID keys, or null when push is not configured on this deployment. */
export function vapidKeys(env: Env): VapidKeys | null {
  // Trimmed: a secret piped in from a shell can carry a trailing newline.
  const publicKey = (env.VAPID_PUBLIC_KEY || '').trim();
  const privateKey = (env.VAPID_PRIVATE_KEY || '').trim();
  if (!publicKey || !privateKey) return null;
  return { publicKey, privateKey, subject: env.SITE_URL || 'https://allsoullearn.com' };
}

const b64url = /^[A-Za-z0-9_-]+$/;

/** Validate what the browser's PushSubscription.toJSON() produced. */
export function parseSubscription(v: unknown): { endpoint: string; p256dh: string; auth: string } | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  const endpoint = typeof o.endpoint === 'string' ? o.endpoint.trim() : '';
  const p256dh = typeof o.keys?.p256dh === 'string' ? o.keys.p256dh : '';
  const auth = typeof o.keys?.auth === 'string' ? o.keys.auth : '';
  if (!/^https:\/\/[^\s]{8,800}$/.test(endpoint)) return null;
  if (!b64url.test(p256dh) || p256dh.length < 80 || p256dh.length > 100) return null;
  if (!b64url.test(auth) || auth.length < 16 || auth.length > 32) return null;
  return { endpoint, p256dh, auth };
}

export async function saveSubscription(
  db: D1Database,
  userId: string,
  sub: { endpoint: string; p256dh: string; auth: string },
  userAgent: string | null,
): Promise<void> {
  // One device follows whoever signed in on it last.
  await db
    .prepare(
      `INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, user_agent)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, user_agent = excluded.user_agent`,
    )
    .bind(crypto.randomUUID(), userId, sub.endpoint, sub.p256dh, sub.auth, (userAgent || '').slice(0, 200))
    .run();
}

export async function removeSubscription(db: D1Database, endpoint: string): Promise<void> {
  await db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').bind(endpoint).run();
}

/**
 * Send to every device of one member. Returns how many devices accepted it.
 * Dead subscriptions (404/410) are deleted on the way. With `kind`, nothing
 * is sent when the member switched that kind off.
 *
 * A member who linked LINE (migration 079) gets it on LINE instead of the
 * app — the user chose one channel, not both.
 */
export async function sendPushToUser(
  db: D1Database,
  env: Env,
  userId: string,
  payload: PushPayload,
  opts: { ttl?: number; urgency?: 'low' | 'normal' | 'high'; topic?: string; kind?: PushKind } = {},
): Promise<number> {
  if (opts.kind && (await mutedKinds(db, userId)).includes(opts.kind)) return 0;
  if (lineMessagingReady(env)) {
    const lineId = await lineIdOf(db, userId);
    if (lineId) return (await linePush(env, lineId, payload)) ? 1 : 0;
  }
  const keys = vapidKeys(env);
  if (!keys) return 0;
  let subs: { endpoint: string; p256dh: string; auth: string }[] = [];
  try {
    subs =
      (await db.prepare('SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?').bind(userId).all<{ endpoint: string; p256dh: string; auth: string }>())
        .results || [];
  } catch {
    return 0; // migration 064 not applied here yet
  }
  let sent = 0;
  for (const s of subs) {
    try {
      const r = await sendWebPush(s, payload, keys, opts);
      if (r.ok) {
        sent++;
        await db.prepare("UPDATE push_subscriptions SET last_sent_at = datetime('now') WHERE endpoint = ?").bind(s.endpoint).run();
      } else if (r.gone) {
        await removeSubscription(db, s.endpoint);
      } else {
        console.warn('push rejected', r.status, new URL(s.endpoint).host);
      }
    } catch (e) {
      console.warn('push failed', e);
    }
  }
  return sent;
}

/**
 * Claim a one-time notification key ("remind-1d:<booking>"). True the first
 * time only, so a job that runs every minute sends each notice once.
 */
export async function claimOnce(db: D1Database, key: string): Promise<boolean> {
  try {
    const r = await db.prepare('INSERT OR IGNORE INTO push_sent (key) VALUES (?)').bind(key).run();
    return (r.meta?.changes ?? 0) > 0;
  } catch {
    return false;
  }
}

/** Undo claimOnce when nothing was delivered, so a later run retries. */
export async function releaseClaim(db: D1Database, key: string): Promise<void> {
  try {
    await db.prepare('DELETE FROM push_sent WHERE key = ?').bind(key).run();
  } catch {}
}

/** SQL: members a notification can reach — an app device, or linked LINE. */
export const REACHABLE_USERS_SQL = `SELECT user_id FROM push_subscriptions UNION ${LINE_REACHABLE_SQL}`;

/** Members (of the given ids) a notification can reach: at least one device
 *  subscribed, or LINE linked and not blocked. */
export async function subscribedUsers(db: D1Database, userIds: string[]): Promise<Set<string>> {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (!ids.length) return new Set();
  const marks = ids.map(() => '?').join(',');
  try {
    const rows = await db
      .prepare(`SELECT DISTINCT user_id FROM push_subscriptions WHERE user_id IN (${marks})`)
      .bind(...ids)
      .all<{ user_id: string }>();
    const out = new Set((rows.results || []).map((r) => r.user_id));
    try {
      const line = await db.prepare(`${LINE_REACHABLE_SQL} AND id IN (${marks})`).bind(...ids).all<{ id: string }>();
      for (const r of line.results || []) out.add(r.id);
    } catch {} // before migration 079
    return out;
  } catch {
    return new Set();
  }
}
