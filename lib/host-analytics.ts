import { computePayout } from '@/lib/workshop-utils';
import { applicantName } from '@/lib/applicant';

/* The numbers behind the full Host Dashboard (slide deck 10, migration 071).
 *
 * Everything is worked out here, once, from the host's own rounds and their
 * bookings, so every tab reads the same figures. Rules that hold throughout:
 * - sales count by the day the money landed (paid_at), refunds come off in the
 *   period they were refunded
 * - a person is "checked in" when marked present on any day of the round
 * - a rate that rests on fewer than MIN_PEOPLE people is withheld (null), so
 *   nobody can be singled out and nobody reads meaning into noise
 * - nothing here is compared with other hosts; cross-host figures are totals
 * - times: SQLite timestamps are UTC, round dates/times are Thai wall clock */

export const MIN_PEOPLE = 5;
const DAY = 86400000;
const TH = 7 * 3600000;

type WS = {
  id: string;
  title: string;
  master_id: string | null;
  master_title: string | null;
  master_kind: string | null;
  date: string;
  end_date: string | null;
  time_start: string;
  time_end: string;
  max_participants: number;
  status: string;
  price: number;
  payment_type: string | null;
  created_at: string;
  payout_deduction_type: 'none' | 'fixed' | 'percent' | null;
  payout_deduction_value: number | null;
  payout_status: string | null;
};
type BK = {
  id: string;
  workshop_id: string;
  user_id: string | null;
  status: string;
  payment_status: string;
  amount: number;
  host_credit: number | null;
  group_size: number | null;
  booking_kind: string | null;
  parent_booking_id: string | null;
  attended: number | null;
  attendance_json: string | null;
  created_at: string;
  paid_at: string | null;
  cancel_reason: string | null;
  source: string | null;
  link_id: string | null;
  utm_campaign: string | null;
  app_status: string | null;
  application_json: string | null;
  user_name: string | null;
  dob: string | null;
};

export type HostData = {
  ws: WS[];
  bk: BK[];
  views: { day: string; workshop_id: string; n: number }[];
  impressions: { day: string; workshop_id: string; n: number }[];
  surveys: Set<string>;
  responses: { workshop_id: string; user_id: string; rating: number; comment: string | null; created_at: string }[];
  reviews: { workshop_id: string; rating: number; comment: string | null; created_at: string }[];
  payouts: { id: string; doc_no: string; workshop_id: string; net: number; occurred_at: string; status: string; ref_id: string | null }[];
  refundAt: Map<string, string>;
  links: { id: string; label: string | null; target: string | null; utm_source: string | null; utm_medium: string | null; utm_campaign: string | null; active: number; created_at: string }[];
  clicks: { day: string; link_id: string; n: number }[];
  /** Per participant of this host: when they first checked in anywhere on ASL. */
  platformFirst: Map<string, number>;
  /** Paid bookings of this host's participants with other hosts (time only). */
  elsewhere: { user_id: string; paid_at: string }[];
};

const OWNED = `(w.instructor_id = ?1 OR EXISTS (SELECT 1 FROM json_each(COALESCE(w.dashboard_access_json, '[]')) WHERE json_each.value = ?1))`;

/** Everything one host's dashboard needs, in a handful of queries. */
export async function loadHostData(db: D1Database, hostId: string): Promise<HostData> {
  const all = <T>(sql: string) => db.prepare(sql).bind(hostId).all<T>().then((r) => r.results || []);
  const [ws, bk, views, impressions, surveys, responses, reviews, payouts, refunds, links, clicks] = await Promise.all([
    all<WS>(
      `SELECT w.id, w.title, w.master_id, m.title AS master_title, m.kind AS master_kind, w.date, w.end_date, w.time_start, w.time_end,
              w.max_participants, w.status, w.price, w.payment_type, w.created_at, w.payout_deduction_type, w.payout_deduction_value, w.payout_status
         FROM workshops w LEFT JOIN workshop_masters m ON m.id = w.master_id WHERE ${OWNED}`,
    ),
    all<BK>(
      `SELECT b.id, b.workshop_id, b.user_id, b.status, b.payment_status, b.amount, b.host_credit, b.group_size, b.booking_kind,
              b.parent_booking_id, b.attended, b.attendance_json, b.created_at, b.paid_at, b.cancel_reason, b.source, b.link_id,
              b.utm_campaign, b.app_status, b.application_json,
              COALESCE(NULLIF(TRIM(u.nickname), ''), u.name) AS user_name, u.date_of_birth AS dob
         FROM bookings b JOIN workshops w ON w.id = b.workshop_id LEFT JOIN users u ON u.id = b.user_id WHERE ${OWNED}`,
    ),
    all<{ day: string; workshop_id: string; n: number }>(
      `SELECT v.day, v.workshop_id, COUNT(*) AS n FROM activity_views v JOIN workshops w ON w.id = v.workshop_id WHERE ${OWNED} GROUP BY v.day, v.workshop_id`,
    ),
    all<{ day: string; workshop_id: string; n: number }>(
      `SELECT i.day, i.workshop_id, i.n FROM activity_impressions i JOIN workshops w ON w.id = i.workshop_id WHERE ${OWNED}`,
    ),
    all<{ workshop_id: string }>(`SELECT s.workshop_id FROM surveys s JOIN workshops w ON w.id = s.workshop_id WHERE ${OWNED}`),
    all<HostData['responses'][number]>(
      `SELECT r.workshop_id, r.user_id, r.rating, r.comment, r.created_at FROM survey_responses r JOIN workshops w ON w.id = r.workshop_id WHERE ${OWNED}`,
    ),
    all<HostData['reviews'][number]>(
      `SELECT r.workshop_id, r.rating, r.comment, r.created_at FROM reviews r JOIN workshops w ON w.id = r.workshop_id WHERE ${OWNED}`,
    ),
    all<HostData['payouts'][number]>(
      `SELECT t.id, t.doc_no, t.workshop_id, t.net, t.occurred_at, t.status, t.ref_id FROM money_tx t JOIN workshops w ON w.id = t.workshop_id
        WHERE t.kind = 'host_payout' AND ${OWNED} ORDER BY t.occurred_at DESC`,
    ),
    all<{ booking_id: string; occurred_at: string }>(
      `SELECT t.booking_id, MIN(t.occurred_at) AS occurred_at FROM money_tx t JOIN workshops w ON w.id = t.workshop_id
        WHERE t.kind = 'refund' AND t.status = 'done' AND t.booking_id IS NOT NULL AND ${OWNED} GROUP BY t.booking_id`,
    ),
    all<HostData['links'][number]>(
      `SELECT id, label, target, utm_source, utm_medium, utm_campaign, active, created_at FROM host_links WHERE host_id = ?1 ORDER BY created_at DESC`,
    ),
    all<{ day: string; link_id: string; n: number }>(
      `SELECT c.day, c.link_id, COUNT(*) AS n FROM link_clicks c JOIN host_links l ON l.id = c.link_id WHERE l.host_id = ?1 GROUP BY c.day, c.link_id`,
    ),
  ]);

  // Cross-host facts, reduced to what the totals need.
  const people = `(SELECT DISTINCT b.user_id FROM bookings b JOIN workshops w ON w.id = b.workshop_id WHERE ${OWNED} AND b.user_id IS NOT NULL)`;
  const [firsts, elsewhere] = await Promise.all([
    all<{ user_id: string; first: string }>(
      `SELECT b.user_id, MIN(w.date || 'T' || w.time_start) AS first FROM bookings b JOIN workshops w ON w.id = b.workshop_id
        WHERE b.user_id IN ${people} AND (b.attended = 1 OR instr(COALESCE(b.attendance_json, ''), ':1') > 0)
        GROUP BY b.user_id`,
    ),
    all<{ user_id: string; paid_at: string }>(
      `SELECT b.user_id, b.paid_at FROM bookings b JOIN workshops w ON w.id = b.workshop_id
        WHERE b.user_id IN ${people} AND b.paid_at IS NOT NULL AND b.status != 'cancelled' AND NOT ${OWNED}`,
    ),
  ]);

  return {
    ws,
    bk,
    views,
    impressions,
    surveys: new Set(surveys.map((s) => s.workshop_id)),
    responses,
    reviews,
    payouts,
    refundAt: new Map(refunds.map((r) => [r.booking_id, r.occurred_at])),
    links,
    clicks,
    platformFirst: new Map(firsts.map((f) => [f.user_id, wallToMs(f.first.slice(0, 10), f.first.slice(11, 16))])),
    elsewhere,
  };
}

/* ---------------- time ---------------- */

/** SQLite UTC "YYYY-MM-DD HH:MM:SS" → ms. */
export const utcMs = (s: string | null | undefined) => (s ? Date.parse(s.replace(' ', 'T') + (s.includes('Z') ? '' : 'Z')) || 0 : 0);
/** Thai wall clock date + "HH:MM" → ms. */
export const wallToMs = (date: string, time = '00:00') => Date.parse(`${date}T${(time || '00:00').slice(0, 5)}:00+07:00`) || 0;
/** Ledger occurred_at ("YYYY-MM-DDTHH:MM", Thai) → ms. */
const ledgerMs = (s: string) => wallToMs(s.slice(0, 10), s.slice(11, 16));
/** ms → Thai "YYYY-MM-DD". */
export const thaiDay = (ms: number) => new Date(ms + TH).toISOString().slice(0, 10);
const thaiHour = (ms: number) => new Date(ms + TH).getUTCHours();
/** 0 = Monday … 6 = Sunday, Thai time. */
const thaiDow = (ms: number) => (new Date(ms + TH).getUTCDay() + 6) % 7;

export type Range = { from: string; to: string; fromMs: number; toMs: number; prevFromMs: number; prevToMs: number; days: number };

/** Inclusive Thai dates → a window plus the equally long window before it. */
export function makeRange(from: string, to: string): Range {
  const fromMs = wallToMs(from);
  const toMs = wallToMs(to) + DAY;
  const len = Math.max(DAY, toMs - fromMs);
  return { from, to, fromMs, toMs, prevFromMs: fromMs - len, prevToMs: fromMs, days: Math.round(len / DAY) };
}

/* ---------------- small helpers ---------------- */

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);
/** A rate about people, withheld below the privacy floor. */
const peoplePct = (a: number, b: number) => (b >= MIN_PEOPLE ? pct(a, b) : null);
const round2 = (n: number) => Math.round(n * 100) / 100;
const DOW_TH = ['จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์', 'อาทิตย์'];

const wsStart = (w: WS) => wallToMs(w.date, w.time_start);
const wsEnd = (w: WS) => wallToMs(w.end_date || w.date, w.time_end || w.time_start);
const gross = (b: BK) => (Number(b.amount) || 0) + (Number(b.host_credit) || 0);
const seatsOf = (b: BK, cap: number) => (b.parent_booking_id ? 0 : b.booking_kind === 'private' ? cap : b.group_size || 1);
/** The seat was paid for (or secured free) at some point. */
const wasCollected = (b: BK) => !!b.paid_at && (b.payment_status === 'paid' || b.payment_status === 'refunded' || b.status === 'confirmed' || b.status === 'cancelled');
/** Paid for and still held. */
const isLive = (b: BK) => b.status !== 'cancelled' && (b.payment_status === 'paid' || b.status === 'confirmed');
const checkedIn = (b: BK) => {
  if (b.attended === 1) return true;
  try {
    return Object.values(JSON.parse(b.attendance_json || '{}') as Record<string, number>).some((v) => v === 1);
  } catch {
    return false;
  }
};
/** Which activity a round belongs to: its master, or itself when standalone. */
const activityOf = (w: WS) => w.master_id || `w:${w.id}`;
const activityTitle = (w: WS) => w.master_title || w.title;
/** 0 morning (<12) · 1 afternoon (12–17) · 2 evening. */
const partOfDay = (t: string) => (Number(t.slice(0, 2)) < 12 ? 0 : Number(t.slice(0, 2)) < 17 ? 1 : 2);

function ageOf(b: BK, at: number): number | null {
  if (b.dob && /^\d{4}-\d{2}-\d{2}/.test(b.dob)) {
    const d = new Date(at + TH);
    const [y, m, dd] = b.dob.split('-').map(Number);
    let age = d.getUTCFullYear() - y;
    if (d.getUTCMonth() + 1 < m || (d.getUTCMonth() + 1 === m && d.getUTCDate() < dd)) age--;
    if (age > 0 && age < 120) return age;
  }
  try {
    const a = (JSON.parse(b.application_json || 'null') as { profile?: { age?: number } } | null)?.profile?.age;
    return typeof a === 'number' && a > 0 && a < 120 ? a : null;
  } catch {
    return null;
  }
}

/* ---------------- the computation ---------------- */

export type Analytics = ReturnType<typeof computeAnalytics>;

/** Every figure for one window, optionally narrowed to one activity. */
export function computeAnalytics(d: HostData, r: Range, activity: string | null, now = Date.now()) {
  const wsAll = d.ws;
  const ws = activity ? wsAll.filter((w) => activityOf(w) === activity) : wsAll;
  const wsById = new Map(wsAll.map((w) => [w.id, w]));
  const inScope = new Set(ws.map((w) => w.id));
  const bk = d.bk.filter((b) => inScope.has(b.workshop_id));
  const bkAll = d.bk;

  // Per-round deduction ratio, from what the round has collected so far.
  const ratio = new Map<string, number>();
  for (const w of wsAll) {
    const g = d.bk.filter((b) => b.workshop_id === w.id && isLive(b)).reduce((s, b) => s + gross(b), 0);
    const ded = g > 0 ? computePayout(g, w.payout_deduction_type || 'none', Number(w.payout_deduction_value) || 0).deduction : 0;
    ratio.set(w.id, g > 0 ? ded / g : w.payout_deduction_type === 'percent' ? (Number(w.payout_deduction_value) || 0) / 100 : 0);
  }

  // Money events: +gross when paid, −gross when a paid seat was given back.
  type Ev = { at: number; amount: number; fee: number; refund: boolean; b: BK };
  const events: Ev[] = [];
  for (const b of bk) {
    if (!wasCollected(b)) continue;
    const g = gross(b);
    const rt = ratio.get(b.workshop_id) || 0;
    const paid = utcMs(b.paid_at);
    events.push({ at: paid, amount: g, fee: g * rt, refund: false, b });
    if (b.status === 'cancelled' && g > 0) {
      const at = d.refundAt.get(b.id);
      events.push({ at: at ? ledgerMs(at) : paid, amount: -g, fee: -g * rt, refund: true, b });
    }
  }
  const money = (from: number, to: number) => {
    let sales = 0, fee = 0, refunds = 0, seats = 0;
    for (const e of events) {
      if (e.at < from || e.at >= to) continue;
      sales += e.amount;
      fee += e.fee;
      if (e.refund) refunds += -e.amount;
      else if (isLive(e.b)) seats += seatsOf(e.b, wsById.get(e.b.workshop_id)?.max_participants || 1);
    }
    return { sales: round2(sales), fee: round2(fee), refunds: round2(refunds), net: round2(sales - fee), seats };
  };

  // Rounds that took place in a window (not cancelled, already started).
  const held = (from: number, to: number) => ws.filter((w) => w.status !== 'cancelled' && wsStart(w) >= from && wsStart(w) < to && wsStart(w) <= now);
  const seatsSold = (w: WS) => d.bk.filter((b) => b.workshop_id === w.id && isLive(b)).reduce((s, b) => s + seatsOf(b, w.max_participants), 0);
  const fill = (rounds: WS[]) => {
    const cap = rounds.reduce((s, w) => s + (w.max_participants || 0), 0);
    return cap ? pct(rounds.reduce((s, w) => s + Math.min(seatsSold(w), w.max_participants), 0), cap) : null;
  };

  // Check-ins with this host: person → sorted round start times.
  const visits = new Map<string, number[]>();
  for (const b of bkAll) {
    if (!b.user_id || !checkedIn(b)) continue;
    const w = wsById.get(b.workshop_id);
    if (!w) continue;
    const arr = visits.get(b.user_id) || [];
    arr.push(wsStart(w));
    visits.set(b.user_id, arr);
  }
  visits.forEach((v) => v.sort((a, b) => a - b));
  const firstVisit = (u: string) => visits.get(u)?.[0] ?? null;
  // People who checked in to the activity being looked at (all of them when none is picked).
  const peopleInActivity = new Set(bk.filter((b) => b.user_id && checkedIn(b)).map((b) => b.user_id as string));
  // Paid bookings with this host per person (for "came back").
  const paidTimes = new Map<string, number[]>();
  for (const b of bkAll) {
    if (!b.user_id || !b.paid_at || b.status === 'cancelled') continue;
    const arr = paidTimes.get(b.user_id) || [];
    arr.push(utcMs(b.paid_at));
    paidTimes.set(b.user_id, arr);
  }
  /** Did this person book this host again within `win` ms after first check-in? */
  const cameBack = (u: string, win: number) => {
    const f = firstVisit(u);
    if (f == null) return false;
    return (paidTimes.get(u) || []).some((t) => t > f && t <= f + win);
  };
  const scopedPeople = (from: number, to: number) => {
    const s = new Set<string>();
    for (const b of bk) {
      const w = wsById.get(b.workshop_id)!;
      if (b.user_id && checkedIn(b) && wsStart(w) >= from && wsStart(w) < to) s.add(b.user_id);
    }
    return s;
  };
  const newIn = (from: number, to: number) =>
    [...scopedPeople(from, to)].filter((u) => {
      const f = firstVisit(u);
      return f != null && f >= from && f < to;
    });
  /** Repeat rate over first-timers whose window has fully passed. */
  const repeatOf = (win: number, firstFrom: number, firstTo: number) => {
    const cohort = [...peopleInActivity].filter((u) => {
      const f = firstVisit(u)!;
      return f >= firstFrom && f < firstTo && f + win <= now;
    });
    const back = cohort.filter((u) => cameBack(u, win)).length;
    return { rate: peoplePct(back, cohort.length), people: cohort.length, back };
  };

  /* ---- overview ---- */
  const cur = money(r.fromMs, r.toMs);
  const prev = money(r.prevFromMs, r.prevToMs);
  const heldCur = held(r.fromMs, r.toMs);
  const heldPrev = held(r.prevFromMs, r.prevToMs);
  // The front-page repeat rate: cohorts whose 90 days are complete, from the last 3 months of them.
  const card90 = repeatOf(90 * DAY, now - 180 * DAY, now - 90 * DAY);
  const card90prev = repeatOf(90 * DAY, now - 270 * DAY, now - 180 * DAY);
  const cards = {
    sales: { cur: cur.sales, prev: prev.sales },
    net: { cur: cur.net, prev: prev.net },
    seats: { cur: cur.seats, prev: prev.seats },
    fill: { cur: fill(heldCur), prev: fill(heldPrev) },
    newPeople: { cur: newIn(r.fromMs, r.toMs).length, prev: newIn(r.prevFromMs, r.prevToMs).length },
    repeat90: { cur: card90.rate, prev: card90prev.rate, people: card90.people },
  };

  // Twelve weeks of sales (Monday-start, Thai), split round-based / standalone.
  const weekStart = (ms: number) => wallToMs(thaiDay(ms)) - thaiDow(ms) * DAY;
  const thisWeek = weekStart(now);
  const weekly = Array.from({ length: 12 }, (_, i) => {
    const from = thisWeek - (11 - i) * 7 * DAY;
    let rounds = 0, single = 0;
    for (const e of events) {
      if (e.at < from || e.at >= from + 7 * DAY) continue;
      if (wsById.get(e.b.workshop_id)?.master_kind === 'round') rounds += e.amount;
      else single += e.amount;
    }
    return { week: thaiDay(from), rounds: round2(rounds), single: round2(single) };
  });

  // Rounds in the next 7 days, with what to do about each.
  const upcoming = ws
    .filter((w) => w.status !== 'cancelled' && wsEnd(w) >= now && wsStart(w) < now + 7 * DAY)
    .sort((a, b) => wsStart(a) - wsStart(b))
    .map((w) => {
      const sold = seatsSold(w);
      const today = thaiDay(wsStart(w)) === thaiDay(now) || (wsStart(w) <= now && wsEnd(w) >= now);
      return {
        id: w.id,
        title: w.title,
        date: w.date,
        time: w.time_start,
        sold,
        cap: w.max_participants,
        action: today ? 'checkin' : sold / Math.max(1, w.max_participants) < 0.5 ? 'promote' : sold < w.max_participants ? 'share' : 'full',
      };
    });

  // Payouts as they really work today: admin transfers each round after it ends.
  const paidOut = new Set(d.payouts.filter((p) => p.status === 'done').map((p) => p.workshop_id));
  const roundNet = (w: WS) => {
    const g = d.bk.filter((b) => b.workshop_id === w.id && isLive(b)).reduce((s, b) => s + gross(b), 0);
    return round2(computePayout(g, w.payout_deduction_type || 'none', Number(w.payout_deduction_value) || 0).net);
  };
  const owed = ws
    .filter((w) => w.status !== 'cancelled' && wsEnd(w) < now && w.payout_status !== 'paid' && !paidOut.has(w.id))
    .map((w) => ({ id: w.id, title: w.title, date: w.date, net: roundNet(w) }))
    .filter((x) => x.net > 0);
  const notYet = ws
    .filter((w) => w.status !== 'cancelled' && wsEnd(w) >= now)
    .map((w) => ({ id: w.id, title: w.title, date: w.date, net: roundNet(w) }))
    .filter((x) => x.net > 0);
  const lastPaid = d.payouts.find((p) => p.status === 'done' && inScope.has(p.workshop_id));
  const payout = {
    owed: round2(owed.reduce((s, x) => s + x.net, 0)),
    owedRounds: owed,
    notYet: round2(notYet.reduce((s, x) => s + x.net, 0)),
    notYetRounds: notYet,
    last: lastPaid ? { doc_no: lastPaid.doc_no, net: lastPaid.net, occurred_at: lastPaid.occurred_at, title: wsById.get(lastPaid.workshop_id)?.title || '—' } : null,
  };

  // Things to do now. Each one links where it gets done.
  const todo: { kind: string; text: string; href: string }[] = [];
  for (const u of upcoming) {
    if (u.action === 'checkin') todo.push({ kind: 'checkin', text: `วันนี้มีรอบ "${u.title}" ${u.time} น. — เช็คชื่อผู้เข้าร่วม`, href: `/host/journeys/${u.id}` });
  }
  for (const w of ws) {
    const s = wsStart(w);
    if (w.status === 'cancelled' || s < now || s > now + 3 * DAY) continue;
    const sold = seatsSold(w);
    if (sold / Math.max(1, w.max_participants) < 0.5) {
      const hrs = Math.max(1, Math.round((s - now) / 3600000));
      todo.push({
        kind: 'unsold',
        text: `รอบ "${w.title}" ${Number(w.date.slice(8))}/${Number(w.date.slice(5, 7))} ยังว่าง ${w.max_participants - sold} ที่ (อีก ${hrs < 48 ? `${hrs} ชม.` : `${Math.round(hrs / 24)} วัน`}) — แชร์ลิงก์ของคุณ`,
        href: `/host/overview?tab=marketing`,
      });
    }
  }
  for (const w of ws) {
    const e = wsEnd(w);
    if (w.status === 'cancelled' || e > now || e < now - 14 * DAY || d.surveys.has(w.id)) continue;
    if (!d.bk.some((b) => b.workshop_id === w.id && checkedIn(b))) continue;
    todo.push({ kind: 'survey', text: `รอบ "${w.title}" จบแล้ว — สร้างแบบสอบถามหลังกิจกรรม`, href: `/host/journeys/${w.id}` });
  }

  /* ---- activities & rounds ---- */
  const byActivity = new Map<string, WS[]>();
  for (const w of ws) byActivity.set(activityOf(w), [...(byActivity.get(activityOf(w)) || []), w]);
  const dayFrom = thaiDay(r.fromMs);
  const dayTo = thaiDay(r.toMs);
  const viewsIn = (ids: Set<string>) => d.views.filter((v) => ids.has(v.workshop_id) && v.day >= dayFrom && v.day < dayTo).reduce((s, v) => s + v.n, 0);
  const impressionsIn = (ids: Set<string>) => d.impressions.filter((v) => ids.has(v.workshop_id) && v.day >= dayFrom && v.day < dayTo).reduce((s, v) => s + v.n, 0);
  const activities = [...byActivity.entries()].map(([key, rounds]) => {
    const ids = new Set(rounds.map((w) => w.id));
    const evs = events.filter((e) => ids.has(e.b.workshop_id) && e.at >= r.fromMs && e.at < r.toMs);
    const sales = evs.reduce((s, e) => s + e.amount, 0);
    const seats = evs.filter((e) => !e.refund && isLive(e.b)).reduce((s, e) => s + seatsOf(e.b, wsById.get(e.b.workshop_id)!.max_participants), 0);
    const paidBookings = evs.filter((e) => !e.refund && !e.b.parent_booking_id).length;
    const resp = d.responses.filter((x) => ids.has(x.workshop_id) && utcMs(x.created_at) >= r.fromMs && utcMs(x.created_at) < r.toMs);
    const views = viewsIn(ids);
    const heldHere = heldCur.filter((w) => ids.has(w.id));
    return {
      key,
      title: activityTitle(rounds[0]),
      kind: rounds[0].master_kind || 'single',
      upcoming: rounds.filter((w) => w.status !== 'cancelled' && wsStart(w) > now).length,
      held: heldHere.length,
      seats,
      fill: fill(heldHere),
      sales: round2(sales),
      avgPrice: seats ? round2(sales / seats) : null,
      csat: resp.length >= MIN_PEOPLE ? round2(resp.reduce((s, x) => s + x.rating, 0) / resp.length) : null,
      views,
      impressions: impressionsIn(ids),
      conversion: views ? pct(paidBookings, views) : null,
    };
  });

  // Fill by weekday × part of day, over rounds held in the window.
  const fillGrid = Array.from({ length: 7 }, (_, dow) =>
    [0, 1, 2].map((p) => {
      const rounds = heldCur.filter((w) => thaiDow(wsStart(w)) === dow && partOfDay(w.time_start) === p);
      return { rounds: rounds.length, fill: fill(rounds) };
    }),
  );

  // Time to first sale and how fast rounds fill up.
  const firstSale: number[] = [];
  const soldOut: { id: string; title: string; daysBefore: number }[] = [];
  for (const w of ws) {
    const paid = d.bk.filter((b) => b.workshop_id === w.id && isLive(b) && b.paid_at).sort((a, b) => utcMs(a.paid_at) - utcMs(b.paid_at));
    const created = utcMs(w.created_at);
    if (paid.length && created >= r.fromMs && created < r.toMs) firstSale.push((utcMs(paid[0].paid_at) - created) / 3600000);
    let n = 0;
    for (const b of paid) {
      n += seatsOf(b, w.max_participants);
      if (n >= w.max_participants) {
        if (wsStart(w) >= r.fromMs && wsStart(w) < r.toMs) soldOut.push({ id: w.id, title: w.title, daysBefore: round2((wsStart(w) - utcMs(b.paid_at)) / DAY) });
        break;
      }
    }
  }
  const roundsInWindow = ws.filter((w) => w.status !== 'cancelled' && wsStart(w) >= r.fromMs && wsStart(w) < r.toMs);
  const fastest = [...soldOut].sort((a, b) => b.daysBefore - a.daysBefore)[0] || null;

  // When people pay (weekday × hour) and how far ahead.
  const heat = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
  const leads: number[] = [];
  const leadBuckets = [0, 0, 0, 0];
  for (const e of events) {
    if (e.refund || e.b.parent_booking_id || e.at < r.fromMs || e.at >= r.toMs) continue;
    heat[thaiDow(e.at)][thaiHour(e.at)]++;
    const lead = (wsStart(wsById.get(e.b.workshop_id)!) - e.at) / DAY;
    if (lead >= 0) {
      leads.push(lead);
      leadBuckets[lead < 2 ? 0 : lead < 8 ? 1 : lead < 15 ? 2 : 3]++;
    }
  }

  // Funnel: unique page visitors/day → bookings started → paid.
  const started = new Set(
    bk.filter((b) => !b.parent_booking_id && utcMs(b.created_at) >= r.fromMs && utcMs(b.created_at) < r.toMs).map((b) => `${b.user_id}:${b.workshop_id}`),
  ).size;
  const paidCount = events.filter((e) => !e.refund && !e.b.parent_booking_id && e.at >= r.fromMs && e.at < r.toMs).length;
  const funnel = { views: viewsIn(inScope), impressions: impressionsIn(inScope), started, paid: paidCount };

  // Outcomes of the seats in rounds that have ended.
  const endedIds = new Set(ws.filter((w) => wsEnd(w) < now && wsStart(w) >= r.fromMs && wsStart(w) < r.toMs).map((w) => w.id));
  const outcome = { came: 0, cancelled: 0, noShow: 0, total: 0 };
  for (const b of bk) {
    if (!endedIds.has(b.workshop_id) || !wasCollected(b)) continue;
    outcome.total++;
    if (b.status === 'cancelled') outcome.cancelled++;
    else if (checkedIn(b)) outcome.came++;
    else outcome.noShow++;
  }
  const windowIds = new Set(roundsInWindow.map((w) => w.id));
  const inWindowPaid = bk.filter((b) => wasCollected(b) && windowIds.has(b.workshop_id));
  const months = Math.max(1, r.days / 30);
  const roundsTab = {
    activities,
    fillGrid,
    firstSaleHours: median(firstSale),
    soldOut: {
      medianDaysBefore: median(soldOut.map((s) => s.daysBefore)),
      fastest,
      fullPct: pct(soldOut.length, roundsInWindow.length),
      fullRounds: soldOut.length,
      rounds: roundsInWindow.length,
    },
    heat,
    leadMedianDays: median(leads),
    leadBuckets,
    funnel,
    outcome: { ...outcome, cameP: pct(outcome.came, outcome.total), cancelledP: pct(outcome.cancelled, outcome.total), noShowP: pct(outcome.noShow, outcome.total) },
    userCancelP: pct(inWindowPaid.filter((b) => b.cancel_reason === 'refund_requested').length, inWindowPaid.length),
    hostCancelled6m: wsAll.filter((w) => w.status === 'cancelled' && wsStart(w) >= now - 182 * DAY && d.bk.some((b) => b.workshop_id === w.id && wasCollected(b))).length,
    perMonth: round2(heldCur.length / months),
    freeShare: pct(heldCur.filter((w) => (w.payment_type || 'paid') === 'free').length, heldCur.length),
    waitlisted: bk.filter((b) => b.app_status === 'waitlisted' && windowIds.has(b.workshop_id)).length,
  };

  /* ---- participants ---- */
  const peopleCur = scopedPeople(r.fromMs, r.toMs);
  const newCur = newIn(r.fromMs, r.toMs);
  const nowTh = new Date(now + TH);
  const monthsBack = Array.from({ length: 12 }, (_, i) =>
    new Date(Date.UTC(nowTh.getUTCFullYear(), nowTh.getUTCMonth() - (11 - i), 1)).toISOString().slice(0, 7),
  );
  const monthRange = (ym: string) => {
    const [y, m] = ym.split('-').map(Number);
    const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
    return [wallToMs(`${ym}-01`), wallToMs(`${next}-01`)] as const;
  };
  const monthlyPeople = monthsBack.map((ym) => {
    const [from, to] = monthRange(ym);
    const everyone = scopedPeople(from, to);
    const fresh = newIn(from, to).length;
    return { month: ym, new: fresh, returning: everyone.size - fresh };
  });
  const cohorts = monthsBack.map((ym) => {
    const [from, to] = monthRange(ym);
    const cohort = [...peopleInActivity].filter((u) => {
      const f = firstVisit(u)!;
      return f >= from && f < to;
    });
    // A cell stays empty until every member of the cohort has had the full window.
    const at = (win: number) => (to + win > now ? null : peoplePct(cohort.filter((u) => cameBack(u, win)).length, cohort.length));
    return { month: ym, people: cohort.length, r30: at(30 * DAY), r60: at(60 * DAY), r90: at(90 * DAY) };
  });
  // Elsewhere on ASL within 90 days of first check-in with this host (totals only).
  const elsewhereBy = new Map<string, number[]>();
  for (const e of d.elsewhere) elsewhereBy.set(e.user_id, [...(elsewhereBy.get(e.user_id) || []), utcMs(e.paid_at)]);
  const firstTimers = [...peopleInActivity].filter((u) => firstVisit(u)! + 90 * DAY <= now);
  const wentOn = firstTimers.filter((u) => (elsewhereBy.get(u) || []).some((t) => t > firstVisit(u)! && t <= firstVisit(u)! + 90 * DAY)).length;
  const platformFirsts = [...peopleInActivity].filter((u) => d.platformFirst.get(u) === firstVisit(u)).length;
  const regulars = [...visits.entries()]
    .filter(([u, v]) => v.length >= 3 && peopleInActivity.has(u))
    .map(([u, v]) => {
      const b = bkAll.find((x) => x.user_id === u);
      return { name: b ? applicantName(b.application_json, b.user_name) : '—', visits: v.length, last: thaiDay(v[v.length - 1]) };
    })
    .sort((a, b) => b.visits - a.visits);
  const ages: number[] = [];
  const seenAge = new Set<string>();
  for (const b of bk) {
    const w = wsById.get(b.workshop_id)!;
    if (!b.user_id || seenAge.has(b.user_id) || !checkedIn(b) || wsStart(w) < r.fromMs || wsStart(w) >= r.toMs) continue;
    const a = ageOf(b, wsStart(w));
    if (a != null) {
      ages.push(a);
      seenAge.add(b.user_id);
    }
  }
  const bands = [
    { label: 'ต่ำกว่า 18', test: (a: number) => a < 18 },
    { label: '18–24', test: (a: number) => a >= 18 && a <= 24 },
    { label: '25–34', test: (a: number) => a >= 25 && a <= 34 },
    { label: '35–44', test: (a: number) => a >= 35 && a <= 44 },
    { label: '45+', test: (a: number) => a >= 45 },
  ].map((band) => {
    const n = ages.filter(band.test).length;
    return { label: band.label, n: n >= MIN_PEOPLE ? n : null, share: n >= MIN_PEOPLE ? pct(n, ages.length) : null };
  });
  const repeatWin = (days: number | null) => {
    const win = days == null ? 3650 * DAY : days * DAY;
    const cohort = [...peopleInActivity].filter((u) => days == null || firstVisit(u)! + win <= now);
    const back = cohort.filter((u) => cameBack(u, win)).length;
    return { rate: peoplePct(back, cohort.length), back, people: cohort.length };
  };
  const people = {
    total: peopleCur.size,
    new: newCur.length,
    returning: peopleCur.size - newCur.length,
    monthly: monthlyPeople,
    repeat: { d30: repeatWin(30), d90: repeatWin(90), d180: repeatWin(180), all: repeatWin(null) },
    cohorts,
    aslReturn: { rate: peoplePct(wentOn, firstTimers.length), people: firstTimers.length },
    platformFirst: platformFirsts,
    regulars,
    ages: { bands, avg: ages.length >= MIN_PEOPLE ? Math.round(ages.reduce((s, a) => s + a, 0) / ages.length) : null, people: ages.length },
  };

  /* ---- money ---- */
  const moneyMonthly = monthsBack.map((ym) => {
    const [from, to] = monthRange(ym);
    return { month: ym, ...money(from, to) };
  });
  const moneyTab = {
    monthly: moneyMonthly,
    payout,
    history: d.payouts
      .filter((p) => inScope.has(p.workshop_id))
      .map((p) => ({ id: p.id, doc_no: p.doc_no, net: p.net, occurred_at: p.occurred_at, status: p.status, title: wsById.get(p.workshop_id)?.title || '—', date: wsById.get(p.workshop_id)?.date || null })),
    deductions: ws
      .filter((w) => w.status !== 'cancelled' && wsStart(w) >= now - 120 * DAY)
      .map((w) => ({ id: w.id, title: w.title, date: w.date, type: w.payout_deduction_type || 'none', value: Number(w.payout_deduction_value) || 0 }))
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 40),
    vat: { last12: money(now - 365 * DAY, now + DAY).sales, threshold: 1800000 },
  };

  /* ---- feedback ---- */
  const surveyed = ws.filter((w) => d.surveys.has(w.id) && wsStart(w) >= r.fromMs && wsStart(w) < r.toMs);
  const surveyedIds = new Set(surveyed.map((w) => w.id));
  const checkedInSurveyed = bk.filter((b) => surveyedIds.has(b.workshop_id) && checkedIn(b) && b.user_id).length;
  const resp = d.responses.filter((x) => surveyedIds.has(x.workshop_id));
  const rv = d.reviews.filter((x) => inScope.has(x.workshop_id) && utcMs(x.created_at) >= r.fromMs && utcMs(x.created_at) < r.toMs);
  const feedback = {
    rounds: surveyed.length,
    responses: resp.length,
    responseRate: peoplePct(resp.length, checkedInSurveyed),
    csat: resp.length >= MIN_PEOPLE ? round2(resp.reduce((s, x) => s + x.rating, 0) / resp.length) : null,
    dist: resp.length >= MIN_PEOPLE ? [1, 2, 3, 4, 5].map((s) => resp.filter((x) => x.rating === s).length) : null,
    comments: resp
      .filter((x) => (x.comment || '').trim())
      .sort((a, b) => utcMs(b.created_at) - utcMs(a.created_at))
      .slice(0, 8)
      .map((x) => ({ rating: x.rating, comment: x.comment as string, title: wsById.get(x.workshop_id)?.title || '—', at: thaiDay(utcMs(x.created_at)) })),
    reviews: {
      count: rv.length,
      avg: rv.length ? round2(rv.reduce((s, x) => s + x.rating, 0) / rv.length) : null,
      latest: [...rv]
        .sort((a, b) => utcMs(b.created_at) - utcMs(a.created_at))
        .slice(0, 5)
        .map((x) => ({ rating: x.rating, comment: x.comment, title: wsById.get(x.workshop_id)?.title || '—', at: thaiDay(utcMs(x.created_at)) })),
    },
  };

  /* ---- marketing ---- */
  const paidIn = events.filter((e) => !e.refund && !e.b.parent_booking_id && e.at >= r.fromMs && e.at < r.toMs);
  const sourceCount = new Map<string, number>();
  for (const e of paidIn) sourceCount.set(e.b.source || 'unknown', (sourceCount.get(e.b.source || 'unknown') || 0) + 1);
  const campaigns = new Map<string, number>();
  for (const e of paidIn) if (e.b.utm_campaign) campaigns.set(e.b.utm_campaign, (campaigns.get(e.b.utm_campaign) || 0) + 1);
  const marketing = {
    sources: [...sourceCount.entries()].map(([source, n]) => ({ source, n, share: pct(n, paidIn.length) })).sort((a, b) => b.n - a.n),
    campaigns: [...campaigns.entries()].map(([campaign, n]) => ({ campaign, n })).sort((a, b) => b.n - a.n),
    links: d.links.map((l) => {
      const via = paidIn.filter((e) => e.b.link_id === l.id);
      return {
        ...l,
        clicks: d.clicks.filter((c) => c.link_id === l.id && c.day >= r.from && c.day <= r.to).reduce((s, c) => s + c.n, 0),
        bookings: via.length,
        sales: round2(via.reduce((s, e) => s + e.amount, 0)),
      };
    }),
  };

  /* ---- highlight insights: written rules, shown only when the data clears them ---- */
  const insights: { id: string; text: string; basis: string }[] = [];
  const doneRounds = ws.filter((w) => wsStart(w) <= now && w.status !== 'cancelled').length;
  const sales = events.filter((e) => !e.refund && !e.b.parent_booking_id && e.at >= r.fromMs && e.at < r.toMs);
  if (doneRounds >= 5 && sales.length >= 10) {
    const slots = new Map<string, number>();
    for (const e of sales) {
      const k = `${thaiDow(e.at)}:${Math.floor(thaiHour(e.at) / 3) * 3}`;
      slots.set(k, (slots.get(k) || 0) + 1);
    }
    const avg = sales.length / 56;
    const [best, n] = [...slots.entries()].sort((a, b) => b[1] - a[1])[0];
    if (n >= avg * 1.3 && n >= 3) {
      const [dow, h] = best.split(':').map(Number);
      insights.push({
        id: 'golden',
        text: `คนจองกิจกรรมของคุณมากที่สุดวัน${DOW_TH[dow]} ช่วง ${String(h).padStart(2, '0')}:00–${String(h + 3).padStart(2, '0')}:00 น. — ลองโพสต์หรือเปิดรอบใหม่ช่วงนั้น`,
        basis: `${n} จาก ${sales.length} การจองในช่วงนี้ชำระในช่วงเวลานี้ของสัปดาห์ (มากกว่าค่าเฉลี่ยของช่วงเวลาอื่นเกิน 30%) · จากรอบที่จัดแล้ว ${doneRounds} รอบ`,
      });
    }
  }
  if (leads.length >= 20) {
    const late = leads.filter((l) => l < 3).length;
    if (late / leads.length >= 0.3) {
      insights.push({
        id: 'late',
        text: `ผู้เข้าร่วม ${Math.round((late / leads.length) * 100)}% จองใน 3 วันสุดท้ายก่อนวันจัด — ลองโพสต์ย้ำ 4 วันก่อนจัด`,
        basis: `${late} จาก ${leads.length} การจองในช่วงนี้ จองก่อนวันจัดไม่ถึง 3 วัน`,
      });
    }
  }
  for (const [, rounds] of byActivity) {
    const recent = rounds.filter((w) => w.status !== 'cancelled' && wsStart(w) <= now && wsStart(w) >= now - 90 * DAY).sort((a, b) => wsStart(a) - wsStart(b));
    const bySlot = new Map<string, WS[]>();
    for (const w of recent) {
      const k = `${thaiDow(wsStart(w))}:${partOfDay(w.time_start)}`;
      bySlot.set(k, [...(bySlot.get(k) || []), w]);
    }
    let found = false;
    for (const [slot, list] of bySlot) {
      let streak = 0, best = 0;
      for (const w of list) {
        streak = seatsSold(w) >= w.max_participants ? streak + 1 : 0;
        best = Math.max(best, streak);
      }
      if (best >= 3) {
        const [dow, p] = slot.split(':').map(Number);
        insights.push({
          id: `full-${activityOf(list[0])}`,
          text: `"${activityTitle(list[0])}" รอบวัน${DOW_TH[dow]}${['เช้า', 'บ่าย', 'เย็น'][p]}เต็มติดกัน ${best} รอบใน 3 เดือน — ลองเปิดรอบเพิ่ม`,
          basis: `${list.length} รอบในช่วงเวลานี้ภายใน 3 เดือน เต็มติดกันสูงสุด ${best} รอบ`,
        });
        found = true;
        break;
      }
    }
    if (found) break;
  }
  {
    const responders = new Set(d.responses.map((x) => x.user_id));
    const elig = [...peopleInActivity].filter((u) => firstVisit(u)! + 90 * DAY <= now);
    const a = elig.filter((u) => responders.has(u));
    const b = elig.filter((u) => !responders.has(u));
    if (a.length >= 10 && b.length >= 10) {
      const ra = a.filter((u) => cameBack(u, 90 * DAY)).length / a.length;
      const rb = b.filter((u) => cameBack(u, 90 * DAY)).length / b.length;
      if (rb > 0 && ra >= rb * 2) {
        insights.push({
          id: 'survey',
          text: `คนที่ตอบแบบสอบถามกลับมาจองซ้ำมากกว่าคนที่ไม่ตอบ ${(ra / rb).toFixed(1)} เท่า — ลองส่งแบบสอบถามทุกรอบ`,
          basis: `ตอบ ${a.length} คน กลับมา ${Math.round(ra * 100)}% · ไม่ตอบ ${b.length} คน กลับมา ${Math.round(rb * 100)}% (ภายใน 90 วัน)`,
        });
      }
    }
  }

  return {
    range: { from: r.from, to: r.to, days: r.days },
    activityOptions: [...new Map(wsAll.map((w) => [activityOf(w), activityTitle(w)])).entries()].map(([key, title]) => ({ key, title })),
    overview: { cards, weekly, upcoming, payout, todo: todo.slice(0, 6), insights: insights.slice(0, 3) },
    rounds: roundsTab,
    people,
    money: moneyTab,
    feedback,
    marketing,
    /** Figures for the sponsor report (lib/host-report), from the same window. */
    report: {
      views: funnel.views,
      participants: peopleCur.size,
      repeat90: card90.rate,
      fill: fill(heldCur),
      soldOutDaysBefore: median(soldOut.map((s) => s.daysBefore)),
      csat: feedback.csat,
      responseRate: feedback.responseRate,
      rounds: heldCur.length,
      ageBand: (() => {
        const top = [...bands].filter((b) => b.share != null).sort((a, b) => (b.share || 0) - (a.share || 0))[0];
        return top ? { label: top.label, share: top.share } : null;
      })(),
    },
  };
}
