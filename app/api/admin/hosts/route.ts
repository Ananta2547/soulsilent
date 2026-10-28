import { NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';
import { ownRoleSql } from '@/lib/roles';
import { PAYOUT_FIELDS, type HostPayoutInfo, type ProfileDefaults } from '@/lib/host-payout';

export type HostAccountRow = {
  id: string;
  name: string | null;
  email: string;
  account_status: string | null;
  /** Saved by admin (null = nothing saved yet). */
  info: HostPayoutInfo | null;
  /** From the host's own profile, shown where admin left a field empty. */
  profile: ProfileDefaults;
};

type Row = { id: string; name: string | null; nickname: string | null; email: string; account_status: string | null; phone: string | null; vault_json: string | null; has_info: number | null; updated_by_name: string | null } & Partial<HostPayoutInfo>;

/** GET /api/admin/hosts — every host (host or round-host role) with where admin
 *  pays them and how to reach them. Admin only: account numbers and contacts
 *  never leave this route for anyone else. */
export async function GET() {
  try {
    await requireAdmin();
    const db = await getDB();
    const rows =
      (
        await db
          .prepare(
            `SELECT u.id, u.name, u.nickname, u.email, u.account_status, u.phone, u.vault_json,
                    CASE WHEN p.user_id IS NULL THEN 0 ELSE 1 END AS has_info,
                    ${PAYOUT_FIELDS.map((f) => `p.${f}`).join(', ')}, p.updated_at, ub.name AS updated_by_name
               FROM users u
               LEFT JOIN host_payout_info p ON p.user_id = u.id
               LEFT JOIN users ub ON ub.id = p.updated_by
              WHERE u.deleted_at IS NULL AND (${ownRoleSql('u', 'teacher')} OR ${ownRoleSql('u', 'session_host')})
              ORDER BY u.name COLLATE NOCASE`,
          )
          .all<Row>()
      ).results || [];

    const hosts: HostAccountRow[] = rows.map((r) => {
      let v: Record<string, string> = {};
      try {
        v = (JSON.parse(r.vault_json || 'null') as Record<string, string>) || {};
      } catch {}
      const full = [v.firstName, v.lastName].filter((x) => x && x.trim()).join(' ');
      return {
        id: r.id,
        name: r.name,
        email: r.email,
        account_status: r.account_status,
        info: r.has_info
          ? (Object.fromEntries([...PAYOUT_FIELDS, 'updated_at', 'updated_by_name'].map((f) => [f, (r as Record<string, unknown>)[f] ?? null])) as HostPayoutInfo)
          : null,
        profile: {
          full_name: full || null,
          nickname: v.nickname || r.nickname || null,
          phone: v.phone || r.phone || null,
          line_id: v.lineId || null,
        },
      };
    });
    return NextResponse.json({ hosts });
  } catch (error) {
    const msg = (error as Error).message;
    if (msg === 'Unauthorized' || msg === 'Forbidden') return NextResponse.json({ error: msg }, { status: 403 });
    console.error('[admin/hosts]', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 });
  }
}
