/**
 * Search and share metadata shared by the root layout, the per-page layouts,
 * robots.txt and sitemap.xml.
 */

/** The public site. Canonical links and Open Graph URLs always point here,
 *  also from the preview Worker, so search engines index one address only. */
export const SITE_ORIGIN = 'https://allsoullearn.com';

export const SITE_NAME = 'AllSoulLearn';

export const SITE_DESCRIPTION =
  'AllSoulLearn รวมกิจกรรมเรียนรู้นอกห้องเรียน เวิร์กช็อป แคมป์ และกิจกรรมกลุ่ม จองที่นั่งและชำระเงินออนไลน์ได้ในที่เดียว';

/** Fallback share image when a page has no picture of its own. */
export const DEFAULT_OG_IMAGE = '/icons/icon-512.png';

/** One line of plain text for a meta description: whitespace folded, cut at
 *  `max` characters on a word boundary where possible. */
export function metaText(text: string | null | undefined, max = 160): string {
  const flat = (text || '').replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return (space > max * 0.6 ? cut.slice(0, space) : cut) + '…';
}

/** Absolute URL on the public site for a path or an already-absolute URL. */
export function absoluteUrl(pathOrUrl: string): string {
  if (/^https?:\/\//.test(pathOrUrl)) return pathOrUrl;
  return SITE_ORIGIN + (pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`);
}
