import { NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { getCurrentUserWithRoles } from '@/lib/auth';
import { hasAnyRole } from '@/lib/roles';
import { parseAnswers, parseQuestions, sanitizeQuestions } from '@/lib/survey';
import { ensureRoundSurvey, parseMasterSurvey } from '@/lib/round-rules';

/** The round activity, if this host (or admin) runs it; otherwise the error. */
async function load(id: string) {
  const u = await getCurrentUserWithRoles();
  if (!u) return { error: NextResponse.json({ error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 }) };
  if (!hasAnyRole(u.roles, ['session_host'])) return { error: NextResponse.json({ error: 'เฉพาะผู้จัดรอบ (session_host)' }, { status: 403 }) };
  const db = await getDB();
  const m = await db
    .prepare('SELECT id, title, organizer, kind, survey_json FROM workshop_masters WHERE id = ?')
    .bind(id)
    .first<{ id: string; title: string; organizer: string | null; kind: string; survey_json: string | null }>();
  if (!m || m.kind === 'single') return { error: NextResponse.json({ error: 'ไม่พบกิจกรรม' }, { status: 404 }) };
  if (!u.roles.includes('admin') && m.organizer !== u.sub) return { error: NextResponse.json({ error: 'คุณไม่ได้เป็นผู้จัดของกิจกรรมนี้' }, { status: 403 }) };
  return { u, db, m };
}

/** Checked in on any day — as the survey and the roster count it. */
const PRESENT = "(b.attended = 1 OR instr(COALESCE(b.attendance_json, ''), ':1') > 0)";

/**
 * GET /api/teacher/masters/[id]/survey — the AAR of a round activity: the
 * survey every round uses (or, before there is one, the newest a round wrote,
 * as a starting point), each round with how many came and answered, every
 * answer, and reviews written outside the survey.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await load(id);
  if ('error' in ctx) return ctx.error;
  const { db, m } = ctx;

  const survey = parseMasterSurvey(m.survey_json);
  let template = null;
  if (!survey) {
    const t = await db
      .prepare(
        `SELECT s.title, s.intro, s.questions_json FROM surveys s JOIN workshops w ON w.id = s.workshop_id
          WHERE w.master_id = ? ORDER BY s.updated_at DESC LIMIT 1`,
      )
      .bind(id)
      .first<{ title: string | null; intro: string | null; questions_json: string }>();
    if (t) template = { title: t.title, intro: t.intro, questions: parseQuestions(t.questions_json) };
  }

  const [rounds, responses, reviews] = await Promise.all([
    db
      .prepare(
        `SELECT w.id, w.date, w.time_start, w.time_end, w.status, s.is_open AS survey_open,
                (SELECT COUNT(*) FROM bookings b WHERE b.workshop_id = w.id AND b.status != 'cancelled' AND ${PRESENT}) AS present,
                (SELECT COUNT(*) FROM survey_responses r WHERE r.workshop_id = w.id) AS answered
           FROM workshops w LEFT JOIN surveys s ON s.workshop_id = w.id
          WHERE w.master_id = ? AND w.status != 'cancelled'
          ORDER BY w.date DESC, w.time_start DESC`,
      )
      .bind(id)
      .all<{ id: string; date: string; time_start: string; time_end: string; status: string; survey_open: number | null; present: number; answered: number }>(),
    db
      .prepare(
        `SELECT r.id, r.workshop_id, r.answers_json, r.rating, r.comment, r.created_at, COALESCE(u.name, 'ผู้เข้าร่วม') AS user_name, s.questions_json
           FROM survey_responses r JOIN workshops w ON w.id = r.workshop_id
           JOIN surveys s ON s.id = r.survey_id LEFT JOIN users u ON u.id = r.user_id
          WHERE w.master_id = ?
          ORDER BY r.created_at DESC`,
      )
      .bind(id)
      .all<{ id: string; workshop_id: string; answers_json: string; rating: number; comment: string | null; created_at: string; user_name: string; questions_json: string }>(),
    db
      .prepare(
        `SELECT rv.id, rv.workshop_id, rv.rating, rv.comment, rv.created_at, COALESCE(u.name, 'ผู้เข้าร่วม') AS user_name
           FROM reviews rv JOIN workshops w ON w.id = rv.workshop_id LEFT JOIN users u ON u.id = rv.user_id
          WHERE w.master_id = ?
            AND NOT EXISTS (SELECT 1 FROM survey_responses r WHERE r.workshop_id = rv.workshop_id AND r.user_id = rv.user_id)
          ORDER BY rv.created_at DESC`,
      )
      .bind(id)
      .all<{ id: string; workshop_id: string; rating: number; comment: string | null; created_at: string; user_name: string }>(),
  ]);

  return NextResponse.json({
    master: { id: m.id, title: m.title },
    survey,
    template,
    rounds: rounds.results || [],
    // Each answer carries the questions of its round's survey, so a round
    // that was asked something else still reads right.
    responses: (responses.results || []).map(({ answers_json, questions_json, ...r }) => ({
      ...r,
      answers: parseAnswers(answers_json),
      questions: parseQuestions(questions_json),
    })),
    reviews: reviews.results || [],
  });
}

/** PUT /api/teacher/masters/[id]/survey { title, intro, questions } — the
 *  survey every round of the activity uses. Rounds that already have one get
 *  the new questions (answers keep their question ids, and each round keeps
 *  its own open/closed switch); rounds from today on that have none get it
 *  now, and rounds opened later get it when they are opened. */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await load(id);
  if ('error' in ctx) return ctx.error;
  const { db, m } = ctx;

  const body = (await request.json().catch(() => ({}))) as { title?: unknown; intro?: unknown; questions?: unknown };
  const { questions, error } = sanitizeQuestions(body.questions);
  if (error) return NextResponse.json({ error }, { status: 400 });
  const title = typeof body.title === 'string' ? body.title.trim().slice(0, 200) || null : null;
  const intro = typeof body.intro === 'string' ? body.intro.trim().slice(0, 2000) || null : null;
  const json = JSON.stringify({ title, intro, questions });

  const [, updated] = await db.batch([
    db.prepare("UPDATE workshop_masters SET survey_json = ?, updated_at = datetime('now') WHERE id = ?").bind(json, id),
    db
      .prepare(
        `UPDATE surveys SET title = ?, intro = ?, questions_json = ?, updated_at = datetime('now')
          WHERE workshop_id IN (SELECT id FROM workshops WHERE master_id = ? AND status != 'cancelled')`,
      )
      .bind(title, intro, JSON.stringify(questions), id),
  ]);
  const fresh = await db
    .prepare(
      `SELECT w.id FROM workshops w WHERE w.master_id = ? AND w.status != 'cancelled' AND w.date >= date('now', '+7 hours')
          AND NOT EXISTS (SELECT 1 FROM surveys s WHERE s.workshop_id = w.id)`,
    )
    .bind(id)
    .all<{ id: string }>();
  for (const r of fresh.results || []) await ensureRoundSurvey(db, r.id, json, m.organizer);

  return NextResponse.json({ survey: { title, intro, questions }, updated: updated.meta.changes || 0, created: (fresh.results || []).length });
}
