/**
 * Server side of "ยืนยันข้อมูลเพื่อลงกิจกรรมเอง" (migration 081). Admin phones
 * the host, then approves: the host gets the self_publisher role and the
 * details are copied into host_payout_info (the "บัญชีผู้จัด" page).
 */
import { safeParseArray } from '@/lib/workshop-utils';
import { sendPushToUser, subscribedUsers } from '@/lib/push';
import type { VerifyData, VerifyField } from '@/lib/verification-labels';

export * from '@/lib/verification-labels';

type Env = Parameters<typeof sendPushToUser>[1];

/** Add or take away a role in roles_json, keeping the primary role in the list. */
export async function setExtraRole(db: D1Database, userId: string, role: string, on: boolean): Promise<void> {
  const u = await db.prepare('SELECT role, roles_json FROM users WHERE id = ?').bind(userId).first<{ role: string; roles_json: string | null }>();
  if (!u || u.role === 'admin') return;
  const roles = safeParseArray<string>(u.roles_json, []);
  const base = roles.length ? roles : [u.role];
  const next = on ? [...new Set([...base, role])] : base.filter((r) => r !== role);
  await db.prepare('UPDATE users SET roles_json = ? WHERE id = ?').bind(JSON.stringify(next), userId).run();
}

/** Copy an approved form into the host's payout and contact record. */
export async function copyToPayout(db: D1Database, userId: string, d: Partial<VerifyData>, adminId: string): Promise<void> {
  const v = (k: VerifyField) => (d[k] || '').trim() || null;
  await db
    .prepare(
      `INSERT INTO host_payout_info (user_id, full_name, nickname, phone, line_id, facebook, instagram, bank, account_no, account_name, promptpay, updated_by, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(user_id) DO UPDATE SET
         full_name = excluded.full_name, nickname = excluded.nickname, phone = excluded.phone, line_id = excluded.line_id,
         facebook = COALESCE(excluded.facebook, host_payout_info.facebook), instagram = COALESCE(excluded.instagram, host_payout_info.instagram),
         bank = excluded.bank, account_no = excluded.account_no, account_name = excluded.account_name,
         promptpay = COALESCE(excluded.promptpay, host_payout_info.promptpay),
         updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
    )
    .bind(userId, v('full_name'), v('nickname'), v('phone'), v('line_id'), v('facebook'), v('instagram'), v('bank'), v('account_no'), v('account_name'), v('promptpay'), adminId)
    .run();
}

/** LINE to every admin who linked LINE. */
export async function tellAdmins(
  db: D1Database,
  env: Env,
  m: { title: string; body: string; band: string; url: string; rows: { k: string; v: string }[]; cta: string },
): Promise<void> {
  try {
    const admins = ((await db.prepare("SELECT id FROM users WHERE role = 'admin' AND deleted_at IS NULL").all<{ id: string }>()).results || []).map((a) => a.id);
    const reach = await subscribedUsers(db, admins);
    for (const id of admins.filter((a) => reach.has(a))) {
      await sendPushToUser(
        db,
        env,
        id,
        {
          title: m.title,
          body: m.body,
          url: m.url,
          card: { topic: 'admin', band: { text: m.band, dot: '#f5c243' }, title: m.title, rows: m.rows, cta: { label: m.cta, url: m.url, dark: true } },
        },
        { kind: 'admin' },
      );
    }
  } catch (e) {
    console.error('[verification] tell admins', e);
  }
}

/** LINE to the host: what admin decided about their form. */
export async function tellHostVerified(db: D1Database, env: Env, hostId: string, action: 'approve' | 'changes' | 'reject', note: string): Promise<void> {
  try {
    const url = '/host/submissions';
    const head = action === 'approve' ? 'ยืนยันข้อมูลผ่านแล้ว — ลงกิจกรรมเองได้' : action === 'changes' ? 'ทีมงานขอให้แก้ข้อมูลยืนยันตัวตน' : 'ใบยืนยันข้อมูลไม่ผ่าน';
    const sub =
      action === 'approve'
        ? 'สร้างกิจกรรมเดี่ยวหรือกิจกรรมจองรอบได้ที่เมนู “สร้าง & ส่งกิจกรรม”'
        : action === 'changes'
          ? 'แก้ตามหมายเหตุแล้วส่งอีกครั้ง'
          : 'ดูเหตุผลจากทีมงานด้านล่าง';
    await sendPushToUser(
      db,
      env,
      hostId,
      {
        title: head,
        body: note || sub,
        url,
        card: {
          topic: action === 'approve' ? 'host' : action === 'changes' ? 'change' : 'cancel',
          topicLabel: action === 'approve' ? 'อนุมัติแล้ว' : action === 'changes' ? 'ขอให้แก้' : 'ไม่อนุมัติ',
          title: head,
          sub,
          quote: note || undefined,
          cta: { label: action === 'approve' ? 'สร้างกิจกรรม' : 'เปิดใบยืนยันข้อมูล', url, dark: action !== 'approve' },
        },
      },
      { kind: 'host' },
    );
  } catch (e) {
    console.error('[verification] tell host', e);
  }
}
