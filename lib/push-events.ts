import { claimOnce, sendPushToUser, subscribedUsers, type PushKind, type PushPayload } from '@/lib/push';
import { parseDashboardAccess, parseInstructorIds } from '@/lib/workshop-utils';
import { visibleAppStatus } from '@/lib/selection-status';
import { BLUE } from '@/lib/line-flex';

/* Push notices about things that happen to a booking or a round, on top of
 * the booking / reminder / change notices in the cron (api/cron/push):
 *
 *   to hosts (kind 'host')        a member asked for a refund · a new application
 *                                 · a 1–2 star review or survey answer
 *   to members (kind 'booking')   the selection result once it is announced
 *                                 · a gift or transferred seat that was claimed
 *                                 · the after-activity survey opening
 *
 * Each is sent once (push_sent key) and only to people with a device. */

type Env = Parameters<typeof sendPushToUser>[1];
type Send = (key: string, userId: string, payload: PushPayload, kind: PushKind) => Promise<boolean>;

type RoundRow = { wid: string; title: string; date: string; instructor_id: string | null; instructor_ids_json: string | null; dashboard_access_json: string | null; organizer: string | null };
const ROUND_COLS = `w.id AS wid, w.title, w.date, w.instructor_id, w.instructor_ids_json, w.dashboard_access_json, m.organizer`;

/** The people who run a round: its host, co-hosts with dashboard access, the
 *  session organizer — never the member the notice is about. */
const hostsOf = (r: RoundRow, except?: string | null) =>
  [...new Set([parseInstructorIds(r)[0], ...parseDashboardAccess(r), r.organizer].filter((x): x is string => !!x && x !== except))];

const thDate = (d: string) => {
  const [y, m, dd] = d.split('-').map(Number);
  const MONTH = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  return y && m ? `${dd} ${MONTH[m - 1]}` : d;
};
const first = (name: string | null | undefined, fallback: string) => (name || '').trim().split(/\s+/)[0] || fallback;
const clip = (s: string | null | undefined, n = 80) => {
  const t = (s || '').trim();
  return t.length > n ? t.slice(0, n) + '…' : t;
};
const stars = (n: number) => '★'.repeat(n) + '☆'.repeat(5 - n);
/** "9 พ.ย. 23:59 น." from a YYYY-MM-DDTHH:MM deadline. */
const thDeadline = (v: string) => `${thDate(v.slice(0, 10))}${v.length >= 16 ? ` ${v.slice(11, 16)} น.` : ''}`;

/** A member gave their seat back for a refund (api/bookings/[id]/refund-request):
 *  tell the round's hosts straight away. */
export async function notifyHostsRefundRequest(db: D1Database, env: Env, bookingId: string): Promise<void> {
  try {
    const r = await db
      .prepare(
        `SELECT b.id, b.user_id, b.amount, COALESCE(NULLIF(u.nickname, ''), u.name) AS member, ${ROUND_COLS}
           FROM bookings b JOIN workshops w ON w.id = b.workshop_id LEFT JOIN workshop_masters m ON m.id = w.master_id
           LEFT JOIN users u ON u.id = b.user_id WHERE b.id = ?`,
      )
      .bind(bookingId)
      .first<RoundRow & { id: string; user_id: string | null; amount: number; member: string | null }>();
    if (!r) return;
    for (const host of hostsOf(r, r.user_id)) {
      if (!(await claimOnce(db, `host-refund:${r.id}:${host}`))) continue;
      await sendPushToUser(
        db,
        env,
        host,
        {
          title: 'มีคนขอคืนเงิน',
          body: `${first(r.member, 'ผู้เข้าร่วม')} ขอคืนเงินแทนการย้ายรอบ · ${r.title} ${thDate(r.date)}`,
          url: `/host/journeys/${r.wid}`,
          tag: `host-${r.wid}`,
          card: {
            topic: 'cancel',
            topicLabel: 'ขอคืนเงิน',
            title: 'มีคนขอคืนเงิน',
            sub: `${first(r.member, 'ผู้เข้าร่วม')} ขอคืนเงินแทนการย้ายรอบ\n${r.title} · ${thDate(r.date)}`,
            cta: { label: 'ดูรายละเอียด', url: `/host/journeys/${r.wid}`, dark: true },
          },
        },
        { kind: 'host' },
      );
    }
  } catch (e) {
    console.error('[push-events] refund request', e);
  }
}

/** Everything the cron looks for each run. Returns how many notices went out. */
export async function pushEvents(db: D1Database, send: Send): Promise<Record<string, number>> {
  const counts = { applied: 0, lowRating: 0, selection: 0, transfer: 0, survey: 0 };
  const all = <T>(sql: string) => db.prepare(sql).all<T>().then((r) => r.results || []);

  // A new application to a selection round, for its hosts.
  const applied = await all<RoundRow & { id: string; user_id: string | null; applicant: string | null; waiting: number }>(
    `SELECT b.id, b.user_id, COALESCE(NULLIF(u.nickname, ''), u.name) AS applicant, ${ROUND_COLS},
            (SELECT COUNT(*) FROM bookings x WHERE x.workshop_id = w.id AND x.app_status = 'applied' AND x.parent_booking_id IS NULL AND x.status != 'cancelled') AS waiting
       FROM bookings b JOIN workshops w ON w.id = b.workshop_id LEFT JOIN workshop_masters m ON m.id = w.master_id
       LEFT JOIN users u ON u.id = b.user_id
      WHERE b.app_status = 'applied' AND b.parent_booking_id IS NULL AND b.status != 'cancelled'
        AND datetime(b.created_at) >= datetime('now', '-60 minutes')
      LIMIT 100`,
  );
  const hostDevices = await subscribedUsers(db, applied.flatMap((r) => hostsOf(r, r.user_id)));
  for (const r of applied) {
    for (const host of hostsOf(r, r.user_id).filter((h) => hostDevices.has(h))) {
      const ok = await send(
        `host-applied:${r.id}:${host}`,
        host,
        {
          title: 'มีใบสมัครใหม่',
          body: `${first(r.applicant, 'ผู้สมัคร')} สมัคร ${r.title} ${thDate(r.date)}`,
          url: `/host/journeys/${r.wid}`,
          tag: `host-${r.wid}`,
          card: {
            topic: 'host',
            title: 'มีใบสมัครใหม่',
            sub: `${first(r.applicant, 'ผู้สมัคร')} สมัคร ${r.title} · ${thDate(r.date)}`,
            avatars: { list: [first(r.applicant, 'ผ').slice(0, 1)], note: `รอคัดเลือก ${r.waiting} คน` },
            cta: { label: 'อ่านใบสมัคร', url: `/host/journeys/${r.wid}`, dark: true },
          },
        },
        'host',
      );
      if (ok) counts.applied++;
    }
  }

  // A 1–2 star review (named) or survey answer (anonymous), for the hosts.
  const low = await all<RoundRow & { id: string; src: string; rating: number; comment: string | null; user_id: string | null }>(
    `SELECT r.id, 'review' AS src, r.rating, r.comment, r.user_id, ${ROUND_COLS}
       FROM reviews r JOIN workshops w ON w.id = r.workshop_id LEFT JOIN workshop_masters m ON m.id = w.master_id
      WHERE r.rating <= 2 AND datetime(r.created_at) >= datetime('now', '-60 minutes')
     UNION ALL
     SELECT s.id, 'survey' AS src, s.rating, s.comment, s.user_id, ${ROUND_COLS}
       FROM survey_responses s JOIN workshops w ON w.id = s.workshop_id LEFT JOIN workshop_masters m ON m.id = w.master_id
      WHERE s.rating <= 2 AND datetime(s.created_at) >= datetime('now', '-60 minutes')
      LIMIT 100`,
  ).catch(() => []);
  const lowDevices = await subscribedUsers(db, low.flatMap((r) => hostsOf(r, r.user_id)));
  for (const r of low) {
    for (const host of hostsOf(r, r.user_id).filter((h) => lowDevices.has(h))) {
      const ok = await send(
        `host-low:${r.src}:${r.id}:${host}`,
        host,
        {
          title: r.src === 'review' ? `รีวิว ${stars(r.rating)} · ${r.title}` : `แบบสอบถาม ${stars(r.rating)} · ${r.title}`,
          body: clip(r.comment) || 'ไม่มีความเห็นเพิ่ม',
          url: r.src === 'review' ? '/host/reviews' : `/host/journeys/${r.wid}/survey`,
          tag: `host-low-${r.wid}`,
          card: {
            topic: 'voice',
            title: `${r.src === 'review' ? 'รีวิวใหม่' : 'แบบสอบถามใหม่'} · ${r.title}`,
            sub: r.comment?.trim() ? undefined : 'ไม่มีความเห็นเพิ่ม',
            stars: { n: r.rating },
            quote: clip(r.comment, 300) || undefined,
            cta: { label: r.src === 'review' ? 'ดูรีวิว' : 'ดูแบบสอบถาม', url: r.src === 'review' ? '/host/reviews' : `/host/journeys/${r.wid}/survey`, dark: true },
          },
        },
        'host',
      );
      if (ok) counts.lowRating++;
    }
  }

  // Selection results, once the round's announcement time has passed (before
  // it, members still see "สมัครแล้ว"). A later change — promoted from the
  // waiting list — is a new notice.
  const decided = await all<{ id: string; user_id: string; app_status: string; wid: string; title: string; date: string; admission_type: 'direct' | 'selection'; announce_at: string | null; confirm_main_by: string | null }>(
    `SELECT b.id, b.user_id, b.app_status, w.id AS wid, w.title, w.date, w.admission_type, w.announce_at, w.confirm_main_by
       FROM bookings b JOIN workshops w ON w.id = b.workshop_id
      WHERE w.admission_type = 'selection' AND w.announce_at IS NOT NULL AND w.status != 'cancelled'
        AND b.app_status IN ('approved', 'waitlisted', 'rejected') AND b.parent_booking_id IS NULL AND b.user_id IS NOT NULL
        AND w.date >= date('now', '+7 hours')
      LIMIT 500`,
  );
  const shown = decided.filter((r) => visibleAppStatus(r, r.app_status) !== 'applied');
  const memberDevices = await subscribedUsers(db, shown.map((r) => r.user_id));
  for (const r of shown) {
    if (!memberDevices.has(r.user_id)) continue;
    const payload: PushPayload =
      r.app_status === 'approved'
        ? {
            title: `ผ่านการคัดเลือก · ${r.title}`,
            body: `ยินดีด้วย! ยืนยันสิทธิ์ที่หน้าการจองของฉันภายในเวลาที่กำหนด · ${thDate(r.date)}`,
            url: '/me/bookings',
            tag: `booking-${r.id}`,
            card: {
              topic: 'select',
              hero: { kind: 'selected' },
              title: 'ยินดีด้วย คุณผ่านการคัดเลือก',
              sub: r.title,
              rows: r.confirm_main_by ? [{ k: 'ยืนยันภายใน', v: thDeadline(r.confirm_main_by), color: BLUE }] : [{ k: 'วัน', v: thDate(r.date) }],
              cta: { label: 'ยืนยันสิทธิ์', url: '/me/bookings' },
            },
          }
        : r.app_status === 'waitlisted'
          ? {
              title: `อยู่ในรายชื่อสำรอง · ${r.title}`,
              body: 'ถ้ามีที่ว่าง เราจะแจ้งให้ทราบทันที',
              url: '/me/bookings',
              tag: `booking-${r.id}`,
              card: { topic: 'select', title: 'คุณอยู่ในรายชื่อสำรอง', sub: `${r.title}\nถ้ามีที่ว่าง เราจะแจ้งให้ทราบทันที`, cta: { label: 'ดูการจอง', url: '/me/bookings', dark: true } },
            }
          : {
              title: `ผลการคัดเลือก · ${r.title}`,
              body: 'ครั้งนี้ยังไม่ได้รับเลือก ขอบคุณที่สนใจ — ลองดูกิจกรรมอื่นที่ใกล้เคียงได้เลย',
              url: '/journeys',
              tag: `booking-${r.id}`,
              card: { topic: 'select', title: 'ครั้งนี้ยังไม่ได้รับเลือก', sub: `ขอบคุณที่สนใจ ${r.title} — ลองดูกิจกรรมอื่นที่ใกล้เคียงได้เลย`, cta: { label: 'ดูกิจกรรมอื่น', url: '/journeys', dark: true } },
            };
    if (await send(`select:${r.id}:${r.app_status}`, r.user_id, payload, 'booking')) counts.selection++;
  }

  // A gift or a transferred seat that was claimed: to the new holder and to the giver.
  const claimed = await all<{ id: string; kind: string; from_user_id: string | null; to_user_id: string | null; to_name: string | null; title: string; date: string }>(
    `SELECT t.id, t.kind, t.from_user_id, t.to_user_id, t.to_name, w.title, w.date
       FROM ticket_transfers t JOIN workshops w ON w.id = t.workshop_id
      WHERE t.status = 'claimed' AND t.claimed_at IS NOT NULL AND datetime(t.claimed_at) >= datetime('now', '-60 minutes')
      LIMIT 100`,
  ).catch(() => []);
  for (const t of claimed) {
    if (t.to_user_id) {
      const ok = await send(
        `transfer-to:${t.id}`,
        t.to_user_id,
        {
          title: t.kind === 'gift' ? 'ได้รับของขวัญเป็นที่นั่ง 🎁' : 'ได้รับสิทธิ์เข้าร่วมแล้ว',
          body: `${t.title} ${thDate(t.date)} — ดูรายละเอียดที่การจองของฉัน`,
          url: '/me/bookings',
          tag: `transfer-${t.id}`,
          card:
            t.kind === 'gift'
              ? { topic: 'gift', hero: { kind: 'gift' }, title: 'มีคนให้ที่นั่งเป็นของขวัญ', sub: `${t.title} · ${thDate(t.date)}`, cta: { label: 'เปิดของขวัญ', url: '/me/bookings' } }
              : { topic: 'gift', title: 'ได้รับสิทธิ์เข้าร่วมแล้ว', sub: `${t.title} · ${thDate(t.date)}`, cta: { label: 'ดูตั๋วของฉัน', url: '/me/bookings' } },
        },
        'booking',
      );
      if (ok) counts.transfer++;
    }
    if (t.from_user_id && t.from_user_id !== t.to_user_id) {
      const ok = await send(
        `transfer-from:${t.id}`,
        t.from_user_id,
        {
          title: t.kind === 'gift' ? 'ของขวัญถูกรับแล้ว' : 'มีคนรับสิทธิ์ต่อแล้ว',
          body: `${first(t.to_name, 'ผู้รับ')} รับที่นั่ง ${t.title} แล้ว`,
          url: '/me/bookings',
          tag: `transfer-${t.id}`,
          card: {
            topic: 'gift',
            title: `${first(t.to_name, 'ผู้รับ')} รับที่นั่งแล้ว`,
            sub: t.kind === 'gift' ? `ของขวัญ ${t.title} ถึงมือแล้ว` : `ที่นั่ง ${t.title} มีคนรับต่อแล้ว`,
            cta: { label: 'ดูการจอง', url: '/me/bookings', dark: true },
          },
        },
        'booking',
      );
      if (ok) counts.transfer++;
    }
  }

  // The after-activity survey just opened — or the round it was ready for
  // just ended (an activity's AAR is set up before its rounds happen): to
  // everyone checked in who has not answered.
  const invites = await all<{ survey_id: string; wid: string; title: string; user_id: string }>(
    `SELECT s.id AS survey_id, w.id AS wid, w.title, b.user_id
       FROM surveys s JOIN workshops w ON w.id = s.workshop_id JOIN bookings b ON b.workshop_id = w.id
      WHERE s.is_open = 1 AND b.user_id IS NOT NULL
        AND (datetime(s.created_at) >= datetime('now', '-60 minutes')
          OR datetime(COALESCE(NULLIF(w.end_date, ''), w.date) || ' ' || COALESCE(NULLIF(w.time_end, ''), '23:59'), '-7 hours') BETWEEN datetime('now', '-60 minutes') AND datetime('now'))
        AND (b.attended = 1 OR instr(COALESCE(b.attendance_json, ''), ':1') > 0)
        AND NOT EXISTS (SELECT 1 FROM survey_responses r WHERE r.survey_id = s.id AND r.user_id = b.user_id)
      LIMIT 500`,
  ).catch(() => []);
  const surveyDevices = await subscribedUsers(db, invites.map((r) => r.user_id));
  for (const r of invites) {
    if (!surveyDevices.has(r.user_id)) continue;
    const ok = await send(
      `survey:${r.survey_id}:${r.user_id}`,
      r.user_id,
      {
        title: `ช่วยเล่าความรู้สึกหลัง ${r.title}`,
        body: 'แบบสอบถามสั้น ๆ ไม่ถึง 1 นาที — ผู้จัดจะได้ทำครั้งหน้าให้ดีขึ้น',
        url: `/survey/${r.wid}`,
        tag: `survey-${r.wid}`,
        card: {
          topic: 'voice',
          title: 'วันนี้เป็นอย่างไรบ้าง',
          sub: `เล่าความรู้สึกหลัง ${r.title} ไม่ถึง 1 นาที — ผู้จัดจะได้ทำครั้งหน้าให้ดีขึ้น`,
          stars: { n: 0, ask: true, hint: 'แตะเพื่อเริ่ม' },
          cta: { label: 'ตอบแบบสอบถาม', url: `/survey/${r.wid}` },
        },
      },
      'booking',
    );
    if (ok) counts.survey++;
  }

  return counts;
}
