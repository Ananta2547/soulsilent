/** Article cards show a 4:3 window of the 3:1 cover. Where that window sits is
 *  stored as `card_x` (0–100, CSS object-position %) inside cover_image_meta,
 *  chosen in the admin with CardFocus. No column of its own. */
export const ARTICLE_CARD_RATIO = 4 / 3;

export function cardX(meta: unknown): number {
  try {
    const m = typeof meta === 'string' ? (JSON.parse(meta) as { card_x?: unknown }) : (meta as { card_x?: unknown } | null);
    const x = Number(m?.card_x);
    return m && m.card_x != null && Number.isFinite(x) ? Math.min(100, Math.max(0, x)) : 50;
  } catch {
    return 50;
  }
}

/** `object-position` for an article's card image. */
export const cardPos = (a: { cover_image_meta?: string | null }) => `${cardX(a.cover_image_meta)}% 50%`;
