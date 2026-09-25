import { NextResponse } from 'next/server';
import { v4 as uuid } from 'uuid';
import { getDB } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { surveyFromRow, validateAnswers } from '@/lib/survey';

type SurveyRow = Parameters<typeof surveyFromRow>[0];
type WorkshopRow = { id: string; title: string; date: string; time_start: string; time_end: string; image_url: string | null };

/** Who may answer: a signed-in user with a live booking on this workshop that
 *  the teacher checked in as present on at least one day. */
async function attendedBooking(db: Awaited<ReturnType<typeof getDB>>, workshopId: string, userId: string) {
  return db
    .prepare(
      `SELECT id FROM bookings
        WHERE workshop_id = ? AND user_id = ? AND attended = 1 AND status != 'cancelled'
        ORDER BY created_at ASC LIMIT 1`,
    )
    .bind(workshopId, userId)
    .first<{ id: string }>();
}

/**
 * GET /api/surveys/[workshopId] — what the QR code opens. Always says which
 * workshop it is and where the visitor stands (signed in? checked in?
 * answered?); the questions only go to someone who may still answer.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ workshopId: string }> }) {
  const { workshopId } = await params;
  const db = await getDB();
  const [workshop, row] = await Promise.all([
    db.prepare('SELECT id, title, date, time_start, time_end, image_url FROM workshops WHERE id = ?').bind(workshopId).first<WorkshopRow>(),
    db.prepare('SELECT * FROM surveys WHERE workshop_id = ?').bind(workshopId).first<SurveyRow>(),
  ]);
  if (!workshop || !row) return NextResponse.json({ error: 'ไม่พบแบบสอบถามนี้' }, { status: 404 });
  const survey = surveyFromRow(row);

  const user = await getCurrentUser();
  const base = { workshop, title: survey.title, is_open: survey.is_open };
  if (!user) return NextResponse.json({ ...base, signedIn: false, eligible: false, answered: false });

  const [booking, answered] = await Promise.all([
    attendedBooking(db, workshopId, user.sub),
    db.prepare('SELECT id FROM survey_responses WHERE survey_id = ? AND user_id = ?').bind(survey.id, user.sub).first(),
  ]);
  const eligible = !!booking;
  const canAnswer = eligible && !answered && survey.is_open;
  return NextResponse.json({
    ...base,
    signedIn: true,
    eligible,
    answered: !!answered,
    intro: canAnswer ? survey.intro : null,
    questions: canAnswer ? survey.questions : [],
  });
}

/** POST /api/surveys/[workshopId] — submit once. Body: { answers, rating, comment }.
 *  The rating and comment also become (or replace) this user's review of the
 *  workshop, so they appear wherever reviews already do. */
export async function POST(request: Request, { params }: { params: Promise<{ workshopId: string }> }) {
  const { workshopId } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบก่อนตอบแบบสอบถาม' }, { status: 401 });

  const db = await getDB();
  const row = await db.prepare('SELECT * FROM surveys WHERE workshop_id = ?').bind(workshopId).first<SurveyRow>();
  if (!row) return NextResponse.json({ error: 'ไม่พบแบบสอบถามนี้' }, { status: 404 });
  const survey = surveyFromRow(row);
  if (!survey.is_open) return NextResponse.json({ error: 'แบบสอบถามนี้ปิดรับคำตอบแล้ว' }, { status: 403 });

  const booking = await attendedBooking(db, workshopId, user.sub);
  if (!booking) return NextResponse.json({ error: 'ตอบได้เฉพาะผู้ที่ถูกเช็คชื่อว่ามาเข้าร่วมกิจกรรมนี้' }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as { answers?: unknown; rating?: unknown; comment?: unknown };
  const { answers, error } = validateAnswers(survey.questions, body.answers);
  if (error) return NextResponse.json({ error }, { status: 400 });
  const rating = Math.round(Number(body.rating));
  if (!rating || rating < 1 || rating > 5) return NextResponse.json({ error: 'กรุณาให้คะแนน 1-5 ดาว' }, { status: 400 });
  const comment = typeof body.comment === 'string' ? body.comment.trim().slice(0, 2000) || null : null;

  try {
    await db.batch([
      // UNIQUE(survey_id, user_id) makes a second submit fail here, before the
      // review is touched (a batch runs as one transaction).
      db
        .prepare(
          `INSERT INTO survey_responses (id, survey_id, workshop_id, user_id, booking_id, answers_json, rating, comment)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(uuid(), survey.id, workshopId, user.sub, booking.id, JSON.stringify(answers), rating, comment),
      db
        .prepare(
          `INSERT INTO reviews (id, workshop_id, user_id, rating, comment)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(workshop_id, user_id)
           DO UPDATE SET rating = excluded.rating, comment = excluded.comment, updated_at = datetime('now')`,
        )
        .bind(uuid(), workshopId, user.sub, rating, comment),
    ]);
  } catch (e) {
    if (String(e).includes('UNIQUE')) return NextResponse.json({ error: 'คุณตอบแบบสอบถามนี้ไปแล้ว' }, { status: 409 });
    console.error('Survey submit error:', e);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 });
  }
  return NextResponse.json({ ok: true }, { status: 201 });
}
