import { NextResponse } from 'next/server';
import { getDB, getEnv } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { lineIdOf, lineMessagingReady, type LineEnv } from '@/lib/line';
import { flexCard } from '@/lib/line-flex';
import { LINE_SAMPLES } from '@/lib/line-flex-samples';

/**
 * Every LINE card with example details (lib/line-flex-samples), admin only.
 *   GET   LINE checks each card (validate endpoint — nothing is sent)
 *   POST  sends them all to the signed-in admin's own linked LINE
 */
async function setup() {
  const user = await getCurrentUser();
  if (!user) return { error: NextResponse.json({ error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 }) };
  if (user.role !== 'admin') return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  const env = (await getEnv()) as LineEnv;
  if (!lineMessagingReady(env)) return { error: NextResponse.json({ error: 'ยังไม่ได้ตั้งค่า LINE' }, { status: 400 }) };
  const site = env.SITE_URL || 'https://allsoullearn.com';
  const messages = LINE_SAMPLES.map((s) => ({ name: s.name, message: flexCard(s.card, site, `${s.name} · ${s.card.title}`) }));
  return { user, env, messages };
}

const call = (env: LineEnv, path: string, body: unknown) =>
  fetch(`https://api.line.me/v2/bot/message/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${(env.LINE_CHANNEL_ACCESS_TOKEN || '').trim()}` },
    body: JSON.stringify(body),
  });

export async function GET() {
  const s = await setup();
  if ('error' in s) return s.error;
  const results = [];
  for (const m of s.messages) {
    const r = await call(s.env, 'validate/push', { messages: [m.message] });
    results.push({ name: m.name, ok: r.ok, detail: r.ok ? null : (await r.text().catch(() => '')).slice(0, 600) });
  }
  return NextResponse.json({ total: results.length, bad: results.filter((r) => !r.ok).length, results });
}

export async function POST() {
  const s = await setup();
  if ('error' in s) return s.error;
  const to = await lineIdOf(await getDB(), s.user.sub);
  if (!to) return NextResponse.json({ error: 'บัญชีนี้ยังไม่ได้เชื่อม LINE (หรือยังไม่ได้เพิ่มเพื่อน)' }, { status: 400 });
  // A push takes up to 5 messages.
  let sent = 0;
  for (let i = 0; i < s.messages.length; i += 5) {
    const r = await call(s.env, 'push', { to, messages: s.messages.slice(i, i + 5).map((m) => m.message) });
    if (!r.ok) return NextResponse.json({ error: `ส่งไม่สำเร็จที่ชุด ${i / 5 + 1}: ${(await r.text().catch(() => '')).slice(0, 300)}`, sent }, { status: 502 });
    sent += Math.min(5, s.messages.length - i);
  }
  return NextResponse.json({ sent });
}
