/**
 * Who can read an article, kept in the existing `published` column so no
 * migration is needed:
 *   0 private  — admins only
 *   2 unlisted — anyone with the link; left out of every list on the site
 *   1 public   — listed on /articles and the home page
 * Every list query keeps using `published = 1`, so unlisted stays out of them.
 */

export type ArticleVisibility = 'private' | 'unlisted' | 'public';

export const PUBLISHED_CODE: Record<ArticleVisibility, number> = { private: 0, unlisted: 2, public: 1 };

export const VISIBILITY_OPTIONS: { value: ArticleVisibility; th: string; hint: string }[] = [
  { value: 'private', th: 'ส่วนตัว', hint: 'เห็นเฉพาะผู้ดูแล' },
  { value: 'unlisted', th: 'ไม่เป็นสาธารณะ', hint: 'เปิดได้เฉพาะคนที่มีลิงก์ ไม่ขึ้นในหน้าเว็บ' },
  { value: 'public', th: 'สาธารณะ', hint: 'ขึ้นในหน้าบทความและหน้าแรก' },
];

export function visibilityOf(published: unknown): ArticleVisibility {
  const n = Number(published);
  return n === 1 ? 'public' : n === 2 ? 'unlisted' : 'private';
}

/** The column value for a request body's `published`: a visibility name, the
 *  raw code, or the old boolean. Missing means public, as before. */
export function publishedCode(v: unknown): number {
  if (v == null) return 1;
  if (v === 'private' || v === 'unlisted' || v === 'public') return PUBLISHED_CODE[v];
  if (v === 2 || v === '2') return 2;
  return v === true || v === 1 || v === '1' ? 1 : 0;
}
