/** Price tiers on a round master (migration 055).
 *
 * Two base prices live in their own columns — price_group is "ราคา/คน" (one
 * seat) and price_group_booking is "กลุ่ม" (booking together; stored now,
 * not yet sold). Any further tier the admin adds — a student rate, a
 * whole-round corporate rate — lives in price_tiers_json. A tier's `mode`
 * says what one purchase buys: 'seat' one seat, 'round' the whole round.
 */

export type TierMode = 'seat' | 'round';

export interface PriceTier {
  id: string;
  label: string;
  price: number;
  mode: TierMode;
}

export function parseTiers(json: string | null | undefined): PriceTier[] {
  try {
    const a = json ? (JSON.parse(json) as unknown) : [];
    if (!Array.isArray(a)) return [];
    return a
      .filter((t): t is PriceTier => !!t && typeof t === 'object' && typeof (t as PriceTier).id === 'string' && typeof (t as PriceTier).label === 'string')
      .map((t) => ({
        id: t.id,
        label: t.label,
        price: Number.isFinite(Number(t.price)) ? Math.max(0, Number(t.price)) : 0,
        mode: t.mode === 'round' ? 'round' : 'seat',
      }));
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
    out.push({ id, label, price, mode: t.mode === 'round' ? 'round' : 'seat' });
  }
  return out;
}

/** Everything a learner can pick in the booking popup: the base seat price
 *  first, then the admin's tiers. */
export function bookableTiers(master: { price_group: number | null; price_tiers_json?: string | null }, seatPrice?: number): PriceTier[] {
  const base: PriceTier = { id: 'seat', label: 'ราคา/คน', price: seatPrice ?? master.price_group ?? 0, mode: 'seat' };
  return [base, ...parseTiers(master.price_tiers_json)];
}
