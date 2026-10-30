/**
 * LINE notifications (migration 079): the Official Account's Messaging API
 * sends, LINE Login (same provider) links a member's LINE account.
 *
 * Secrets (set with `wrangler secret put`, never in code):
 *   LINE_CHANNEL_ACCESS_TOKEN  Messaging API, long-lived token
 *   LINE_CHANNEL_SECRET        Messaging API, signs the webhook
 *   LINE_LOGIN_CHANNEL_ID      LINE Login channel
 *   LINE_LOGIN_CHANNEL_SECRET  LINE Login channel
 * Without them every function here does nothing, like push without VAPID.
 */
import type { PushPayload } from '@/lib/push';
import { flexCard, type Topic } from '@/lib/line-flex';

export type LineEnv = {
  LINE_CHANNEL_ACCESS_TOKEN?: string;
  LINE_CHANNEL_SECRET?: string;
  LINE_LOGIN_CHANNEL_ID?: string;
  LINE_LOGIN_CHANNEL_SECRET?: string;
  SITE_URL?: string;
};

const t = (v?: string) => (v || '').trim();
export const lineMessagingReady = (env: LineEnv) => !!t(env.LINE_CHANNEL_ACCESS_TOKEN);
export const lineLoginReady = (env: LineEnv) => !!(t(env.LINE_LOGIN_CHANNEL_ID) && t(env.LINE_LOGIN_CHANNEL_SECRET));

/** SQL: members a notification can reach on LINE. */
export const LINE_REACHABLE_SQL = `SELECT id FROM users WHERE line_user_id IS NOT NULL AND COALESCE(line_blocked, 0) = 0`;

/** The member's LINE id, or null when not linked / blocked / before 079. */
export async function lineIdOf(db: D1Database, userId: string): Promise<string | null> {
  try {
    const r = await db.prepare('SELECT line_user_id, line_blocked FROM users WHERE id = ?').bind(userId).first<{ line_user_id: string | null; line_blocked: number | null }>();
    return r?.line_user_id && !r.line_blocked ? r.line_user_id : null;
  } catch {
    return null;
  }
}

/** The notice as a LINE card: its own card, or the title and body under its topic. */
function messageOf(p: PushPayload, topic: Topic, siteUrl: string) {
  const card = p.card ?? { topic, title: p.title, sub: p.body, cta: { label: 'เปิดดู', url: p.url } };
  return flexCard(card, siteUrl, p.title);
}

/** Push one notification to a LINE user. True when LINE accepted it. */
export async function linePush(env: LineEnv, to: string, payload: PushPayload, topic: Topic = 'booking'): Promise<boolean> {
  const token = t(env.LINE_CHANNEL_ACCESS_TOKEN);
  if (!token) return false;
  try {
    const r = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ to, messages: [messageOf(payload, topic, env.SITE_URL || 'https://allsoullearn.com')] }),
    });
    if (!r.ok) console.warn('[line] push rejected', r.status, (await r.text().catch(() => '')).slice(0, 200));
    else console.log('[line] push ok', payload.title);
    return r.ok;
  } catch (e) {
    console.warn('[line] push failed', e);
    return false;
  }
}

/** The webhook body was signed by our Messaging API channel. */
export async function verifyLineSignature(env: LineEnv, rawBody: string, signature: string | null): Promise<boolean> {
  const secret = t(env.LINE_CHANNEL_SECRET);
  if (!secret || !signature) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody)));
  let bin = '';
  for (const b of mac) bin += String.fromCharCode(b);
  const expected = btoa(bin);
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}
