import { NextResponse } from 'next/server';
import { getDB } from '@/lib/db';

/**
 * POST /api/app/ping  { m: 'install' | 'open' } — the installed app counting
 * itself (components/pwa/appStats.ts). Adds 1 to today's counter in
 * app_stats (migration 065). Anonymous and best-effort: no sign-in, nothing
 * about the person or device is stored, and it never fails the page.
 */
const METRICS = new Set(['install', 'open']);

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { m?: unknown };
  const metric = typeof body.m === 'string' ? body.m : '';
  if (!METRICS.has(metric)) return NextResponse.json({ error: 'bad metric' }, { status: 400 });
  try {
    const db = await getDB();
    await db
      .prepare(
        `INSERT INTO app_stats (day, metric, n) VALUES (date('now', '+7 hours'), ?, 1)
         ON CONFLICT(day, metric) DO UPDATE SET n = n + 1`,
      )
      .bind(metric)
      .run();
  } catch {
    // Migration 065 not applied here yet: nothing to count into.
  }
  return new NextResponse(null, { status: 204 });
}
