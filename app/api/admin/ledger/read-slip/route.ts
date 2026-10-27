import { NextResponse } from 'next/server';
import { getEnv } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';
import { getFromR2 } from '@/lib/r2';
import { readSlipWithGemini } from '@/lib/slip-reader';

/** The R2 key behind a /api/media/… link, if it is a ledger slip. */
function slipKey(url: string): string | null {
  const m = /\/api\/media\/(images\/ledger\/[^?#]+)/.exec(url);
  return m ? decodeURIComponent(m[1]) : null;
}

/** POST /api/admin/ledger/read-slip — { url, original_url? } of a slip just
 *  uploaded to the ledger folder → the fields Gemini reads off it. The
 *  untouched original is read when there is one (the crop may cut text). */
export async function POST(request: Request) {
  try {
    await requireAdmin();
    const env = (await getEnv()) as { GEMINI_API_KEY?: string; GEMINI_MODEL?: string };
    if (!env.GEMINI_API_KEY) return NextResponse.json({ error: 'ยังไม่ได้ตั้ง GEMINI_API_KEY — กรอกเองไปก่อน' }, { status: 503 });
    const body = (await request.json()) as { url?: string; original_url?: string };
    const key = slipKey(body.original_url || '') || slipKey(body.url || '');
    if (!key) return NextResponse.json({ error: 'ไม่พบรูปสลิป' }, { status: 400 });
    const obj = await getFromR2(key);
    if (!obj) return NextResponse.json({ error: 'ไม่พบรูปสลิป' }, { status: 404 });
    const bytes = await obj.arrayBuffer();
    if (bytes.byteLength > 8 * 1024 * 1024) return NextResponse.json({ error: 'รูปใหญ่เกินไป' }, { status: 413 });
    const mime = obj.httpMetadata?.contentType || 'image/jpeg';
    const fields = await readSlipWithGemini({ bytes, mime }, env.GEMINI_API_KEY, env.GEMINI_MODEL || undefined);
    return NextResponse.json({ fields });
  } catch (error) {
    const msg = (error as Error).message;
    if (msg === 'Unauthorized' || msg === 'Forbidden') return NextResponse.json({ error: msg }, { status: 403 });
    console.error('[ledger] read-slip', error);
    if ((error as Error).name === 'TimeoutError') return NextResponse.json({ error: 'Gemini ตอบช้าเกินไป — ลองแนบใหม่อีกครั้ง' }, { status: 504 });
    return NextResponse.json({ error: msg || 'อ่านสลิปไม่สำเร็จ' }, { status: 502 });
  }
}
