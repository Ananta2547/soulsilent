/** The queries behind the home page, shared by the routes that serve each
 *  piece on its own (/api/workshops, /api/stats, ...) and by /api/home, which
 *  runs them all in one D1 batch — one round trip instead of one per piece. */

import { seatsOfRowSql } from '@/lib/seats';

/** The public workshop list: every column plus the venue, the master's kind
 *  and the seats taken. A private booking took the whole round, so it counts
 *  as every seat. `where` clauses are ANDed; params bind in order. */
export function workshopListSql(where: string[]): string {
  const countSelect = `, (SELECT COALESCE(SUM(${seatsOfRowSql('bookings', 'workshops.max_participants')}), 0) FROM bookings WHERE bookings.workshop_id = workshops.id AND bookings.status != 'cancelled' AND bookings.payment_status != 'expired') AS booking_count`;
  let query = `SELECT workshops.*, l.name AS loc_name, l.province AS loc_province, l.district AS loc_district, m.kind AS master_kind${countSelect}
       FROM workshops LEFT JOIN locations l ON workshops.location_id = l.id
       LEFT JOIN workshop_masters m ON m.id = workshops.master_id`;
  if (where.length > 0) query += ' WHERE ' + where.join(' AND ');
  return query + ' ORDER BY date DESC';
}

export const PUBLISHED_ARTICLES_SQL = 'SELECT * FROM articles WHERE published = 1 ORDER BY date DESC';

export const ARTICLE_CATEGORIES_SQL = 'SELECT * FROM article_categories ORDER BY sort_order, key';

/** Public reviews joined with author and workshop — no emails. `limit` keeps
 *  only reviews with a comment (the landing wall); `featured` narrows to the
 *  admin-starred ones. */
export function reviewListSql(opts: { limit?: number | null; featured?: boolean }): string {
  let sql = `
      SELECT r.id, r.rating, r.comment, r.featured, r.created_at,
             u.name AS user_name,
             w.id AS workshop_id, w.title AS workshop_title, w.master_id AS master_id
      FROM reviews r
      LEFT JOIN users u ON r.user_id = u.id
      LEFT JOIN workshops w ON r.workshop_id = w.id`;
  const where: string[] = [];
  if (opts.limit) where.push(`r.comment IS NOT NULL AND trim(r.comment) != ''`);
  if (opts.featured) where.push(`r.featured = 1`);
  if (where.length) sql += ` WHERE ${where.join(' AND ')}`;
  sql += ` ORDER BY r.created_at DESC`;
  if (opts.limit) sql += ` LIMIT ${opts.limit}`;
  return sql;
}

/** The three counters on the home page in one row: workshops, people who
 *  took part (paid, confirmed or checked in), and distinct venues (the linked
 *  location, else the free-text one). */
export const STATS_SQL = `SELECT
  (SELECT COUNT(*) FROM workshops) AS workshops,
  (SELECT COUNT(*) FROM bookings
    WHERE status != 'cancelled'
      AND (payment_status = 'paid' OR status = 'confirmed' OR attended = 1)) AS participants,
  (SELECT COUNT(DISTINCT COALESCE(NULLIF(TRIM(location_id), ''), NULLIF(TRIM(location), '')))
     FROM workshops
    WHERE COALESCE(NULLIF(TRIM(location_id), ''), NULLIF(TRIM(location), '')) IS NOT NULL) AS locations`;

/** Numbers the home page shows before (or without) the database. */
export const BASE_WORKSHOPS = 11;
export const BASE_PARTICIPANTS = 125;

export type StatsRow = { workshops: number; participants: number; locations: number };

export function statsFromRow(row: StatsRow | null | undefined): StatsRow {
  return {
    workshops: BASE_WORKSHOPS + (row?.workshops || 0),
    participants: BASE_PARTICIPANTS + (row?.participants || 0),
    locations: row?.locations || 0,
  };
}
