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

export type PushPayload = {
  title: string;
  body: string;
  /** Opened when the notification is tapped (same-origin path). */
  url?: string;
  /** Notifications with the same tag replace each other on the device. */
  tag?: string;
};

type Env = { VAPID_PUBLIC_KEY?: string; VAPID_PRIVATE_KEY?: string; SITE_URL?: string };

/** The VAPID keys, or null when push is not configured on this deployment. */
export function vapidKeys(env: Env): VapidKeys | null {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return null;
  return { publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY, subject: env.SITE_URL || 'https://allsoullearn.com' };
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
 * Dead subscriptions (404/410) are deleted on the way.
 */
export async function sendPushToUser(
  db: D1Database,
  env: Env,
  userId: string,
  payload: PushPayload,
  opts: { ttl?: number; urgency?: 'low' | 'normal' | 'high'; topic?: string } = {},
): Promise<number> {
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

/** Members (of the given ids) who have at least one device subscribed. */
export async function subscribedUsers(db: D1Database, userIds: string[]): Promise<Set<string>> {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (!ids.length) return new Set();
  try {
    const rows = await db
      .prepare(`SELECT DISTINCT user_id FROM push_subscriptions WHERE user_id IN (${ids.map(() => '?').join(',')})`)
      .bind(...ids)
      .all<{ user_id: string }>();
    return new Set((rows.results || []).map((r) => r.user_id));
  } catch {
    return new Set();
  }
}
