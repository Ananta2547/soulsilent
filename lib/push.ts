/**
 * Notifications: sending to a member, their per-kind switches, and
 * remembering what was already sent. Every notification goes through the
 * LINE Official Account (lib/line.ts, migration 079) — the installable app
 * and its web push were retired. Tables: push_sent (064), push_prefs (066).
 *
 * Every function here is best-effort. Without LINE configured, or before the
 * migrations run, they quietly do nothing — a notification must never break a
 * booking or a page.
 */
import { LINE_REACHABLE_SQL, lineIdOf, linePush, lineMessagingReady, type LineEnv } from '@/lib/line';

export type PushPayload = {
  title: string;
  body: string;
  /** Opened from the message's button (same-origin path). */
  url?: string;
  /** Kept for callers; LINE has no replace-by-tag. */
  tag?: string;
};

type Env = { SITE_URL?: string } & LineEnv;

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

/** True when this deployment can send notifications at all. */
export function notificationsReady(env: Env): boolean {
  return lineMessagingReady(env);
}

/**
 * Send to one member on LINE. Returns 1 when LINE accepted it, else 0 (not
 * linked, blocked the Official Account, or LINE not configured). With `kind`,
 * nothing is sent when the member switched that kind off.
 */
export async function sendPushToUser(
  db: D1Database,
  env: Env,
  userId: string,
  payload: PushPayload,
  opts: { kind?: PushKind } = {},
): Promise<number> {
  if (!lineMessagingReady(env)) return 0;
  if (opts.kind && (await mutedKinds(db, userId)).includes(opts.kind)) return 0;
  const lineId = await lineIdOf(db, userId);
  if (!lineId) return 0;
  return (await linePush(env, lineId, payload)) ? 1 : 0;
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

/** SQL: members a notification can reach — LINE linked and not blocked. */
export const REACHABLE_USERS_SQL = LINE_REACHABLE_SQL;

/** Members (of the given ids) a notification can reach. */
export async function subscribedUsers(db: D1Database, userIds: string[]): Promise<Set<string>> {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (!ids.length) return new Set();
  const marks = ids.map(() => '?').join(',');
  try {
    const line = await db.prepare(`${LINE_REACHABLE_SQL} AND id IN (${marks})`).bind(...ids).all<{ id: string }>();
    return new Set((line.results || []).map((r) => r.id));
  } catch {
    return new Set(); // before migration 079
  }
}
