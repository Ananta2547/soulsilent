import { NextResponse } from 'next/server';
import { getDB, getEnv } from '@/lib/db';
import { seatsOfRowSql } from '@/lib/seats';
import { computePayout } from '@/lib/workshop-utils';

/**
 * Read-only finance export for external tooling (the accounting app).
 *
 *   GET /api/export/finance?type=bookings|workshops|summary|orphans
 *       header: x-export-key: <FINANCE_EXPORT_KEY>
 *
 * Query:
 *   from, to   YYYY-MM-DD (inclusive). bookings/summary filter on the booking's
 *              created_at; workshops filter on the event date.
 *   format     json (default) | csv
 *   limit      page size, default 500, max 2000 (bookings only)
 *   cursor     opaque, from the previous page's `next_cursor` (bookings only)
 *
 * No personal data leaves through here: customers appear only as a stable
 * SHA-256 pseudonym of their user id, so repeat buyers can be counted without
 * anyone being identifiable. See docs/finance-api.md for the field reference.
 */

type Type = 'bookings' | 'workshops' | 'summary' | 'orphans';
const TYPES: Type[] = ['bookings', 'workshops', 'summary', 'orphans'];

/** Money that actually stayed with us: paid or admin-confirmed, not cancelled,
 *  not refunded. A booking cancelled with `cancel_reason='refunded'` is the
 *  manual full-refund path (slip attached); the webhook path sets
 *  payment_status='refunded'. */
const COLLECTED = `(b.status != 'cancelled' AND b.payment_status != 'refunded'
  AND (b.payment_status = 'paid' OR b.status = 'confirmed'))`;
const REFUNDED = `(b.payment_status = 'refunded' OR b.cancel_reason = 'refunded')`;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function bad(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status });
}

/** Same-length compare so a wrong key does not leak its length by timing. */
function keyMatches(given: string | null, expected: string): boolean {
  if (!given || !expected || given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

async function pseudonym(userId: string | null, salt: string): Promise<string | null> {
  if (!userId) return null;
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}:${userId}`));
  return [...new Uint8Array(buf).slice(0, 12)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function teacherIds(instructorId: string | null, json: string | null): string[] {
  const ids = new Set<string>();
  if (instructorId) ids.add(instructorId);
  try {
    const a = json ? (JSON.parse(json) as unknown) : [];
    if (Array.isArray(a)) a.forEach((x) => typeof x === 'string' && x && ids.add(x));
  } catch {
    /* legacy column only */
  }
  return [...ids];
}

/** Which rail the money came in on. */
function channel(b: { comp_kind?: string | null; amount: number; beam_payment_link_id: string | null; beam_qr_charge_id: string | null; beam_charge_id: string | null; stripe_payment_id: string | null; payment_status: string }): string {
  // Free-seat invitation issued by admin (lib/comp.ts).
  if (b.comp_kind) return 'invite';
  if (Number(b.amount) === 0) return 'free';
  if (b.beam_qr_charge_id) return 'beam_promptpay';
  if (b.beam_payment_link_id || b.beam_charge_id) return 'beam_card';
  if (b.stripe_payment_id) return 'stripe';
  return b.payment_status === 'paid' ? 'unknown' : 'none';
}

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return '';
  const cols = Object.keys(rows[0]);
  const cell = (v: unknown) => {
    if (v == null) return '';
    const s = Array.isArray(v) ? v.join('|') : String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\r\n');
}

function respond(rows: Record<string, unknown>[], format: string, name: string, extra: Record<string, unknown> = {}) {
  if (format === 'csv') {
    return new Response(`﻿${toCsv(rows)}`, {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="${name}.csv"`,
        'cache-control': 'no-store',
      },
    });
  }
  return NextResponse.json({ type: name, count: rows.length, ...extra, rows }, { headers: { 'cache-control': 'no-store' } });
}

type BookingRow = {
  id: string;
  created_at: string;
  confirmed_at: string | null;
  user_id: string | null;
  workshop_id: string;
  workshop_title: string;
  workshop_date: string;
  workshop_category: string | null;
  master_id: string | null;
  master_kind: string | null;
  admission_type: string | null;
  payment_type: string | null;
  deposit_amount: number | null;
  instructor_id: string | null;
  instructor_ids_json: string | null;
  booking_kind: string | null;
  booking_tier_label: string | null;
  group_size: number | null;
  parent_booking_id: string | null;
  seats: number;
  status: string;
  payment_status: string;
  app_status: string | null;
  cancel_reason: string | null;
  amount: number;
  comp_kind: string | null;
  host_credit: number;
  collected: number;
  refunded: number;
  beam_payment_link_id: string | null;
  beam_qr_charge_id: string | null;
  beam_charge_id: string | null;
  stripe_payment_id: string | null;
  transferred: number;
};

export async function GET(request: Request) {
  try {
    const env = await getEnv();
    const key = env.FINANCE_EXPORT_KEY || '';
    if (!key || !keyMatches(request.headers.get('x-export-key'), key)) {
      return bad('Forbidden', 403);
    }

    const url = new URL(request.url);
    const type = (url.searchParams.get('type') || 'bookings') as Type;
    if (!TYPES.includes(type)) return bad(`type must be one of ${TYPES.join(', ')}`);
    const format = url.searchParams.get('format') === 'csv' ? 'csv' : 'json';
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');
    if ((from && !DATE_RE.test(from)) || (to && !DATE_RE.test(to))) return bad('from/to must be YYYY-MM-DD');

    const db = await getDB();

    if (type === 'bookings') {
      const limit = Math.min(2000, Math.max(1, Number(url.searchParams.get('limit')) || 500));
      let cursor: { created_at: string; id: string } | null = null;
      const rawCursor = url.searchParams.get('cursor');
      if (rawCursor) {
        try {
          cursor = JSON.parse(atob(rawCursor));
        } catch {
          return bad('bad cursor');
        }
      }
      const where: string[] = ['1=1'];
      const args: (string | number)[] = [];
      if (from) { where.push('b.created_at >= ?'); args.push(`${from} 00:00:00`); }
      if (to) { where.push('b.created_at <= ?'); args.push(`${to} 23:59:59`); }
      if (cursor) { where.push('(b.created_at > ? OR (b.created_at = ? AND b.id > ?))'); args.push(cursor.created_at, cursor.created_at, cursor.id); }
      args.push(limit + 1);

      const res = await db
        .prepare(
          `SELECT b.id, b.created_at, b.confirmed_at, b.user_id,
                  b.workshop_id, w.title AS workshop_title, w.date AS workshop_date, w.category AS workshop_category,
                  w.master_id, m.kind AS master_kind, w.admission_type, w.payment_type, w.deposit_amount,
                  w.instructor_id, w.instructor_ids_json,
                  b.booking_kind, b.booking_tier_label, b.group_size, b.parent_booking_id,
                  ${seatsOfRowSql('b', 'w.max_participants')} AS seats,
                  b.status, b.payment_status, b.app_status, b.cancel_reason, b.amount,
                  b.comp_kind, COALESCE(b.host_credit, 0) AS host_credit,
                  CASE WHEN ${COLLECTED} THEN 1 ELSE 0 END AS collected,
                  CASE WHEN ${REFUNDED} THEN 1 ELSE 0 END AS refunded,
                  b.beam_payment_link_id, b.beam_qr_charge_id, b.beam_charge_id, b.stripe_payment_id,
                  EXISTS (SELECT 1 FROM ticket_transfers t WHERE t.booking_id = b.id AND t.status = 'claimed') AS transferred
             FROM bookings b
             JOIN workshops w ON w.id = b.workshop_id
             LEFT JOIN workshop_masters m ON m.id = w.master_id
            WHERE ${where.join(' AND ')}
            ORDER BY b.created_at ASC, b.id ASC
            LIMIT ?`,
        )
        .bind(...args)
        .all<BookingRow>();
      const all = res.results || [];
      const page = all.slice(0, limit);
      const last = page[page.length - 1];
      const next = all.length > limit && last ? btoa(JSON.stringify({ created_at: last.created_at, id: last.id })) : null;

      const rows = await Promise.all(
        page.map(async (b) => ({
          booking_id: b.id,
          created_at: b.created_at,
          confirmed_at: b.confirmed_at,
          customer: await pseudonym(b.user_id, key),
          workshop_id: b.workshop_id,
          workshop_title: b.workshop_title,
          workshop_date: b.workshop_date,
          workshop_category: b.workshop_category,
          master_id: b.master_id,
          master_kind: b.master_kind,
          admission_type: b.admission_type,
          payment_type: b.payment_type,
          deposit_amount: Number(b.deposit_amount) || 0,
          teacher_ids: teacherIds(b.instructor_id, b.instructor_ids_json),
          booking_kind: b.booking_kind,
          tier: b.booking_tier_label,
          seats: Number(b.seats) || 0,
          group_size: b.group_size,
          parent_booking_id: b.parent_booking_id,
          status: b.status,
          payment_status: b.payment_status,
          app_status: b.app_status,
          cancel_reason: b.cancel_reason,
          channel: channel(b),
          amount: Number(b.amount) || 0,
          collected: b.collected === 1,
          refunded: b.refunded === 1,
          net_amount: b.collected === 1 ? Number(b.amount) || 0 : 0,
          // Invitation seats: who covers it, and what ASL pays the host for it
          // (not money the participant paid — kept out of amount/net_amount).
          comp_kind: b.comp_kind,
          asl_paid: b.collected === 1 ? Number(b.host_credit) || 0 : 0,
          transferred: Number(b.transferred) === 1,
        })),
      );
      return respond(rows, format, 'bookings', { next_cursor: next, limit });
    }

    if (type === 'workshops') {
      const where: string[] = ["w.status != 'draft'"];
      const args: string[] = [];
      if (from) { where.push('w.date >= ?'); args.push(from); }
      if (to) { where.push('w.date <= ?'); args.push(to); }
      const res = await db
        .prepare(
          `SELECT w.id, w.title, w.date, w.end_date, w.time_start, w.time_end, w.category, w.status,
                  w.master_id, m.kind AS master_kind, w.admission_type, w.payment_type, w.deposit_amount,
                  w.price, w.promo_price, w.max_participants, w.instructor_id, w.instructor_ids_json,
                  w.payout_deduction_type, w.payout_deduction_value, w.payout_status, w.payout_remark,
                  CASE WHEN w.payout_slip_url IS NOT NULL THEN 1 ELSE 0 END AS payout_slip,
                  (SELECT COUNT(*) FROM bookings b WHERE b.workshop_id = w.id AND ${COLLECTED}) AS bookings,
                  (SELECT COALESCE(SUM(${seatsOfRowSql('b', 'w.max_participants')}), 0) FROM bookings b WHERE b.workshop_id = w.id AND ${COLLECTED}) AS seats_sold,
                  (SELECT COALESCE(SUM(b.amount), 0) FROM bookings b WHERE b.workshop_id = w.id AND ${COLLECTED}) AS gross,
                  (SELECT COALESCE(SUM(b.host_credit), 0) FROM bookings b WHERE b.workshop_id = w.id AND ${COLLECTED}) AS asl_paid,
                  (SELECT COALESCE(SUM(b.amount), 0) FROM bookings b WHERE b.workshop_id = w.id AND ${REFUNDED}) AS refunded,
                  (SELECT COUNT(*) FROM bookings b WHERE b.workshop_id = w.id AND ${REFUNDED}) AS refunds,
                  (SELECT COUNT(*) FROM bookings b WHERE b.workshop_id = w.id AND b.status = 'cancelled') AS cancelled
             FROM workshops w
             LEFT JOIN workshop_masters m ON m.id = w.master_id
            WHERE ${where.join(' AND ')}
            ORDER BY w.date ASC, w.time_start ASC`,
        )
        .bind(...args)
        .all<{
          id: string; title: string; date: string; end_date: string | null; time_start: string; time_end: string;
          category: string | null; status: string; master_id: string | null; master_kind: string | null;
          admission_type: string | null; payment_type: string | null; deposit_amount: number | null;
          price: number; promo_price: number | null; max_participants: number;
          instructor_id: string | null; instructor_ids_json: string | null;
          payout_deduction_type: 'none' | 'fixed' | 'percent'; payout_deduction_value: number;
          payout_status: string | null; payout_remark: string | null; payout_slip: number;
          bookings: number; seats_sold: number; gross: number; asl_paid: number; refunded: number; refunds: number; cancelled: number;
        }>();
      const rows = (res.results || []).map((w) => {
        const gross = Number(w.gross) || 0;
        const aslPaid = Number(w.asl_paid) || 0;
        // The host is paid on participants' money plus what ASL covers for
        // invitation seats, both before the payout deduction.
        const p = computePayout(gross + aslPaid, w.payout_deduction_type || 'none', Number(w.payout_deduction_value) || 0);
        return {
          workshop_id: w.id,
          title: w.title,
          date: w.date,
          end_date: w.end_date,
          time_start: w.time_start,
          time_end: w.time_end,
          category: w.category,
          status: w.status,
          master_id: w.master_id,
          master_kind: w.master_kind,
          admission_type: w.admission_type,
          payment_type: w.payment_type,
          deposit_amount: Number(w.deposit_amount) || 0,
          price: Number(w.price) || 0,
          promo_price: w.promo_price,
          max_participants: w.max_participants,
          teacher_ids: teacherIds(w.instructor_id, w.instructor_ids_json),
          bookings: Number(w.bookings) || 0,
          seats_sold: Number(w.seats_sold) || 0,
          cancelled: Number(w.cancelled) || 0,
          refunds: Number(w.refunds) || 0,
          gross,
          asl_paid: aslPaid,
          host_gross: gross + aslPaid,
          refunded: Number(w.refunded) || 0,
          payout_deduction_type: w.payout_deduction_type || 'none',
          payout_deduction_value: Number(w.payout_deduction_value) || 0,
          payout_deduction: p.deduction,
          payout_net: p.net,
          payout_status: w.payout_status,
          payout_remark: w.payout_remark,
          payout_slip: w.payout_slip === 1,
        };
      });
      return respond(rows, format, 'workshops');
    }

    if (type === 'summary') {
      const where: string[] = ['1=1'];
      const args: string[] = [];
      if (from) { where.push('b.created_at >= ?'); args.push(`${from} 00:00:00`); }
      if (to) { where.push('b.created_at <= ?'); args.push(`${to} 23:59:59`); }
      const res = await db
        .prepare(
          `SELECT substr(b.created_at, 1, 7) AS month,
                  SUM(CASE WHEN ${COLLECTED} THEN 1 ELSE 0 END) AS bookings,
                  SUM(CASE WHEN ${COLLECTED} THEN ${seatsOfRowSql('b', 'w.max_participants')} ELSE 0 END) AS seats,
                  SUM(CASE WHEN ${COLLECTED} THEN b.amount ELSE 0 END) AS gross,
                  SUM(CASE WHEN ${COLLECTED} THEN COALESCE(b.host_credit, 0) ELSE 0 END) AS asl_paid,
                  SUM(CASE WHEN ${REFUNDED} THEN b.amount ELSE 0 END) AS refunded,
                  SUM(CASE WHEN ${REFUNDED} THEN 1 ELSE 0 END) AS refunds,
                  SUM(CASE WHEN b.status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled,
                  COUNT(DISTINCT CASE WHEN ${COLLECTED} THEN b.user_id END) AS customers
             FROM bookings b JOIN workshops w ON w.id = b.workshop_id
            WHERE ${where.join(' AND ')}
            GROUP BY month ORDER BY month ASC`,
        )
        .bind(...args)
        .all<{ month: string; bookings: number; seats: number; gross: number; asl_paid: number; refunded: number; refunds: number; cancelled: number; customers: number }>();
      const rows = (res.results || []).map((r) => ({
        month: r.month,
        bookings: Number(r.bookings) || 0,
        seats: Number(r.seats) || 0,
        customers: Number(r.customers) || 0,
        gross: Number(r.gross) || 0,
        asl_paid: Number(r.asl_paid) || 0,
        refunded: Number(r.refunded) || 0,
        refunds: Number(r.refunds) || 0,
        cancelled: Number(r.cancelled) || 0,
      }));
      const totals = rows.reduce(
        (t, r) => ({ bookings: t.bookings + r.bookings, seats: t.seats + r.seats, gross: t.gross + r.gross, asl_paid: t.asl_paid + r.asl_paid, refunded: t.refunded + r.refunded }),
        { bookings: 0, seats: 0, gross: 0, asl_paid: 0, refunded: 0 },
      );
      return respond(rows, format, 'summary', { totals });
    }

    // orphans — money that arrived without a valid booking to attach to.
    const where: string[] = ['1=1'];
    const args: string[] = [];
    if (from) { where.push('o.created_at >= ?'); args.push(`${from} 00:00:00`); }
    if (to) { where.push('o.created_at <= ?'); args.push(`${to} 23:59:59`); }
    const res = await db
      .prepare(
        `SELECT o.id, o.booking_id, o.amount, o.currency, o.reason, o.resolved, o.resolved_note, o.created_at
           FROM orphan_payments o WHERE ${where.join(' AND ')} ORDER BY o.created_at ASC`,
      )
      .bind(...args)
      .all<{ id: string; booking_id: string | null; amount: number; currency: string; reason: string; resolved: number; resolved_note: string | null; created_at: string }>();
    const rows = (res.results || []).map((o) => ({
      payment_id: o.id,
      booking_id: o.booking_id,
      amount: (Number(o.amount) || 0) / 100,
      currency: o.currency,
      reason: o.reason,
      resolved: o.resolved === 1,
      resolved_note: o.resolved_note,
      created_at: o.created_at,
    }));
    return respond(rows, format, 'orphans');
  } catch (error) {
    console.error('Finance export error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 });
  }
}
