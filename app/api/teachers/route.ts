import { NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { roleSql } from '@/lib/roles';
import { seatsHeldSubquery, seatsOfRowSql } from '@/lib/seats';

/** What the makers page shows per teacher: who they are, what they teach,
 *  the rounds they have open, the workshops they have hosted, and one voice
 *  from a past participant. Public fields only. */
export type TeacherCard = {
  id: string;
  name: string;
  nickname: string | null;
  avatar_url: string | null;
  bio: string | null;
  /** Workshop categories this teacher has taught, most frequent first. */
  crafts: string[];
  upcoming: number;
  next_date: string | null;
  /** Start time of that next round, so ties on a date order by the hour. */
  next_time: string | null;
  /** When someone last signed up for any of this teacher's workshops. */
  last_booked_at: string | null;
  /** Rounds already held (past, active). */
  hosted: number;
  /** Capacity and whether it is full — never how many are booked. */
  rounds: { id: string; date: string; time_start: string; title: string; max: number; full: boolean }[];
  works: { id: string; title: string; image_url: string | null }[];
  quote: { comment: string; workshop: string } | null;
};

type WRow = {
  id: string;
  title: string;
  date: string;
  time_start: string;
  max_participants: number;
  category: string | null;
  image_url: string | null;
  instructor_id: string | null;
  instructor_ids_json: string | null;
  organizer: string | null;
  booked: number;
};

/** Every teacher a workshop row belongs to. */
function teachersOf(w: { instructor_id: string | null; instructor_ids_json: string | null; organizer: string | null }): string[] {
  const ids = new Set<string>();
  if (w.instructor_id) ids.add(w.instructor_id);
  if (w.organizer) ids.add(w.organizer);
  try {
    const a = w.instructor_ids_json ? (JSON.parse(w.instructor_ids_json) as unknown) : [];
    if (Array.isArray(a)) a.forEach((x) => typeof x === 'string' && x && ids.add(x));
  } catch {
    /* legacy column only */
  }
  return [...ids];
}

/** GET /api/teachers — every active teacher (primary or extra role), with
 *  the rounds and workshops that make up their card, plus site-wide totals
 *  for the header. */
export async function GET() {
  try {
    const db = await getDB();
    const teachersRes = await db
      .prepare(
        `SELECT u.id, u.name, u.nickname, u.avatar_url, u.bio, u.role
           FROM users u
          WHERE ${roleSql('u', 'teacher')}
            AND (u.account_status IS NULL OR u.account_status = 'active')
          ORDER BY u.name ASC`,
      )
      .all<{ id: string; name: string; nickname: string | null; avatar_url: string | null; bio: string | null; role: string }>();
    const teachers = teachersRes.results || [];
    if (teachers.length === 0) {
      return NextResponse.json({ teachers: [], stats: { makers: 0, rounds: 0, people: 0 } });
    }

    // Every active workshop, past and future, with its seat count — the page
    // splits them into "open rounds" and "hosted" per teacher.
    const wsRes = await db
      .prepare(
        `SELECT w.id, w.title, w.date, w.time_start, w.max_participants, w.category, w.image_url,
                w.instructor_id, w.instructor_ids_json, m.organizer,
                ${seatsHeldSubquery('w')} AS booked
           FROM workshops w
           LEFT JOIN workshop_masters m ON m.id = w.master_id
          WHERE w.status = 'active'
          ORDER BY w.date ASC, w.time_start ASC`,
      )
      .all<WRow>();
    const workshops = wsRes.results || [];

    // One voice per teacher: the newest warm review on any of their workshops.
    const rvRes = await db
      .prepare(
        `SELECT r.comment, w.title, w.instructor_id, w.instructor_ids_json, m.organizer
           FROM reviews r
           JOIN workshops w ON w.id = r.workshop_id
           LEFT JOIN workshop_masters m ON m.id = w.master_id
          WHERE r.comment IS NOT NULL AND TRIM(r.comment) != '' AND r.rating >= 4
          ORDER BY r.created_at DESC
          LIMIT 300`,
      )
      .all<{ comment: string; title: string; instructor_id: string | null; instructor_ids_json: string | null; organizer: string | null }>();

    // Newest sign-ups first; the first one seen per teacher is their latest.
    const recentRes = await db
      .prepare(
        `SELECT b.created_at, w.instructor_id, w.instructor_ids_json, m.organizer
           FROM bookings b
           JOIN workshops w ON w.id = b.workshop_id
           LEFT JOIN workshop_masters m ON m.id = w.master_id
          WHERE b.status != 'cancelled'
          ORDER BY b.created_at DESC
          LIMIT 500`,
      )
      .all<{ created_at: string; instructor_id: string | null; instructor_ids_json: string | null; organizer: string | null }>();
    const lastBooked = new Map<string, string>();
    for (const r of recentRes.results || []) {
      for (const tid of teachersOf(r)) if (!lastBooked.has(tid)) lastBooked.set(tid, r.created_at);
    }

    const people = await db
      .prepare(
        `SELECT COALESCE(SUM(${seatsOfRowSql('b', 'w.max_participants')}), 0) AS n
           FROM bookings b JOIN workshops w ON w.id = b.workshop_id
          WHERE b.status != 'cancelled' AND (b.payment_status = 'paid' OR b.status = 'confirmed')`,
      )
      .first<{ n: number }>();

    const today = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
    const byTeacher = new Map<string, WRow[]>();
    for (const w of workshops) {
      for (const tid of teachersOf(w)) {
        if (!byTeacher.has(tid)) byTeacher.set(tid, []);
        byTeacher.get(tid)!.push(w);
      }
    }
    const quoteOf = new Map<string, { comment: string; workshop: string }>();
    for (const r of rvRes.results || []) {
      for (const tid of teachersOf(r)) {
        if (!quoteOf.has(tid)) quoteOf.set(tid, { comment: r.comment.trim(), workshop: r.title });
      }
    }

    // Admins pass roleSql, but they only belong on the makers page when they
    // actually lead a workshop of their own; the other admins stay off it.
    const cards: TeacherCard[] = teachers.filter((t) => t.role !== 'admin' || byTeacher.has(t.id)).map((t) => {
      const mine = byTeacher.get(t.id) || [];
      const open = mine.filter((w) => w.date >= today);
      const past = mine.filter((w) => w.date < today);
      const craftCount = new Map<string, number>();
      mine.forEach((w) => w.category && craftCount.set(w.category, (craftCount.get(w.category) || 0) + 1));
      const seenTitle = new Set<string>();
      const works = [...open, ...past.slice().reverse()]
        .filter((w) => (seenTitle.has(w.title) ? false : (seenTitle.add(w.title), true)))
        .slice(0, 6)
        .map((w) => ({ id: w.id, title: w.title, image_url: w.image_url }));
      return {
        id: t.id,
        name: t.name,
        nickname: t.nickname,
        avatar_url: t.avatar_url,
        bio: t.bio,
        crafts: [...craftCount.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c),
        upcoming: open.length,
        next_date: open[0]?.date || null,
        next_time: open[0]?.time_start || null,
        last_booked_at: lastBooked.get(t.id) || null,
        hosted: past.length,
        rounds: open.slice(0, 6).map((w) => ({ id: w.id, date: w.date, time_start: w.time_start, title: w.title, max: w.max_participants, full: (Number(w.booked) || 0) >= w.max_participants })),
        works,
        quote: quoteOf.get(t.id) || null,
      };
    });

    return NextResponse.json({
      teachers: cards,
      stats: {
        makers: cards.length,
        rounds: workshops.filter((w) => w.date < today).length,
        people: Number(people?.n) || 0,
      },
    });
  } catch (error) {
    console.error('List teachers error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 });
  }
}
