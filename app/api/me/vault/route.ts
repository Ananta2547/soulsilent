import { NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { hasIdentity, identityChanged, identityLockedUntil } from '@/lib/identity-lock';

/** GET /api/me/vault — the signed-in user's autofill vault (identity/health/emergency). */
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const db = await getDB();
    const row = await db
      .prepare('SELECT vault_json, identity_locked_at FROM users WHERE id = ?')
      .bind(user.sub)
      .first<{ vault_json: string | null; identity_locked_at: string | null }>();
    let vault: Record<string, string> | null = null;
    try {
      vault = row?.vault_json ? (JSON.parse(row.vault_json) as Record<string, string>) : null;
    } catch {
      vault = null;
    }
    // userId lets the client scope its localStorage cache per-account so one
    // user's vault can never bleed into another on a shared browser.
    // identityLockedUntil lets the settings form grey out the identity section
    // before the user types anything, rather than only failing on save.
    return NextResponse.json({
      vault,
      userId: user.sub,
      identityLockedUntil: identityLockedUntil(row?.identity_locked_at),
    });
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
    const next = body.vault && typeof body.vault === 'object' ? body.vault : null;
    const json = next ? JSON.stringify(next) : null;
    const db = await getDB();

    // Identity may change once every 30 days. The first fill (no name stored
    // yet) is onboarding and does not start the clock; the save after that
    // does. Health and emergency sections are never limited.
    const row = await db
      .prepare('SELECT vault_json, identity_locked_at FROM users WHERE id = ?')
      .bind(user.sub)
      .first<{ vault_json: string | null; identity_locked_at: string | null }>();
    let prev: Record<string, unknown> | null = null;
    try {
      prev = row?.vault_json ? (JSON.parse(row.vault_json) as Record<string, unknown>) : null;
    } catch {
      prev = null;
    }
    const touchesIdentity = identityChanged(prev, next);
    const lockedUntil = identityLockedUntil(row?.identity_locked_at);
    if (touchesIdentity && lockedUntil) {
      return NextResponse.json(
        { error: 'identity_locked', identityLockedUntil: lockedUntil },
        { status: 423 }
      );
    }
    const startsClock = touchesIdentity && hasIdentity(prev);

    if (startsClock) {
      await db
        .prepare("UPDATE users SET vault_json = ?, identity_locked_at = datetime('now') WHERE id = ?")
        .bind(json, user.sub)
        .run();
    } else {
      await db.prepare('UPDATE users SET vault_json = ? WHERE id = ?').bind(json, user.sub).run();
    }
    const after = await db
      .prepare('SELECT identity_locked_at FROM users WHERE id = ?')
      .bind(user.sub)
      .first<{ identity_locked_at: string | null }>();
    return NextResponse.json({ ok: true, identityLockedUntil: identityLockedUntil(after?.identity_locked_at) });
  } catch (error) {
    console.error('Save vault error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 });
  }
}
