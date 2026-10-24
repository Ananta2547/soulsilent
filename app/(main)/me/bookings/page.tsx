'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { PushToggle } from '@/components/pwa/PushToggle';
import { useLang, T, tr } from '@/lib/i18n';
import { Reveal } from '@/components/design/Reveal';
import { Btn } from '@/components/design/RippleButton';
import { fmtDate as fmtDateOnly, fmtDateTime, sqliteToMs } from '@/lib/datetime';
import { ApplicationConsentModal } from '@/components/workshops/ApplicationConsentModal';
import { CheckoutModal } from '@/components/workshops/CheckoutPanel';
import { isWorkshopOngoing, hasWorkshopEnded, getWorkshopStart, getWorkshopDays } from '@/lib/workshop-utils';
import { useLoadingTracker } from '@/components/design/DataLoading';
import './bookings.css';

type Booking = {
  id: string;
  workshop_id: string;
  workshop_title: string;
  status: string;
  payment_status: string;
  amount: number;
  expires_at: string | null;
  created_at: string;
  application_json?: string | null;
  ws_date?: string;
  ws_time_start?: string;
  ws_time_end?: string;
  ws_end_date?: string | null;
  ws_dates_json?: string;
  ws_workshop_type?: string;
  ws_day_times_json?: string | null;
  ws_require_consent?: number;
  /** The round's picture, or its master's cover (fills the ticket stub). */
  ws_image_url?: string | null;
  // selection workflow (joined + computed by GET /api/bookings?mine=1)
  app_status?: string;
  view_status?: string; // masked until announcement
  waitlist_rank?: number | null;
  confirmed_at?: string | null;
  confirm_by?: string | null;
  ws_admission_type?: string;
  ws_payment_type?: string;
  ws_announce_at?: string | null;
  // Admin has recorded the transfer back (ledger, or a slip from before it).
  // The slip itself is admin-only; the voucher link goes out by email.
  refunded?: boolean;
  // Why an unsuccessful booking ended (drives the red remark). See cancelRemark().
  cancel_reason?: string | null;
  // Per-day check-in map { "0":1, ... } for multi-day/part events.
  attendance_json?: string | null;
  attended?: number | null;
  // The host cancelled the round this seat was in and moved it here
  // (migration 068); "YYYY-MM-DD HH:MM" of the old round.
  moved_from?: string | null;
  moved_from_when?: string | null;
  parent_booking_id?: string | null;
};

/** Shared date/time shape for a booking's workshop (ongoing / ended / start). */
function wsShape(b: Booking) {
  return {
    workshop_type: (b.ws_workshop_type as 'one_day') || 'one_day',
    date: b.ws_date || '',
    end_date: b.ws_end_date ?? null,
    dates_json: b.ws_dates_json || '[]',
    time_start: b.ws_time_start || '00:00',
    time_end: b.ws_time_end || '23:59',
    day_times_json: b.ws_day_times_json ?? null,
  };
}

/** True once the whole event is over. */
function bookingEnded(b: Booking): boolean {
  if (!b.ws_date) return false;
  return hasWorkshopEnded(wsShape(b));
}

/** Red remark text for an unsuccessful booking, keyed by cancel_reason. */
function cancelRemark(reason: string | null | undefined, lang: 'th' | 'en'): string | null {
  switch (reason) {
    case 'payment_failed': return tr(lang, 'ดำเนินการชำระเงินไม่สำเร็จ', 'Payment was not completed');
    case 'seat_full': return tr(lang, 'สิทธิ์การเข้าร่วมเต็มแล้ว', 'Participation slots are full');
    case 'not_registered': return tr(lang, 'เกินกำหนดเวลาลงทะเบียน', 'Missed the registration window');
    case 'incomplete_days': return tr(lang, 'เงื่อนไขเวลาเข้าร่วมไม่ครบถ้วน', 'Attendance requirement not met');
    case 'workshop_changed': return tr(lang, 'กิจกรรมมีการเปลี่ยนแปลงกำหนดการ', 'The event schedule was changed');
    case 'refunded': return tr(lang, 'ดำเนินการไม่สำเร็จ', 'Not completed');
    case 'refund_requested': return tr(lang, 'คุณขอคืนเงินแทนการย้ายรอบ · กำลังคืนเงิน', 'You chose a refund over the moved round · refund in progress');
    case 'late_refunded':
      return tr(lang, 'ชำระเงินหลังหมดเวลา · คืนเงินแล้ว', 'Paid after the deadline · refunded');
    case 'late_refund_pending':
      return tr(lang, 'ชำระเงินหลังหมดเวลา · กำลังคืนเงิน', 'Paid after the deadline · refund in progress');
    default: return null;
  }
}

/** True once the event has started (a moved seat can no longer be refunded). */
function bookingStarted(b: Booking): boolean {
  if (!b.ws_date) return false;
  return getWorkshopStart(wsShape(b)).getTime() <= Date.now();
}

/** "12 ต.ค. 10:00" from the old round's "YYYY-MM-DD HH:MM". */
function movedWhen(s: string): string {
  const [d, t] = s.split(' ');
  const date = new Date(d + 'T00:00:00');
  return `${date.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}${t ? ` ${t}` : ''}`;
}

/** True while a booking's workshop is currently taking place. */
function bookingOngoing(b: Booking): boolean {
  if (!b.ws_date) return false;
  return isWorkshopOngoing({
    workshop_type: (b.ws_workshop_type as 'one_day') || 'one_day',
    date: b.ws_date,
    end_date: b.ws_end_date ?? null,
    dates_json: b.ws_dates_json || '[]',
    time_start: b.ws_time_start || '00:00',
    time_end: b.ws_time_end || '23:59',
    day_times_json: b.ws_day_times_json ?? null,
  });
}

/** A pending hold that has run out of its window. */
function isExpiredHold(b: Booking): boolean {
  if (b.status === 'cancelled') return false;
  if (b.payment_status !== 'pending') return false;
  if (!b.expires_at) return false;
  // Selection apps with no hold (expires_at null) never "expire" this way.
  return sqliteToMs(b.expires_at) <= Date.now();
}

type Bucket = 'done' | 'active' | 'other';

/** Which tab a booking belongs to.
 *  done   = paid / confirmed (seat secured)
 *  active = still in progress: pending payment (incl. abandoned checkout /
 *           expired hold), pending announcement, approved-awaiting-confirm,
 *           waitlisted
 *  other  = cancelled or rejected (only under "ทั้งหมด") */
/** Total days in the event (>=1). */
function dayCount(b: Booking): number {
  return Math.max(1, getWorkshopDays(wsShape(b)).length);
}

/** How many days the user actually checked in for. */
function daysPresent(b: Booking): number {
  let c = 0;
  try {
    const m = b.attendance_json ? JSON.parse(b.attendance_json) : null;
    if (m && typeof m === 'object') c = Object.values(m).filter((v) => v === 1).length;
  } catch {}
  if (c > 0) return c;
  return b.attended === 1 ? 1 : 0;
}

/** Tab bucket + the reason (real or computed) for an unsuccessful outcome. */
function outcome(b: Booking): { bucket: Bucket; reason: string | null } {
  // Anti-spoiler: for a selection booking, before the announcement moment the
  // result is masked — keep the card In Progress no matter the admin's decision.
  // (The raw status may already be 'cancelled'/'rejected', which must NOT leak
  // it into another tab or surface a remark/badge until announce_at passes.)
  // A workshop cancellation is not a "result" — never mask it, the user must
  // know the event is off.
  if (
    b.ws_admission_type === 'selection' &&
    b.ws_announce_at &&
    b.cancel_reason !== 'workshop_changed' &&
    b.cancel_reason !== 'refunded'
  ) {
    const announceMs = new Date(b.ws_announce_at).getTime();
    if (!Number.isNaN(announceMs) && Date.now() < announceMs) {
      return { bucket: 'active', reason: null };
    }
  }

  if (b.status === 'cancelled') {
    let reason = b.cancel_reason ?? null;
    // A cancelled booking that never completed payment (manual abandon or an
    // expired hold with no reason stored) reads as a payment failure.
    if (!reason && b.payment_status !== 'paid' && b.payment_status !== 'refunded' && (b.amount || 0) > 0) {
      reason = 'payment_failed';
    }
    return { bucket: 'other', reason };
  }
  if ((b.view_status || 'applied') === 'rejected') return { bucket: 'other', reason: b.cancel_reason ?? 'seat_full' };

  const secured = b.payment_status === 'paid' || b.status === 'confirmed';
  if (secured) {
    // Before the event ends the seat is still In Progress (countdown to start).
    if (!bookingEnded(b)) return { bucket: 'active', reason: null };
    // Event over → Completed only if the user attended (all days). Otherwise the
    // seat is "unsuccessful": no check-in = no-show, partial = incomplete.
    const present = daysPresent(b);
    if (present <= 0) return { bucket: 'other', reason: 'not_registered' };
    if (present < dayCount(b)) return { bucket: 'other', reason: 'incomplete_days' };
    return { bucket: 'done', reason: null };
  }
  return { bucket: 'active', reason: null };
}

function classify(b: Booking): Bucket {
  return outcome(b).bucket;
}


/** What a ticket shows. Every booking maps to exactly one kind; the kind picks
 *  the stub colours, the tag, the live line and the one action on the front. */
type Kind =
  | 'pay'
  | 'paid_upcoming'
  | 'paid_ongoing'
  | 'sel_applied'
  | 'sel_approved'
  | 'sel_waitlist'
  | 'done'
  | 'other'
  | 'refunded'
  | 'expired'
  | 'pending';

/** [stub bg, stub ink], [tag bg, tag ink] on the stub, [tag bg, tag ink] on the phone body. */
const PAL: Record<Kind, { stub: [string, string]; tag: [string, string]; soft: [string, string] }> = {
  pay: { stub: ['var(--accent)', 'var(--ink)'], tag: ['var(--ink)', '#fff'], soft: ['#fde7d3', '#a04a14'] },
  paid_upcoming: { stub: ['var(--teal)', '#fff'], tag: ['#fff', 'var(--teal-deep)'], soft: ['var(--teal)', '#fff'] },
  paid_ongoing: { stub: ['var(--ink)', '#fff'], tag: ['var(--accent)', 'var(--ink)'], soft: ['var(--accent)', 'var(--ink)'] },
  sel_applied: { stub: ['var(--cream-deep)', 'var(--ink)'], tag: ['#fff', 'var(--muted)'], soft: ['var(--cream-deep)', 'var(--muted)'] },
  sel_approved: { stub: ['var(--teal-50)', 'var(--teal-deep)'], tag: ['var(--teal)', '#fff'], soft: ['#e7f3ee', 'var(--teal-deep)'] },
  sel_waitlist: { stub: ['var(--accent-soft)', 'var(--ink)'], tag: ['#fff', '#a04a14'], soft: ['#fde7d3', '#a04a14'] },
  done: { stub: ['var(--teal-deep)', '#fff'], tag: ['var(--accent)', 'var(--ink)'], soft: ['var(--teal-50)', 'var(--teal-deep)'] },
  other: { stub: ['#fde7d3', '#a04a14'], tag: ['#fff', '#a04a14'], soft: ['#fde7d3', '#a04a14'] },
  refunded: { stub: ['#fde7d3', '#a04a14'], tag: ['#fff', '#a04a14'], soft: ['#fde7d3', '#a04a14'] },
  expired: { stub: ['var(--cream-deep)', 'var(--muted)'], tag: ['#fff', 'var(--muted)'], soft: ['var(--cream-deep)', 'var(--muted)'] },
  pending: { stub: ['var(--cream-deep)', 'var(--ink)'], tag: ['#fff', 'var(--muted)'], soft: ['var(--cream-deep)', 'var(--muted)'] },
};

/** Colours of the live line: [text, strong text, dot, halo]. */
type Tone = 'muted' | 'wait' | 'grey' | 'warn' | 'urgent' | 'red' | 'teal';
const TONE: Record<Tone, [string, string, string, string]> = {
  muted: ['var(--muted)', 'var(--ink)', 'var(--teal)', 'var(--teal-50)'],
  wait: ['var(--muted)', 'var(--ink)', 'var(--accent)', '#fdf1e7'],
  grey: ['var(--muted)', 'var(--ink)', 'var(--muted)', 'var(--cream)'],
  warn: ['#a04a14', '#a04a14', 'var(--accent)', '#fdf1e7'],
  urgent: ['#c0392b', '#c0392b', '#c0392b', '#fdf1e7'],
  red: ['#c0392b', '#c0392b', '#c0392b', '#fde7d3'],
  teal: ['var(--teal-deep)', 'var(--teal-deep)', 'var(--teal)', 'rgba(13,138,126,.22)'],
};

/** A pending hold lasts 10 minutes; the bar on a "pay" ticket shrinks over it. */
const HOLD_SECONDS = 600;

const MON = {
  th: ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
};
const WD = {
  th: ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'],
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
};
const p2 = (n: number) => String(n).padStart(2, '0');

/** Stub date parts from a "YYYY-MM-DD" day (no timezone shift: it is a Thai date). */
function stubDate(day: string, lang: 'th' | 'en') {
  const [y, m, d] = day.split('-').map(Number);
  if (!y || !m || !d) return null;
  return {
    day: p2(d),
    month: MON[lang][m - 1],
    year: String(lang === 'th' ? y + 543 : y),
    weekday: WD[lang][new Date(Date.UTC(y, m - 1, d)).getUTCDay()],
  };
}

/** Short ticket number from the booking id, e.g. "Nº 3F9A". */
function serialOf(id: string): string {
  return id.replace(/[^a-z0-9]/gi, '').slice(-4).toUpperCase();
}

type Ticket = {
  kind: Kind;
  tag: string;
  live: { label: string; strong: string; tone: Tone };
  barPct: number | null;
  note: string;
  dim: boolean;
  struck: boolean;
};

/** Late-refund notices the user has already read, as "<bookingId>:<state>".
 *
 *  Keyed by state and not by booking alone on purpose: acknowledging "your
 *  refund is being processed" should silence THAT message, and the later "it has
 *  landed" is different news that deserves to be raised once on its own. */
const LATE_ACK_KEY = 'asl.lateRefundAck';

function lateAckKey(b: { id: string; cancel_reason?: string | null }): string {
  return `${b.id}:${b.cancel_reason ?? ''}`;
}

/** The selection/payment facts every part of a ticket reads from. */
function facts(b: Booking) {
  const paid = b.payment_status === 'paid' || b.status === 'confirmed';
  const isSelection = b.ws_admission_type === 'selection';
  const view = b.view_status || 'applied';
  // Approved selection seat awaiting the user's confirmation.
  const awaitingConfirm = isSelection && view === 'approved' && !paid && !b.confirmed_at;
  // Application submitted but payment not completed (incl. abandoned checkout /
  // expired hold). Direct booking owes immediately; selection owes only after
  // the seat is confirmed.
  const owesPayment =
    !paid &&
    b.status !== 'cancelled' &&
    b.payment_status === 'pending' &&
    (b.amount || 0) > 0 &&
    (isSelection ? !!b.confirmed_at : true);
  // Only treat as a dead "expired hold" when there's nothing to resume.
  const showExpired = isExpiredHold(b) && !owesPayment;
  return { paid, isSelection, view, awaitingConfirm, owesPayment, showExpired };
}

/** Everything the front and back of one ticket need, at time `now`. */
function ticketOf(b: Booking, now: number, lang: 'th' | 'en'): Ticket {
  const f = facts(b);
  const o = outcome(b);
  const dim = f.showExpired || (b.status === 'cancelled' && !f.isSelection);
  const base = { dim, struck: f.showExpired, barPct: null };

  if (o.bucket === 'other') {
    const remark = cancelRemark(o.reason, lang) || '';
    const refunded = b.payment_status === 'refunded' || !!b.refunded;
    return {
      ...base,
      kind: refunded ? 'refunded' : 'other',
      tag: refunded ? `↩ ${tr(lang, 'คืนเงินแล้ว', 'Refunded')}` : `✕ ${tr(lang, 'ไม่สำเร็จ', 'Unsuccessful')}`,
      live: { label: tr(lang, 'หมายเหตุ:', 'Note:'), strong: remark || (refunded ? tr(lang, 'คืนเงินแล้ว', 'Refunded') : tr(lang, 'ยกเลิกแล้ว', 'Cancelled')), tone: 'red' },
      note: remark ? `${tr(lang, 'หมายเหตุ: ', 'Note: ')}${remark}` : tr(lang, 'การจองนี้ไม่สำเร็จ', 'This booking did not go through.'),
    };
  }

  if (o.bucket === 'done') {
    return {
      ...base,
      kind: 'done',
      tag: `✓ ${tr(lang, 'สำเร็จ', 'Completed')}`,
      live: { label: tr(lang, 'เข้าร่วมครบทุกวันแล้ว', 'Attended every day'), strong: '✓', tone: 'teal' },
      note: tr(lang, 'ขอบคุณที่มาด้วยกัน — กลับไปได้ตัวเอง.', 'Thank you for coming along.'),
    };
  }

  if (f.owesPayment) {
    const left = b.expires_at ? Math.max(0, Math.floor((sqliteToMs(b.expires_at) - now) / 1000)) : null;
    const note = tr(
      lang,
      'ห้ามบันทึก QR ไว้จ่ายภายหลังหรือสแกนซ้ำ — จ่ายหลังหมดเวลา/จ่ายซ้ำ เงินจะถูกตัดแต่ระบบไม่รับชำระและไม่ได้ที่นั่งเพิ่ม',
      'Do not save the QR to pay later or scan it twice — a late or repeat payment is deducted but rejected, and grants no extra seat.',
    );
    const tag = tr(lang, 'รอชำระเงิน', 'Pending payment');
    if (left === null) {
      return { ...base, kind: 'pay', tag, note, live: { label: tr(lang, 'รอชำระเงิน', 'Awaiting payment'), strong: '', tone: 'warn' } };
    }
    if (left === 0) {
      return { ...base, kind: 'pay', tag, note, live: { label: `⛔ ${tr(lang, 'หมดเวลาชำระเงิน', 'Payment time expired')}`, strong: '', tone: 'red' } };
    }
    return {
      ...base,
      kind: 'pay',
      tag,
      note,
      barPct: Math.min(100, (left / HOLD_SECONDS) * 100),
      live: { label: tr(lang, 'ชำระภายใน', 'Pay within'), strong: `${p2(Math.floor(left / 60))}:${p2(left % 60)}`, tone: left <= 120 ? 'urgent' : 'warn' },
    };
  }

  if (f.awaitingConfirm) {
    return {
      ...base,
      kind: 'sel_approved',
      tag: `✓ ${tr(lang, 'ผ่านการคัดเลือก', 'Approved')}`,
      live: b.confirm_by
        ? { label: tr(lang, 'ยืนยันสิทธิ์ภายใน', 'Confirm by'), strong: fmtDateTime(b.confirm_by, lang, 'short'), tone: 'warn' }
        : { label: tr(lang, 'กรุณายืนยันสิทธิ์', 'Please confirm your seat'), strong: '', tone: 'warn' },
      note: tr(
        lang,
        'คุณผ่านการคัดเลือก กรุณายืนยันสิทธิ์ภายในเวลาที่กำหนด ไม่เช่นนั้นสิทธิ์จะส่งต่อให้ตัวสำรอง',
        'You were selected. Confirm within the deadline, or the seat passes to the waitlist.',
      ),
    };
  }

  if (f.isSelection && !f.paid && f.view === 'waitlisted') {
    const rank = b.waitlist_rank ?? '—';
    return {
      ...base,
      kind: 'sel_waitlist',
      tag: tr(lang, `ตัวสำรอง #${rank}`, `Waitlist #${rank}`),
      live: { label: tr(lang, 'รอเรียกตัวสำรอง ·', 'On the waitlist ·'), strong: tr(lang, `อันดับ ${rank}`, `#${rank}`), tone: 'wait' },
      note: tr(lang, 'หากมีที่นั่งว่าง เราจะแจ้งคุณทันทีตามลำดับตัวสำรอง', 'If a seat opens up, we will tell you right away, in waitlist order.'),
    };
  }

  if (f.isSelection && !f.paid) {
    const announce = b.ws_announce_at ? new Date(b.ws_announce_at).getTime() : NaN;
    const t = Number.isNaN(announce) ? 0 : Math.max(0, Math.floor((announce - now) / 1000));
    return {
      ...base,
      kind: 'sel_applied',
      tag: tr(lang, 'อยู่ระหว่างพิจารณา', 'Under review'),
      live:
        t > 0
          ? {
              label: tr(lang, 'ประกาศผลใน', 'Results in'),
              strong: `${Math.floor(t / 86400)}${tr(lang, 'ว', 'd')} ${p2(Math.floor((t % 86400) / 3600))}:${p2(Math.floor((t % 3600) / 60))}:${p2(t % 60)}`,
              tone: 'grey',
            }
          : { label: tr(lang, 'รอประกาศผล', 'Awaiting results'), strong: '', tone: 'grey' },
      note: tr(lang, 'กิจกรรมนี้คัดเลือกผู้เข้าร่วม ผลจะแสดงที่นี่เมื่อถึงเวลาประกาศ', 'This journey selects its participants. The result shows here when it is announced.'),
    };
  }

  if (f.paid && b.ws_date) {
    if (bookingOngoing(b)) {
      return {
        ...base,
        kind: 'paid_ongoing',
        tag: `● ${tr(lang, 'กำลังจัดอยู่', 'Happening now')}`,
        live: { label: tr(lang, 'กิจกรรมกำลังดำเนินอยู่', 'Event in progress'), strong: '', tone: 'teal' },
        note: tr(lang, 'กิจกรรมกำลังดำเนินอยู่ ดูใบสมัครหรือแก้ไขความยินยอมการถ่ายภาพได้จากด้านหน้า', 'The event is on. View your application or change your photo consent from the front.'),
      };
    }
    const t = Math.max(0, Math.floor((getWorkshopStart(wsShape(b)).getTime() - now) / 1000));
    const d = Math.floor(t / 86400);
    const h = Math.floor((t % 86400) / 3600);
    return {
      ...base,
      kind: 'paid_upcoming',
      tag: `✓ ${tr(lang, 'ชำระแล้ว', 'Paid')}`,
      live: {
        label: tr(lang, 'เริ่มในอีก', 'Starts in'),
        strong: d > 0 ? tr(lang, `${d} วัน ${h} ชม.`, `${d}d ${h}h`) : `${p2(h)}:${p2(Math.floor((t % 3600) / 60))}:${p2(t % 60)}`,
        tone: 'muted',
      },
      note: tr(lang, 'ที่นั่งของคุณได้รับการยืนยันแล้ว เราจะเตือนคืนก่อนวันและก่อนเริ่ม 2 ชั่วโมง', 'Your seat is confirmed. We will remind you the evening before and 2 hours before.'),
    };
  }

  if (f.showExpired) {
    return {
      ...base,
      kind: 'expired',
      tag: tr(lang, 'หมดเวลาจอง', 'Hold expired'),
      live: { label: `⛔ ${tr(lang, 'หมดเวลาจอง', 'Hold expired')}`, strong: '', tone: 'red' },
      note: tr(lang, 'ที่นั่งถูกปล่อยแล้ว หากยังต้องการเข้าร่วม จองใหม่ได้หากยังมีที่นั่งว่าง', 'The seat was released. Book again while seats remain.'),
    };
  }

  return {
    ...base,
    kind: 'pending',
    tag: f.paid ? `✓ ${tr(lang, 'ยืนยันแล้ว', 'Confirmed')}` : tr(lang, 'รอดำเนินการ', 'Pending'),
    live: { label: f.paid ? tr(lang, 'ยืนยันที่นั่งแล้ว', 'Seat confirmed') : tr(lang, 'รอดำเนินการ', 'Pending'), strong: '', tone: f.paid ? 'teal' : 'grey' },
    note: tr(lang, 'ดูรายละเอียดกิจกรรมได้ที่หน้ากิจกรรม', 'See the journey page for details.'),
  };
}

export default function MyBookingsPage() {
  const { lang } = useLang();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  // Set when the installed app answered from its offline copy (no connection).
  const [offlineCopy, setOfflineCopy] = useState(false);
  const [verifyFailed, setVerifyFailed] = useState(false);
  const [unauthorized, setUnauthorized] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  // "ไม่สะดวก ขอคืนเงิน" on a seat the host moved: asks before cancelling.
  const [refundAsk, setRefundAsk] = useState<Booking | null>(null);
  const [refundBusy, setRefundBusy] = useState(false);
  const [refundErr, setRefundErr] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [checkoutFor, setCheckoutFor] = useState<Booking | null>(null);
  const [checkoutErr, setCheckoutErr] = useState<string | null>(null);
  const [thankYou, setThankYou] = useState(false);
  const [filter, setFilter] = useState<'all' | 'active' | 'done' | 'other'>('all');
  const [consentFor, setConsentFor] = useState<Booking | null>(null);
  /** Tickets turned over to their back. Cleared when the tab changes. */
  const [flipped, setFlipped] = useState<Record<string, boolean>>({});
  /** One clock for every countdown on the page. */
  const [now, setNow] = useState(() => Date.now());
  /** Set when a booking flips to paid while this page is open. */
  const [justPaid, setJustPaid] = useState<string | null>(null);
  /** Late-refund notices the user has acknowledged this visit. */
  // Acknowledgements for late refunds. Read straight out of localStorage so
  // there is no flash of a popup the user already dismissed on a previous
  // visit; guarded for the server render, where there is no storage.
  const [dismissedLate, setDismissedLate] = useState<string[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const saved = JSON.parse(window.localStorage.getItem(LATE_ACK_KEY) || '[]');
      return Array.isArray(saved) ? (saved as string[]) : [];
    } catch {
      return [];
    }
  });
  /** Holds already reported as timed out, so each is sent to the server once. */
  const expireSent = useRef<Set<string>>(new Set());

  // Only the first load raises the loading screen; the poll that refreshes this
  // page while a payment settles is left untracked by the tracker itself.
  const track = useLoadingTracker();

  const load = useCallback(() => {
    setLoadError(false);
    track(
      fetch('/api/bookings?mine=1')
        .then((r) => {
          if (r.status === 401) {
            setUnauthorized(true);
            return null;
          }
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          setOfflineCopy(r.headers.get('x-sw-offline') === '1');
          return r.json() as Promise<{ bookings: Booking[] }>;
        })
        .then((d) => {
          if (!d) return;
          const next = d.bookings || [];
          // Installed app: the icon shows how many booked rounds are still ahead.
          const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
          const ahead = next.filter((b) => b.status === 'confirmed' && b.payment_status === 'paid' && b.ws_date && !bookingEnded(b)).length;
          if (nav.setAppBadge) (ahead ? nav.setAppBadge(ahead) : nav.clearAppBadge?.())?.catch(() => {});
          // Announce a booking that became paid while the page was open, so the
          // user is told rather than left staring at a countdown.
          setBookings((prev) => {
            const wasPending = new Set(
              prev.filter((b) => b.payment_status === 'pending' && b.status !== 'cancelled').map((b) => b.id),
            );
            const flippedToPaid = next.find(
              (b) => wasPending.has(b.id) && (b.payment_status === 'paid' || b.status === 'confirmed'),
            );
            if (flippedToPaid) setJustPaid(flippedToPaid.id);
            return next;
          });
        })
        .catch((e) => {
          console.error('Failed to load bookings', e);
          setLoadError(true);
        })
        .finally(() => setLoading(false)),
    );
  }, [track]);

  // On return from the gateway → verify + show thank-you.
  // ?paid=1&booking=<bookingId> — Beam has no session-id placeholder of its
  // own, so the booking id is what comes back.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const bookingId = params.get('booking');
    const paid = params.get('paid');
    (async () => {
      if (bookingId) {
        try {
          const res = await fetch('/api/payments/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ booking_id: bookingId }),
          });
          if (!res.ok) throw new Error(`verify HTTP ${res.status}`);
        } catch (e) {
          console.error('Payment verification failed', e);
          setVerifyFailed(true);
        }
      }
      if (paid) {
        setThankYou(true);
        window.history.replaceState({}, '', '/me/bookings');
      }
      load();
    })();
  }, [load]);

  // Tick once a second for the countdowns on the tickets.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // A hold that runs out while on screen: tell the server to close the checkout
  // (kills a saved QR) and mark the booking, then refresh the list. Once per
  // booking.
  useEffect(() => {
    const due = bookings.filter(
      (b) => facts(b).owesPayment && b.expires_at && sqliteToMs(b.expires_at) <= now && !expireSent.current.has(b.id),
    );
    if (due.length === 0) return;
    due.forEach((b) => expireSent.current.add(b.id));
    Promise.all(
      due.map((b) =>
        fetch(`/api/bookings/${b.id}/expire`, { method: 'POST' }).catch((e) => console.error('Failed to expire booking', e)),
      ),
    ).then(() => load());
  }, [bookings, now, load]);

  // Money arrived after the hold lapsed and is being sent back. Raised as a
  // popup because the row alone only says "cancelled", which tells someone who
  // just paid nothing about where their money went.
  //
  // ALL of them at once, not one popup per booking. Picking only the first left
  // the next one waiting behind it, so dismissing produced another popup, and
  // another — which reads like the page is broken rather than like three
  // separate notices.
  const lateRefunds = bookings.filter(
    (b) =>
      (b.cancel_reason === 'late_refunded' || b.cancel_reason === 'late_refund_pending') &&
      !dismissedLate.includes(lateAckKey(b)),
  );
  const lateRefund = lateRefunds[0] ?? null;

  // Anything still waiting on payment. No clock reading here — that would be an
  // impure call during render, and it isn't needed: once the hold lapses the
  // server marks the row cancelled/expired, this turns false, and the poll below
  // stops on its own.
  const awaitingPayment = bookings.some(
    (b) => b.payment_status === 'pending' && b.status !== 'cancelled' && !!b.expires_at,
  );

  // While a payment is outstanding, keep this page in step with reality.
  //
  // The user pays on Beam's hosted page — often by scanning with a phone while
  // this tab sits idle — and nothing there tells them we received it. Someone
  // who came back to a stale countdown assumed it had failed and paid a second
  // time. Polling means the moment the webhook confirms the booking, this page
  // says so.
  //
  // Only while the tab is actually visible: a hidden tab has nobody to inform,
  // and the refresh on becoming visible covers the "switch back" case, which is
  // the moment that matters most.
  useEffect(() => {
    if (!awaitingPayment) return;

    const tick = () => {
      if (document.visibilityState === 'visible') load();
    };
    const timer = setInterval(tick, 4000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [awaitingPayment, load]);

  async function cancel(b: Booking) {
    const msg = tr(
      lang,
      'ทิ้งการจองที่ยังไม่จ่ายเงิน? ที่นั่งจะถูกปล่อยทันที',
      'Abandon this unpaid hold? The seat is released immediately.'
    );
    if (!confirm(msg)) return;
    setCancellingId(b.id);
    try {
      const res = await fetch(`/api/bookings/${b.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'cancelled' }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        alert(data.error || tr(lang, 'ยกเลิกไม่สำเร็จ', 'Cancellation failed'));
        return;
      }
      load();
    } catch {
      alert(tr(lang, 'เกิดข้อผิดพลาด', 'Something went wrong'));
    } finally {
      setCancellingId(null);
    }
  }

  async function resumePayment(b: Booking) {
    setConfirmingId(b.id);
    try {
      const res = await fetch(`/api/bookings/${b.id}/pay`, { method: 'POST' });
      const data = (await res.json()) as { checkoutUrl?: string; paid?: boolean; error?: string };
      if (!res.ok) {
        alert(data.error || tr(lang, 'ดำเนินการไม่สำเร็จ', 'Could not continue'));
        return;
      }
      if (data.checkoutUrl) {
        window.location.assign(data.checkoutUrl);
        return;
      }
      load();
    } catch {
      alert(tr(lang, 'เกิดข้อผิดพลาด', 'Something went wrong'));
    } finally {
      setConfirmingId(null);
    }
  }

  // A selected applicant with something to pay goes through the checkout
  // screen first (total + coupons); a free workshop confirms straight away.
  function confirmSeat(b: Booking) {
    if (b.ws_payment_type === 'free') {
      postConfirm(b, null).then((e) => e && alert(e));
      return;
    }
    setCheckoutErr(null);
    setCheckoutFor(b);
  }

  /** Resolves to an error message, or null once confirmed / redirected. */
  async function postConfirm(b: Booking, couponCode: string | null): Promise<string | null> {
    setConfirmingId(b.id);
    try {
      const res = await fetch(`/api/bookings/${b.id}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coupon_code: couponCode || undefined }),
      });
      const data = (await res.json()) as { checkoutUrl?: string; error?: string };
      if (!res.ok) return data.error || tr(lang, 'ยืนยันไม่สำเร็จ', 'Confirmation failed');
      if (data.checkoutUrl) {
        window.location.assign(data.checkoutUrl);
        return null;
      }
      // Free workshop or a 100% coupon → confirmed without payment.
      setCheckoutFor(null);
      load();
      return null;
    } catch {
      return tr(lang, 'เกิดข้อผิดพลาด', 'Something went wrong');
    } finally {
      setConfirmingId(null);
    }
  }

  // Nothing to draw while this page's requests are open — the loading screen is
  // over it already (components/design/DataLoading.tsx).
  if (loading) return null;

  if (unauthorized) {
    return (
      <section className="section mb-page" style={{ padding: '80px 0', textAlign: 'center' }}>
        <p style={{ color: 'var(--muted)', marginBottom: 16 }}>
          {tr(lang, 'กรุณาเข้าสู่ระบบเพื่อดูการจอง', 'Please sign in to view your bookings')}
        </p>
        <Btn kind="teal" href="/auth/login?redirect=/me/bookings">
          {tr(lang, 'เข้าสู่ระบบ', 'Sign in')}
        </Btn>
      </section>
    );
  }

  const counts = {
    all: bookings.length,
    active: bookings.filter((b) => classify(b) === 'active').length,
    done: bookings.filter((b) => classify(b) === 'done').length,
    other: bookings.filter((b) => classify(b) === 'other').length,
  };
  const actionCount = bookings.filter((b) => {
    const f = facts(b);
    return f.owesPayment || f.awaitingConfirm;
  }).length;
  const tabs: { key: 'all' | 'active' | 'done' | 'other'; label: string; short: string }[] = [
    { key: 'all', label: tr(lang, 'ทั้งหมด', 'All'), short: tr(lang, 'ทั้งหมด', 'All') },
    { key: 'active', label: tr(lang, 'กำลังดำเนินการ', 'In progress'), short: tr(lang, 'ดำเนินการ', 'Active') },
    { key: 'done', label: tr(lang, 'สำเร็จ', 'Completed'), short: tr(lang, 'สำเร็จ', 'Done') },
    { key: 'other', label: tr(lang, 'ไม่สำเร็จ', 'Unsuccessful'), short: tr(lang, 'ไม่สำเร็จ', 'Failed') },
  ];
  const tabIndex = Math.max(0, tabs.findIndex((t) => t.key === filter));
  const filtered = filter === 'all' ? bookings : bookings.filter((b) => classify(b) === filter);

  return (
    <section className="section mb-page" style={{ paddingTop: 48, paddingBottom: 64 }}>
      <div className="container">
        <Reveal>
          <div className="mb-head">
            <div>
              <span className="eyebrow">
                <T th="โปรไฟล์ของฉัน" en="my account" />
              </span>
              <h1 className="display-th">
                <T th="การจองของฉัน" en="My bookings" />
              </h1>
              <p>
                {tr(lang, `ทั้งหมด ${counts.all} รายการ`, `${counts.all} bookings`)}
                {actionCount > 0 && ` · ${tr(lang, `รอคุณดำเนินการ ${actionCount} รายการ`, `${actionCount} waiting on you`)}`}
              </p>
            </div>
            <div className="mb-tabs" role="tablist" aria-label={tr(lang, 'หมวดการจอง', 'Booking categories')}>
              <span className="mb-tabs-thumb" style={{ transform: `translateX(${tabIndex * 100}%)` }} aria-hidden="true" />
              {tabs.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  role="tab"
                  aria-selected={filter === t.key}
                  className={`mb-tab${filter === t.key ? ' is-on' : ''}`}
                  onClick={() => {
                    setFilter(t.key);
                    setFlipped({});
                  }}
                >
                  <span className="mb-tab-label">{t.label}</span>
                  <span className="mb-tab-short">{t.short}</span>
                  <span className="mb-tab-count">{counts[t.key]}</span>
                </button>
              ))}
            </div>
          </div>
        </Reveal>

        <div className="mb-stack">
          {/* Payment landed while the page was open. Shown prominently and left
              up until dismissed — a user who does not see this is a user who
              scans the QR again and pays twice. */}
          {justPaid && (
            <div role="status" className="mb-paid">
              <span className="mb-paid-icon">✓</span>
              <div className="mb-paid-text">
                <b>{tr(lang, 'ได้รับการชำระเงินแล้ว', 'Payment received')}</b>
                <span>
                  {tr(lang, 'ที่นั่งของคุณได้รับการยืนยันเรียบร้อย — ไม่ต้องสแกนจ่ายซ้ำ', 'Your seat is confirmed — no need to scan and pay again.')}
                </span>
              </div>
              <button type="button" onClick={() => setJustPaid(null)} className="btn btn-paper btn-sm" style={{ minHeight: 40 }}>
                {tr(lang, 'รับทราบ', 'Got it')}
              </button>
            </div>
          )}

          {verifyFailed && (
            <div className="mb-note is-warn">
              {tr(lang, 'ยืนยันการชำระเงินอัตโนมัติไม่สำเร็จ หากคุณชำระเงินแล้วแต่สถานะยังไม่อัปเดต กรุณารีเฟรชหน้าอีกครั้งหรือติดต่อผู้ดูแล', 'Automatic payment verification failed. If you paid but the status has not updated, please refresh or contact the admin.')}
            </div>
          )}

          {bookings.length > 0 && !offlineCopy && <PushToggle variant="nudge" />}

          {offlineCopy && (
            <div className="mb-note is-info">
              {tr(lang, 'ตอนนี้ไม่มีอินเทอร์เน็ต — แสดงการจองล่าสุดที่บันทึกไว้ในเครื่อง สถานะอาจยังไม่อัปเดต', 'You are offline — showing the bookings last saved on this phone; statuses may be out of date.')}
            </div>
          )}

          {loadError && (
            <div className="mb-note is-error">
              <span>{tr(lang, 'โหลดข้อมูลการจองไม่สำเร็จ', 'Failed to load your bookings')}</span>
              <button type="button" onClick={() => { setLoading(true); load(); }}>
                {tr(lang, 'ลองใหม่', 'Retry')}
              </button>
            </div>
          )}
        </div>

        {bookings.length === 0 ? (
          <div className="mb-empty">
            <div className="mb-empty-word" aria-hidden="true">NO TICKET</div>
            <p>{tr(lang, 'ยังไม่มีการจอง — ลองดูกิจกรรมเร็ว ๆ นี้ดูสิ', 'No bookings yet — explore upcoming journeys')}</p>
            <Btn kind="teal" href="/journeys">
              {tr(lang, 'ดูกิจกรรมทั้งหมด', 'Browse journeys')} →
            </Btn>
          </div>
        ) : filtered.length === 0 ? (
          <div className="mb-empty is-filtered">
            <p>{tr(lang, 'ไม่มีรายการในหมวดนี้', 'No bookings in this category')}</p>
          </div>
        ) : (
          <div className="mb-grid">
            {filtered.map((b) => {
              const f = facts(b);
              const t = ticketOf(b, now, lang);
              const pal = PAL[t.kind];
              const [live, liveStrong, liveDot, liveHalo] = TONE[t.live.tone];
              const isFlipped = !!flipped[b.id];
              const toggle = () => setFlipped((s) => ({ ...s, [b.id]: !s[b.id] }));
              const firstDay = b.ws_date ? getWorkshopDays(wsShape(b))[0] || b.ws_date : null;
              const sd = firstDay ? stubDate(firstDay, lang) : null;
              const serial = serialOf(b.id);
              const price = (b.amount || 0) > 0 ? `฿${(b.amount || 0).toLocaleString()}` : tr(lang, 'ฟรี', 'Free');
              const created = fmtDateOnly(sqliteToMs(b.created_at), lang);
              const eventDate = b.ws_date ? fmtDateTime(getWorkshopStart(wsShape(b)), lang) : '—';
              const busy = confirmingId === b.id;
              const refundNote =
                b.ws_payment_type === 'deposit'
                  ? tr(lang, '↩ คืนมัดจำแล้ว · รายละเอียดอยู่ในอีเมล', '↩ Deposit returned · details in your email')
                  : tr(lang, '↩ คืนเงินแล้ว · รายละเอียดอยู่ในอีเมล', '↩ Refunded · details in your email');

              // The one action on the front of the ticket.
              let act: { tone: 'teal' | 'soft' | 'accent' | 'ghost'; long: string; short: string; onClick?: () => void; href?: string; external?: boolean };
              if (t.kind === 'pay') {
                act = {
                  tone: 'teal',
                  long: busy ? tr(lang, 'กำลังดำเนินการ…', 'Processing…') : tr(lang, 'ดำเนินการชำระเงินต่อ', 'Continue payment'),
                  short: busy ? '…' : tr(lang, 'ชำระเงินต่อ', 'Pay now'),
                  onClick: () => resumePayment(b),
                };
              } else if (t.kind === 'sel_approved') {
                const free = b.ws_payment_type === 'free';
                act = {
                  tone: 'teal',
                  long: busy ? tr(lang, 'กำลังดำเนินการ…', 'Processing…') : free ? tr(lang, 'ยืนยันสิทธิ์', 'Confirm seat') : tr(lang, 'ยืนยัน & ชำระเงิน', 'Confirm & Pay'),
                  short: busy ? '…' : free ? tr(lang, 'ยืนยันสิทธิ์', 'Confirm') : tr(lang, 'ยืนยัน & ชำระ', 'Confirm & Pay'),
                  onClick: () => confirmSeat(b),
                };
              } else if (t.kind === 'paid_upcoming' && b.status === 'confirmed') {
                act = { tone: 'soft', long: tr(lang, 'เพิ่มลงปฏิทิน', 'Add to calendar'), short: tr(lang, 'เพิ่มลงปฏิทิน', 'Add to calendar'), href: `/api/bookings/${b.id}/calendar`, external: true };
              } else if (t.kind === 'paid_ongoing') {
                act = { tone: 'accent', long: tr(lang, 'ดูใบสมัคร', 'View application'), short: tr(lang, 'ดูใบสมัคร', 'Application'), onClick: () => setConsentFor(b) };
              } else {
                act = { tone: 'ghost', long: `${tr(lang, 'ดูกิจกรรม', 'View journey')} →`, short: `${tr(lang, 'ดูกิจกรรม', 'View journey')} →`, href: `/journeys/${b.workshop_id}` };
              }
              const actInner = (
                <>
                  <span className="mb-act-long">{act.long}</span>
                  <span className="mb-act-short">{act.short}</span>
                </>
              );

              const vars = {
                '--stub-bg': pal.stub[0],
                '--stub-ink': pal.stub[1],
                '--tag-bg': pal.tag[0],
                '--tag-ink': pal.tag[1],
                '--soft-bg': pal.soft[0],
                '--soft-ink': pal.soft[1],
                '--live': live,
                '--live-strong': liveStrong,
                '--live-dot': liveDot,
                '--live-halo': liveHalo,
              } as React.CSSProperties;

              return (
                <div key={b.id} className={`mb-ticket${isFlipped ? ' is-flipped' : ''}${t.dim ? ' is-dim' : ''}`} style={vars}>
                  <div className="mb-flip">
                    <div className="mb-face mb-front" inert={isFlipped}>
                      <div
                        className={`mb-stub${b.ws_image_url ? ' has-img' : ''}`}
                        style={b.ws_image_url ? { backgroundImage: `url("${b.ws_image_url.replace(/"/g, '%22')}")` } : undefined}
                      >
                        <div className="mb-stub-date">
                          <span className="mb-day">{sd ? sd.day : '—'}</span>
                          {sd && (
                            <span className="mb-my">
                              {sd.month}
                              <span className="mb-my-year"> {sd.year}</span>
                              <span className="mb-my-wd"> · {sd.weekday}</span>
                            </span>
                          )}
                          {sd && <span className="mb-wd-line">{sd.weekday}</span>}
                        </div>
                        <div className="mb-stub-side">
                          <span className="mb-tag">{t.tag}</span>
                          <span className="mb-serial">Nº {serial}</span>
                        </div>
                        {t.kind === 'done' && <span className="mb-sparkle" aria-hidden="true">✺</span>}
                      </div>
                      <div className="mb-perf" aria-hidden="true"><i /><i /></div>
                      <div className="mb-body">
                        <div className="mb-body-top">
                          <span className="mb-tag">{t.tag}</span>
                          <span className={`mb-price${t.struck ? ' is-struck' : ''}`}>{price}</span>
                        </div>
                        <h3 className="mb-title">
                          <Link href={`/journeys/${b.workshop_id}`}>{b.workshop_title}</Link>
                        </h3>
                        <div className="mb-meta">
                          <span className="mb-created">{tr(lang, 'จองเมื่อ', 'Booked')} {created}</span>
                          <span className={`mb-price${t.struck ? ' is-struck' : ''}`}>{price}</span>
                        </div>
                        {b.moved_from && b.status !== 'cancelled' && (
                          <div className="mb-moved">{tr(lang, 'ผู้จัดย้ายรอบให้ — ดูรายละเอียดด้านหลัง', 'The host moved your round — see the back')}</div>
                        )}
                        <div className="mb-live-wrap">
                          <div className="mb-live">
                            <span className="mb-live-dot" />
                            <span className="mb-live-text">
                              {t.live.label} {t.live.strong && <b>{t.live.strong}</b>}
                            </span>
                          </div>
                          {t.barPct !== null && (
                            <div className="mb-bar"><span style={{ width: `${t.barPct}%` }} /></div>
                          )}
                        </div>
                        <div className="mb-actions">
                          {act.href ? (
                            act.external ? (
                              <a href={act.href} className={`mb-act is-${act.tone}`}>{actInner}</a>
                            ) : (
                              <Link href={act.href} className={`mb-act is-${act.tone}`}>{actInner}</Link>
                            )
                          ) : (
                            <button type="button" className={`mb-act is-${act.tone}`} onClick={act.onClick} disabled={busy}>
                              {actInner}
                            </button>
                          )}
                          <button
                            type="button"
                            className="mb-flip-btn"
                            onClick={toggle}
                            aria-label={tr(lang, 'พลิกดูรายละเอียด', 'Flip for details')}
                            title={tr(lang, 'พลิกดูรายละเอียด', 'Flip for details')}
                          >
                            ↻
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="mb-face mb-back" inert={!isFlipped}>
                      <div className="mb-back-head">
                        <span className="mb-back-eyebrow">{tr(lang, 'รายละเอียดการจอง', 'Booking details')}</span>
                        <span className="mb-serial">Nº {serial}</span>
                      </div>
                      <div className="mb-back-title">{b.workshop_title}</div>
                      <dl className="mb-facts">
                        <dt>{tr(lang, 'วันกิจกรรม', 'Date')}</dt>
                        <dd>{eventDate}</dd>
                        <dt>{tr(lang, 'จองเมื่อ', 'Booked')}</dt>
                        <dd>{created}</dd>
                        <dt className="mb-fact-amount">{tr(lang, 'ยอด', 'Amount')}</dt>
                        <dd className="mb-fact-amount">{price}</dd>
                      </dl>
                      <p className="mb-back-note">{t.note}</p>
                      {b.moved_from && b.status !== 'cancelled' && (
                        <p className="mb-back-note mb-moved-note">
                          {tr(
                            lang,
                            `ผู้จัดยกเลิกรอบเดิม${b.moved_from_when ? ` (${movedWhen(b.moved_from_when)})` : ''} และย้ายที่นั่งของคุณมารอบนี้ ไม่สะดวกขอคืนเงินแทนได้จนกว่ารอบนี้จะเริ่ม`,
                            `The host cancelled your original round${b.moved_from_when ? ` (${movedWhen(b.moved_from_when)})` : ''} and moved your seat here. You can take a refund instead until this round starts.`,
                          )}
                        </p>
                      )}
                      {b.refunded && <p className="mb-back-note mb-refunded">{refundNote}</p>}
                      <div className="mb-back-actions">
                        {b.moved_from && b.status !== 'cancelled' && !b.parent_booking_id && !bookingStarted(b) && (
                          <button type="button" className="mb-act is-glass" onClick={() => setRefundAsk(b)}>
                            <span className="mb-act-long">{tr(lang, 'ไม่สะดวก ขอคืนเงิน', 'Refund instead')}</span>
                            <span className="mb-act-short">{tr(lang, 'ขอคืนเงิน', 'Refund')}</span>
                          </button>
                        )}
                        {f.owesPayment && (
                          <button type="button" className="mb-act is-glass" onClick={() => cancel(b)} disabled={cancellingId === b.id}>
                            {cancellingId === b.id ? tr(lang, 'กำลังยกเลิก...', 'Cancelling...') : tr(lang, 'ยกเลิกการจอง', 'Cancel booking')}
                          </button>
                        )}
                        <button type="button" className="mb-act is-paper" onClick={toggle}>
                          ↻ {tr(lang, 'พลิกกลับ', 'Flip back')}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {checkoutFor && (
        <CheckoutModal
          request={{ booking_id: checkoutFor.id }}
          title={checkoutFor.workshop_title}
          subtitle={tr(lang, 'ยืนยันสิทธิ์ผู้ได้รับคัดเลือก', 'Confirm your selected seat')}
          itemLabel={checkoutFor.ws_payment_type === 'deposit' ? tr(lang, 'มัดจำ · 1 ที่นั่ง', 'Deposit · one seat') : tr(lang, '1 ที่นั่ง', 'One seat')}
          busy={confirmingId === checkoutFor.id}
          error={checkoutErr}
          onClose={() => setCheckoutFor(null)}
          onConfirm={async (code) => {
            setCheckoutErr(await postConfirm(checkoutFor, code));
          }}
        />
      )}

      {consentFor && (
        <ApplicationConsentModal
          bookingId={consentFor.id}
          applicationJson={consentFor.application_json ?? null}
          workshopTitle={consentFor.workshop_title}
          requireConsent={consentFor.ws_require_consent === 1}
          onClose={() => setConsentFor(null)}
          onSaved={(consent) => {
            setBookings((rows) =>
              rows.map((r) => {
                if (r.id !== consentFor.id) return r;
                let app: Record<string, unknown> = {};
                try { app = r.application_json ? JSON.parse(r.application_json) : {}; } catch { app = {}; }
                app.consent = { photoVideo: consent, label: consent === 'granted' ? 'ยินยอม' : 'ไม่ยินยอม' };
                return { ...r, application_json: JSON.stringify(app) };
              })
            );
          }}
        />
      )}

      {/* Late payment → refund notice. Deliberately a modal, not a banner: the
          user has just paid money for a seat they did not get, and that must
          not be something they can scroll past. */}
      {lateRefund && (() => {
        const done = lateRefunds.every((b) => b.cancel_reason === 'late_refunded');
        const dismiss = () => {
          const keys = lateRefunds.map(lateAckKey);
          setDismissedLate((prev) => [...prev, ...keys]);
          // Remembered across visits, including for a refund still in flight.
          // The row itself keeps saying so in red, which is the right weight for
          // something the user has already been told — a modal across the whole
          // screen on every single reload is not. If it later completes, the key
          // changes and the good news is raised once.
          try {
            const saved = JSON.parse(window.localStorage.getItem(LATE_ACK_KEY) || '[]');
            const merged = Array.from(new Set([...(Array.isArray(saved) ? saved : []), ...keys]));
            window.localStorage.setItem(LATE_ACK_KEY, JSON.stringify(merged));
          } catch {
            // Storage blocked or full — the popup simply comes back next visit.
          }
        };
        return (
          <div className="mb-modal" onMouseDown={(e) => { if (e.target === e.currentTarget) dismiss(); }}>
            <div className="mb-modal-card" style={{ maxWidth: 460, padding: '34px 28px' }}>
              <div className="mb-modal-icon" style={{ background: '#fdf1e7', color: '#a04a14' }}>↩</div>
              <h2 className="display-th" style={{ fontSize: 21, margin: '0 0 12px', textAlign: 'center' }}>
                {tr(lang, 'ชำระเงินหลังหมดเวลา — ระบบคืนเงินให้แล้ว', 'Paid after the deadline — your money is on its way back')}
              </h2>
              <p style={{ fontSize: 14.5, color: 'var(--muted)', lineHeight: 1.7, margin: '0 0 14px' }}>
                {tr(
                  lang,
                  `เราได้รับเงินของคุณสำหรับ "${lateRefund.workshop_title || 'กิจกรรม'}" หลังหมดเวลาชำระเงิน 10 นาที ที่นั่งจึงถูกปล่อยให้ผู้อื่นไปแล้ว`,
                  `We received your payment for "${lateRefund.workshop_title || 'the workshop'}" after the 10-minute window closed, so the seat had already been released to someone else.`,
                )}
              </p>
              <div style={{ background: done ? '#e6f4f1' : '#fdf1e7', color: done ? '#0b5f57' : '#8a4b1a', borderRadius: 14, padding: '13px 16px', fontSize: 13.5, lineHeight: 1.65, marginBottom: 20 }}>
                {done
                  ? tr(
                      lang,
                      'ระบบได้สั่งคืนเงินเต็มจำนวนอัตโนมัติแล้ว — เงินจะกลับเข้าบัญชีของคุณตามรอบของธนาคาร (ปกติ 1–3 วันทำการ) ไม่ต้องดำเนินการใด ๆ เพิ่ม',
                      'A full refund has been issued automatically. The money returns on your bank\'s schedule — usually 1–3 business days. Nothing further is needed from you.',
                    )
                  : tr(
                      lang,
                      'ระบบกำลังดำเนินการคืนเงินให้ หากยังไม่ได้รับเงินคืนภายใน 3 วันทำการ กรุณาติดต่อทีมงานพร้อมแจ้งวันเวลาที่โอน',
                      'The refund is being processed. If it has not arrived within 3 business days, please contact us with the date and time you paid.',
                    )}
              </div>
              {lateRefunds.length > 1 && (
                <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6, margin: '0 0 14px' }}>
                  {tr(
                    lang,
                    `รวมทั้งหมด ${lateRefunds.length} รายการที่ชำระหลังหมดเวลา และคืนเงินด้วยเงื่อนไขเดียวกัน`,
                    `${lateRefunds.length} bookings were paid after the deadline and are being refunded on the same terms.`,
                  )}
                </p>
              )}
              <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6, margin: '0 0 20px' }}>
                {tr(
                  lang,
                  'หากยังต้องการเข้าร่วม สามารถจองใหม่ได้หากยังมีที่นั่งว่าง',
                  'If you still want to join, you can book again while seats remain.',
                )}
              </p>
              <Btn kind="teal" onClick={dismiss} style={{ width: '100%', justifyContent: 'center' }}>
                {tr(lang, 'รับทราบ', 'Got it')}
              </Btn>
            </div>
          </div>
        );
      })()}

      {refundAsk && (
        <div className="mb-modal" onMouseDown={(e) => { if (e.target === e.currentTarget && !refundBusy) setRefundAsk(null); }}>
          <div className="mb-modal-card" style={{ maxWidth: 460, padding: '30px 28px' }}>
            <div className="mb-modal-icon" style={{ background: '#fdf1e7', color: '#a04a14' }}>↩</div>
            <h2 className="display-th" style={{ fontSize: 22, margin: '0 0 10px' }}>
              {tr(lang, 'ขอคืนเงินแทนรอบใหม่?', 'Take a refund instead?')}
            </h2>
            <p style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.65, margin: '0 0 8px' }}>
              {tr(
                lang,
                `ที่นั่งใน "${refundAsk.workshop_title}" จะถูกยกเลิก${refundAsk.amount > 0 ? ` และทีมงานจะโอนคืน ฿${Math.round(refundAsk.amount).toLocaleString()} ตามยอดที่จ่ายจริง` : ''}`,
                `Your seat in "${refundAsk.workshop_title}" will be cancelled${refundAsk.amount > 0 ? ` and we will transfer back ฿${Math.round(refundAsk.amount).toLocaleString()}, the amount you paid` : ''}.`,
              )}
            </p>
            <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6, margin: '0 0 20px' }}>
              {tr(lang, 'ถ้าเป็นการจองกลุ่ม ที่นั่งของเพื่อนในกลุ่มจะถูกยกเลิกด้วย · ทำแล้วย้อนกลับไม่ได้', 'For a group, your friends’ seats are cancelled too. This cannot be undone.')}
            </p>
            {refundErr && <p style={{ color: '#b3261e', fontSize: 13, margin: '0 0 12px' }}>{refundErr}</p>}
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="button" className="btn btn-paper" style={{ flex: 1, justifyContent: 'center' }} disabled={refundBusy} onClick={() => setRefundAsk(null)}>
                {tr(lang, 'ไปรอบใหม่', 'Keep the new round')}
              </button>
              <button
                type="button"
                className="btn"
                style={{ flex: 1, justifyContent: 'center', background: '#a04a14', color: '#fff' }}
                disabled={refundBusy}
                onClick={async () => {
                  setRefundBusy(true);
                  setRefundErr(null);
                  try {
                    const res = await fetch(`/api/bookings/${refundAsk.id}/refund-request`, { method: 'POST' });
                    const d = (await res.json()) as { error?: string };
                    if (!res.ok) setRefundErr(d.error || tr(lang, 'ขอคืนเงินไม่สำเร็จ', 'Refund request failed'));
                    else {
                      setRefundAsk(null);
                      load();
                    }
                  } catch {
                    setRefundErr(tr(lang, 'เกิดข้อผิดพลาด', 'Something went wrong'));
                  } finally {
                    setRefundBusy(false);
                  }
                }}
              >
                {refundBusy ? tr(lang, 'กำลังส่ง…', 'Sending…') : tr(lang, 'ขอคืนเงิน', 'Request refund')}
              </button>
            </div>
          </div>
        </div>
      )}

      {thankYou && (
        <div className="mb-modal" onMouseDown={(e) => { if (e.target === e.currentTarget) setThankYou(false); }}>
          <div className="mb-modal-card is-center">
            <div className="mb-modal-icon" style={{ background: 'var(--teal)', color: '#fff', fontSize: 32 }}>✓</div>
            <h2 className="display-th" style={{ fontSize: 22, margin: '0 0 10px' }}>
              <T th="ส่งใบสมัครสำเร็จ" en="Application Submitted Successfully" />
            </h2>
            <p style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.6, margin: '0 0 22px' }}>
              <T th="ขอบคุณสำหรับการสมัคร 🙏" en="Thank you for applying 🙏" />
            </p>
            <button type="button" onClick={() => setThankYou(false)} className="btn btn-teal" style={{ width: '100%', justifyContent: 'center' }}>
              {tr(lang, 'ดูหน้าการจอง', 'View Booking Page')}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
