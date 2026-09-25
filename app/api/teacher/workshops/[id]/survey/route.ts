import { NextResponse } from 'next/server';
import { v4 as uuid } from 'uuid';
import { getDB } from '@/lib/db';
import { getCurrentUserWithRoles } from '@/lib/auth';
import { hasAnyRole } from '@/lib/roles';
import { canAccessTeacherDashboard } from '@/lib/workshop-utils';
import { parseAnswers, sanitizeQuestions, surveyFromRow, type SurveyResponse } from '@/lib/survey';
import type { Workshop } from '@/lib/types';

type SurveyRow = Parameters<typeof surveyFromRow>[0];

/** The workshop, if this teacher may run its dashboard; otherwise the error. */
async function load(id: string) {
  const u = await getCurrentUserWithRoles();
  if (!u) return { error: NextResponse.json({ error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 }) };
  if (!hasAnyRole(u.roles, ['teacher'])) return { error: NextResponse.json({ error: 'เฉพาะผู้สอน' }, { status: 403 }) };
  const db = await getDB();
  const workshop = await db.prepare('SELECT * FROM workshops WHERE id = ?').bind(id).first<Workshop>();
  if (!workshop) return { error: NextResponse.json({ error: 'ไม่พบเวิร์กชอป' }, { status: 404 }) };
  if (!u.roles.includes('admin') && !canAccessTeacherDashboard(workshop, u.sub)) {
    return { error: NextResponse.json({ error: 'ไม่มีสิทธิ์เข้าถึง' }, { status: 403 }) };
  }
  return { u, db, workshop };
}

/**
 * GET /api/teacher/workshops/[id]/survey — the AAR survey of this workshop
 * (null until the teacher saves one) with every answer so far.
 *
 * `template`: when a round has no survey yet, the newest survey of another
 * round of the same activity, so the teacher starts from the questions they
 * already wrote instead of an empty form.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await load(id);
  if ('error' in ctx) return ctx.error;
  const { db, workshop } = ctx;

  const row = await db.prepare('SELECT * FROM surveys WHERE workshop_id = ?').bind(id).first<SurveyRow>();
  let template = null;
  if (!row && workshop.master_id) {
    const t = await db
      .prepare(
        `SELECT s.* FROM surveys s JOIN workshops w ON w.id = s.workshop_id
          WHERE w.master_id = ? AND s.workshop_id != ?
          ORDER BY s.updated_at DESC LIMIT 1`,
      )
      .bind(workshop.master_id, id)
      .first<SurveyRow>();
    if (t) template = surveyFromRow(t);
  }

  const res = await db
    .prepare(
      `SELECT id, user_id, booking_id, answers_json, rating, comment, created_at
         FROM survey_responses WHERE workshop_id = ? ORDER BY created_at ASC`,
    )
    .bind(id)
    .all<Omit<SurveyResponse, 'answers'> & { answers_json: string }>();
  const responses: SurveyResponse[] = (res.results || []).map(({ answers_json, ...r }) => ({ ...r, answers: parseAnswers(answers_json) }));

  return NextResponse.json({
    workshop: { id: workshop.id, title: workshop.title, date: workshop.date, time_start: workshop.time_start, time_end: workshop.time_end },
    survey: row ? surveyFromRow(row) : null,
    template,
    responses,
  });
}

/** PUT /api/teacher/workshops/[id]/survey — create or replace the survey.
 *  Body: { title, intro, questions, is_open }. Answers already given keep
 *  their question ids, so rewording a question does not lose them. */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await load(id);
  if ('error' in ctx) return ctx.error;
  const { db, u } = ctx;

  const body = (await request.json().catch(() => ({}))) as { title?: unknown; intro?: unknown; questions?: unknown; is_open?: unknown };
  const { questions, error } = sanitizeQuestions(body.questions);
  if (error) return NextResponse.json({ error }, { status: 400 });
  const title = typeof body.title === 'string' ? body.title.trim().slice(0, 200) || null : null;
  const intro = typeof body.intro === 'string' ? body.intro.trim().slice(0, 2000) || null : null;
  const isOpen = body.is_open === false ? 0 : 1;

  await db
    .prepare(
      `INSERT INTO surveys (id, workshop_id, title, intro, questions_json, is_open, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(workshop_id) DO UPDATE SET
         title = excluded.title, intro = excluded.intro, questions_json = excluded.questions_json,
         is_open = excluded.is_open, updated_at = datetime('now')`,
    )
    .bind(uuid(), id, title, intro, JSON.stringify(questions), isOpen, u.sub)
    .run();

  const row = await db.prepare('SELECT * FROM surveys WHERE workshop_id = ?').bind(id).first<SurveyRow>();
  return NextResponse.json({ survey: row ? surveyFromRow(row) : null });
}
