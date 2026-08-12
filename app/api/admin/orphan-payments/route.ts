import { NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';

interface OrphanRow {
  id: string;
  payment_intent: string | null;
  booking_id: string | null;
  amount: number;
  currency: string;
  email: string | null;
  reason: string;
  resolved: number;
  resolved_note: string | null;
  created_at: string;
}

/** List recorded orphan payments (money that reached Stripe but doesn't match an
 *  owed booking — late/duplicate PromptPay QR payments). ?all=1 includes resolved. */
export async function GET(request: Request) {
  try {
    await requireAdmin();
    const db = await getDB();
    const all = new URL(request.url).searchParams.get('all') === '1';
    const rows = await db
      .prepare(
        `SELECT id, payment_intent, booking_id, amount, currency, email, reason, resolved, resolved_note, created_at
         FROM orphan_payments
         ${all ? '' : 'WHERE resolved = 0'}
         ORDER BY created_at DESC LIMIT 200`
      )
      .all<OrphanRow>();
    const unresolved = await db
      .prepare('SELECT COUNT(*) AS n FROM orphan_payments WHERE resolved = 0')
      .first<{ n: number }>();
    return NextResponse.json({ items: rows.results, unresolved: unresolved?.n || 0 });
  } catch (error) {
    const msg = (error as Error).message;
    if (msg === 'Unauthorized' || msg === 'Forbidden') {
      return NextResponse.json({ error: msg }, { status: 403 });
    }
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 });
  }
}

/** Mark an orphan payment resolved (after refunding it in the Stripe Dashboard). */
export async function PATCH(request: Request) {
  try {
    await requireAdmin();
    const db = await getDB();
    const body = (await request.json()) as { id?: string; resolved?: boolean; note?: string };
    if (!body.id) {
      return NextResponse.json({ error: 'missing id' }, { status: 400 });
    }
    await db
      .prepare('UPDATE orphan_payments SET resolved = ?, resolved_note = ? WHERE id = ?')
      .bind(body.resolved === false ? 0 : 1, body.note ?? null, body.id)
      .run();
    return NextResponse.json({ ok: true });
  } catch (error) {
    const msg = (error as Error).message;
    if (msg === 'Unauthorized' || msg === 'Forbidden') {
      return NextResponse.json({ error: msg }, { status: 403 });
    }
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 });
  }
}
