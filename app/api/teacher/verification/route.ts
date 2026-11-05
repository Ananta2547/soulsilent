import { NextResponse } from 'next/server';
import { getDB, getEnv } from '@/lib/db';
import { requireRoles } from '@/lib/auth';
import { hasAnyRole } from '@/lib/roles';
import { routeError } from '@/lib/submissions';
import { cleanVerify, tellAdmins, VERIFY_LABEL, type VerificationRow, type VerifyData } from '@/lib/host-verification';

/**
 * GET /api/teacher/verification — may this host publish on their own, their
 * "ยืนยันข้อมูลเพื่อลงกิจกรรมเอง" form if any, and what to prefill a new one with
 * (their profile and the payout record admin keeps).
 */
export async function GET() {
  try {
    const me = await requireRoles('teacher', 'session_host');
    const db = await getDB();
    const row = await db.prepare('SELECT * FROM host_verifications WHERE user_id = ?').bind(me.sub).first<VerificationRow>();
    let prefill: Partial<VerifyData> = {};
    if (!row) {
      const u = await db
        .prepare(
          `SELECT u.name, u.nickname, u.email, u.phone, u.vault_json, p.full_name, p.nickname AS p_nick, p.phone AS p_phone, p.line_id, p.facebook, p.instagram,
                  p.bank, p.account_no, p.account_name, p.promptpay
             FROM users u LEFT JOIN host_payout_info p ON p.user_id = u.id WHERE u.id = ?`,
        )
        .bind(me.sub)
        .first<Record<string, string | null>>();
      let v: Record<string, string> = {};
      try {
        v = (JSON.parse(u?.vault_json || 'null') as Record<string, string>) || {};
      } catch {}
      const pick = (...xs: (string | null | undefined)[]) => xs.find((x) => x && x.trim())?.trim() || '';
      prefill = {
        full_name: pick(u?.full_name, [v.firstName, v.lastName].filter(Boolean).join(' ')),
        nickname: pick(u?.p_nick, v.nickname, u?.nickname),
        phone: pick(u?.p_phone, v.phone, u?.phone),
        email: pick(u?.email),
        line_id: pick(u?.line_id),
        facebook: pick(u?.facebook),
        instagram: pick(u?.instagram),
        bank: pick(u?.bank),
        account_no: pick(u?.account_no),
        account_name: pick(u?.account_name),
        promptpay: pick(u?.promptpay),
      };
    }
    return NextResponse.json({ canPublish: hasAnyRole(me.roles, ['self_publisher']), verification: row || null, prefill });
  } catch (e) {
    return routeError(e, 'Get verification');
  }
}

/** POST /api/teacher/verification { ...fields } — send (or resend) the form to admin. */
export async function POST(request: Request) {
  try {
    const me = await requireRoles('teacher', 'session_host');
    if (hasAnyRole(me.roles, ['self_publisher'])) return NextResponse.json({ error: 'บัญชีนี้ลงกิจกรรมเองได้อยู่แล้ว' }, { status: 400 });
    const { data, missing } = cleanVerify(await request.json());
    if (missing) return NextResponse.json({ error: `กรุณากรอก${VERIFY_LABEL[missing]}` }, { status: 400 });
    const db = await getDB();
    const was = await db.prepare('SELECT status FROM host_verifications WHERE user_id = ?').bind(me.sub).first<{ status: string }>();
    if (was?.status === 'rejected') return NextResponse.json({ error: 'ใบยืนยันข้อมูลไม่ผ่าน — ติดต่อทีมงาน' }, { status: 400 });

    await db
      .prepare(
        `INSERT INTO host_verifications (user_id, full_name, nickname, phone, email, line_id, page_url, facebook, instagram, bank, account_no, account_name, promptpay, about, status, review_note, submitted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', NULL, datetime('now'))
         ON CONFLICT(user_id) DO UPDATE SET
           full_name = excluded.full_name, nickname = excluded.nickname, phone = excluded.phone, email = excluded.email, line_id = excluded.line_id,
           page_url = excluded.page_url, facebook = excluded.facebook, instagram = excluded.instagram, bank = excluded.bank,
           account_no = excluded.account_no, account_name = excluded.account_name, promptpay = excluded.promptpay, about = excluded.about,
           status = 'pending', submitted_at = excluded.submitted_at`,
      )
      .bind(me.sub, data.full_name, data.nickname, data.phone, data.email, data.line_id, data.page_url, data.facebook, data.instagram, data.bank, data.account_no, data.account_name, data.promptpay, data.about)
      .run();

    // Only a fresh send is news; editing a form that already waits is not.
    if (was?.status !== 'pending') {
      const url = `/admin/submissions?focus=${encodeURIComponent(`ver:${me.sub}`)}`;
      const env = (await getEnv()) as unknown as Parameters<typeof tellAdmins>[1];
      await tellAdmins(db, env, {
        title: `ผู้จัดขอยืนยันข้อมูล: ${data.nickname || data.full_name}`,
        body: `${data.full_name} · ${data.phone}`,
        band: 'ADMIN · ยืนยันผู้จัด',
        url,
        rows: [
          { k: 'ชื่อ', v: `${data.full_name} (${data.nickname})` },
          { k: 'โทร', v: data.phone },
          { k: 'เพจ', v: data.page_url },
        ],
        cta: 'ตรวจใบยืนยัน',
      });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return routeError(e, 'Send verification');
  }
}
