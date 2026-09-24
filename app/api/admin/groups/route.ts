import { NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { applicantName } from '@/lib/applicant';

export type AdminGroupMember = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  status: string;
  attended: number | null;
  created_at: string;
};

export type AdminGroupRow = {
  id: string;
  workshop_id: string;
  workshop_title: string | null;
  workshop_date: string | null;
  time_start: string | null;
  time_end: string | null;
  tier_label: string | null;
  kind: string | null;
  group_size: number;
  amount: number | null;
  payment_status: string | null;
  status: string;
  created_at: string;
  booker: { name: string; phone: string | null; email: string | null };
  /** Friends who followed the invite link, oldest first. */
  members: AdminGroupMember[];
};

type Raw = {
  id: string;
  parent_booking_id: string | null;
  workshop_id: string;
  group_size: number | null;
  amount: number | null;
  payment_status: string | null;
  status: string;
  attended: number | null;
  booking_kind: string | null;
  booking_tier_label: string | null;
  application_json: string | null;
  created_at: string;
  user_name: string | null;
  user_email: string | null;
  user_phone: string | null;
  workshop_title: string | null;
  workshop_date: string | null;
  time_start: string | null;
  time_end: string | null;
};

const phoneOf = (json: string | null, fallback: string | null): string | null => {
  try {
    const p = (JSON.parse(json || 'null') as { profile?: { phone?: string } } | null)?.profile;
    return (p?.phone || '').trim() || fallback;
  } catch {
    return fallback;
  }
};

/**
 * GET /api/admin/groups — every group booking (one purchase for several
 * seats) with the friends who have joined it through the invite link.
 *
 * Admin only: it lists names and phone numbers across all workshops.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });
  if (user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const db = await getDB();
  // Group heads (group_size > 1, no parent) and every member row that points
  // at one, in one read.
  const res = await db
    .prepare(
      `SELECT b.id, b.parent_booking_id, b.workshop_id, b.group_size, b.amount, b.payment_status, b.status,
              b.attended, b.booking_kind, b.booking_tier_label, b.application_json, b.created_at,
              u.name AS user_name, u.email AS user_email, u.phone AS user_phone,
              w.title AS workshop_title, w.date AS workshop_date, w.time_start, w.time_end
         FROM bookings b
         LEFT JOIN users u ON u.id = b.user_id
         LEFT JOIN workshops w ON w.id = b.workshop_id
        WHERE (b.parent_booking_id IS NULL AND b.group_size > 1)
           OR b.parent_booking_id IS NOT NULL
        ORDER BY b.created_at ASC`,
    )
    .all<Raw>();

  const rows = res.results || [];
  const groups = new Map<string, AdminGroupRow>();
  for (const r of rows) {
    if (r.parent_booking_id) continue;
    groups.set(r.id, {
      id: r.id,
      workshop_id: r.workshop_id,
      workshop_title: r.workshop_title,
      workshop_date: r.workshop_date,
      time_start: r.time_start,
      time_end: r.time_end,
      tier_label: r.booking_tier_label,
      kind: r.booking_kind,
      group_size: r.group_size || 0,
      amount: r.amount,
      payment_status: r.payment_status,
      status: r.status,
      created_at: r.created_at,
      booker: { name: applicantName(r.application_json, r.user_name), phone: phoneOf(r.application_json, r.user_phone), email: r.user_email },
      members: [],
    });
  }
  for (const r of rows) {
    const g = r.parent_booking_id ? groups.get(r.parent_booking_id) : undefined;
    if (!g) continue;
    g.members.push({
      id: r.id,
      name: applicantName(r.application_json, r.user_name),
      phone: phoneOf(r.application_json, r.user_phone),
      email: r.user_email,
      status: r.status,
      attended: r.attended,
      created_at: r.created_at,
    });
  }

  // Newest purchase first.
  const list = [...groups.values()].sort((a, b) => b.created_at.localeCompare(a.created_at));
  return NextResponse.json({ groups: list });
}
