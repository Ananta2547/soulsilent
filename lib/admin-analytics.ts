import { computePayout } from '@/lib/workshop-utils';
import { gpKindOf, gpOfBooking, loadGp, rateFor, roundFees, type GpContext, type GpKind } from '@/lib/gp';
import { MIN_PEOPLE, makeRange, thaiDay, utcMs, wallToMs, type Range } from '@/lib/host-analytics';

export { makeRange };

/* The numbers behind Admin Insights (/admin/insights): the whole platform,
 * worked out once per request from every round, booking and ledger row.
 *
 * Money words, used the same way on every tab:
 * - sales (GMV)   what bookings are worth to hosts: paid amount + what ASL
 *                 covers for a seat (bookings.host_credit — ASL-funded coupon
 *                 share and ASL invitation seats). Counted on paid_at; a refund
 *                 comes off when it was refunded (ledger), as on the Host Dashboard
 * - fee           what ASL keeps from hosts: GP by the table, or admin's manual
 *                 deduction for rounds set to 'manual'
 * - beam          Beam's fee, estimated from the rates admin sets (Beam does not
 *                 report it per charge); not given back on a refund
 * - subsidy       host_credit — money ASL pays hosts that no participant paid
 * - platform net  fee − beam − subsidy
 * - expenses      business expenses and payroll from the money ledger
 * - profit        platform net − expenses
 * Rates about people below MIN_PEOPLE are withheld (null), as for hosts. */

const DAY = 86400000;
const TH = 7 * 3600000;

type WS = {
  id: string;
  title: string;
  instructor_id: string | null;
  host_name: string | null;
  fee_mode: string | null;
  master_id: string | null;
  master_title: string | null;
  master_kind: string | null;
  category: string | null;
  is_online: number | null;
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
  utm_campaign: string | null;
  app_status: string | null;
  beam_charge_id: string | null;
  beam_qr_charge_id: string | null;
  coupon_id: string | null;
  discount_amount: number | null;
  host_discount: number | null;
};
type TX = { id: string; doc_no: string; kind: string; status: string; gross: number; net: number; occurred_at: string; booking_id: string | null; workshop_id: string | null; category_id: string | null; payee_email: string | null; emailed_at: string | null };

export type AdminData = {
  ws: WS[];
  bk: BK[];
  users: { id: string; created_at: string; dob: string | null }[];
  tx: TX[];
  categories: { id: string; name: string }[];
  coupons: { id: string; name: string }[];
  views: { day: string; n: number }[];
  impressions: { day: string; n: number }[];
  responses: { workshop_id: string; rating: number; comment: string | null; created_at: string }[];
  reviews: { workshop_id: string; rating: number; comment: string | null; created_at: string }[];
  orphans: { n: number; amount: number };
  app: { day: string; metric: string; n: number }[];
  pushSubs: number;
  beam: { qr: number | null; card: number | null };
  gp: GpContext;
};

const rows = <T>(db: D1Database, sql: string) => db.prepare(sql).all<T>().then((r) => r.results || []);

/** Everything Admin Insights needs, in one round of queries. */
export async function loadAdminData(db: D1Database): Promise<AdminData> {
  const [ws, bk, users, tx, categories, coupons, views, impressions, responses, reviews, orphans, app, push, settings] = await Promise.all([
    rows<WS>(
      db,
      `SELECT w.id, w.title, w.instructor_id, COALESCE(NULLIF(TRIM(u.nickname), ''), u.name) AS host_name, w.fee_mode, w.master_id, m.title AS master_title,
              m.kind AS master_kind, w.category, w.is_online, w.date, w.end_date, w.time_start, w.time_end, w.max_participants, w.status, w.price,
              w.payment_type, w.created_at, w.payout_deduction_type, w.payout_deduction_value, w.payout_status
         FROM workshops w LEFT JOIN workshop_masters m ON m.id = w.master_id LEFT JOIN users u ON u.id = w.instructor_id`,
    ),
    rows<BK>(
      db,
      `SELECT id, workshop_id, user_id, status, payment_status, amount, host_credit, group_size, booking_kind, parent_booking_id, attended,
              attendance_json, created_at, paid_at, cancel_reason, source, utm_campaign, app_status, beam_charge_id, beam_qr_charge_id,
              coupon_id, discount_amount, host_discount
         FROM bookings`,
    ),
    rows<AdminData['users'][number]>(db, `SELECT id, created_at, date_of_birth AS dob FROM users WHERE deleted_at IS NULL`),
    rows<TX>(db, `SELECT id, doc_no, kind, status, gross, net, occurred_at, booking_id, workshop_id, category_id, payee_email, emailed_at FROM money_tx WHERE status = 'done'`),
    rows<{ id: string; name: string }>(db, `SELECT id, name FROM expense_categories`),
    rows<{ id: string; name: string }>(db, `SELECT id, name FROM coupons`),
    rows<{ day: string; n: number }>(db, `SELECT day, COUNT(*) AS n FROM activity_views GROUP BY day`),
    rows<{ day: string; n: number }>(db, `SELECT day, SUM(n) AS n FROM activity_impressions GROUP BY day`),
    rows<AdminData['responses'][number]>(db, `SELECT workshop_id, rating, comment, created_at FROM survey_responses`),
    rows<AdminData['reviews'][number]>(db, `SELECT workshop_id, rating, comment, created_at FROM reviews`),
    db.prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(amount), 0) AS amount FROM orphan_payments WHERE resolved = 0`).first<{ n: number; amount: number }>(),
    rows<{ day: string; metric: string; n: number }>(db, `SELECT day, metric, n FROM app_stats`),
    db.prepare(`SELECT COUNT(*) AS n FROM push_subscriptions`).first<{ n: number }>(),
    rows<{ key: string; value: string }>(db, `SELECT key, value FROM admin_settings WHERE key IN ('beam_fee_qr', 'beam_fee_card')`),
  ]);
  const setting = (k: string) => {
    const v = settings.find((s) => s.key === k)?.value;
    return v != null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null;
  };
  return {
    ws,
    bk,
    users,
    tx,
    categories,
    coupons,
    views,
    impressions,
    responses,
    reviews,
    orphans: { n: orphans?.n || 0, amount: (orphans?.amount || 0) / 100 },
    app,
    pushSubs: push?.n || 0,
    beam: { qr: setting('beam_fee_qr'), card: setting('beam_fee_card') },
    gp: await loadGp(db, ws.map((w) => w.instructor_id)),
  };
}

/* ---------------- helpers ---------------- */

const ledgerMs = (s: string) => wallToMs(s.slice(0, 10), s.slice(11, 16));
const thaiHour = (ms: number) => new Date(ms + TH).getUTCHours();
const thaiDow = (ms: number) => (new Date(ms + TH).getUTCDay() + 6) % 7;
const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);
const peoplePct = (a: number, b: number) => (b >= MIN_PEOPLE ? pct(a, b) : null);
const round2 = (n: number) => Math.round(n * 100) / 100;
const sum = <T>(xs: T[], f: (x: T) => number) => round2(xs.reduce((s, x) => s + f(x), 0));

const wsStart = (w: WS) => wallToMs(w.date, w.time_start);
const wsEnd = (w: WS) => wallToMs(w.end_date || w.date, w.time_end || w.time_start);
const gross = (b: BK) => (Number(b.amount) || 0) + (Number(b.host_credit) || 0);
const seatsOf = (b: BK, cap: number) => (b.parent_booking_id ? 0 : b.booking_kind === 'private' ? cap : b.group_size || 1);
const wasCollected = (b: BK) => !!b.paid_at && (b.payment_status === 'paid' || b.payment_status === 'refunded' || b.status === 'confirmed' || b.status === 'cancelled');
const isLive = (b: BK) => b.status !== 'cancelled' && (b.payment_status === 'paid' || b.status === 'confirmed');
const checkedIn = (b: BK) => {
  if (b.attended === 1) return true;
  try {
    return Object.values(JSON.parse(b.attendance_json || '{}') as Record<string, number>).some((v) => v === 1);
  } catch {
    return false;
  }
};
const activityOf = (w: WS) => w.master_id || `w:${w.id}`;
const activityTitle = (w: WS) => w.master_title || w.title;
const viaBeam = (b: BK) => !!(b.beam_charge_id || b.beam_qr_charge_id);
const ageAt = (dob: string | null, at: number) => {
  if (!dob || !/^\d{4}-\d{2}-\d{2}/.test(dob)) return null;
  const d = new Date(at + TH);
  const [y, m, dd] = dob.split('-').map(Number);
  let age = d.getUTCFullYear() - y;
  if (d.getUTCMonth() + 1 < m || (d.getUTCMonth() + 1 === m && d.getUTCDate() < dd)) age--;
  return age > 0 && age < 120 ? age : null;
};
/** Price per seat bands, as [label, upper bound (exclusive)]. */
const PRICE_BANDS: [string, number][] = [
  ['ฟรี', 0],
  ['1–499', 500],
  ['500–999', 1000],
  ['1,000–1,999', 2000],
  ['2,000–2,999', 3000],
  ['3,000 ขึ้นไป', Infinity],
];

/* ---------------- the computation ---------------- */

export type AdminAnalytics = ReturnType<typeof computeAdminAnalytics>;

export function computeAdminAnalytics(d: AdminData, r: Range, now = Date.now()) {
  const wsById = new Map(d.ws.map((w) => [w.id, w]));
  const bkByWs = new Map<string, BK[]>();
  for (const b of d.bk) bkByWs.set(b.workshop_id, [...(bkByWs.get(b.workshop_id) || []), b]);
  const inWin = (ms: number) => ms >= r.fromMs && ms < r.toMs;
  const inPrev = (ms: number) => ms >= r.prevFromMs && ms < r.prevToMs;
  const soldIn = (w: WS) => Math.min(w.max_participants, (bkByWs.get(w.id) || []).filter(isLive).reduce((a, b) => a + seatsOf(b, w.max_participants), 0));

  // Manual rounds: admin's deduction as a share of what the round collected.
  const ratio = new Map<string, number>();
  for (const w of d.ws) {
    if (w.fee_mode !== 'manual') continue;
    const g = (bkByWs.get(w.id) || []).filter(isLive).reduce((s, b) => s + gross(b), 0);
    const ded = g > 0 ? computePayout(g, w.payout_deduction_type || 'none', Number(w.payout_deduction_value) || 0).deduction : 0;
    ratio.set(w.id, g > 0 ? ded / g : w.payout_deduction_type === 'percent' ? (Number(w.payout_deduction_value) || 0) / 100 : 0);
  }
  const refundAt = new Map<string, number>();
  const ledgerPaid = new Set<string>();
  for (const t of d.tx) {
    if (t.kind === 'refund' && t.booking_id && !refundAt.has(t.booking_id)) refundAt.set(t.booking_id, ledgerMs(t.occurred_at));
    if (t.kind === 'booking_payment' && t.booking_id) ledgerPaid.add(t.booking_id);
  }
  const beamRate = (b: BK) => (b.beam_qr_charge_id ? d.beam.qr : d.beam.card) ?? 0;

  // Money events: + when paid, − when a paid seat was given back.
  type Ev = { at: number; sales: number; cash: number; fee: number; beam: number; subsidy: number; refund: boolean; b: BK; w: WS };
  const events: Ev[] = [];
  for (const b of d.bk) {
    if (!wasCollected(b)) continue;
    const w = wsById.get(b.workshop_id);
    if (!w) continue;
    const g = gross(b);
    const fee = w.fee_mode === 'manual' ? g * (ratio.get(b.workshop_id) || 0) : gpOfBooking(d.gp, w, b).gp;
    const paid = utcMs(b.paid_at);
    const cash = Number(b.amount) || 0;
    const credit = Number(b.host_credit) || 0;
    events.push({ at: paid, sales: g, cash, fee, beam: viaBeam(b) ? (cash * beamRate(b)) / 100 : 0, subsidy: credit, refund: false, b, w });
    if (b.status === 'cancelled' && g > 0) {
      events.push({ at: refundAt.get(b.id) ?? paid, sales: -g, cash: -cash, fee: -fee, beam: 0, subsidy: -credit, refund: true, b, w });
    }
  }
  const money = (test: (ms: number) => boolean, evs: Ev[] = events) => {
    let sales = 0, cash = 0, fee = 0, beam = 0, subsidy = 0, refunds = 0, seats = 0, bookings = 0;
    for (const e of evs) {
      if (!test(e.at)) continue;
      sales += e.sales;
      cash += e.cash;
      fee += e.fee;
      beam += e.beam;
      subsidy += e.subsidy;
      if (e.refund) refunds += -e.sales;
      else if (!e.b.parent_booking_id) {
        bookings++;
        if (isLive(e.b)) seats += seatsOf(e.b, e.w.max_participants || 1);
      }
    }
    return {
      sales: round2(sales),
      cash: round2(cash),
      fee: round2(fee),
      beam: round2(beam),
      subsidy: round2(subsidy),
      refunds: round2(refunds),
      hostShare: round2(sales - fee),
      platformNet: round2(fee - beam - subsidy),
      takeRate: pct(fee, sales),
      seats,
      bookings,
      aov: bookings ? round2(sales / bookings) : null,
    };
  };
  const expensesIn = (test: (ms: number) => boolean) => sum(d.tx.filter((t) => (t.kind === 'expense' || t.kind === 'payroll') && test(ledgerMs(t.occurred_at))), (t) => t.gross);

  const cur = money(inWin);
  const prev = money(inPrev);
  const expCur = expensesIn(inWin);
  const expPrev = expensesIn(inPrev);

  /* ---- people basics ---- */
  const firstBuy = new Map<string, number>();
  const buyTimes = new Map<string, number[]>();
  for (const e of events) {
    if (e.refund || e.b.parent_booking_id || !e.b.user_id) continue;
    const u = e.b.user_id;
    if (!firstBuy.has(u) || e.at < firstBuy.get(u)!) firstBuy.set(u, e.at);
    buyTimes.set(u, [...(buyTimes.get(u) || []), e.at]);
  }
  buyTimes.forEach((v) => v.sort((a, b) => a - b));
  const buyersIn = (test: (ms: number) => boolean) => new Set(events.filter((e) => !e.refund && !e.b.parent_booking_id && e.b.user_id && test(e.at)).map((e) => e.b.user_id as string));
  const signupsIn = (test: (ms: number) => boolean) => d.users.filter((u) => test(utcMs(u.created_at)));
  const buyersCur = buyersIn(inWin);
  const buyersPrev = buyersIn(inPrev);
  const firstIn = (test: (ms: number) => boolean) => [...firstBuy.values()].filter(test).length;
  /** Did this person book again within `win` ms of their first booking? */
  const boughtAgain = (u: string, win: number) => {
    const ts = buyTimes.get(u) || [];
    return ts.length > 1 && ts[1] <= ts[0] + win;
  };

  /* ---- payables: what ASL still owes hosts ---- */
  const paidOut = new Set(d.tx.filter((t) => t.kind === 'host_payout' && t.workshop_id).map((t) => t.workshop_id as string));
  const roundNet = (w: WS) => roundFees(d.gp, w, bkByWs.get(w.id) || []).net;
  const owed = d.ws
    .filter((w) => w.status !== 'cancelled' && wsEnd(w) < now && w.payout_status !== 'paid' && !paidOut.has(w.id))
    .map((w) => ({ id: w.id, title: w.title, host: w.host_name || '—', hostId: w.instructor_id, date: w.date, net: roundNet(w), days: Math.floor((now - wsEnd(w)) / DAY) }))
    .filter((x) => x.net > 0)
    .sort((a, b) => b.days - a.days);
  const notYet = d.ws
    .filter((w) => w.status !== 'cancelled' && wsEnd(w) >= now)
    .map((w) => ({ id: w.id, net: roundNet(w) }))
    .filter((x) => x.net > 0);
  const aging = [
    { label: '0–7 วัน', test: (n: number) => n <= 7 },
    { label: '8–30 วัน', test: (n: number) => n > 7 && n <= 30 },
    { label: 'เกิน 30 วัน', test: (n: number) => n > 30 },
  ].map((a) => {
    const xs = owed.filter((o) => a.test(o.days));
    return { label: a.label, n: xs.length, amount: sum(xs, (x) => x.net) };
  });

  // Seats given back that have no refund recorded yet.
  const pendingRefunds = d.bk
    .filter((b) => b.status === 'cancelled' && wasCollected(b) && (Number(b.amount) || 0) > 0 && b.payment_status !== 'refunded' && !refundAt.has(b.id))
    .map((b) => ({ id: b.id, title: wsById.get(b.workshop_id)?.title || '—', amount: Number(b.amount) || 0, since: thaiDay(utcMs(b.paid_at)) }));

  // Beam payments the ledger has no row for, and payout vouchers not emailed.
  const ledgerGaps = d.bk.filter((b) => viaBeam(b) && wasCollected(b) && (Number(b.amount) || 0) > 0 && !ledgerPaid.has(b.id)).length;
  const unsentVouchers = d.tx.filter((t) => t.kind === 'host_payout' && t.payee_email && !t.emailed_at).length;

  /* ---- time series ---- */
  const weekStart = (ms: number) => wallToMs(thaiDay(ms)) - thaiDow(ms) * DAY;
  const thisWeek = weekStart(now);
  const weekly = Array.from({ length: 12 }, (_, i) => {
    const from = thisWeek - (11 - i) * 7 * DAY;
    const m = money((ms) => ms >= from && ms < from + 7 * DAY);
    return { week: thaiDay(from), sales: m.sales, hostShare: m.hostShare, fee: m.fee, platformNet: m.platformNet };
  });
  const nowTh = new Date(now + TH);
  const monthsBack = Array.from({ length: 12 }, (_, i) => new Date(Date.UTC(nowTh.getUTCFullYear(), nowTh.getUTCMonth() - (11 - i), 1)).toISOString().slice(0, 7));
  const monthRange = (ym: string) => {
    const [y, m] = ym.split('-').map(Number);
    const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
    return [wallToMs(`${ym}-01`), wallToMs(`${next}-01`)] as const;
  };
  const monthly = monthsBack.map((ym) => {
    const [from, to] = monthRange(ym);
    const t = (ms: number) => ms >= from && ms < to;
    const m = money(t);
    const expenses = expensesIn(t);
    return { month: ym, ...m, expenses, profit: round2(m.platformNet - expenses), signups: signupsIn(t).length, firstBuyers: firstIn(t) };
  });

  /* ---- money tab ---- */
  const ledgerFlows = (test: (ms: number) => boolean) => {
    const by = (k: string) => sum(d.tx.filter((t) => t.kind === k && test(ledgerMs(t.occurred_at))), (t) => t.net);
    return { in: by('booking_payment'), refund: by('refund'), payout: by('host_payout'), expense: by('expense'), payroll: by('payroll') };
  };
  const all = ledgerFlows(() => true);
  const expByCat = new Map<string, number>();
  for (const t of d.tx) {
    if ((t.kind !== 'expense' && t.kind !== 'payroll') || !inWin(ledgerMs(t.occurred_at))) continue;
    const k = t.kind === 'payroll' ? 'เงินเดือน' : d.categories.find((c) => c.id === t.category_id)?.name || 'ไม่ระบุหมวด';
    expByCat.set(k, (expByCat.get(k) || 0) + t.gross);
  }
  const paidCur = events.filter((e) => !e.refund && inWin(e.at) && e.cash > 0);
  const methods = [
    { label: 'PromptPay QR', test: (b: BK) => !!b.beam_qr_charge_id },
    { label: 'Beam (บัตร / อื่น ๆ)', test: (b: BK) => !b.beam_qr_charge_id && !!b.beam_charge_id },
    { label: 'ช่องทางอื่น / ก่อน Beam', test: (b: BK) => !viaBeam(b) },
  ].map((m) => {
    const xs = paidCur.filter((e) => m.test(e.b));
    return { label: m.label, n: xs.length, amount: sum(xs, (e) => e.cash) };
  });
  const couponRows = new Map<string, { n: number; discount: number; host: number }>();
  for (const e of events) {
    if (e.refund || !inWin(e.at) || !e.b.coupon_id || !isLive(e.b)) continue;
    const c = couponRows.get(e.b.coupon_id) || { n: 0, discount: 0, host: 0 };
    c.n++;
    c.discount += Number(e.b.discount_amount) || 0;
    c.host += Number(e.b.host_discount) || 0;
    couponRows.set(e.b.coupon_id, c);
  }
  const coupons = [...couponRows.entries()]
    .map(([id, c]) => ({ id, name: d.coupons.find((x) => x.id === id)?.name || id, n: c.n, discount: round2(c.discount), asl: round2(c.discount - c.host), host: round2(c.host) }))
    .sort((a, b) => b.discount - a.discount);
  // VAT counts the platform's own income: the fees it keeps.
  const fee12 = money((ms) => ms >= now - 365 * DAY && ms < now + DAY).fee;

  /* ---- hosts ---- */
  const hostIds = [...new Set(d.ws.map((w) => w.instructor_id).filter((x): x is string => !!x))];
  const respByWs = new Map<string, number[]>();
  for (const x of d.responses) respByWs.set(x.workshop_id, [...(respByWs.get(x.workshop_id) || []), x.rating]);
  const hosts = hostIds.map((id) => {
    const mine = d.ws.filter((w) => w.instructor_id === id);
    const ids = new Set(mine.map((w) => w.id));
    const m = money(inWin, events.filter((e) => ids.has(e.w.id)));
    const held = mine.filter((w) => w.status !== 'cancelled' && inWin(wsStart(w)) && wsStart(w) <= now);
    const cap = held.reduce((s, w) => s + w.max_participants, 0);
    const ratings = mine.filter((w) => inWin(wsStart(w))).flatMap((w) => respByWs.get(w.id) || []);
    const lastRound = Math.max(0, ...mine.filter((w) => w.status !== 'cancelled' && wsStart(w) <= now).map(wsStart));
    const upcoming = mine.filter((w) => w.status !== 'cancelled' && wsStart(w) > now).length;
    const everSold = events.some((e) => !e.refund && ids.has(e.w.id));
    const first = Math.min(...mine.map((w) => utcMs(w.created_at)).filter(Boolean));
    return {
      id,
      name: mine[0]?.host_name || '—',
      sales: m.sales,
      fee: m.fee,
      platformNet: m.platformNet,
      seats: m.seats,
      rounds: held.length,
      fill: pct(held.reduce((s, w) => s + soldIn(w), 0), cap),
      csat: ratings.length >= MIN_PEOPLE ? round2(ratings.reduce((s, x) => s + x, 0) / ratings.length) : null,
      owed: sum(owed.filter((o) => o.hostId === id), (o) => o.net),
      upcoming,
      lastRound: lastRound ? thaiDay(lastRound) : null,
      isNew: Number.isFinite(first) && inWin(first),
      active: held.length > 0 || m.bookings > 0,
      atRisk: everSold && upcoming === 0 && lastRound < now - 60 * DAY,
      rate: { single: rateFor(d.gp, id, 'single', now).rate, round: rateFor(d.gp, id, 'round', now).rate },
    };
  });
  const hostsSorted = [...hosts].sort((a, b) => b.sales - a.sales);
  const activeHosts = hosts.filter((h) => h.active).length;
  const tierCount = (kind: GpKind) => {
    const map = new Map<number, number>();
    for (const h of hosts) if (h.active) map.set(h.rate[kind], (map.get(h.rate[kind]) || 0) + 1);
    return [...map.entries()].sort((a, b) => b[0] - a[0]).map(([rate, n]) => ({ rate, n }));
  };

  /* ---- people tab ---- */
  const signupsCur = signupsIn(inWin);
  const activationBase = signupsCur.filter((u) => utcMs(u.created_at) + 30 * DAY <= now);
  const activated = activationBase.filter((u) => {
    const f = firstBuy.get(u.id);
    return f != null && f <= utcMs(u.created_at) + 30 * DAY;
  }).length;
  const repeatBuyers = [...buyersCur].filter((u) => (firstBuy.get(u) ?? Infinity) < r.fromMs).length;
  const cohorts = monthsBack.map((ym) => {
    const [from, to] = monthRange(ym);
    const cohort = [...firstBuy.entries()].filter(([, t]) => t >= from && t < to).map(([u]) => u);
    // A cell stays empty until every member has had the full window.
    const at = (win: number) => (to + win > now ? null : peoplePct(cohort.filter((u) => boughtAgain(u, win)).length, cohort.length));
    return { month: ym, people: cohort.length, r30: at(30 * DAY), r60: at(60 * DAY), r90: at(90 * DAY) };
  });
  const sourceCount = new Map<string, number>();
  const campaignCount = new Map<string, number>();
  const paidBookingsCur = events.filter((e) => !e.refund && !e.b.parent_booking_id && inWin(e.at));
  for (const e of paidBookingsCur) {
    sourceCount.set(e.b.source || 'unknown', (sourceCount.get(e.b.source || 'unknown') || 0) + 1);
    if (e.b.utm_campaign) campaignCount.set(e.b.utm_campaign, (campaignCount.get(e.b.utm_campaign) || 0) + 1);
  }
  const dayIn = (day: string) => day >= r.from && day <= r.to;
  const funnel = {
    impressions: d.impressions.filter((v) => dayIn(v.day)).reduce((s, v) => s + Number(v.n), 0),
    views: d.views.filter((v) => dayIn(v.day)).reduce((s, v) => s + Number(v.n), 0),
    started: new Set(d.bk.filter((b) => !b.parent_booking_id && inWin(utcMs(b.created_at))).map((b) => `${b.user_id}:${b.workshop_id}`)).size,
    paid: paidBookingsCur.length,
  };
  const dobOf = new Map(d.users.map((u) => [u.id, u.dob]));
  const ages = [...buyersCur].map((u) => ageAt(dobOf.get(u) || null, now)).filter((a): a is number => a != null);
  const ageBands = [
    { label: 'ต่ำกว่า 18', test: (a: number) => a < 18 },
    { label: '18–24', test: (a: number) => a >= 18 && a <= 24 },
    { label: '25–34', test: (a: number) => a >= 25 && a <= 34 },
    { label: '35–44', test: (a: number) => a >= 35 && a <= 44 },
    { label: '45+', test: (a: number) => a >= 45 },
  ].map((b) => {
    const n = ages.filter(b.test).length;
    return { label: b.label, n: n >= MIN_PEOPLE ? n : null, share: n >= MIN_PEOPLE ? pct(n, ages.length) : null };
  });

  /* ---- activities tab ---- */
  const heldIn = (test: (ms: number) => boolean) => d.ws.filter((w) => w.status !== 'cancelled' && test(wsStart(w)) && wsStart(w) <= now);
  const heldCur = heldIn(inWin);
  const heldPrev = heldIn(inPrev);
  const fillOf = (rounds: WS[]) => pct(rounds.reduce((s, w) => s + soldIn(w), 0), rounds.reduce((s, w) => s + (w.max_participants || 0), 0));
  const outcome = { came: 0, cancelled: 0, noShow: 0 };
  for (const w of d.ws) {
    if (wsEnd(w) >= now || !inWin(wsStart(w))) continue;
    for (const b of bkByWs.get(w.id) || []) {
      if (!wasCollected(b)) continue;
      if (b.status === 'cancelled') outcome.cancelled++;
      else if (checkedIn(b)) outcome.came++;
      else outcome.noShow++;
    }
  }
  const leads: number[] = [];
  const heat = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
  for (const e of paidBookingsCur) {
    heat[thaiDow(e.at)][thaiHour(e.at)]++;
    const lead = (wsStart(e.w) - e.at) / DAY;
    if (lead >= 0) leads.push(lead);
  }
  const group = (key: (e: Ev) => string) => {
    const m = new Map<string, number>();
    for (const e of events) if (inWin(e.at)) m.set(key(e), (m.get(key(e)) || 0) + e.sales);
    return [...m.entries()].map(([label, v]) => ({ label, value: round2(v) })).filter((x) => x.value > 0).sort((a, b) => b.value - a.value);
  };
  const bandSeats = PRICE_BANDS.map(([label]) => ({ label, value: 0 }));
  for (const e of paidBookingsCur) {
    if (!isLive(e.b)) continue;
    const seats = Math.max(1, seatsOf(e.b, e.w.max_participants || 1));
    const per = e.sales / seats;
    const i = per <= 0 ? 0 : PRICE_BANDS.findIndex(([, max], k) => k > 0 && per < max);
    bandSeats[i < 0 ? PRICE_BANDS.length - 1 : i].value += seats;
  }
  const actMap = new Map<string, { title: string; host: string; sales: number; seats: number; rounds: WS[] }>();
  for (const w of d.ws) {
    const k = activityOf(w);
    const a = actMap.get(k) || { title: activityTitle(w), host: w.host_name || '—', sales: 0, seats: 0, rounds: [] };
    a.rounds.push(w);
    actMap.set(k, a);
  }
  for (const e of events) {
    if (!inWin(e.at)) continue;
    const a = actMap.get(activityOf(e.w))!;
    a.sales += e.sales;
    if (!e.refund && isLive(e.b)) a.seats += seatsOf(e.b, e.w.max_participants || 1);
  }
  const activities = [...actMap.entries()]
    .map(([key, a]) => ({ key, title: a.title, host: a.host, sales: round2(a.sales), seats: a.seats, fill: fillOf(a.rounds.filter((w) => w.status !== 'cancelled' && inWin(wsStart(w)) && wsStart(w) <= now)) }))
    .filter((a) => a.sales > 0 || a.seats > 0)
    .sort((a, b) => b.sales - a.sales);
  const hostCancelled = d.ws.filter((w) => w.status === 'cancelled' && inWin(wsStart(w)) && (bkByWs.get(w.id) || []).some(wasCollected)).length;
  const refundRequests = d.bk.filter((b) => b.cancel_reason === 'refund_requested' && wasCollected(b) && inWin(utcMs(b.paid_at)));

  /* ---- quality ---- */
  const respCur = d.responses.filter((x) => inWin(utcMs(x.created_at)));
  const revCur = d.reviews.filter((x) => inWin(utcMs(x.created_at)));
  const dist = (xs: { rating: number }[]) => [1, 2, 3, 4, 5].map((s) => xs.filter((x) => x.rating === s).length);
  const low = [
    ...respCur.filter((x) => x.rating <= 3).map((x) => ({ ...x, from: 'แบบสอบถาม' })),
    ...revCur.filter((x) => x.rating <= 3).map((x) => ({ ...x, from: 'รีวิว' })),
  ]
    .sort((a, b) => utcMs(b.created_at) - utcMs(a.created_at))
    .slice(0, 10)
    .map((x) => ({ rating: x.rating, comment: x.comment, from: x.from, title: wsById.get(x.workshop_id)?.title || '—', host: wsById.get(x.workshop_id)?.host_name || '—', at: thaiDay(utcMs(x.created_at)) }));
  const appIn = (metric: string) => d.app.filter((a) => a.metric === metric && dayIn(a.day)).reduce((s, a) => s + Number(a.n), 0);
  const appDaily = Array.from({ length: 30 }, (_, i) => {
    const day = thaiDay(now - (29 - i) * DAY);
    const at = (metric: string) => d.app.filter((a) => a.metric === metric && a.day === day).reduce((s, a) => s + Number(a.n), 0);
    return { day, install: at('install'), open: at('open') };
  });

  /* ---- alerts for the front page ---- */
  const alerts: { text: string; href: string; tone: 'bad' | 'warn' }[] = [];
  const overdue = owed.filter((o) => o.days > 7);
  if (overdue.length) alerts.push({ tone: 'bad', text: `ค้างโอนให้ผู้จัดเกิน 7 วัน ${overdue.length} รอบ รวม ฿${Math.round(sum(overdue, (o) => o.net)).toLocaleString('th-TH')}`, href: '/admin/ledger' });
  if (pendingRefunds.length) alerts.push({ tone: 'bad', text: `การจองที่ยกเลิกแล้วแต่ยังไม่บันทึกการคืนเงิน ${pendingRefunds.length} รายการ`, href: '/admin/ledger' });
  if (d.orphans.n) alerts.push({ tone: 'warn', text: `เงินเข้าที่ยังไม่ได้ตรวจ ${d.orphans.n} รายการ`, href: '/admin/payments' });
  if (ledgerGaps) alerts.push({ tone: 'warn', text: `การชำระผ่าน Beam ที่ยังไม่มีในบัญชีการเงิน ${ledgerGaps} รายการ`, href: '/admin/ledger' });
  if (d.beam.qr == null || d.beam.card == null) alerts.push({ tone: 'warn', text: 'ยังไม่ได้ตั้งอัตราค่าธรรมเนียม Beam — รายได้สุทธิยังไม่หักค่า Beam', href: '/admin/insights?tab=money&settings=1' });

  const owedTotal = sum(owed, (o) => o.net);
  return {
    range: { from: r.from, to: r.to, days: r.days },
    beam: d.beam,
    overview: {
      cards: {
        sales: { cur: cur.sales, prev: prev.sales },
        platformNet: { cur: cur.platformNet, prev: prev.platformNet },
        fee: { cur: cur.fee, prev: prev.fee },
        takeRate: { cur: cur.takeRate, prev: prev.takeRate },
        bookings: { cur: cur.bookings, prev: prev.bookings },
        buyers: { cur: buyersCur.size, prev: buyersPrev.size },
        signups: { cur: signupsCur.length, prev: signupsIn(inPrev).length },
        profit: { cur: round2(cur.platformNet - expCur), prev: round2(prev.platformNet - expPrev) },
      },
      cur,
      weekly,
      alerts,
      owedTotal,
      topHosts: hostsSorted.filter((h) => h.sales > 0).slice(0, 5).map((h) => ({ id: h.id, name: h.name, sales: h.sales, platformNet: h.platformNet })),
      topActivities: activities.slice(0, 5),
    },
    money: {
      cur,
      expenses: expCur,
      profit: round2(cur.platformNet - expCur),
      monthly,
      ledger: { all: { ...all, balance: round2(all.in - all.refund - all.payout - all.expense - all.payroll) }, cur: ledgerFlows(inWin) },
      payable: { owed: owedTotal, owedRounds: owed.slice(0, 40), notYet: sum(notYet, (x) => x.net), notYetRounds: notYet.length, aging },
      expByCat: [...expByCat.entries()].map(([label, value]) => ({ label, value: round2(value) })).sort((a, b) => b.value - a.value),
      methods,
      coupons,
      vat: { last12: fee12, threshold: 1800000 },
      pendingRefunds: { n: pendingRefunds.length, amount: sum(pendingRefunds, (x) => x.amount), rows: pendingRefunds.slice(0, 20) },
      ledgerGaps,
    },
    hosts: {
      total: hosts.length,
      active: activeHosts,
      newHosts: hosts.filter((h) => h.isNew).length,
      atRisk: hosts.filter((h) => h.atRisk).sort((a, b) => (a.lastRound || '').localeCompare(b.lastRound || '')),
      salesPerActive: activeHosts ? round2(cur.sales / activeHosts) : null,
      top3Share: pct(sum(hostsSorted.slice(0, 3), (h) => h.sales), cur.sales),
      rows: hostsSorted,
      tiers: { single: tierCount('single'), round: tierCount('round') },
    },
    people: {
      signups: signupsCur.length,
      buyers: buyersCur.size,
      firstBuyers: firstIn(inWin),
      repeatBuyers,
      repeatShare: peoplePct(repeatBuyers, buyersCur.size),
      activation: peoplePct(activated, activationBase.length),
      activationBase: activationBase.length,
      spendPerBuyer: buyersCur.size ? round2(cur.sales / buyersCur.size) : null,
      monthly: monthly.map((m) => ({ month: m.month, signups: m.signups, firstBuyers: m.firstBuyers })),
      cohorts,
      sources: [...sourceCount.entries()].map(([source, n]) => ({ source, n })).sort((a, b) => b.n - a.n),
      campaigns: [...campaignCount.entries()].map(([campaign, n]) => ({ campaign, n })).sort((a, b) => b.n - a.n).slice(0, 12),
      funnel,
      ages: { bands: ageBands, people: ages.length, avg: ages.length >= MIN_PEOPLE ? Math.round(ages.reduce((s, a) => s + a, 0) / ages.length) : null },
    },
    activities: {
      held: heldCur.length,
      heldPrev: heldPrev.length,
      upcoming30: d.ws.filter((w) => w.status !== 'cancelled' && wsStart(w) > now && wsStart(w) < now + 30 * DAY).length,
      fill: { cur: fillOf(heldCur), prev: fillOf(heldPrev) },
      hostCancelled,
      refundRequestP: pct(refundRequests.length, paidBookingsCur.length),
      outcome,
      leadMedian: median(leads),
      byCategory: group((e) => e.w.category || 'ไม่ระบุหมวด'),
      byFormat: group((e) => (e.w.is_online ? 'ออนไลน์' : 'ออนไซต์')),
      byKind: group((e) => (gpKindOf(e.w) === 'round' ? 'แบบรอบ' : gpKindOf(e.w) === 'free' ? 'ฟรี / มัดจำ' : 'เดี่ยว')),
      priceBands: bandSeats,
      top: activities.slice(0, 15),
      heat,
    },
    quality: {
      csat: respCur.length >= MIN_PEOPLE ? round2(respCur.reduce((s, x) => s + x.rating, 0) / respCur.length) : null,
      responses: respCur.length,
      surveyDist: respCur.length >= MIN_PEOPLE ? dist(respCur) : null,
      reviews: { n: revCur.length, avg: revCur.length ? round2(revCur.reduce((s, x) => s + x.rating, 0) / revCur.length) : null, dist: dist(revCur) },
      low,
      refundRequests: { n: refundRequests.length, amount: sum(refundRequests, (b) => Number(b.amount) || 0) },
      pendingRefunds: pendingRefunds.length,
      system: {
        orphans: d.orphans,
        ledgerGaps,
        unsentVouchers,
        installs: appIn('install'),
        opens: appIn('open'),
        pushSubs: d.pushSubs,
        appDaily,
      },
    },
  };
}
