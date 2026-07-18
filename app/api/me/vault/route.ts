import { NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

/** GET /api/me/vault — the signed-in user's autofill vault (identity/health/emergency). */
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const db = await getDB();
    const row = await db
      .prepare('SELECT vault_json FROM users WHERE id = ?')
      .bind(user.sub)
      .first<{ vault_json: string | null }>();
    let vault: Record<string, string> | null = null;
    try {
      vault = row?.vault_json ? (JSON.parse(row.vault_json) as Record<string, string>) : null;
    } catch {
      vault = null;
    }
    // userId lets the client scope its localStorage cache per-account so one
    // user's vault can never bleed into another on a shared browser.
    return NextResponse.json({ vault, userId: user.sub });
  } catch (error) {
    console.error('Get vault error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 });
  }
}

/** PUT /api/me/vault — save the signed-in user's autofill vault. */
export async function PUT(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = (await request.json()) as { vault?: Record<string, unknown> };
    const json =
      body.vault && typeof body.vault === 'object' ? JSON.stringify(body.vault) : null;
    const db = await getDB();
    await db.prepare('UPDATE users SET vault_json = ? WHERE id = ?').bind(json, user.sub).run();
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Save vault error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 });
  }
}
