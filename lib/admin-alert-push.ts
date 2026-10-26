import { claimOnce, sendPushToUser, subscribedUsers } from '@/lib/push';
import { thaiDay } from '@/lib/host-analytics';
import { computeAdminAnalytics, loadAdminData, makeRange } from '@/lib/admin-analytics';

type Env = Parameters<typeof sendPushToUser>[1];

/** How often the cron looks for new urgent alerts. Working out every alert
 *  reads the whole platform, so not on every minute's run. */
const EVERY_MS = 15 * 60 * 1000;

/**
 * Push new urgent ("ด่วน") Admin Insights alerts to every admin's devices.
 *
 * Each alert is pushed once (push_sent key `admin-alert:<alert key>`); an
 * alert's key carries its state, so one that changes (a member changing their
 * name a 5th time) counts as new. Alerts admin acknowledged are not open and
 * are never pushed. Everything new in one run goes out as a single notice, so
 * a backlog does not ring the phone many times. Admins switch this off with
 * the "แจ้งเตือนผู้ดูแล" switch (push kind 'admin').
 */
export async function pushAdminAlerts(db: D1Database, env: Env, now = Date.now()): Promise<number> {
  if (!(await claimOnce(db, `admin-run:${Math.floor(now / EVERY_MS)}`))) return 0;
  const admins = (await db.prepare("SELECT id FROM users WHERE role = 'admin' AND deleted_at IS NULL").all<{ id: string }>()).results || [];
  const devices = await subscribedUsers(
    db,
    admins.map((a) => a.id),
  );
  if (!devices.size) return 0;

  const today = thaiDay(now);
  const { alerts } = computeAdminAnalytics(await loadAdminData(db), makeRange(today, today), now);
  const fresh = [];
  for (const a of alerts.open) {
    if (a.tone === 'bad' && (await claimOnce(db, `admin-alert:${a.key}`))) fresh.push(a);
  }
  if (!fresh.length) return 0;

  const payload =
    fresh.length === 1
      ? { title: 'แจ้งเตือนด่วน · ผู้ดูแล', body: `${fresh[0].title}\n${fresh[0].detail}` }
      : {
          title: `แจ้งเตือนด่วน ${fresh.length} เรื่อง · ผู้ดูแล`,
          body: fresh.slice(0, 3).map((a) => `• ${a.title}`).join('\n') + (fresh.length > 3 ? `\nและอีก ${fresh.length - 3} เรื่อง` : ''),
        };
  for (const id of devices) {
    await sendPushToUser(db, env, id, { ...payload, url: '/admin/insights?tab=alerts', tag: 'admin-alerts' }, { kind: 'admin', urgency: 'high', topic: 'admin-alerts' });
  }
  return fresh.length;
}
