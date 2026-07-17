import { NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';
import type { ApplicationQuestion } from '@/lib/types';

// PUT /api/workshops/[id]/application — admin saves the pre-booking questions.
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const { id } = await params;
    const body = (await request.json()) as { questions?: ApplicationQuestion[] };
    const questions = Array.isArray(body.questions) ? body.questions : [];

    const db = await getDB();
    await db
      .prepare("UPDATE workshops SET application_form = ?, updated_at = datetime('now') WHERE id = ?")
      .bind(JSON.stringify(questions), id)
      .run();

    return NextResponse.json({ success: true });
  } catch (error) {
    const err = error as Error;
    if (err.message === 'Unauthorized' || err.message === 'Forbidden') {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 });
  }
}
