/**
 * Coupons (migration 067): what a coupon takes off a booking, whether it may be
 * used, and which coupons a member can pick at checkout.
 *
 * The server is the only place a price is worked out: the checkout screen
 * sends a code, never an amount. A coupon is "in use" while a booking that
 * carries it is alive (aliveSql), so cancelling a booking or letting its
 * 10-minute hold run out gives the coupon back without any bookkeeping.
 */
import { getEffectivePrice, parseInstructorIds } from '@/lib/workshop-utils';
import { parseTiers, tierSeats, tierTotal } from '@/lib/pricing';
import { serverNow } from '@/lib/server-clock';
import type { Workshop } from '@/lib/types';

export type CouponKind = 'percent' | 'amount' | 'free' | 'fixed_price';
export type CouponDistribution = 'public' | 'unique' | 'wallet';
export type CouponFunding = 'asl' | 'host' | 'split';
export type CouponScope = 'all' | 'masters' | 'categories' | 'hosts';
/** The kind of booking a coupon is used on. */
export type BookingFlow = 'direct' | 'group' | 'selection' | 'deposit' | 'gift';

export const FLOWS: { key: BookingFlow; label: string }[] = [
  { key: 'direct', label: 'จองตรง (จ่ายเต็ม)' },
  { key: 'group', label: 'จองกลุ่ม / แพ็ก / เหมารอบ' },
  { key: 'selection', label: 'กิจกรรมคัดเลือก' },
  { key: 'deposit', label: 'มัดจำ' },
  { key: 'gift', label: 'ซื้อเป็นของขวัญ' },
];

export const KIND_LABEL: Record<CouponKind, string> = {
  percent: 'ลดเป็น %',
  amount: 'ลดเป็นบาท',
  free: 'ฟรี 100%',
  fixed_price: 'ราคาพิเศษ',
};

export const DIST_LABEL: Record<CouponDistribution, string> = {
  public: 'รหัสสาธารณะ',
  unique: 'บัตรรหัสเฉพาะ',
  wallet: 'คูปองในบัญชี',
};

export interface Coupon {
  id: string;
  name: string;
  description: string | null;
  kind: CouponKind;
  value: number;
  max_discount: number | null;
  distribution: CouponDistribution;
  public_code: string | null;
  show_at_checkout: number;
  stack_with_promo: number;
  funded_by: CouponFunding;
  host_share_pct: number;
  starts_at: string | null;
  ends_at: string | null;
  max_uses: number | null;
  per_user_limit: number | null;
  min_spend: number;
  scope: CouponScope;
  scope_json: string | null;
  kinds_json: string | null;
  first_booking_only: number;
  status: 'active' | 'disabled';
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CouponCode {
  id: string;
  coupon_id: string;
  code: string;
  owner_user_id: string | null;
  claimed_at: string | null;
  batch: string | null;
  created_at: string;
}

/** A booking that still holds its seat (and so its coupon), as SQL over `b`. */
export function aliveSql(b = 'bookings'): string {
  return `(${b}.status != 'cancelled'
    AND COALESCE(${b}.payment_status, '') NOT IN ('expired', 'refunded')
    AND NOT (${b}.payment_status = 'pending' AND ${b}.expires_at IS NOT NULL AND datetime(${b}.expires_at) <= datetime('now')))`;
}

/** Letters and digits that cannot be misread for one another (no 0/O, 1/I/L). */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function randomCode(len = 8): string {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
}

/** What people type: case, spaces and dashes do not matter. */
export function normalizeCode(raw: unknown): string {
  return String(raw ?? '')
    .toUpperCase()
    .replace(/[\s-]+/g, '')
    .slice(0, 40);
}

/** Thai wall clock "YYYY-MM-DDTHH:MM" for now (same scheme as promo bounds). */
export function thaiNow(now: Date = serverNow()): string {
  return new Date(now.getTime() + 7 * 3600 * 1000).toISOString().slice(0, 16);
}

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    const v = JSON.parse(raw);
    return (v ?? fallback) as T;
  } catch {
    return fallback;
  }
}

export function couponFlows(c: Pick<Coupon, 'kinds_json'>): BookingFlow[] {
  const list = parseJson<string[]>(c.kinds_json, []);
  const ok = FLOWS.map((f) => f.key);
  const picked = list.filter((k): k is BookingFlow => (ok as string[]).includes(k));
  return picked.length ? picked : ok;
}

export function couponScopeIds(c: Pick<Coupon, 'scope_json'>): string[] {
  return parseJson<unknown[]>(c.scope_json, []).map(String).filter(Boolean);
}

const baht = (n: number) => '฿' + Math.round(n).toLocaleString();

/** Short Thai line for what a coupon gives, e.g. "ลด 20% สูงสุด ฿300". */
export function couponHeadline(c: Pick<Coupon, 'kind' | 'value' | 'max_discount'>): string {
  if (c.kind === 'percent') return `ลด ${c.value}%${c.max_discount ? ` สูงสุด ${baht(c.max_discount)}` : ''}`;
  if (c.kind === 'amount') return `ลด ${baht(c.value)}`;
  if (c.kind === 'free') return 'เข้าร่วมฟรี';
  return `จ่ายเพียง ${baht(c.value)}`;
}

/** The big text on a coupon ticket: "20%", "฿200", "ฟรี", "฿500". */
export function couponBig(c: Pick<Coupon, 'kind' | 'value'>): string {
  if (c.kind === 'percent') return `${c.value}%`;
  if (c.kind === 'free') return 'ฟรี';
  return baht(c.value);
}

/** Who pays for the discount, as a Thai line for admin screens. */
export function fundingLabel(c: Pick<Coupon, 'funded_by' | 'host_share_pct'>): string {
  if (c.funded_by === 'host') return 'ผู้จัดแบกส่วนลด';
  if (c.funded_by === 'split') return `แบ่งกัน · ผู้จัด ${c.host_share_pct}% · ASL ${100 - c.host_share_pct}%`;
  return 'ASL แบกส่วนลด (ผู้จัดได้เต็มราคา)';
}

// ---------------------------------------------------------------------------
// Price of a booking before the coupon
// ---------------------------------------------------------------------------

/**
 * Everything a coupon is judged against. `list` is the price before any
 * promo, `promo` what the member would pay without a coupon.
 */
export type PriceCtx = {
  flow: BookingFlow;
  list: number;
  promo: number;
  workshop: Pick<Workshop, 'id' | 'master_id' | 'category' | 'instructor_id' | 'instructor_ids_json'>;
  userId: string;
  /** The booking being priced, so its own earlier coupon does not count against it. */
  excludeBookingId?: string | null;
};

/**
 * Price of a new booking, mirroring POST /api/bookings: a picked tier sets
 * the price (no promo), deposit types owe the deposit, a single seat gets
 * the promo price. Returns an error string when the request cannot be priced.
 */
export async function newBookingPrice(
  db: D1Database,
  workshop: Workshop,
  o: { tier_id?: string | null; group_size?: number | null; gift?: boolean },
): Promise<{ flow: BookingFlow; list: number; promo: number } | { error: string }> {
  const pt = workshop.payment_type || 'paid';
  if (workshop.admission_type === 'selection' && !o.gift) {
    return { error: 'กิจกรรมคัดเลือกใช้คูปองได้ตอนชำระเงินหลังได้รับคัดเลือก' };
  }
  if (pt === 'free') return { flow: 'direct', list: 0, promo: 0 };

  let seats = 1;
  let tierPrice: number | null = null;
  let isPrivate = false;
  if (!o.gift && o.tier_id && o.tier_id !== 'seat') {
    if (!workshop.master_id) return { error: 'ราคานี้ใช้กับกิจกรรมนี้ไม่ได้' };
    const m = await db
      .prepare('SELECT price_tiers_json FROM workshop_masters WHERE id = ?')
      .bind(workshop.master_id)
      .first<{ price_tiers_json: string | null }>();
    const tier = m ? parseTiers(m.price_tiers_json).find((t) => t.id === o.tier_id) : undefined;
    if (!tier) return { error: 'ไม่พบราคาที่เลือก' };
    const n = tierSeats(tier, o.group_size);
    if (n == null) return { error: `จำนวนคนต้องอยู่ระหว่าง ${tier.min}–${tier.max} คน` };
    seats = n;
    tierPrice = tierTotal(tier, seats);
    isPrivate = tier.mode === 'round' || !!tier.lock;
  }

  let list: number;
  let promo: number;
  if (pt === 'deposit') {
    list = promo = workshop.deposit_amount || 0;
  } else if (tierPrice != null) {
    list = promo = tierPrice;
  } else {
    list = workshop.price;
    promo = getEffectivePrice(workshop).price;
  }
  const flow: BookingFlow = o.gift ? 'gift' : pt === 'deposit' ? 'deposit' : seats > 1 || isPrivate ? 'group' : 'direct';
  return { flow, list, promo };
}

/** Price of a selected applicant confirming their seat (same as the confirm route). */
export function selectionPrice(workshop: Workshop): { flow: BookingFlow; list: number; promo: number } {
  const pt = workshop.payment_type || 'paid';
  if (pt === 'free') return { flow: 'selection', list: 0, promo: 0 };
  if (pt === 'deposit') {
    const d = workshop.deposit_amount || 0;
    return { flow: 'selection', list: d, promo: d };
  }
  return { flow: 'selection', list: workshop.price, promo: getEffectivePrice(workshop).price };
}

// ---------------------------------------------------------------------------
// Applying a coupon
// ---------------------------------------------------------------------------

export type Quote = {
  list: number;
  /** Shown as "ส่วนลดโปรโมชัน". */
  promoOff: number;
  /** Shown as "ส่วนลดคูปอง". list − promoOff − couponOff = total. */
  couponOff: number;
  total: number;
  /** Stored on the booking: what it would cost without the coupon, and the
   *  money the coupon takes off that (= promo − total). */
  listAmount: number;
  discount: number;
  hostDiscount: number;
  aslDiscount: number;
};

/** The price with no coupon. */
export function plainQuote(ctx: Pick<PriceCtx, 'list' | 'promo'>): Quote {
  return {
    list: ctx.list,
    promoOff: Math.max(0, ctx.list - ctx.promo),
    couponOff: 0,
    total: ctx.promo,
    listAmount: ctx.promo,
    discount: 0,
    hostDiscount: 0,
    aslDiscount: 0,
  };
}

/** What the coupon's own rule takes off `base`. */
function ruleOff(c: Pick<Coupon, 'kind' | 'value' | 'max_discount'>, base: number): number {
  if (base <= 0) return 0;
  let off = 0;
  if (c.kind === 'percent') {
    off = Math.floor((base * Math.min(100, Math.max(0, c.value))) / 100);
    if (c.max_discount != null && c.max_discount > 0) off = Math.min(off, c.max_discount);
  } else if (c.kind === 'amount') {
    off = Math.max(0, c.value);
  } else if (c.kind === 'free') {
    off = base;
  } else {
    off = base - Math.max(0, c.value);
  }
  return Math.max(0, Math.min(base, Math.round(off)));
}

/** The price with this coupon, or null when the promo is already cheaper. */
export function quoteWith(c: Coupon, ctx: Pick<PriceCtx, 'list' | 'promo'>): Quote | null {
  const stack = !!c.stack_with_promo;
  const base = stack ? ctx.promo : ctx.list;
  const total = base - ruleOff(c, base);
  if (total >= ctx.promo) return null; // no better than not using it
  const discount = ctx.promo - total;
  const pct = c.funded_by === 'host' ? 100 : c.funded_by === 'split' ? Math.min(100, Math.max(0, c.host_share_pct)) : 0;
  const hostDiscount = Math.round((discount * pct) / 100);
  return {
    list: ctx.list,
    promoOff: stack ? Math.max(0, ctx.list - ctx.promo) : 0,
    couponOff: stack ? ctx.promo - total : ctx.list - total,
    total,
    listAmount: ctx.promo,
    discount,
    hostDiscount,
    aslDiscount: discount - hostDiscount,
  };
}

export type Verdict = { ok: true; quote: Quote } | { ok: false; reason: string };

function fmtThai(wall: string): string {
  const [d, t] = wall.split('T');
  const [y, m, day] = d.split('-').map(Number);
  const MON = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  return `${day} ${MON[(m || 1) - 1]} ${((y || 0) + 543) % 100}${t ? ` ${t}` : ''}`;
}

/**
 * May this member use this coupon (and this code, for unique / wallet codes)
 * on this booking? Every rule is checked here, on the server.
 */
export async function judge(db: D1Database, c: Coupon, code: CouponCode | null, ctx: PriceCtx): Promise<Verdict> {
  if (c.status !== 'active') return { ok: false, reason: 'คูปองนี้ถูกปิดใช้งานแล้ว' };
  const now = thaiNow();
  if (c.starts_at && now < c.starts_at) return { ok: false, reason: `ใช้ได้ตั้งแต่ ${fmtThai(c.starts_at)}` };
  if (c.ends_at && now > c.ends_at) return { ok: false, reason: 'คูปองนี้หมดอายุแล้ว' };
  if (ctx.promo <= 0) return { ok: false, reason: 'รายการนี้ไม่มีค่าใช้จ่าย' };
  if (!couponFlows(c).includes(ctx.flow)) return { ok: false, reason: 'ใช้กับการจองแบบนี้ไม่ได้' };

  const ids = couponScopeIds(c);
  if (c.scope === 'masters' && !(ctx.workshop.master_id && ids.includes(ctx.workshop.master_id))) {
    return { ok: false, reason: 'ใช้กับกิจกรรมนี้ไม่ได้' };
  }
  if (c.scope === 'categories' && !(ctx.workshop.category && ids.includes(ctx.workshop.category))) {
    return { ok: false, reason: 'ใช้กับหมวดของกิจกรรมนี้ไม่ได้' };
  }
  if (c.scope === 'hosts' && !parseInstructorIds(ctx.workshop as Workshop).some((h) => ids.includes(h))) {
    return { ok: false, reason: 'ใช้กับกิจกรรมของผู้จัดคนนี้ไม่ได้' };
  }
  if (c.min_spend > 0 && ctx.promo < c.min_spend) return { ok: false, reason: `ใช้ได้กับยอดตั้งแต่ ${baht(c.min_spend)}` };

  const ex = ctx.excludeBookingId || '';
  if (code) {
    if (code.coupon_id !== c.id) return { ok: false, reason: 'รหัสไม่ถูกต้อง' };
    if (code.owner_user_id && code.owner_user_id !== ctx.userId) return { ok: false, reason: 'รหัสนี้เป็นของบัญชีอื่น' };
    const used = await db
      .prepare(`SELECT 1 FROM bookings WHERE coupon_code = ? AND id != ? AND ${aliveSql()} LIMIT 1`)
      .bind(code.code, ex)
      .first();
    if (used) return { ok: false, reason: 'รหัสนี้ถูกใช้แล้ว' };
  }
  if (c.max_uses != null && c.max_uses > 0) {
    const n = await db
      .prepare(`SELECT COUNT(*) AS n FROM bookings WHERE coupon_id = ? AND id != ? AND ${aliveSql()}`)
      .bind(c.id, ex)
      .first<{ n: number }>();
    if ((n?.n || 0) >= c.max_uses) return { ok: false, reason: 'คูปองนี้ถูกใช้ครบจำนวนแล้ว' };
  }
  if (c.per_user_limit != null && c.per_user_limit > 0) {
    const n = await db
      .prepare(`SELECT COUNT(*) AS n FROM bookings WHERE coupon_id = ? AND user_id = ? AND id != ? AND ${aliveSql()}`)
      .bind(c.id, ctx.userId, ex)
      .first<{ n: number }>();
    if ((n?.n || 0) >= c.per_user_limit) return { ok: false, reason: 'คุณใช้คูปองนี้ครบสิทธิ์แล้ว' };
  }
  if (c.first_booking_only) {
    const prior = await db
      .prepare(
        `SELECT 1 FROM bookings WHERE user_id = ? AND id != ? AND status != 'cancelled'
           AND (payment_status = 'paid' OR status = 'confirmed') LIMIT 1`,
      )
      .bind(ctx.userId, ex)
      .first();
    if (prior) return { ok: false, reason: 'ใช้ได้เฉพาะการจองครั้งแรก' };
  }

  const quote = quoteWith(c, ctx);
  if (!quote) return { ok: false, reason: ctx.promo < ctx.list ? 'ราคาโปรโมชันถูกกว่าคูปองนี้' : 'คูปองนี้ไม่ทำให้ราคาลดลง' };
  return { ok: true, quote };
}

/** The coupon (and code row) behind what was typed or picked, or null. */
export async function findByCode(db: D1Database, raw: unknown): Promise<{ coupon: Coupon; code: CouponCode | null } | null> {
  const code = normalizeCode(raw);
  if (!code) return null;
  const pub = await db.prepare('SELECT * FROM coupons WHERE public_code = ?').bind(code).first<Coupon>();
  if (pub) return { coupon: pub, code: null };
  const row = await db.prepare('SELECT * FROM coupon_codes WHERE code = ?').bind(code).first<CouponCode>();
  if (!row) return null;
  const coupon = await db.prepare('SELECT * FROM coupons WHERE id = ?').bind(row.coupon_id).first<Coupon>();
  return coupon ? { coupon, code: row } : null;
}

/** The code string a booking stores for a coupon use. */
export function storedCode(found: { coupon: Coupon; code: CouponCode | null }): string {
  return found.code ? found.code.code : found.coupon.public_code || '';
}

// ---------------------------------------------------------------------------
// Wrong-code lock
// ---------------------------------------------------------------------------

export const MAX_ATTEMPTS = 10;

export async function tooManyAttempts(db: D1Database, userId: string): Promise<boolean> {
  const r = await db
    .prepare("SELECT COUNT(*) AS n FROM coupon_attempts WHERE user_id = ? AND created_at > datetime('now', '-10 minutes')")
    .bind(userId)
    .first<{ n: number }>();
  return (r?.n || 0) >= MAX_ATTEMPTS;
}

export async function recordAttempt(db: D1Database, userId: string): Promise<void> {
  await db.batch([
    db.prepare('INSERT INTO coupon_attempts (user_id) VALUES (?)').bind(userId),
    db.prepare("DELETE FROM coupon_attempts WHERE created_at < datetime('now', '-1 day')"),
  ]);
}

// ---------------------------------------------------------------------------
// Using a coupon on a booking (shared by the booking routes)
// ---------------------------------------------------------------------------

/** Columns a booking stores for its coupon; all zero / null without one. */
export type CouponColumns = {
  coupon_id: string | null;
  coupon_code: string | null;
  list_amount: number | null;
  discount_amount: number;
  host_discount: number;
  host_credit: number;
  amount: number;
};

/**
 * Check `rawCode` for this booking and work out what it is charged. Without a
 * code the plain price comes back. Wrong codes count towards the lock.
 */
export async function applyCode(
  db: D1Database,
  rawCode: unknown,
  ctx: PriceCtx,
): Promise<{ ok: true; cols: CouponColumns } | { ok: false; error: string }> {
  const plain: CouponColumns = {
    coupon_id: null,
    coupon_code: null,
    list_amount: null,
    discount_amount: 0,
    host_discount: 0,
    host_credit: 0,
    amount: ctx.promo,
  };
  if (!normalizeCode(rawCode)) return { ok: true, cols: plain };
  if (await tooManyAttempts(db, ctx.userId)) return { ok: false, error: 'กรอกรหัสผิดหลายครั้งเกินไป ลองใหม่อีก 10 นาที' };
  const found = await findByCode(db, rawCode);
  if (!found) {
    await recordAttempt(db, ctx.userId);
    return { ok: false, error: 'ไม่พบรหัสคูปองนี้' };
  }
  const v = await judge(db, found.coupon, found.code, ctx);
  if (!v.ok) return { ok: false, error: `ใช้คูปองไม่ได้: ${v.reason}` };
  const q = v.quote;
  return {
    ok: true,
    cols: {
      coupon_id: found.coupon.id,
      coupon_code: storedCode(found),
      list_amount: q.listAmount,
      discount_amount: q.discount,
      host_discount: q.hostDiscount,
      host_credit: q.aslDiscount,
      amount: q.total,
    },
  };
}

// ---------------------------------------------------------------------------
// What a member can pick at checkout
// ---------------------------------------------------------------------------

/** A coupon as the checkout screen and the wallet show it. */
export type CouponOffer = {
  code: string;
  name: string;
  description: string | null;
  headline: string;
  big: string;
  kind: CouponKind;
  endsAt: string | null;
  source: 'wallet' | 'public';
  ok: boolean;
  reason: string | null;
  total: number | null;
};

function offerOf(c: Coupon, code: string, source: CouponOffer['source'], v: Verdict): CouponOffer {
  return {
    code,
    name: c.name,
    description: c.description,
    headline: couponHeadline(c),
    big: couponBig(c),
    kind: c.kind,
    endsAt: c.ends_at,
    source,
    ok: v.ok,
    reason: v.ok ? null : v.reason,
    total: v.ok ? v.quote.total : null,
  };
}

/**
 * Coupons offered at checkout: the member's unused wallet codes, then public
 * coupons the admin chose to show. Expired, disabled and spent ones are left
 * out; the rest come with whether they work here and why not.
 */
export async function offersFor(db: D1Database, ctx: PriceCtx): Promise<CouponOffer[]> {
  const now = thaiNow();
  const ex = ctx.excludeBookingId || '';
  const wallet =
    (
      await db
        .prepare(
          `SELECT cc.* FROM coupon_codes cc JOIN coupons c ON c.id = cc.coupon_id
            WHERE cc.owner_user_id = ? AND c.status = 'active' AND (c.ends_at IS NULL OR c.ends_at >= ?)
              AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.coupon_code = cc.code AND b.id != ? AND ${aliveSql('b')})
            ORDER BY cc.claimed_at DESC`,
        )
        .bind(ctx.userId, now, ex)
        .all<CouponCode>()
    ).results || [];
  const publics =
    (
      await db
        .prepare(
          `SELECT * FROM coupons WHERE distribution = 'public' AND show_at_checkout = 1 AND status = 'active'
             AND public_code IS NOT NULL AND (ends_at IS NULL OR ends_at >= ?) ORDER BY created_at DESC`,
        )
        .bind(now)
        .all<Coupon>()
    ).results || [];

  const coupons = new Map<string, Coupon>();
  for (const p of publics) coupons.set(p.id, p);
  const needed = [...new Set(wallet.map((w) => w.coupon_id))].filter((id) => !coupons.has(id));
  if (needed.length) {
    const rows = await db
      .prepare(`SELECT * FROM coupons WHERE id IN (${needed.map(() => '?').join(',')})`)
      .bind(...needed)
      .all<Coupon>();
    for (const c of rows.results || []) coupons.set(c.id, c);
  }

  const out: CouponOffer[] = [];
  for (const w of wallet) {
    const c = coupons.get(w.coupon_id);
    if (c) out.push(offerOf(c, w.code, 'wallet', await judge(db, c, w, ctx)));
  }
  for (const p of publics) out.push(offerOf(p, p.public_code as string, 'public', await judge(db, p, null, ctx)));
  // Usable first, best price first.
  return out.sort((a, b) => Number(b.ok) - Number(a.ok) || (a.total ?? 1e12) - (b.total ?? 1e12));
}

/** The admin form's payload, cleaned. Returns an error string when unusable. */
export function cleanCouponInput(body: Record<string, unknown>): { data: Omit<Coupon, 'id' | 'status' | 'created_by' | 'created_at' | 'updated_at'> } | { error: string } {
  const name = String(body.name ?? '').trim().slice(0, 120);
  if (!name) return { error: 'กรุณาตั้งชื่อคูปอง' };
  const kind = String(body.kind) as CouponKind;
  if (!['percent', 'amount', 'free', 'fixed_price'].includes(kind)) return { error: 'เลือกชนิดส่วนลด' };
  const num = (v: unknown) => (v === '' || v == null ? null : Math.round(Number(v)));
  const value = kind === 'free' ? 0 : num(body.value);
  if (kind !== 'free' && (value == null || !Number.isFinite(value) || value < 0)) return { error: 'กรอกมูลค่าส่วนลด' };
  if (kind === 'percent' && (value! < 1 || value! > 100)) return { error: 'เปอร์เซ็นต์ต้องอยู่ระหว่าง 1–100' };
  if (kind === 'amount' && value! < 1) return { error: 'ส่วนลดต้องมากกว่า ฿0' };
  const distribution = String(body.distribution) as CouponDistribution;
  if (!['public', 'unique', 'wallet'].includes(distribution)) return { error: 'เลือกรูปแบบการแจก' };
  const publicCode = distribution === 'public' ? normalizeCode(body.public_code) : null;
  if (distribution === 'public' && (!publicCode || publicCode.length < 4)) return { error: 'รหัสสาธารณะต้องมีอย่างน้อย 4 ตัวอักษร' };
  if (publicCode && !/^[A-Z0-9]+$/.test(publicCode)) return { error: 'รหัสใช้ได้เฉพาะ A–Z และ 0–9' };
  const funded = String(body.funded_by || 'asl') as CouponFunding;
  if (!['asl', 'host', 'split'].includes(funded)) return { error: 'เลือกว่าใครแบกส่วนลด' };
  let share = funded === 'host' ? 100 : funded === 'asl' ? 0 : (num(body.host_share_pct) ?? 50);
  share = Math.min(100, Math.max(0, share));
  if (funded === 'split' && (share <= 0 || share >= 100)) return { error: 'แบบแบ่งกัน ส่วนของผู้จัดต้องอยู่ระหว่าง 1–99%' };
  const wall = (v: unknown) => {
    const s = String(v ?? '').trim();
    return /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/.test(s) ? (s.length === 10 ? `${s}T00:00` : s) : null;
  };
  const starts = wall(body.starts_at);
  const ends = wall(body.ends_at);
  if (starts && ends && ends < starts) return { error: 'วันหมดอายุต้องอยู่หลังวันเริ่มใช้' };
  const scope = String(body.scope || 'all') as CouponScope;
  if (!['all', 'masters', 'categories', 'hosts'].includes(scope)) return { error: 'ขอบเขตไม่ถูกต้อง' };
  const ids = Array.isArray(body.scope_ids) ? body.scope_ids.map(String).filter(Boolean) : [];
  if (scope !== 'all' && ids.length === 0) return { error: 'เลือกกิจกรรม หมวด หรือผู้จัดอย่างน้อย 1 รายการ' };
  const flows = Array.isArray(body.kinds) ? body.kinds.map(String).filter((k) => FLOWS.some((f) => f.key === k)) : [];
  if (flows.length === 0) return { error: 'เลือกแบบการจองที่ใช้ได้อย่างน้อย 1 แบบ' };
  const positiveOrNull = (v: unknown) => {
    const n = num(v);
    return n != null && n > 0 ? n : null;
  };
  return {
    data: {
      name,
      description: String(body.description ?? '').trim().slice(0, 300) || null,
      kind,
      value: value ?? 0,
      max_discount: kind === 'percent' ? positiveOrNull(body.max_discount) : null,
      distribution,
      public_code: publicCode,
      show_at_checkout: distribution === 'public' && body.show_at_checkout ? 1 : 0,
      stack_with_promo: body.stack_with_promo ? 1 : 0,
      funded_by: funded,
      host_share_pct: share,
      starts_at: starts,
      ends_at: ends,
      max_uses: positiveOrNull(body.max_uses),
      per_user_limit: positiveOrNull(body.per_user_limit),
      min_spend: Math.max(0, num(body.min_spend) ?? 0),
      scope,
      scope_json: scope === 'all' ? null : JSON.stringify(ids),
      kinds_json: flows.length === FLOWS.length ? null : JSON.stringify(flows),
      first_booking_only: body.first_booking_only ? 1 : 0,
    },
  };
}
