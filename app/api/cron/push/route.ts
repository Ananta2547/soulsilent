import { NextResponse } from 'next/server';
import { getDB, getEnv } from '@/lib/db';
import { claimOnce, sendPushToUser, vapidKeys } from '@/lib/push';

/**
 * Push notifications on a schedule. Hit every minute by the Worker's cron
 * (worker.ts) with the shared secret:
 *   GET /api/cron/push   header: x-cron-secret: <CRON_SECRET>
 *
 * Sent only to members with a subscribed device, each at most once (push_sent):
 *  - booked     a booking confirmed in the last hour  → "จองสำเร็จ"
 *  - remind-1d  the evening before (from 18:00 Thai time)
 *  - remind-2h  within two hours of the start, same day
 *  - joined     a friend took a seat in the member's group booking
 *
 * Reads bookings only; it never changes them, so the payment paths stay as
 * they are. Does nothing until migration 064 runs and VAPID keys are set.
 */

type Row = { id: string; user_id: string; title: string; date: string; time_start: string | null; loc: string | null };

const TH_DAYS = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
const TH_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
function thDate(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  if (!y || !m || !d) return ymd;
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${TH_DAYS[dow]} ${d} ${TH_MONTHS[m - 1]}`;
}
const hhmm = (t: string | null) => (t ? t.slice(0, 5) : '');

const SELECT = `SELECT b.id, b.user_id, w.title, w.date, w.time_start, l.name AS loc
                  FROM bookings b
                  JOIN workshops w ON w.id = b.workshop_id
                  LEFT JOIN locations l ON l.id = w.location_id`;
const HAS_DEVICE = `b.user_id IN (SELECT user_id FROM push_subscriptions)`;

export async function GET(request: Request) {
  const env = await getEnv();
  const secret = env.CRON_SECRET || '';
  if (!secret || request.headers.get('x-cron-secret') !== secret) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (!vapidKeys(env)) return NextResponse.json({ ok: true, skipped: 'push not configured' });

  const db = await getDB();
  const counts = { booked: 0, remind1d: 0, remind2h: 0, joined: 0 };
  const send = async (key: string, userId: string, payload: Parameters<typeof sendPushToUser>[3], urgency: 'normal' | 'high' = 'normal') => {
    if (!(await claimOnce(db, key))) return false;
    return (await sendPushToUser(db, env, userId, payload, { urgency, topic: key.split(':')[0] })) > 0;
  };

  try {
    // Booking confirmed (paid, free, or a seat claimed from an invite).
    const booked = await db
      .prepare(
        `${SELECT}
          WHERE b.status = 'confirmed' AND b.payment_status = 'paid' AND b.parent_booking_id IS NULL
            AND datetime(COALESCE(b.confirmed_at, b.created_at)) >= datetime('now', '-60 minutes')
            AND ${HAS_DEVICE}
          LIMIT 100`,
      )
      .all<Row>();
    for (const r of booked.results || []) {
      const ok = await send(`booked:${r.id}`, r.user_id, {
        title: 'จองสำเร็จ ✓',
        body: `${r.title} · ${thDate(r.date)}${r.time_start ? ` ${hhmm(r.time_start)} น.` : ''}`,
        url: '/me/bookings',
        tag: `booking-${r.id}`,
      });
      if (ok) counts.booked++;
    }

    // The evening before: from 18:00 Thai time, for tomorrow's rounds.
    const thaiHour = Number(new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(11, 13));
    if (thaiHour >= 18) {
      const tomorrow = await db
        .prepare(
          `${SELECT}
            WHERE b.status = 'confirmed' AND w.status = 'active'
              AND w.date = date('now', '+7 hours', '+1 day')
              AND ${HAS_DEVICE}
            LIMIT 300`,
        )
        .all<Row>();
      for (const r of tomorrow.results || []) {
        const ok = await send(`remind-1d:${r.id}`, r.user_id, {
          title: `พรุ่งนี้ ${r.title}`,
          body: [r.time_start ? `เริ่ม ${hhmm(r.time_start)} น.` : '', r.loc ? `ที่ ${r.loc}` : ''].filter(Boolean).join(' · ') || 'อย่าลืมกิจกรรมของคุณพรุ่งนี้',
          url: '/me/bookings',
          tag: `booking-${r.id}`,
        });
        if (ok) counts.remind1d++;
      }
    }

    // Two hours before the start, same day (Thai time).
    const soon = await db
      .prepare(
        `${SELECT}
          WHERE b.status = 'confirmed' AND w.status = 'active'
            AND w.date = date('now', '+7 hours')
            AND w.time_start IS NOT NULL
            AND time(w.time_start) > time('now', '+7 hours')
            AND time(w.time_start) <= time('now', '+7 hours', '+2 hours')
            AND ${HAS_DEVICE}
          LIMIT 300`,
      )
      .all<Row>();
    for (const r of soon.results || []) {
      const ok = await send(
        `remind-2h:${r.id}`,
        r.user_id,
        {
          title: `อีกไม่นาน: ${r.title}`,
          body: [`เริ่ม ${hhmm(r.time_start)} น.`, r.loc ? `ที่ ${r.loc}` : ''].filter(Boolean).join(' · '),
          url: '/me/bookings',
          tag: `booking-${r.id}`,
        },
        'high',
      );
      if (ok) counts.remind2h++;
    }

    // A friend claimed a seat in a group booking: tell whoever booked it.
    const joined = await db
      .prepare(
        `SELECT m.id, p.user_id, w.title, COALESCE(NULLIF(u.nickname, ''), u.name) AS friend
           FROM bookings m
           JOIN bookings p ON p.id = m.parent_booking_id
           JOIN workshops w ON w.id = m.workshop_id
           LEFT JOIN users u ON u.id = m.user_id
          WHERE m.parent_booking_id IS NOT NULL AND m.user_id IS NOT NULL AND m.status != 'cancelled'
            AND datetime(m.created_at) >= datetime('now', '-60 minutes')
            AND p.user_id IN (SELECT user_id FROM push_subscriptions)
          LIMIT 100`,
      )
      .all<{ id: string; user_id: string; title: string; friend: string | null }>();
    for (const r of joined.results || []) {
      const friend = (r.friend || '').trim().split(/\s+/)[0] || 'เพื่อน';
      const ok = await send(`joined:${r.id}`, r.user_id, {
        title: 'เพื่อนเข้ากลุ่มแล้ว',
        body: `${friend} รับคำเชิญ ${r.title}`,
        url: '/me/bookings',
      });
      if (ok) counts.joined++;
    }

    return NextResponse.json({ ok: true, ...counts });
  } catch (error) {
    // Before migration 064 the subscription table does not exist: nothing to do.
    const msg = error instanceof Error ? error.message : String(error);
    if (/no such table/i.test(msg)) return NextResponse.json({ ok: true, skipped: 'migration 064 not applied' });
    console.error('Push cron error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 });
  }
}
