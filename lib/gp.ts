import { computePayout } from '@/lib/workshop-utils';

/* The platform fee (GP), migration 073.
 *
 * - Tiered by the host's sales in the PREVIOUS month (Thai calendar), counted
 *   separately for standalone activities (ประเภท ข.) and round-based ones
 *   (ประเภท ก.). Payment fees are inside it; the participant pays nothing extra.
 * - Free activities are 0%. Deposits are returned on the day, so they carry no GP.
 * - The part of a seat's price above 3,000 baht is charged 3% (like a tax band).
 *   A group or whole-round booking's seat price is what was paid ÷ its seats.
 * - Round-based hosts: 0% for one month from their first round going on sale;
 *   hosts who already had rounds before 2570 get 0% for all of January 2570.
 * - The rate follows the day the money was paid: anything paid before
 *   1 Jan 2570 is 0%, and December 2569's sales set January 2570's tier.
 * - GP is charged on what the host is paid for the seat: amount after the
 *   host's own discount, plus what ASL covers for a comp or ASL coupon.
 * Admin can switch a round to a manual deduction instead (fee_mode 'manual'). */

export const GP_START = '2027-01-01'; // 1 ม.ค. 2570, Thai time
export const HIGH_PRICE_FROM = 3000;
export const HIGH_PRICE_RATE = 3;
/** [from sales (baht), rate %] — ascending. */
export const TIERS: Record<'single' | 'round', [number, number][]> = {
  single: [
    [0, 15],
    [5000, 12],
    [12000, 9],
    [60000, 6],
  ],
  round: [
    [0, 10],
    [15000, 7],
    [60000, 4],
  ],
};
export const KIND_LABEL = { single: 'กิจกรรมเดี่ยว (ประเภท ข.)', round: 'กิจกรรมแบบรอบ (ประเภท ก.)' } as const;

export type GpKind = 'single' | 'round';
const TH = 7 * 3600000;
const wallMs = (date: string, time = '00:00') => Date.parse(`${date}T${time}:00+07:00`);
const utcMs = (s: string | null | undefined) => (s ? Date.parse(s.replace(' ', 'T') + (s.includes('Z') ? '' : 'Z')) || 0 : 0);
const thaiMonth = (ms: number) => new Date(ms + TH).toISOString().slice(0, 7);
const prevMonth = (ym: string) => {
  const [y, m] = ym.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
};
const nextMonth = (ym: string) => {
  const [y, m] = ym.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
};
const round2 = (n: number) => Math.round(n * 100) / 100;
export const GP_START_MS = wallMs(GP_START);

/** The table rate for last month's sales. */
export function tierRate(kind: GpKind, sales: number): number {
  let rate = TIERS[kind][0][1];
  for (const [from, r] of TIERS[kind]) if (sales >= from) rate = r;
  return rate;
}
/** The next step up from these sales: how much more, and the rate it brings. */
export function nextTier(kind: GpKind, sales: number): { need: number; rate: number } | null {
  const t = TIERS[kind].find(([from]) => from > sales);
  return t ? { need: round2(t[0] - sales), rate: t[1] } : null;
}

export type GpWorkshop = {
  id: string;
  instructor_id: string | null;
  master_kind: string | null;
  payment_type: string | null;
  max_participants: number;
  fee_mode: string | null;
  payout_deduction_type: 'none' | 'fixed' | 'percent' | null;
  payout_deduction_value: number | null;
};
export type GpBooking = {
  id: string;
  amount: number;
  host_credit: number | null;
  paid_at: string | null;
  status: string;
  payment_status: string;
  group_size: number | null;
  booking_kind: string | null;
  parent_booking_id: string | null;
};

export function gpKindOf(w: Pick<GpWorkshop, 'master_kind' | 'payment_type'>): GpKind | 'free' {
  const pt = w.payment_type || 'paid';
  if (pt === 'free' || pt === 'deposit') return 'free';
  return w.master_kind === 'round' ? 'round' : 'single';
}

type HostFacts = { roundStart: number | null; roundZeroUntil: number };
export type GpContext = {
  hosts: Map<string, HostFacts>;
  /** `${host}|${month}|${kind}` → frozen table rate + the sales it came from */
  months: Map<string, { rate: number; prevSales: number }>;
  /** `${host}|${month}|${kind}` → sales in that month so far (live, by paid date) */
  sales: Map<string, number>;
};

/** Facts and month rates for these hosts; freezes any month row that is due. */
export async function loadGp(db: D1Database, hostIds: (string | null | undefined)[], now = Date.now()): Promise<GpContext> {
  const ctx: GpContext = { hosts: new Map(), months: new Map(), sales: new Map() };
  const ids = [...new Set(hostIds.filter((x): x is string => !!x))];
  const curMonth = thaiMonth(now);
  for (const host of ids) {
    const [facts, sales, rows] = await Promise.all([
      db
        .prepare(
          `SELECT MIN(w.created_at) AS round_start FROM workshops w JOIN workshop_masters m ON m.id = w.master_id
            WHERE w.instructor_id = ? AND m.kind = 'round' AND w.status != 'cancelled'`,
        )
        .bind(host)
        .first<{ round_start: string | null }>(),
      db
        .prepare(
          `SELECT strftime('%Y-%m', datetime(b.paid_at, '+7 hours')) AS m,
                  CASE WHEN mm.kind = 'round' THEN 'round' ELSE 'single' END AS k,
                  SUM(b.amount + COALESCE(b.host_credit, 0)) AS s
             FROM bookings b JOIN workshops w ON w.id = b.workshop_id LEFT JOIN workshop_masters mm ON mm.id = w.master_id
            WHERE w.instructor_id = ? AND b.paid_at IS NOT NULL AND b.status != 'cancelled'
              AND COALESCE(w.payment_type, 'paid') NOT IN ('free', 'deposit')
            GROUP BY m, k`,
        )
        .bind(host)
        .all<{ m: string; k: GpKind; s: number }>(),
      db
        .prepare('SELECT month, kind, prev_sales, rate FROM gp_months WHERE host_id = ?')
        .bind(host)
        .all<{ month: string; kind: GpKind; prev_sales: number; rate: number }>(),
    ]);
    const roundStart = facts?.round_start ? utcMs(facts.round_start) : null;
    let zeroUntil = 0;
    if (roundStart) {
      if (roundStart < GP_START_MS) zeroUntil = wallMs('2027-02-01');
      else {
        const d = new Date(roundStart + TH);
        zeroUntil = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes()) - TH;
      }
    }
    ctx.hosts.set(host, { roundStart, roundZeroUntil: zeroUntil });
    for (const s of sales.results || []) ctx.sales.set(`${host}|${s.m}|${s.k}`, Number(s.s) || 0);
    for (const r of rows.results || []) ctx.months.set(`${host}|${r.month}|${r.kind}`, { rate: r.rate, prevSales: r.prev_sales });

    // Freeze every month from 2570 up to this one that has no row yet.
    if (now >= GP_START_MS) {
      const inserts: D1PreparedStatement[] = [];
      for (let ym = thaiMonth(GP_START_MS); ym <= curMonth; ym = nextMonth(ym)) {
        for (const kind of ['single', 'round'] as GpKind[]) {
          const key = `${host}|${ym}|${kind}`;
          if (ctx.months.has(key)) continue;
          const prevSales = ctx.sales.get(`${host}|${prevMonth(ym)}|${kind}`) || 0;
          const rate = tierRate(kind, prevSales);
          ctx.months.set(key, { rate, prevSales });
          inserts.push(db.prepare('INSERT OR IGNORE INTO gp_months (host_id, month, kind, prev_sales, rate) VALUES (?, ?, ?, ?, ?)').bind(host, ym, kind, prevSales, rate));
        }
      }
      if (inserts.length) await db.batch(inserts);
    }
  }
  return ctx;
}

/** The round 0% month (and GP's start date) on top of a table rate, at time `at`. */
function adjust(ctx: GpContext, host: string, kind: GpKind, table: number, at: number): { rate: number; why: string | null } {
  if (at < GP_START_MS) return { rate: 0, why: 'ชำระก่อน 1 ม.ค. 2570' };
  const facts = ctx.hosts.get(host);
  if (kind === 'round' && facts && at < facts.roundZeroUntil) return { rate: 0, why: 'เดือนแรกของกิจกรรมแบบรอบ' };
  return { rate: table, why: null };
}

/** The rate a host pays for a kind at time `at` (when the money is paid). */
export function rateFor(ctx: GpContext, host: string, kind: GpKind, at: number): { rate: number; table: number; why: string | null } {
  const ym = thaiMonth(at);
  const table = ctx.months.get(`${host}|${ym}|${kind}`)?.rate ?? tierRate(kind, ctx.sales.get(`${host}|${prevMonth(ym)}|${kind}`) || 0);
  return { ...adjust(ctx, host, kind, table, at), table };
}

/** GP on one booking (gp mode). Members of a group carry 0 — the parent pays. */
export function gpOfBooking(ctx: GpContext, w: GpWorkshop, b: GpBooking): { rate: number; gp: number; gross: number } {
  const gross = (Number(b.amount) || 0) + (Number(b.host_credit) || 0);
  const kind = gpKindOf(w);
  if (!b.paid_at || kind === 'free' || gross <= 0 || !w.instructor_id) return { rate: 0, gp: 0, gross };
  const { rate } = rateFor(ctx, w.instructor_id, kind, utcMs(b.paid_at));
  if (rate <= 0) return { rate: 0, gp: 0, gross };
  const seats = Math.max(1, b.parent_booking_id ? 1 : b.booking_kind === 'private' ? w.max_participants || 1 : b.group_size || 1);
  const perSeat = gross / seats;
  const base = Math.min(perSeat, HIGH_PRICE_FROM) * seats;
  const over = Math.max(0, perSeat - HIGH_PRICE_FROM) * seats;
  return { rate, gp: round2((base * rate) / 100 + (over * HIGH_PRICE_RATE) / 100), gross };
}

const isLive = (b: GpBooking) => b.status !== 'cancelled' && (b.payment_status === 'paid' || b.status === 'confirmed');

/** What one round owes the host: gross, the fee (GP or admin's manual
 *  deduction) and net, over the seats still held. */
export function roundFees(ctx: GpContext, w: GpWorkshop, bookings: GpBooking[]): { mode: 'gp' | 'manual'; gross: number; fee: number; net: number } {
  const live = bookings.filter(isLive);
  const gross = round2(live.reduce((s, b) => s + (Number(b.amount) || 0) + (Number(b.host_credit) || 0), 0));
  if (w.fee_mode === 'manual') {
    const p = computePayout(gross, w.payout_deduction_type || 'none', Number(w.payout_deduction_value) || 0);
    return { mode: 'manual', gross, fee: round2(p.deduction), net: round2(p.net) };
  }
  const fee = round2(live.reduce((s, b) => s + gpOfBooking(ctx, w, b).gp, 0));
  return { mode: 'gp', gross, fee, net: round2(gross - fee) };
}

/** For the host's fee card: this month's rate per kind, sales so far, and
 *  what selling more this month would bring next month. */
export function feeStatus(ctx: GpContext, host: string, now = Date.now()) {
  const facts = ctx.hosts.get(host);
  const ym = thaiMonth(now);
  // Before GP starts, "next month" means the first charged month (Jan 2570),
  // read as "if you sold like this in the month before".
  const nextAt = Math.max(wallMs(`${nextMonth(ym)}-01`), GP_START_MS);
  return {
    started: now >= GP_START_MS,
    startsOn: GP_START,
    roundZeroUntil: facts?.roundZeroUntil && facts.roundZeroUntil > now ? new Date(facts.roundZeroUntil + TH).toISOString().slice(0, 10) : null,
    kinds: (['single', 'round'] as GpKind[]).map((kind) => {
      const salesNow = ctx.sales.get(`${host}|${ym}|${kind}`) || 0;
      const cur = rateFor(ctx, host, kind, now);
      const step = nextTier(kind, salesNow);
      return {
        kind,
        label: KIND_LABEL[kind],
        rate: cur.rate,
        why: cur.why,
        salesThisMonth: round2(salesNow),
        nextMonthRate: adjust(ctx, host, kind, tierRate(kind, salesNow), nextAt).rate,
        step: step ? { need: step.need, rate: adjust(ctx, host, kind, step.rate, nextAt).rate } : null,
      };
    }),
  };
}

/** One round's fees straight from the database (payout sheet, host roster). */
export async function roundFeesById(db: D1Database, workshopId: string) {
  const w = await db
    .prepare(
      `SELECT w.id, w.instructor_id, m.kind AS master_kind, w.payment_type, w.max_participants, w.fee_mode,
              w.payout_deduction_type, w.payout_deduction_value
         FROM workshops w LEFT JOIN workshop_masters m ON m.id = w.master_id WHERE w.id = ?`,
    )
    .bind(workshopId)
    .first<GpWorkshop>();
  if (!w) return null;
  const bookings =
    (
      await db
        .prepare(
          `SELECT id, amount, host_credit, paid_at, status, payment_status, group_size, booking_kind, parent_booking_id
             FROM bookings WHERE workshop_id = ?`,
        )
        .bind(workshopId)
        .all<GpBooking>()
    ).results || [];
  const ctx = await loadGp(db, [w.instructor_id]);
  const fees = roundFees(ctx, w, bookings);
  const kind = gpKindOf(w);
  /** Per paid booking, for the breakdown on the payout sheet. */
  const lines = bookings
    .filter((b) => b.status !== 'cancelled' && (b.payment_status === 'paid' || b.status === 'confirmed') && (Number(b.amount) || 0) + (Number(b.host_credit) || 0) > 0)
    .map((b) => ({ id: b.id, paid_at: b.paid_at, ...gpOfBooking(ctx, w, b) }));
  // GP by the table whatever the round's mode, so the sheet can show both.
  return { ...fees, kind, lines, gpFee: round2(lines.reduce((s, l) => s + l.gp, 0)) };
}
