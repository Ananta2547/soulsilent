import { NextResponse } from 'next/server';
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

/** GET /api/home — everything the home page shows, in one response. The six
 *  pieces used to be six requests, each its own D1 round trip after the page
 *  had hydrated; here they run as one batch. Same rows as the individual
 *  routes (/api/workshops?status=active, ?featured=1&public=1, /api/articles,
 *  /api/article-categories, /api/reviews?featured=1&limit=10, /api/stats). */
export async function GET() {
  try {
    const db = await getDB();
    const [active, featured, articles, categories, reviews, stats] = await db.batch([
      db.prepare(workshopListSql(['status = ?'])).bind('active'),
      db.prepare(workshopListSql(["status IN ('active', 'closed')", 'featured = 1'])),
      db.prepare(PUBLISHED_ARTICLES_SQL),
      db.prepare(ARTICLE_CATEGORIES_SQL),
      db.prepare(reviewListSql({ limit: 10, featured: true })),
      db.prepare(STATS_SQL),
    ]);
    return NextResponse.json({
      workshops: (active.results || []) as Workshop[],
      featured: (featured.results || []) as Workshop[],
      articles: (articles.results || []) as Article[],
      categories: (categories.results || []) as ArticleCategory[],
      reviews: reviews.results || [],
      stats: statsFromRow((stats.results as StatsRow[])[0]),
    });
  } catch (error) {
    console.error('Home bundle error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 });
  }
}
