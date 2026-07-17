import type { Article, ArticleBlock, ArticleCategory } from './types';

/**
 * Default categories — used as fallback when /api/article-categories hasn't
 * loaded yet or when an article's category was deleted from the master list.
 * Plus the "all" pseudo-category for filter bars (never stored on rows).
 */
export const DEFAULT_CATEGORIES: { key: string; th: string; en: string }[] = [
  { key: 'all', th: 'ทั้งหมด', en: 'All' },
  { key: 'slow', th: 'การเรียนรู้แบบช้า', en: 'Slow Learning' },
  { key: 'diary', th: 'ไดอารี่เวิร์กชอป', en: 'Workshop Diary' },
  { key: 'howto', th: 'วิธีทำ', en: 'How-to' },
  { key: 'conversation', th: 'บทสนทนา', en: 'Conversation' },
  { key: 'reflection', th: 'บทสะท้อน', en: 'Reflection' },
  { key: 'field', th: 'ภาคสนาม', en: 'Field Notes' },
];

const TH_MONTH = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
];

export function formatArticleDate(iso: string, lang: 'th' | 'en'): string {
  const d = new Date(`${iso}T00:00:00`);
  if (lang === 'en') {
    return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
  }
  return `${d.getDate()} ${TH_MONTH[d.getMonth()]} ${d.getFullYear() + 543}`;
}

/**
 * Look up a category label from a list (fetched from API) and fall back to the
 * hardcoded defaults if the list isn't ready yet or the key is missing.
 */
export function categoryLabel(
  key: string,
  lang: 'th' | 'en',
  list?: Pick<ArticleCategory, 'key' | 'th' | 'en'>[]
): string {
  const fromList = list?.find((x) => x.key === key);
  if (fromList) return lang === 'th' ? fromList.th : fromList.en;
  const fallback = DEFAULT_CATEGORIES.find((x) => x.key === key);
  if (fallback) return lang === 'th' ? fallback.th : fallback.en;
  return key; // last-resort: show the raw key
}

export function parseTags(article: Pick<Article, 'tags_json'>): string[] {
  try {
    const v = JSON.parse(article.tags_json || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function parseBody(article: Pick<Article, 'body_json'>): ArticleBlock[] {
  try {
    const v = JSON.parse(article.body_json || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
