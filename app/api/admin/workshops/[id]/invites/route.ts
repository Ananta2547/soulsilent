import { NextResponse } from 'next/server';
import { v4 as uuid } from 'uuid';
import { getDB, getEnv } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';
import { claimUrl, newTransferToken } from '@/lib/transfers';
import { getEffectivePrice, hasWorkshopStarted } from '@/lib/workshop-utils';
import { seatsHeldSubquery } from '@/lib/seats';
import { MAX_SPECIAL_PRICE, isCompKind, type CompKind } from '@/lib/comp';
import type { Workshop } from '@/lib/types';

/**
 * /api/admin/workshops/{id}/invites — free-seat invitations (บัตรเชิญ).
 *
 * Each invitation is one ฿0 booking held by the issuing admin plus one
 * ticket_transfers row (kind 'invite') whose token is the QR. Whoever scans it
 * and signs in claims the seat through /claim/{token}, exactly like a gift.
 * The seat is taken from the round the moment it is issued.
 */

export type InviteRow = {
  booking_id: string;
  token: string;
  url: string;
  status: 'pending' | 'claimed' | 'cancelled';
  comp_kind: CompKind;
  host_credit: number;
  created_at: string;
  claimed_at: string | null;
  issued_by: string | null;
  to_name: string | null;
};

function fail(error: unknown) {
  const msg = (error as Error).message;
  if (msg === 'Unauthorized') return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });
  if (msg === 'Forbidden') return NextResponse.json({ error: 'เฉพาะผู้ดูแลระบบ' }, { status: 403 });
  console.error('Invites error:', error);
  return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 });
}

async function siteUrl(): Promise<string> {
  const env = await getEnv();
  return env.SITE_URL || 'http://localhost:3000';
}

/** GET — every invitation of this round, newest first. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const { id } = await params;
    const db = await getDB();
    const site = await siteUrl();
    const res = await db
      .prepare(
        `SELECT t.booking_id, t.token, t.status, t.created_at, t.claimed_at, t.from_name AS issued_by, t.to_name,
                b.comp_kind, b.host_credit
           FROM ticket_transfers t
           JOIN bookings b ON b.id = t.booking_id
          WHERE t.workshop_id = ? AND t.kind = 'invite'
          ORDER BY t.created_at DESC`,
      )
      .bind(id)
      .all<Omit<InviteRow, 'url'>>();
    const invites: InviteRow[] = (res.results || []).map((r) => ({ ...r, host_credit: Number(r.host_credit) || 0, url: claimUrl(site, r.token) }));
    return NextResponse.json({ invites });
  } catch (error) {
    return fail(error);
  }
}

/** POST { comp_kind, special_price? } — issue one invitation (one seat). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin();
    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as { comp_kind?: unknown; special_price?: unknown };
    if (!isCompKind(body.comp_kind)) return NextResponse.json({ error: 'เลือกประเภทที่นั่งฟรี' }, { status: 400 });
    const kind = body.comp_kind;

    const db = await getDB();
    const workshop = await db
      .prepare(`SELECT w.*, ${seatsHeldSubquery('w')} AS held FROM workshops w WHERE w.id = ?`)
      .bind(id)
      .first<Workshop & { held: number }>();
    if (!workshop) return NextResponse.json({ error: 'ไม่พบกิจกรรม' }, { status: 404 });
    if (workshop.status !== 'active') return NextResponse.json({ error: 'กิจกรรมนี้ไม่ได้เปิดอยู่' }, { status: 400 });
    if (hasWorkshopStarted(workshop)) return NextResponse.json({ error: 'กิจกรรมเริ่มแล้ว ออกบัตรเชิญไม่ได้' }, { status: 400 });
    if ((Number(workshop.held) || 0) >= workshop.max_participants) {
      return NextResponse.json({ error: 'ที่นั่งเต็มแล้ว ออกบัตรเชิญไม่ได้' }, { status: 400 });
    }

    // What AllSoulLearn owes the host for this seat.
    let credit = 0;
    if (kind === 'asl') {
      credit = Math.round(getEffectivePrice(workshop).price || 0);
    } else if (kind === 'special') {
      const p = Number(body.special_price);
      if (!Number.isFinite(p) || p <= 0 || p > MAX_SPECIAL_PRICE) {
        return NextResponse.json({ error: 'กรอกราคาพิเศษเป็นจำนวนเงินที่มากกว่า 0' }, { status: 400 });
      }
      credit = Math.round(p);
    }

    const account = await db
      .prepare('SELECT name, nickname FROM users WHERE id = ?')
      .bind(admin.sub)
      .first<{ name: string | null; nickname: string | null }>();
    const issuer = (account?.nickname || '').trim() || (account?.name || '').trim() || 'AllSoulLearn';

    const bookingId = uuid();
    const token = newTransferToken();
    // Held in the admin's name, confirmed and ฿0 — the seat is taken now and
    // the receiver inherits it on claim.
    await db.batch([
      db
        .prepare(
          `INSERT INTO bookings (id, workshop_id, user_id, status, payment_status, amount, app_status, confirmed_at, comp_kind, host_credit)
           VALUES (?, ?, ?, 'confirmed', 'paid', 0, 'approved', datetime('now'), ?, ?)`,
        )
        .bind(bookingId, id, admin.sub, kind, credit),
      db
        .prepare(
          `INSERT INTO ticket_transfers (id, booking_id, workshop_id, kind, token, status, from_user_id, from_name)
           VALUES (?, ?, ?, 'invite', ?, 'pending', ?, ?)`,
        )
        .bind(uuid(), bookingId, id, token, admin.sub, issuer),
    ]);

    const invite: InviteRow = {
      booking_id: bookingId,
      token,
      url: claimUrl(await siteUrl(), token),
      status: 'pending',
      comp_kind: kind,
      host_credit: credit,
      created_at: new Date().toISOString(),
      claimed_at: null,
      issued_by: issuer,
      to_name: null,
    };
    return NextResponse.json({ invite });
  } catch (error) {
    return fail(error);
  }
}

/** DELETE ?token= — withdraw an unclaimed invitation; its seat goes back on sale. */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const { id } = await params;
    const token = new URL(req.url).searchParams.get('token') || '';
    const db = await getDB();
    const tr = await db
      .prepare(`SELECT booking_id, status FROM ticket_transfers WHERE token = ? AND workshop_id = ? AND kind = 'invite'`)
      .bind(token, id)
      .first<{ booking_id: string; status: string }>();
    if (!tr) return NextResponse.json({ error: 'ไม่พบบัตรเชิญ' }, { status: 404 });
    if (tr.status !== 'pending') return NextResponse.json({ error: 'บัตรเชิญนี้ถูกรับไปแล้วหรือยกเลิกแล้ว' }, { status: 400 });
    await db.batch([
      db.prepare(`UPDATE ticket_transfers SET status = 'cancelled' WHERE token = ? AND status = 'pending'`).bind(token),
      // The held seat leaves the rosters too: they list paid-or-confirmed rows
      // (a paid seat stays after cancelling so refunds can be attached), and
      // this one never took money — 'expired' is what lapsed holds use.
      // host_credit goes to 0 so it can never reach the host's revenue.
      db.prepare(`UPDATE bookings SET status = 'cancelled', payment_status = 'expired', cancel_reason = 'invite_withdrawn', host_credit = 0 WHERE id = ?`).bind(tr.booking_id),
    ]);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}
