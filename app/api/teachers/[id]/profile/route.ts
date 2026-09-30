import { NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { getCurrentUserWithRoles } from '@/lib/auth';
import { roleSql } from '@/lib/roles';
import { isEmptyProfile, parseTeacherProfile } from '@/lib/teacher-profile';

/** PUT /api/teachers/[id]/profile — the teacher (or an admin) saves what
 *  they wrote on their public page. Whole-blob replace; the body is cleaned
 *  by parseTeacherProfile so nothing over-long or malformed is stored. */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const me = await getCurrentUserWithRoles();
    if (!me) return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });
    if (me.sub !== id && !me.roles.includes('admin')) {
      return NextResponse.json({ error: 'ไม่มีสิทธิ์แก้ไขหน้านี้' }, { status: 403 });
    }

    const db = await getDB();
    const target = await db
      .prepare(`SELECT u.id FROM users u WHERE u.id = ? AND ${roleSql('u', 'teacher')}`)
      .bind(id)
      .first<{ id: string }>();
    if (!target) return NextResponse.json({ error: 'ไม่พบผู้จัด' }, { status: 404 });

    const profile = parseTeacherProfile(await req.json().catch(() => null));
    await db
      .prepare('UPDATE users SET teacher_profile_json = ? WHERE id = ?')
      .bind(isEmptyProfile(profile) ? null : JSON.stringify(profile), id)
      .run();
    return NextResponse.json({ profile });
  } catch (error) {
    console.error('Save teacher profile error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 });
  }
}
