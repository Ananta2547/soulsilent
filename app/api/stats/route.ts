import { NextResponse } from 'next/server';
import { getDB } from '@/lib/db';

/**
 * GET /api/stats — public homepage statistics.
 * Each figure = a base seed value + the live count from the database.
 *   workshops    = 11  + workshops created in the system
 *   participants = 125 + successful bookings (paid/confirmed — actual attendees)
 *   locations    = distinct venues used across all workshops (no base)
 *
 * Project founding date: 15 Nov 2022 (พ.ศ. 2565) — use for any future
 * duration-based figures.
 */
const BASE_WORKSHOPS = 11;
const BASE_PARTICIPANTS = 125;

export async function GET() {
  try {
    const db = await getDB();

    const wRow = await db
      .prepare('SELECT COUNT(*) AS c FROM workshops')
      .first<{ c: number }>();

    const pRow = await db
      .prepare(
        `SELECT COUNT(*) AS c FROM bookings
          WHERE status != 'cancelled'
            AND (payment_status = 'paid' OR status = 'confirmed' OR attended = 1)`,
      )
      .first<{ c: number }>();

    // Distinct venues actually used by workshops (prefer the linked location_id,
    // fall back to the free-text location).
    const lRow = await db
      .prepare(
        `SELECT COUNT(DISTINCT COALESCE(NULLIF(TRIM(location_id), ''), NULLIF(TRIM(location), ''))) AS c
           FROM workshops
          WHERE COALESCE(NULLIF(TRIM(location_id), ''), NULLIF(TRIM(location), '')) IS NOT NULL`,
      )
      .first<{ c: number }>();

    return NextResponse.json({
      workshops: BASE_WORKSHOPS + (wRow?.c || 0),
      participants: BASE_PARTICIPANTS + (pRow?.c || 0),
      locations: lRow?.c || 0,
    });
  } catch (error) {
    console.error('Stats error:', error);
    // Never break the homepage — return the base numbers on failure.
    return NextResponse.json({ workshops: BASE_WORKSHOPS, participants: BASE_PARTICIPANTS, locations: 0 });
  }
}
