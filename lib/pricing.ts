/** Price tiers on a round master (migrations 055, 056).
 *
 * Every price the admin sells lives in price_tiers_json; price_group is the
 * per-seat price derived from it (see seatPrice), kept for older rounds.
 * A tier's `mode` says what one purchase buys:
 *   seat  — one seat
 *   round — the whole round (nobody else joins)
 *   pack  — a fixed group of `size` people
 *   range — a group of `min`..`max` people, the booker picks how many
 * Group tiers (pack / range) are priced per person; `lock` makes the booking
 * take the whole round for itself, the way a round tier does. The booker is
 * one of the group and invites the rest by link.
 */

export type TierMode = 'seat' | 'round' | 'pack' | 'range';

export interface PriceTier {
  id: string;
  label: string;
  /** Baht per person (per seat), or for the whole round when mode = 'round'. */
  price: number;
  mode: TierMode;
  /** pack: people in the pack (booker included). */
  size?: number;
  /** range: smallest / largest group allowed (booker included). */
  min?: number;
  max?: number;
  /** Seat and group tiers: the booking locks the round as private. */
  lock?: boolean;
}

export const isGroupTier = (t: PriceTier): boolean => t.mode === 'pack' || t.mode === 'range';

const int = (v: unknown, fallback: number): number => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

function shape(t: Partial<PriceTier>, id: string, label: string, price: number): PriceTier {
  const mode: TierMode = t.mode === 'round' || t.mode === 'pack' || t.mode === 'range' ? t.mode : 'seat';
  const out: PriceTier = { id, label, price, mode };
  if (mode === 'seat') {
    if (t.lock) out.lock = true;
  } else if (mode === 'pack') {
    out.size = Math.max(2, int(t.size, 2));
    out.lock = !!t.lock;
  } else if (mode === 'range') {
    const min = Math.max(2, int(t.min, 2));
    out.min = min;
    out.max = Math.max(min, int(t.max, min));
    out.lock = !!t.lock;
  }
  return out;
}

export function parseTiers(json: string | null | undefined): PriceTier[] {
  try {
    const a = json ? (JSON.parse(json) as unknown) : [];
    if (!Array.isArray(a)) return [];
    return a
      .filter((t): t is PriceTier => !!t && typeof t === 'object' && typeof (t as PriceTier).id === 'string' && typeof (t as PriceTier).label === 'string')
      .map((t) => shape(t, t.id, t.label, Number.isFinite(Number(t.price)) ? Math.max(0, Number(t.price)) : 0));
  } catch {
    return [];
  }
}

/** Clean what the admin form sends before it is stored. */
export function normalizeTiers(input: unknown): PriceTier[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: PriceTier[] = [];
  for (const raw of input) {
    const t = raw as Partial<PriceTier>;
    const label = String(t.label ?? '').trim();
    const price = Number(t.price);
    if (!label || !Number.isFinite(price) || price < 0) continue;
    let id = String(t.id || '').trim() || `t-${Math.random().toString(36).slice(2, 8)}`;
    while (seen.has(id)) id = `${id}-x`;
    seen.add(id);
    out.push(shape(t, id, label, price));
  }
  return out;
}

/** The per-seat price: the first per-seat tier. Stored as price_group. */
export function seatPrice(tiers: PriceTier[]): number | null {
  return tiers.find((t) => t.mode === 'seat')?.price ?? null;
}

/** The one number a card or a round carries: the per-seat price, else the
 *  whole-round price, else nothing. */
export function cardPrice(tiers: PriceTier[]): number | null {
  return (tiers.find((t) => t.mode === 'seat') ?? tiers.find((t) => t.mode === 'round'))?.price ?? null;
}

/** Everything a learner can pick in the booking popup. A master saved before
 *  prices became tiers has only price_group, so that still shows as a
 *  "ราคา/คน" row until a per-seat tier replaces it. */
export function bookableTiers(master: { price_group: number | null; price_tiers_json?: string | null }, roundPrice?: number): PriceTier[] {
  const tiers = parseTiers(master.price_tiers_json);
  if (tiers.some((t) => t.mode === 'seat') || master.price_group == null) return tiers;
  const base: PriceTier = { id: 'seat', label: 'ราคา/คน', price: roundPrice ?? master.price_group, mode: 'seat' };
  return [base, ...tiers];
}

/** How many seats one purchase of this tier takes, given the group size the
 *  booker asked for (only a range tier listens to it). null = not allowed. */
export function tierSeats(t: PriceTier, wanted?: number | null): number | null {
  if (t.mode === 'pack') return t.size || 2;
  if (t.mode === 'range') {
    const n = Math.round(Number(wanted));
    if (!Number.isFinite(n) || n < (t.min || 2) || n > (t.max || 2)) return null;
    return n;
  }
  return 1;
}

/** What the booker pays for one purchase: per-person tiers times the seats. */
export function tierTotal(t: PriceTier, seats: number): number {
  return t.mode === 'round' ? t.price : t.price * seats;
}

/** Short Thai/English descriptor of what the tier buys, for lists and forms. */
export function tierDesc(t: PriceTier, lang: 'th' | 'en' = 'th'): string {
  const lock = t.lock ? (lang === 'th' ? ' · ล็อกรอบส่วนตัว' : ' · locks the round') : '';
  switch (t.mode) {
    case 'round':
      return lang === 'th' ? 'เหมาทั้งรอบ' : 'whole round';
    case 'pack':
      return (lang === 'th' ? `แพ็ก ${t.size} คน · ต่อคน` : `pack of ${t.size} · per person`) + lock;
    case 'range':
      return (lang === 'th' ? `กลุ่ม ${t.min}–${t.max} คน · ต่อคน` : `group of ${t.min}–${t.max} · per person`) + lock;
    default:
      return (lang === 'th' ? 'ต่อคน' : 'per person') + lock;
  }
}
