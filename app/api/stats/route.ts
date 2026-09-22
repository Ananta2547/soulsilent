import { NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { STATS_SQL, statsFromRow, BASE_WORKSHOPS, BASE_PARTICIPANTS, type StatsRow } from '@/lib/home-data';

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
export async function GET() {
  try {
    const db = await getDB();
    // One statement, one D1 round trip, for the three counters.
    const row = await db.prepare(STATS_SQL).first<StatsRow>();
    return NextResponse.json(statsFromRow(row));
  } catch (error) {
    console.error('Stats error:', error);
    // Never break the homepage — return the base numbers on failure.
    return NextResponse.json({ workshops: BASE_WORKSHOPS, participants: BASE_PARTICIPANTS, locations: 0 });
  }
}
