import { NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { getCurrentUserWithRoles } from '@/lib/auth';
import { hasAnyRole } from '@/lib/roles';
import { cleanQuestions, saveMasterApplication } from '@/lib/application-form';

/** PUT /api/teacher/masters/[id]/application { questions, require_consent }
 *  — the host of a round activity (or admin) writes its application form and
 *  turns the PDPA consent on or off. Saved on the activity and pushed to every
 *  round that has not started; answers already given stay as they are. */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await getCurrentUserWithRoles();
  if (!u) return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });
  if (!hasAnyRole(u.roles, ['session_host'])) return NextResponse.json({ error: 'เฉพาะผู้จัดรอบ (session_host)' }, { status: 403 });
  const { id } = await params;
  const db = await getDB();
  const m = await db.prepare('SELECT id, organizer, kind FROM workshop_masters WHERE id = ?').bind(id).first<{ id: string; organizer: string | null; kind: string }>();
  if (!m) return NextResponse.json({ error: 'ไม่พบกิจกรรม' }, { status: 404 });
  if (!u.roles.includes('admin') && m.organizer !== u.sub) return NextResponse.json({ error: 'คุณไม่ได้เป็นผู้จัดของกิจกรรมนี้' }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as { questions?: unknown; require_consent?: boolean };
  const cleaned = cleanQuestions(body.questions);
  if ('error' in cleaned) return NextResponse.json({ error: cleaned.error }, { status: 400 });
  const rounds = await saveMasterApplication(db, id, cleaned.questions, !!body.require_consent);
  return NextResponse.json({ ok: true, questions: cleaned.questions, require_consent: !!body.require_consent, rounds });
}
