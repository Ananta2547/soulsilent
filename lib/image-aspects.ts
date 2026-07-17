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

export type AspectSpec = { ratio: number; label: string };

export const ASPECTS = {
  // Workshop cover poster — A3 portrait (29.7 × 42 cm).
  WORKSHOP_CARD: { ratio: 297 / 420, label: 'A3 · โปสเตอร์ (การ์ด)' },
  WORKSHOP_HERO: { ratio: 297 / 420, label: 'A3 · โปสเตอร์ 29.7×42' },
  // Workshop master (info) cover — wide landscape hero.
  WORKSHOP_MASTER: { ratio: 16 / 9, label: '16:9 · ปกข้อมูล Workshop' },

  ARTICLE_COVER: { ratio: 16 / 9, label: '16:9 · article card' },
  ARTICLE_HERO: { ratio: 21 / 9, label: '21:9 · article header' },
  ARTICLE_BODY_16_9: { ratio: 16 / 9, label: '16:9 · body image' },
  ARTICLE_BODY_4_3: { ratio: 4 / 3, label: '4:3 · body image' },
  ARTICLE_BODY_1_1: { ratio: 1, label: '1:1 · body image' },

  COURSE_THUMB: { ratio: 16 / 9, label: '16:9 · course thumbnail' },

  LOCATION_GALLERY: { ratio: 4 / 3, label: '4:3 · location gallery' },
  LOCATION_MAP: { ratio: 4 / 3, label: '4:3 · graphic map' },

  AVATAR: { ratio: 1, label: '1:1 · avatar' },
  PROFILE_COVER: { ratio: 16 / 5, label: '16:5 · cover photo' },

  PAYOUT_SLIP: { ratio: 3 / 4, label: '3:4 · สลิปโอนเงิน' },
  REFUND_SLIP: { ratio: 3 / 4, label: '3:4 · สลิปคืนมัดจำ' },
} satisfies Record<string, AspectSpec>;

/** Pick the larger ratio (wider). Used to compute master crop when multiple placements exist. */
export function largestAspect(...specs: AspectSpec[]): AspectSpec {
  return specs.reduce((a, b) => (b.ratio > a.ratio ? b : a));
}
