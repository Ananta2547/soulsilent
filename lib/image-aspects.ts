/**
 * Centralized aspect-ratio registry — the single source of truth for every
 * place an image is rendered. Forms reference these by name; changing a value
 * here updates all forms (and re-crop modals) at once.
 *
 * Convention:
 *   - `ratio` is width/height as a number (e.g. 16/9 ≈ 1.7777).
 *   - `label` is shown to the admin in the cropper UI.
 *   - When an image is used in multiple placements, the form picks the
 *     LARGEST safe ratio as `primary` and passes the others as `overlays` so
 *     the admin can see how it'll be masked elsewhere.
 */

/** `ratio` omitted = free / original aspect: the cropper doesn't force a shape
 *  and defaults to the whole image (used for slips, which must stay full-page). */
export type AspectSpec = { ratio?: number; label: string };

export const ASPECTS = {
  // Workshop cover poster — A3 portrait (29.7 × 42 cm).
  WORKSHOP_CARD: { ratio: 297 / 420, label: 'A3 · โปสเตอร์ (การ์ด)' },
  WORKSHOP_HERO: { ratio: 297 / 420, label: 'A3 · โปสเตอร์ 29.7×42' },
  // Workshop master (info) cover — A3 portrait poster (29.7 × 42 cm).
  WORKSHOP_MASTER: { ratio: 297 / 420, label: 'A3 · โปสเตอร์ (ปกข้อมูล Workshop)' },

  ARTICLE_COVER: { ratio: 16 / 9, label: '16:9 · article card' },
  ARTICLE_HERO: { ratio: 3, label: '3:1 · article header (full width)' },
  ARTICLE_BODY_16_9: { ratio: 16 / 9, label: '16:9 · body image' },
  ARTICLE_BODY_4_3: { ratio: 4 / 3, label: '4:3 · body image' },
  ARTICLE_BODY_1_1: { ratio: 1, label: '1:1 · body image' },

  COURSE_THUMB: { ratio: 16 / 9, label: '16:9 · course thumbnail' },

  LOCATION_GALLERY: { ratio: 4 / 3, label: '4:3 · location gallery' },
  LOCATION_MAP: { ratio: 4 / 3, label: '4:3 · graphic map' },

  AVATAR: { ratio: 1, label: '1:1 · avatar' },
  PROFILE_COVER: { ratio: 16 / 5, label: '16:5 · cover photo' },

  // Slips are photos of a receipt — never crop them, keep the original shape.
  PAYOUT_SLIP: { label: 'สัดส่วนจริง · สลิปโอนเงิน' },
  REFUND_SLIP: { label: 'สัดส่วนจริง · สลิปคืนมัดจำ' },
} satisfies Record<string, AspectSpec>;

/** Pick the larger ratio (wider). Used to compute master crop when multiple
 *  placements exist. Free-aspect specs (no ratio) are ignored. */
export function largestAspect(...specs: AspectSpec[]): AspectSpec {
  return specs.reduce((a, b) => ((b.ratio ?? -1) > (a.ratio ?? -1) ? b : a));
}
