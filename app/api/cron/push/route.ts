import { NextResponse } from 'next/server';
import { getDB, getEnv } from '@/lib/db';
import { claimOnce, REACHABLE_USERS_SQL, sendPushToUser, subscribedUsers, vapidKeys, type PushKind } from '@/lib/push';
import { seatsHeldSubquery } from '@/lib/seats';
import { pushAdminAlerts } from '@/lib/admin-alert-push';
import { pushEvents } from '@/lib/push-events';
import { parseDashboardAccess, parseInstructorIds } from '@/lib/workshop-utils';

/**
 * Push notifications on a schedule. Hit every minute by the Worker's cron
 * (worker.ts) with the shared secret:
 *   GET /api/cron/push   header: x-cron-secret: <CRON_SECRET>
 *
 * Sent only to members with a subscribed device, each at most once (push_sent):
 *  - booked       a booking confirmed in the last hour  → "จองสำเร็จ"       (kind booking)
 *  - joined       a friend took a seat in the member's group booking        (kind booking)
 *  - remind-1d    the evening before (from 18:00 Thai time)                (kind reminder)
 *  - remind-2h    within two hours of the start, same day                  (kind reminder)
 *  - host-booked  someone booked a round you run (owner, co-hosts with
 *                 dashboard access, the round's organizer)                 (kind host)
 *  - changed      a round's day, time, venue or online link changed        (always sent)
 *  - cancelled    a round was cancelled                                    (always sent)
 * Members can switch the kinds off (push_prefs); changes always go out.
 *
 * Moves and cancellations are found by comparing each upcoming round with
 * the schedule last seen (push_schedule), so they are caught whichever page
 * made the edit. Reads bookings only; it never changes them, so the payment
 * paths stay as they are. Does nothing until migration 064 runs and VAPID keys
 * are set; the move/cancel and preference parts wait for 066.
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
const firstName = (s: string | null | undefined, fallback: string) => (s || '').trim().split(/\s+/)[0] || fallback;

/** Short stable hash, so a notice key changes when the schedule does. */
function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

const SELECT = `SELECT b.id, b.user_id, w.title, w.date, w.time_start, l.name AS loc
                  FROM bookings b
                  JOIN workshops w ON w.id = b.workshop_id
                  LEFT JOIN locations l ON l.id = w.location_id`;
// An app device, or LINE linked (migration 079).
const HAS_DEVICE = `b.user_id IN (${REACHABLE_USERS_SQL})`;

/** What members rely on to turn up: compared run to run to spot a move. */
type Snapshot = {
  status: string;
  date: string;
  end_date: string | null;
  dates: string;
  time_start: string | null;
  time_end: string | null;
  day_times: string;
  location_id: string | null;
  loc: string | null;
  online: number;
  online_url: string | null;
};
type SchedRow = {
  id: string;
  title: string;
  status: string | null;
  date: string;
  end_date: string | null;
  dates_json: string | null;
  time_start: string | null;
  time_end: string | null;
  day_times_json: string | null;
  location_id: string | null;
  loc: string | null;
  is_online: number | null;
  online_url: string | null;
  snapshot: string | null;
};
const snapshotOf = (r: SchedRow): Snapshot => ({
  status: r.status || 'active',
  date: r.date,
  end_date: r.end_date || null,
  dates: r.dates_json && r.dates_json !== '[]' ? r.dates_json : '',
  time_start: hhmm(r.time_start) || null,
  time_end: hhmm(r.time_end) || null,
  day_times: r.day_times_json && r.day_times_json !== '[]' ? r.day_times_json : '',
  location_id: r.location_id || null,
  loc: r.loc || null,
  online: r.is_online ? 1 : 0,
  online_url: r.online_url || null,
});

/** "วันเวลาใหม่ … · สถานที่ใหม่ …" — only the parts that changed. */
function describeChange(a: Snapshot, b: Snapshot): string | null {
  const parts: string[] = [];
  if (a.date !== b.date || a.end_date !== b.end_date || a.dates !== b.dates || a.time_start !== b.time_start || a.time_end !== b.time_end || a.day_times !== b.day_times) {
    const days = b.end_date && b.end_date !== b.date ? `${thDate(b.date)} – ${thDate(b.end_date)}` : thDate(b.date);
    parts.push(`วันเวลาใหม่ ${days}${b.time_start ? ` ${b.time_start} น.` : ''}`);
  }
  if (a.online !== b.online || (b.online ? a.online_url !== b.online_url : a.location_id !== b.location_id || a.loc !== b.loc)) {
    parts.push(b.online ? (a.online ? 'ลิงก์ออนไลน์ใหม่' : 'เปลี่ยนเป็นออนไลน์') : `สถานที่ใหม่ ${b.loc || ''}`.trim());
  }
  return parts.length ? parts.join(' · ') : null;
}

export async function GET(request: Request) {
  const env = await getEnv();
  const secret = env.CRON_SECRET || '';
  if (!secret || request.headers.get('x-cron-secret') !== secret) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (!vapidKeys(env)) return NextResponse.json({ ok: true, skipped: 'push not configured' });

  const db = await getDB();
  const counts = { booked: 0, remind1d: 0, remind2h: 0, joined: 0, host: 0, changed: 0, cancelled: 0 };
  const send = async (
    key: string,
    userId: string,
    payload: Parameters<typeof sendPushToUser>[3],
    kind: PushKind,
    urgency: 'normal' | 'high' = 'normal',
  ) => {
    if (!(await claimOnce(db, key))) return false;
    return (await sendPushToUser(db, env, userId, payload, { urgency, topic: key.split(':')[0], kind })) > 0;
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
      const ok = await send(
        `booked:${r.id}`,
        r.user_id,
        {
          title: 'จองสำเร็จ ✓',
          body: `${r.title} · ${thDate(r.date)}${r.time_start ? ` ${hhmm(r.time_start)} น.` : ''}`,
          url: '/me/bookings',
          tag: `booking-${r.id}`,
        },
        'booking',
      );
      if (ok) counts.booked++;
    }

    // The evening before: from 18:00 Thai time, for tomorrow's rounds. The
    // key carries the date, so a round moved to another day reminds again.
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
        const ok = await send(
          `remind-1d:${r.id}:${r.date}`,
          r.user_id,
          {
            title: `พรุ่งนี้ ${r.title}`,
            body: [r.time_start ? `เริ่ม ${hhmm(r.time_start)} น.` : '', r.loc ? `ที่ ${r.loc}` : ''].filter(Boolean).join(' · ') || 'อย่าลืมกิจกรรมของคุณพรุ่งนี้',
            url: '/me/bookings',
            tag: `booking-${r.id}`,
          },
          'reminder',
        );
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
        `remind-2h:${r.id}:${r.date}:${hhmm(r.time_start)}`,
        r.user_id,
        {
          title: `อีกไม่นาน: ${r.title}`,
          body: [`เริ่ม ${hhmm(r.time_start)} น.`, r.loc ? `ที่ ${r.loc}` : ''].filter(Boolean).join(' · '),
          url: '/me/bookings',
          tag: `booking-${r.id}`,
        },
        'reminder',
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
            AND p.user_id IN (${REACHABLE_USERS_SQL})
          LIMIT 100`,
      )
      .all<{ id: string; user_id: string; title: string; friend: string | null }>();
    for (const r of joined.results || []) {
      const ok = await send(
        `joined:${r.id}`,
        r.user_id,
        {
          title: 'เพื่อนเข้ากลุ่มแล้ว',
          body: `${firstName(r.friend, 'เพื่อน')} รับคำเชิญ ${r.title}`,
          url: '/me/bookings',
        },
        'booking',
      );
      if (ok) counts.joined++;
    }

    // Someone booked a round: tell the people who run it — the owner, the
    // co-hosts allowed into its dashboard, and the organizer of a session round.
    const hostBooked = await db
      .prepare(
        `SELECT b.id, b.user_id, b.group_size, b.booking_kind, w.id AS wid, w.title, w.date, w.time_start,
                w.max_participants, w.instructor_id, w.instructor_ids_json, w.dashboard_access_json,
                m.organizer, COALESCE(NULLIF(u.nickname, ''), u.name) AS booker,
                ${seatsHeldSubquery('w')} AS taken
           FROM bookings b
           JOIN workshops w ON w.id = b.workshop_id
           LEFT JOIN workshop_masters m ON m.id = w.master_id
           LEFT JOIN users u ON u.id = b.user_id
          WHERE b.status = 'confirmed' AND b.payment_status = 'paid' AND b.parent_booking_id IS NULL
            AND datetime(COALESCE(b.confirmed_at, b.created_at)) >= datetime('now', '-60 minutes')
          LIMIT 100`,
      )
      .all<{
        id: string;
        user_id: string | null;
        group_size: number | null;
        booking_kind: string | null;
        wid: string;
        title: string;
        date: string;
        time_start: string | null;
        max_participants: number | null;
        instructor_id: string | null;
        instructor_ids_json: string | null;
        dashboard_access_json: string | null;
        organizer: string | null;
        booker: string | null;
        taken: number;
      }>();
    const hostRows = hostBooked.results || [];
    const hostIds = (r: (typeof hostRows)[number]) =>
      [...new Set([parseInstructorIds(r)[0], ...parseDashboardAccess(r), r.organizer].filter((x): x is string => !!x && x !== r.user_id))];
    const hostsWithDevice = await subscribedUsers(db, hostRows.flatMap(hostIds));
    for (const r of hostRows) {
      const seats = r.booking_kind === 'private' ? 'ทั้งรอบ' : `${r.group_size || 1} ที่`;
      const full = r.max_participants ? ` · จองแล้ว ${r.taken}/${r.max_participants}` : '';
      for (const hostId of hostIds(r).filter((h) => hostsWithDevice.has(h))) {
        const ok = await send(
          `host-booked:${r.id}:${hostId}`,
          hostId,
          {
            title: 'มีคนจองรอบของคุณ',
            body: `${firstName(r.booker, 'ผู้เข้าร่วม')} จอง ${seats} · ${r.title} ${thDate(r.date)}${r.time_start ? ` ${hhmm(r.time_start)} น.` : ''}${full}`,
            url: `/host/journeys/${r.wid}`,
            tag: `host-${r.wid}`,
          },
          'host',
        );
        if (ok) counts.host++;
      }
    }

    // Moves and cancellations (migration 066).
    try {
      const rounds = await db
        .prepare(
          `SELECT w.id, w.title, w.status, w.date, w.end_date, w.dates_json, w.time_start, w.time_end,
                  w.day_times_json, w.location_id, COALESCE(l.name, w.location) AS loc, w.is_online, w.online_url,
                  s.snapshot
             FROM workshops w
             LEFT JOIN locations l ON l.id = w.location_id
             LEFT JOIN push_schedule s ON s.workshop_id = w.id
            WHERE w.date IS NOT NULL AND COALESCE(w.end_date, w.date) >= date('now', '+7 hours', '-1 day')
            LIMIT 1000`,
        )
        .all<SchedRow>();
      for (const r of rounds.results || []) {
        const now = snapshotOf(r);
        const nowJson = JSON.stringify(now);
        if (r.snapshot === nowJson) continue;
        let before: Snapshot | null = null;
        try {
          before = r.snapshot ? (JSON.parse(r.snapshot) as Snapshot) : null;
        } catch {
          before = null;
        }
        if (before && now.status === 'cancelled' && before.status !== 'cancelled') {
          // The cancel cascade marks every booking 'workshop_changed'; tell those who had a seat.
          const who = await db
            .prepare(
              `SELECT b.id, b.user_id FROM bookings b
                WHERE b.workshop_id = ? AND b.status = 'cancelled' AND b.cancel_reason = 'workshop_changed'
                  AND b.payment_status = 'paid' AND ${HAS_DEVICE}`,
            )
            .bind(r.id)
            .all<{ id: string; user_id: string }>();
          for (const b of who.results || []) {
            const ok = await send(
              `cancelled:${b.id}`,
              b.user_id,
              {
                title: `ยกเลิก: ${r.title}`,
                body: `รอบ ${thDate(before.date)}${before.time_start ? ` ${before.time_start} น.` : ''} ถูกยกเลิก แตะเพื่อดูการจองของคุณ`,
                url: '/me/bookings',
                tag: `booking-${b.id}`,
              },
              'change',
              'high',
            );
            if (ok) counts.cancelled++;
          }
        } else if (before && now.status !== 'cancelled') {
          const what = describeChange(before, now);
          if (what) {
            const who = await db
              .prepare(`SELECT b.id, b.user_id FROM bookings b WHERE b.workshop_id = ? AND b.status = 'confirmed' AND ${HAS_DEVICE}`)
              .bind(r.id)
              .all<{ id: string; user_id: string }>();
            const version = hash(nowJson);
            for (const b of who.results || []) {
              const ok = await send(
                `changed:${b.id}:${version}`,
                b.user_id,
                { title: `เปลี่ยนแปลง: ${r.title}`, body: what, url: '/me/bookings', tag: `booking-${b.id}` },
                'change',
                'high',
              );
              if (ok) counts.changed++;
            }
          }
        }
        // First sighting is stored silently; afterwards the new schedule replaces the old.
        await db
          .prepare(
            `INSERT INTO push_schedule (workshop_id, snapshot, seen_at) VALUES (?, ?, datetime('now'))
             ON CONFLICT(workshop_id) DO UPDATE SET snapshot = excluded.snapshot, seen_at = excluded.seen_at`,
          )
          .bind(r.id, nowJson)
          .run();
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (!/no such table/i.test(msg)) throw error;
    }

    // Refunds asked for, applications, low ratings, selection results, claimed
    // gifts and surveys opening (lib/push-events).
    const events = await pushEvents(db, send).catch((e) => {
      console.error('Push events error:', e);
      return {};
    });

    // New urgent Admin Insights alerts to admins, every 15 minutes (lib/admin-alert-push).
    const admin = await pushAdminAlerts(db, env).catch((e) => {
      console.error('Admin alerts push error:', e);
      return 0;
    });

    // Housekeeping, 03:00–03:09 Thai time: forget sent-markers older than 60
    // days and schedules of rounds long over. Every notice above only looks at
    // bookings from the last hour or rounds from yesterday on, so an old key
    // can never be claimed again.
    let pruned = 0;
    const thaiNow = new Date(Date.now() + 7 * 3600 * 1000).toISOString();
    if (thaiNow.slice(11, 13) === '03' && Number(thaiNow.slice(14, 16)) < 10) {
      const r = await db.prepare(`DELETE FROM push_sent WHERE sent_at < datetime('now', '-60 days')`).run();
      pruned = r.meta?.changes ?? 0;
      await db
        .prepare(
          `DELETE FROM push_schedule WHERE workshop_id NOT IN
             (SELECT id FROM workshops WHERE COALESCE(end_date, date) >= date('now', '+7 hours', '-30 days'))`,
        )
        .run()
        .catch(() => null);
    }

    return NextResponse.json({ ok: true, ...counts, events, admin, pruned });
  } catch (error) {
    // Before migration 064 the subscription table does not exist: nothing to do.
    const msg = error instanceof Error ? error.message : String(error);
    if (/no such table/i.test(msg)) return NextResponse.json({ ok: true, skipped: 'migration 064 not applied' });
    console.error('Push cron error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 });
  }
}
