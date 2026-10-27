import { getDB } from '@/lib/db';
import {
  ARTICLE_CATEGORIES_SQL,
  PUBLISHED_ARTICLES_SQL,
  STATS_SQL,
  reviewListSql,
  statsFromRow,
  workshopListSql,
  type StatsRow,
} from '@/lib/home-data';
import type { Article, ArticleCategory, Workshop } from '@/lib/types';
import { publicWorkshop } from '@/lib/workshop-public';
import { visibleMasterSql } from '@/lib/round-rules';

/** A review as the home page shows it: no emails, author and journey joined. */
export type PublicReview = {
  id: string;
  rating: number;
  comment: string | null;
  featured: number;
  created_at: string;
  user_name: string | null;
  workshop_id: string | null;
  workshop_title: string | null;
  master_id: string | null;
};

export type HomeBundle = {
  workshops: Workshop[];
  featured: Workshop[];
  articles: Article[];
  categories: ArticleCategory[];
  reviews: PublicReview[];
  stats: StatsRow;
};

/** Everything the home page shows, in one D1 batch. Read by the home page on
 *  the server (so the first HTML carries real data) and by GET /api/home. */
export async function loadHomeBundle(): Promise<HomeBundle> {
  const db = await getDB();
  const [active, featured, articles, categories, reviews, stats] = await db.batch([
    db.prepare(workshopListSql(['status = ?', visibleMasterSql('m')])).bind('active'),
    db.prepare(workshopListSql(["status IN ('active', 'closed')", 'featured = 1', visibleMasterSql('m')])),
    db.prepare(PUBLISHED_ARTICLES_SQL),
    db.prepare(ARTICLE_CATEGORIES_SQL),
    db.prepare(reviewListSql({ limit: 10, featured: true })),
    db.prepare(STATS_SQL),
  ]);
  return {
    workshops: ((active.results || []) as Workshop[]).map(publicWorkshop),
    featured: ((featured.results || []) as Workshop[]).map(publicWorkshop),
    // Cards only: the article bodies would ride along in the page's HTML.
    articles: ((articles.results || []) as Article[]).map((a) => ({ ...a, body_json: '' })),
    categories: (categories.results || []) as ArticleCategory[],
    reviews: (reviews.results || []) as PublicReview[],
    stats: statsFromRow((stats.results as StatsRow[])[0]),
  };
}
