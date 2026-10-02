import { NextResponse } from 'next/server';
import { seatsHeldSubquery, seatsOfRowSql } from '@/lib/seats';
import { getDB } from '@/lib/db';
import { expireStaleHolds } from '@/lib/holds';
import { ownRoleSql } from '@/lib/roles';
import { getCurrentUserWithRoles } from '@/lib/auth';
import { parseTeacherProfile, type TeacherProfile } from '@/lib/teacher-profile';
import { getWorkshopStatusBadge } from '@/lib/workshop-utils';
import type { Workshop } from '@/lib/types';

/* Public profile of a teacher: who they are, what they wrote about
 * themselves, the workshops they have run, and every round they run from
 * today on — the rows the profile page's calendar lights up. Only fields a
 * visitor may see leave here. `can_edit` is true for the teacher themself
 * and for admins, so the page can offer the in-place editor. */

const SEAT_TAKEN = `
  b.status != 'cancelled' AND (
    b.payment_status = 'paid' OR b.status = 'confirmed'
    OR (b.payment_status = 'pending' AND b.expires_at IS NOT NULL AND datetime(b.expires_at) > datetime('now'))
  )`;

/** Rounds this host leads: listed as a facilitator on the row, or organizer
 *  of its master when the row names nobody (so a workshop handed to another
 *  host leaves this page). Binds the id three times. */
const MINE = `(
  w.instructor_id = ?
  OR EXISTS (SELECT 1 FROM json_each(COALESCE(w.instructor_ids_json, '[]')) WHERE json_each.value = ?)
  OR (m.organizer = ? AND COALESCE(w.instructor_id, '') = ''
      AND NOT EXISTS (SELECT 1 FROM json_each(COALESCE(w.instructor_ids_json, '[]')) WHERE COALESCE(json_each.value, '') != ''))
)`;

export type TeacherPublic = {
  id: string;
  name: string;
  nickname: string | null;
  avatar_url: string | null;
  bio: string | null;
  /** Workshop categories they have taught, most frequent first. */
  crafts: string[];
  profile: TeacherProfile;
  /** Rounds already held and people who sat in them (collected seats). */
  hosted: number;
  joined: number;
  /** Distinct workshops, open ones first then the newest past ones. */
  works: { id: string; title: string; image_url: string | null; open: boolean }[];
};

type WorkRow = { id: string; title: string; image_url: string | null; category: string | null; open?: boolean };

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = await getDB();
    await expireStaleHolds(db);

    const row = await db
      .prepare(
        `SELECT u.id, u.name, u.nickname, u.avatar_url, u.bio, u.teacher_profile_json
           FROM users u
          WHERE u.id = ? AND ${ownRoleSql('u', 'teacher')} AND (u.account_status IS NULL OR u.account_status = 'active')`
      )
      .bind(id)
      .first<{ id: string; name: string; nickname: string | null; avatar_url: string | null; bio: string | null; teacher_profile_json: string | null }>();
    if (!row) return NextResponse.json({ error: 'ไม่พบผู้จัด' }, { status: 404 });

    const rounds = await db
      .prepare(
        `SELECT w.id, w.master_id, w.title, w.date, w.end_date, w.workshop_type, w.dates_json,
                w.time_start, w.time_end, w.image_url, w.price, w.max_participants, w.is_online, w.category,
                w.status, w.close_at, w.admission_type, w.announce_at, w.day_times_json,
                l.name AS loc_name, l.province AS loc_province,
                ${seatsHeldSubquery('w')} AS booked,
                (SELECT COALESCE(SUM(CASE WHEN b.booking_kind = 'private' THEN 1 ELSE 0 END), 0)
                   FROM bookings b WHERE b.workshop_id = w.id AND ${SEAT_TAKEN}) AS private_taken
           FROM workshops w
           LEFT JOIN locations l ON l.id = w.location_id
           LEFT JOIN workshop_masters m ON m.id = w.master_id
          WHERE w.status = 'active' AND w.date >= date('now') AND ${MINE}
          ORDER BY w.date ASC, w.time_start ASC`
      )
      .bind(id, id, id)
      .all();

    // Everything they have already run, for the works rail, the crafts and
    // the "rounds hosted" number. Newest first.
    const past = await db
      .prepare(
        `SELECT w.id, w.title, w.image_url, w.category
           FROM workshops w
           LEFT JOIN workshop_masters m ON m.id = w.master_id
          WHERE w.status = 'active' AND w.date < date('now') AND ${MINE}
          ORDER BY w.date DESC`
      )
      .bind(id, id, id)
      .all<WorkRow>();

    const joined = await db
      .prepare(
        `SELECT COALESCE(SUM(${seatsOfRowSql('b', 'w.max_participants')}), 0) AS n
           FROM bookings b
           JOIN workshops w ON w.id = b.workshop_id
           LEFT JOIN workshop_masters m ON m.id = w.master_id
          WHERE w.status = 'active' AND ${MINE}
            AND b.status != 'cancelled' AND (b.payment_status = 'paid' OR b.status = 'confirmed')`
      )
      .bind(id, id, id)
      .first<{ n: number }>();

    // A work is open while its round still takes bookings: registration not
    // closed (start, close_at, announce) and seats not gone.
    const open = ((rounds.results || []) as unknown as (Workshop & { booked: number; private_taken: number })[]).map(
      (w): WorkRow => ({
        id: w.id,
        title: w.title,
        image_url: w.image_url,
        category: w.category ?? null,
        open: getWorkshopStatusBadge(w).open && w.private_taken === 0 && w.booked < w.max_participants,
      }),
    );
    const pastRows = past.results || [];
    const craftCount = new Map<string, number>();
    [...open, ...pastRows].forEach((w) => w.category && craftCount.set(w.category, (craftCount.get(w.category) || 0) + 1));
    const seen = new Set<string>();
    const works = [...open, ...pastRows]
      .filter((w) => (seen.has(w.title) ? false : (seen.add(w.title), true)))
      .slice(0, 8)
      .map((w) => ({ id: w.id, title: w.title, image_url: w.image_url, open: !!w.open }));

    const me = await getCurrentUserWithRoles();
    const can_edit = !!me && (me.sub === id || me.roles.includes('admin'));

    const teacher: TeacherPublic = {
      id: row.id,
      name: row.name,
      nickname: row.nickname,
      avatar_url: row.avatar_url,
      bio: row.bio,
      crafts: [...craftCount.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c),
      profile: parseTeacherProfile(row.teacher_profile_json),
      hosted: pastRows.length,
      joined: Number(joined?.n) || 0,
      works,
    };
    // Visitors see a round's capacity and whether it is full, never how many
    // are booked — the counts stay on the server.
    const publicRounds = ((rounds.results || []) as (Record<string, unknown> & { booked: number; private_taken: number; max_participants: number })[]).map(
      ({ booked, private_taken, ...r }) => ({ ...r, full: private_taken > 0 || booked >= r.max_participants }),
    );
    return NextResponse.json({ teacher, rounds: publicRounds, can_edit });
  } catch (error) {
    console.error('Teacher profile error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 });
  }
}
