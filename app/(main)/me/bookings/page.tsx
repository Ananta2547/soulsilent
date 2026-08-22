'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useLang, T, tr } from '@/lib/i18n';
import { Reveal } from '@/components/design/Reveal';
import { Btn } from '@/components/design/RippleButton';
import { fmtDateTime, sqliteToMs } from '@/lib/datetime';
import { AnnounceCountdown } from '@/components/workshops/AnnounceCountdown';
import { ApplicationConsentModal } from '@/components/workshops/ApplicationConsentModal';
import { isWorkshopOngoing, hasWorkshopEnded, getWorkshopStart, getWorkshopDays } from '@/lib/workshop-utils';

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
  // selection workflow (joined + computed by GET /api/bookings?mine=1)
  app_status?: string;
  view_status?: string; // masked until announcement
  waitlist_rank?: number | null;
  confirmed_at?: string | null;
  confirm_by?: string | null;
  ws_admission_type?: string;
  ws_payment_type?: string;
  ws_announce_at?: string | null;
  // Deposit-refund slip attached by admin (visible once uploaded).
  refund_slip_url?: string | null;
  // Why an unsuccessful booking ended (drives the red remark). See cancelRemark().
  cancel_reason?: string | null;
  // Per-day check-in map { "0":1, ... } for multi-day/part events.
  attendance_json?: string | null;
  attended?: number | null;
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
    case 'late_refunded':
      return tr(lang, 'ชำระเงินหลังหมดเวลา · คืนเงินแล้ว', 'Paid after the deadline · refunded');
    case 'late_refund_pending':
      return tr(lang, 'ชำระเงินหลังหมดเวลา · กำลังคืนเงิน', 'Paid after the deadline · refund in progress');
    default: return null;
  }
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

function fmtDate(d: string, lang: 'th' | 'en') {
  return fmtDateTime(d, lang);
}

export default function MyBookingsPage() {
  const { lang } = useLang();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [verifyFailed, setVerifyFailed] = useState(false);
  const [unauthorized, setUnauthorized] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [thankYou, setThankYou] = useState(false);
  const [filter, setFilter] = useState<'all' | 'active' | 'done' | 'other'>('all');
  const [slipUrl, setSlipUrl] = useState<string | null>(null);
  const [consentFor, setConsentFor] = useState<Booking | null>(null);
  /** Set when a booking flips to paid while this page is open. */
  const [justPaid, setJustPaid] = useState<string | null>(null);
  /** Late-refund notices the user has acknowledged this visit. */
  const [dismissedLate, setDismissedLate] = useState<string[]>([]);

  const load = useCallback(() => {
    setLoadError(false);
    fetch('/api/bookings?mine=1')
      .then((r) => {
        if (r.status === 401) {
          setUnauthorized(true);
          return null;
        }
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<{ bookings: Booking[] }>;
      })
      .then((d) => {
        if (!d) return;
        const next = d.bookings || [];
        // Announce a booking that became paid while the page was open, so the
        // user is told rather than left staring at a countdown.
        setBookings((prev) => {
          const wasPending = new Set(
            prev.filter((b) => b.payment_status === 'pending' && b.status !== 'cancelled').map((b) => b.id),
          );
          const flipped = next.find(
            (b) => wasPending.has(b.id) && (b.payment_status === 'paid' || b.status === 'confirmed'),
          );
          if (flipped) setJustPaid(flipped.id);
          return next;
        });
      })
      .catch((e) => {
        console.error('Failed to load bookings', e);
        setLoadError(true);
      })
      .finally(() => setLoading(false));
  }, []);

  // On return from the gateway → verify + show thank-you.
  //   Beam   : ?paid=1&booking=<bookingId>   (Beam has no session-id placeholder)
  //   Stripe : ?paid=1&session_id=<id>       (legacy, for holds still in flight)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get('session_id');
    const bookingId = params.get('booking');
    const paid = params.get('paid');
    (async () => {
      if (sessionId || bookingId) {
        try {
          const res = await fetch('/api/payments/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(bookingId ? { booking_id: bookingId } : { session_id: sessionId }),
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

  // Money arrived after the hold lapsed and is being sent back. Raised as a
  // popup because the row alone only says "cancelled", which tells someone who
  // just paid nothing about where their money went.
  //
  // Derived rather than pushed from an effect, and dismissal is per visit: a
  // notice about money the user is owed is worth showing again on a reload
  // until they have acted on it.
  const lateRefund =
    bookings.find(
      (b) =>
        (b.cancel_reason === 'late_refunded' || b.cancel_reason === 'late_refund_pending') &&
        !dismissedLate.includes(b.id),
    ) ?? null;

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
        window.location.href = data.checkoutUrl;
        return;
      }
      load();
    } catch {
      alert(tr(lang, 'เกิดข้อผิดพลาด', 'Something went wrong'));
    } finally {
      setConfirmingId(null);
    }
  }

  async function confirmSeat(b: Booking) {
    setConfirmingId(b.id);
    try {
      const res = await fetch(`/api/bookings/${b.id}/confirm`, { method: 'POST' });
      const data = (await res.json()) as { checkoutUrl?: string; error?: string };
      if (!res.ok) {
        alert(data.error || tr(lang, 'ยืนยันไม่สำเร็จ', 'Confirmation failed'));
        return;
      }
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
        return;
      }
      // Free workshop → confirmed without payment.
      load();
    } catch {
      alert(tr(lang, 'เกิดข้อผิดพลาด', 'Something went wrong'));
    } finally {
      setConfirmingId(null);
    }
  }

  if (loading) {
    return (
      <section className="section" style={{ padding: '80px 0', textAlign: 'center' }}>
        <div style={{ width: 32, height: 32, border: '2px solid var(--teal)', borderTopColor: 'transparent', borderRadius: '50%', margin: '0 auto', animation: 'float 1s linear infinite' }} />
      </section>
    );
  }

  if (unauthorized) {
    return (
      <section className="section" style={{ padding: '80px 0', textAlign: 'center' }}>
        <p style={{ color: 'var(--muted)', marginBottom: 16 }}>
          {tr(lang, 'กรุณาเข้าสู่ระบบเพื่อดูการจอง', 'Please sign in to view your bookings')}
        </p>
        <Btn kind="teal" href="/auth/login?redirect=/me/bookings">
          {tr(lang, 'เข้าสู่ระบบ', 'Sign in')}
        </Btn>
      </section>
    );
  }

  return (
    <section className="section" style={{ paddingTop: 48, paddingBottom: 64 }}>
      <div className="container">
        <Reveal>
          <span className="eyebrow">
            <T th="โปรไฟล์ของฉัน" en="my account" />
          </span>
          <h1 className="display-th" style={{ fontSize: 'clamp(34px, 5vw, 60px)', margin: '18px 0 8px' }}>
            <T th="การจองของฉัน" en="My bookings" />
          </h1>
          <p style={{ color: 'var(--muted)', fontSize: 15, marginBottom: 20 }}>
            {tr(lang, 'ทั้งหมด', 'Total')} {bookings.length} {tr(lang, 'รายการ', 'bookings')}
          </p>
        </Reveal>

        {/* Payment landed while the page was open. Shown prominently and left
            up until dismissed — a user who does not see this is a user who
            scans the QR again and pays twice. */}
        {justPaid && (
          <div
            role="status"
            style={{ background: '#e6f4f1', border: '1px solid #0d8a7e', color: '#0b5f57', borderRadius: 12, padding: '14px 16px', fontSize: 14.5, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}
          >
            <span style={{ fontSize: 20 }}>✓</span>
            <strong>{tr(lang, 'ได้รับการชำระเงินแล้ว', 'Payment received')}</strong>
            <span style={{ color: '#0b5f57' }}>
              {tr(lang, 'ที่นั่งของคุณได้รับการยืนยันเรียบร้อย — ไม่ต้องสแกนจ่ายซ้ำ', 'Your seat is confirmed — no need to scan and pay again.')}
            </span>
            <button
              type="button"
              onClick={() => setJustPaid(null)}
              style={{ marginLeft: 'auto', border: '1px solid #0d8a7e', background: 'transparent', color: '#0b5f57', borderRadius: 999, padding: '4px 14px', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer' }}
            >
              {tr(lang, 'รับทราบ', 'Got it')}
            </button>
          </div>
        )}

        {verifyFailed && (
          <div style={{ background: '#fdf1e7', border: '1px solid #e8b98a', color: '#8a4b1a', borderRadius: 12, padding: '12px 16px', fontSize: 14, marginBottom: 16 }}>
            {tr(lang, 'ยืนยันการชำระเงินอัตโนมัติไม่สำเร็จ หากคุณชำระเงินแล้วแต่สถานะยังไม่อัปเดต กรุณารีเฟรชหน้าอีกครั้งหรือติดต่อผู้ดูแล', 'Automatic payment verification failed. If you paid but the status has not updated, please refresh or contact the admin.')}
          </div>
        )}

        {loadError && (
          <div style={{ background: '#fdecec', border: '1px solid #e6a5a5', color: '#9a2b2b', borderRadius: 12, padding: '12px 16px', fontSize: 14, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span>{tr(lang, 'โหลดข้อมูลการจองไม่สำเร็จ', 'Failed to load your bookings')}</span>
            <button type="button" onClick={() => { setLoading(true); load(); }} style={{ border: '1px solid #9a2b2b', background: 'transparent', color: '#9a2b2b', borderRadius: 999, padding: '4px 14px', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer' }}>
              {tr(lang, 'ลองใหม่', 'Retry')}
            </button>
          </div>
        )}

        {/* Tabs */}
        {(() => {
          const counts = {
            all: bookings.length,
            active: bookings.filter((b) => classify(b) === 'active').length,
            done: bookings.filter((b) => classify(b) === 'done').length,
            other: bookings.filter((b) => classify(b) === 'other').length,
          };
          const tabs: { key: 'all' | 'active' | 'done' | 'other'; label: string }[] = [
            { key: 'all', label: `${tr(lang, 'ทั้งหมด', 'All')} (${counts.all})` },
            { key: 'active', label: `${tr(lang, 'กำลังดำเนินการ', 'In progress')} (${counts.active})` },
            { key: 'done', label: `${tr(lang, 'สำเร็จ', 'Completed')} (${counts.done})` },
            { key: 'other', label: `${tr(lang, 'ดำเนินการไม่สำเร็จ', 'Unsuccessful')} (${counts.other})` },
          ];
          return (
            <div style={{ display: 'flex', gap: 8, marginBottom: 28, flexWrap: 'wrap' }}>
              {tabs.map((t) => {
                const on = filter === t.key;
                return (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setFilter(t.key)}
                    style={{
                      border: on ? '1px solid var(--teal)' : '1px solid var(--cream-deep)',
                      background: on ? 'var(--teal)' : 'var(--paper)',
                      color: on ? '#fff' : 'var(--ink)',
                      borderRadius: 999,
                      padding: '8px 18px',
                      fontSize: 13.5,
                      fontWeight: 600,
                      fontFamily: 'inherit',
                      cursor: 'pointer',
                      transition: 'all .15s',
                    }}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
          );
        })()}

        {(() => {
          const filtered = filter === 'all' ? bookings : bookings.filter((b) => classify(b) === filter);
          if (bookings.length === 0) {
            return (
              <div style={{ padding: 48, borderRadius: 22, background: 'var(--cream)', textAlign: 'center', color: 'var(--muted)' }}>
                <p style={{ marginBottom: 14 }}>
                  {tr(lang, 'ยังไม่มีการจอง — ลองดู workshop เร็ว ๆ นี้ดูสิ', 'No bookings yet — explore upcoming workshops')}
                </p>
                <Btn kind="teal" href="/workshops">
                  {tr(lang, 'ดูกิจกรรมทั้งหมด', 'Browse workshops')} →
                </Btn>
              </div>
            );
          }
          if (filtered.length === 0) {
            return (
              <div style={{ padding: 40, borderRadius: 22, background: 'var(--cream)', textAlign: 'center', color: 'var(--muted)' }}>
                <p style={{ margin: 0 }}>{tr(lang, 'ไม่มีรายการในหมวดนี้', 'No bookings in this category')}</p>
              </div>
            );
          }
          return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {filtered.map((b) => {
              const paid = b.payment_status === 'paid' || b.status === 'confirmed';
              const expired = isExpiredHold(b);
              const isSelection = b.ws_admission_type === 'selection';
              const view = b.view_status || 'applied';
              // Approved selection seat awaiting the user's confirmation.
              const awaitingConfirm =
                isSelection && view === 'approved' && !paid && !b.confirmed_at;
              // Application submitted but payment not completed (incl. abandoned
              // checkout / expired hold). Direct booking owes immediately;
              // selection owes only after the seat is confirmed.
              const owesPayment =
                !paid &&
                b.status !== 'cancelled' &&
                b.payment_status === 'pending' &&
                (b.amount || 0) > 0 &&
                (isSelection ? !!b.confirmed_at : true);
              // Only treat as a dead "expired hold" when there's nothing to resume.
              const showExpired = expired && !owesPayment;
              // Pending Announcement: applied to a selection workshop, result
              // still masked, and an announcement datetime is set.
              const pendingAnnounce = isSelection && view === 'applied' && !!b.ws_announce_at;

              return (
                <div
                  key={b.id}
                  className="card"
                  style={{
                    padding: 20,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 18,
                    background: 'var(--paper)',
                    flexWrap: 'wrap',
                    opacity: showExpired || (b.status === 'cancelled' && !isSelection) ? 0.6 : 1,
                  }}
                >
                  <Link href={`/workshops/${b.workshop_id}`} style={{ flex: 1, minWidth: 220, textDecoration: 'none', color: 'var(--ink)' }}>
                    <h3 className="display-th" style={{ fontSize: 18, margin: '0 0 4px' }}>
                      {b.workshop_title}
                    </h3>
                    <div className="mono" style={{ fontSize: 11, color: 'var(--muted)', letterSpacing: '.08em', textTransform: 'uppercase' }}>
                      {new Date(b.created_at).toLocaleDateString(lang === 'th' ? 'th-TH' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </div>
                    {awaitingConfirm && b.confirm_by && (
                      <div style={{ fontSize: 12, color: '#a04a14', marginTop: 6 }}>
                        {tr(lang, 'ยืนยันสิทธิ์ภายใน', 'Confirm by')} {fmtDate(b.confirm_by, lang)}
                      </div>
                    )}
                    {owesPayment && b.expires_at && (
                      <div style={{ marginTop: 6 }}>
                        <PayCountdown bookingId={b.id} expiresAt={b.expires_at} onExpire={load} lang={lang} />
                      </div>
                    )}
                  </Link>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <StatusBadge booking={b} expired={showExpired} owesPayment={owesPayment} unsuccessful={classify(b) === 'other'} lang={lang} />

                    <div style={{ fontFamily: 'Archivo Black, Mitr, sans-serif', fontSize: 18, color: showExpired ? 'var(--muted)' : 'var(--ink)', textDecoration: showExpired ? 'line-through' : 'none' }}>
                      ฿{(b.amount || 0).toLocaleString()}
                    </div>

                    {b.refund_slip_url && (
                      <button
                        type="button"
                        onClick={() => setSlipUrl(b.refund_slip_url || null)}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--teal-50, #e6f4f1)', color: 'var(--teal-deep, #0f766e)', border: '1px solid var(--cream-deep)', borderRadius: 999, fontSize: 12.5, fontFamily: 'inherit', fontWeight: 600, cursor: 'pointer', padding: '8px 14px' }}
                      >
                        <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <rect x="4" y="3" width="16" height="18" rx="2" strokeWidth={1.7} />
                          <path strokeLinecap="round" strokeWidth={1.7} d="M8 8h8M8 12h8M8 16h5" />
                        </svg>
                        {b.ws_payment_type === 'deposit'
                          ? tr(lang, 'ดูสลิปคืนมัดจำ', 'View deposit refund slip')
                          : tr(lang, 'ดูสลิปโอนเงินคืน', 'View refund slip')}
                      </button>
                    )}

                    {/* Ongoing event → view application & edit PDPA consent */}
                    {paid && bookingOngoing(b) && (
                      <button
                        type="button"
                        onClick={() => setConsentFor(b)}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--accent, #f5c243)', color: 'var(--ink)', border: 0, borderRadius: 999, fontSize: 12.5, fontFamily: 'inherit', fontWeight: 700, cursor: 'pointer', padding: '8px 14px' }}
                      >
                        <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M9 12h6M9 16h4M8 4h8l4 4v12a1 1 0 01-1 1H5a1 1 0 01-1-1V5a1 1 0 011-1z" />
                        </svg>
                        {tr(lang, 'ดูใบสมัคร', 'View application')}
                      </button>
                    )}

                    {awaitingConfirm && (
                      <Btn kind="teal" onClick={() => confirmSeat(b)} disabled={confirmingId === b.id} style={{ justifyContent: 'center' }}>
                        {confirmingId === b.id
                          ? tr(lang, 'กำลังดำเนินการ…', 'Processing…')
                          : b.ws_payment_type === 'free'
                            ? tr(lang, 'ยืนยันสิทธิ์', 'Confirm seat')
                            : tr(lang, 'ยืนยัน & ชำระเงิน', 'Confirm & Pay')}
                      </Btn>
                    )}

                    {owesPayment && (
                      <>
                        <Btn kind="teal" onClick={() => resumePayment(b)} disabled={confirmingId === b.id} style={{ justifyContent: 'center' }}>
                          {confirmingId === b.id ? tr(lang, 'กำลังดำเนินการ…', 'Processing…') : tr(lang, 'ดำเนินการชำระเงินต่อ', 'Continue payment')}
                        </Btn>
                        <button
                          type="button"
                          onClick={() => cancel(b)}
                          disabled={cancellingId === b.id}
                          style={{ background: 'transparent', border: '1px solid var(--cream-deep)', borderRadius: 999, color: 'var(--muted)', fontSize: 12.5, fontFamily: 'inherit', fontWeight: 600, cursor: 'pointer', padding: '8px 14px' }}
                        >
                          {cancellingId === b.id ? tr(lang, 'กำลังยกเลิก...', 'Cancelling...') : tr(lang, 'ยกเลิกการจอง', 'Cancel booking')}
                        </button>
                      </>
                    )}
                  </div>

                  {/* No countdowns on an unsuccessful/cancelled card. */}
                  {pendingAnnounce && classify(b) !== 'other' && (
                    <div style={{ flexBasis: '100%' }}>
                      <AnnounceCountdown
                        announceAt={b.ws_announce_at!}
                        heading={tr(lang, 'รอประกาศผล — จะประกาศวันที่', 'Pending announcement — results on')}
                      />
                    </div>
                  )}

                  {/* Secured seat, event not over → countdown to the start (In Progress). */}
                  {paid && b.ws_date && !bookingEnded(b) && classify(b) !== 'other' && (
                    <div style={{ flexBasis: '100%' }}>
                      <StartCountdown booking={b} lang={lang} />
                    </div>
                  )}

                  {/* Unsuccessful → red remark, no actions/countdown. */}
                  {(() => {
                    const o = outcome(b);
                    const remark = o.bucket === 'other' ? cancelRemark(o.reason, lang) : null;
                    return remark ? (
                      <div style={{ flexBasis: '100%', color: '#c0392b', fontSize: 13, fontWeight: 600 }}>
                        {tr(lang, 'หมายเหตุ: ', 'Note: ')}{remark}
                      </div>
                    ) : null;
                  })()}
                </div>
              );
            })}
          </div>
          );
        })()}
      </div>

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

      {slipUrl && (
        <div
          onMouseDown={(e) => { if (e.target === e.currentTarget) setSlipUrl(null); }}
          style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(13,30,29,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 16px' }}
        >
          <div style={{ width: '100%', maxWidth: 420, background: 'var(--paper)', borderRadius: 22, boxShadow: '0 30px 80px -24px rgba(13,30,29,.5)', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid var(--cream-deep)' }}>
              <span className="display-th" style={{ fontSize: 16 }}>
                <T th="สลิปคืนมัดจำ" en="Refund slip" />
              </span>
              <button
                type="button"
                onClick={() => setSlipUrl(null)}
                aria-label={tr(lang, 'ปิด', 'Close')}
                style={{ width: 32, height: 32, borderRadius: '50%', border: 'none', background: 'var(--cream)', color: 'var(--ink)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div style={{ padding: 16, textAlign: 'center', background: 'var(--cream)' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={slipUrl} alt="refund slip" style={{ maxWidth: '100%', maxHeight: '70vh', borderRadius: 12, display: 'inline-block' }} />
            </div>
            <div style={{ padding: '12px 16px', borderTop: '1px solid var(--cream-deep)', textAlign: 'center' }}>
              <a href={slipUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12.5, color: 'var(--teal-deep)', fontWeight: 600, textDecoration: 'none' }}>
                {tr(lang, 'เปิดรูปเต็ม ↗', 'Open full image ↗')}
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Late payment → refund notice. Deliberately a modal, not a banner: the
          user has just paid money for a seat they did not get, and that must
          not be something they can scroll past. */}
      {lateRefund && (() => {
        const done = lateRefund.cancel_reason === 'late_refunded';
        const dismiss = () => setDismissedLate((prev) => [...prev, lateRefund.id]);
        return (
          <div
            onMouseDown={(e) => { if (e.target === e.currentTarget) dismiss(); }}
            style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(13,30,29,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 16px', overflowY: 'auto' }}
          >
            <div style={{ width: '100%', maxWidth: 460, background: 'var(--paper)', borderRadius: 22, boxShadow: '0 30px 80px -24px rgba(13,30,29,.5)', padding: '34px 28px' }}>
              <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#fdf1e7', color: '#a04a14', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30, margin: '0 auto 18px' }}>
                ↩
              </div>
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
              <div style={{ background: done ? '#e6f4f1' : '#fdf1e7', border: `1px solid ${done ? '#0d8a7e' : '#e8b98a'}`, color: done ? '#0b5f57' : '#8a4b1a', borderRadius: 14, padding: '13px 16px', fontSize: 13.5, lineHeight: 1.65, marginBottom: 20 }}>
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

      {thankYou && (
        <div
          onMouseDown={(e) => { if (e.target === e.currentTarget) setThankYou(false); }}
          style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(13,30,29,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 16px' }}
        >
          <div style={{ width: '100%', maxWidth: 420, background: 'var(--paper)', borderRadius: 22, boxShadow: '0 30px 80px -24px rgba(13,30,29,.5)', textAlign: 'center', padding: '36px 28px' }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--teal)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, margin: '0 auto 18px' }}>✓</div>
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

/** Countdown to the event start for a secured seat. Once the event is running it
 *  switches to "กิจกรรมกำลังดำเนินอยู่". Shown only in the In Progress tab. */
function StartCountdown({ booking: b, lang }: { booking: Booking; lang: 'th' | 'en' }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (bookingOngoing(b)) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12.5, fontWeight: 700, color: 'var(--teal-deep)' }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--teal)', display: 'inline-block' }} />
        {tr(lang, 'กิจกรรมกำลังดำเนินอยู่', 'Event in progress')}
      </span>
    );
  }

  const startMs = getWorkshopStart(wsShape(b)).getTime();
  const total = Math.max(0, Math.floor((startMs - now) / 1000));
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const parts = d > 0
    ? tr(lang, `${d} วัน ${h} ชม.`, `${d}d ${h}h`)
    : `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 600, color: 'var(--muted)' }}>
      ⏳ {tr(lang, 'เริ่มในอีก', 'Starts in')}{' '}
      <span style={{ fontFamily: 'Archivo Black, Mitr, sans-serif', fontVariantNumeric: 'tabular-nums', color: 'var(--ink)' }}>{parts}</span>
    </span>
  );
}

/** Live mm:ss countdown to the 10-min auto-cancel deadline. Calls onExpire once. */
function PayCountdown({ bookingId, expiresAt, onExpire, lang }: { bookingId: string; expiresAt: string; onExpire: () => void; lang: 'th' | 'en' }) {
  const [now, setNow] = useState(() => Date.now());
  const [done, setDone] = useState(false);
  const targetMs = sqliteToMs(expiresAt);
  useEffect(() => {
    if (Date.now() >= targetMs) {
      setDone(true);
      return;
    }
    const id = setInterval(() => {
      setNow(Date.now());
      if (targetMs - Date.now() <= 0) {
        clearInterval(id);
        setDone(true);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [targetMs]);

  // On timeout: tell the server to expire the Stripe session (kills the saved
  // QR) + mark the booking, then refresh the list. Runs once.
  useEffect(() => {
    if (!done) return;
    let cancelled = false;
    (async () => {
      try {
        await fetch(`/api/bookings/${bookingId}/expire`, { method: 'POST' });
      } catch (e) {
        console.error('Failed to expire booking', e);
      }
      if (!cancelled) onExpire();
    })();
    return () => {
      cancelled = true;
    };
  }, [done, bookingId, onExpire]);

  if (done) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, color: '#c0392b' }}>
        ⛔ {tr(lang, 'หมดเวลาชำระเงิน', 'Payment time expired')}
      </span>
    );
  }

  const total = Math.max(0, Math.floor((targetMs - now) / 1000));
  const mm = String(Math.floor(total / 60)).padStart(2, '0');
  const ss = String(total % 60).padStart(2, '0');
  const urgent = total <= 120;
  return (
    <span style={{ display: 'block' }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 600, color: urgent ? '#c0392b' : '#a04a14' }}>
        ⏳ {tr(lang, 'ชำระเงินภายใน', 'Pay within')}{' '}
        <span style={{ fontFamily: 'Archivo Black, Mitr, sans-serif', fontVariantNumeric: 'tabular-nums', letterSpacing: '.02em' }}>
          {mm}:{ss}
        </span>{' '}
        {tr(lang, 'นาที ไม่งั้นจะยกเลิกอัตโนมัติ', "or it's auto-cancelled")}
      </span>
      <span style={{ display: 'block', marginTop: 4, fontSize: 11.5, lineHeight: 1.4, color: '#c0392b' }}>
        {tr(
          lang,
          'กรุณาชำระเงินภายในเวลาที่กำหนด ห้ามบันทึก QR ไว้จ่ายภายหลังหรือสแกนซ้ำ — จ่ายหลังหมดเวลา/จ่ายซ้ำ เงินจะถูกตัดจากบัญชีแต่ระบบไม่รับชำระและไม่ได้ที่นั่งเพิ่ม (ธนาคารจะคืนเงินให้ภายหลัง)',
          'Pay within the time limit. Do not save this QR to pay later or scan it twice — a late or repeat payment is deducted by your bank but rejected by us and grants no extra seat (your bank returns the money later).',
        )}
      </span>
    </span>
  );
}

function StatusBadge({ booking: b, expired, owesPayment, unsuccessful, lang }: { booking: Booking; expired?: boolean; owesPayment?: boolean; unsuccessful?: boolean; lang: 'th' | 'en' }) {
  const isSelection = b.ws_admission_type === 'selection';
  const paid = b.payment_status === 'paid' || b.status === 'confirmed';

  // Refunds keep their own badge; every other Unsuccessful card reads uniformly.
  if (unsuccessful && b.payment_status !== 'refunded') {
    return <span className="tag" style={{ background: '#fde7d3', color: '#a04a14', fontWeight: 700 }}>✕ {tr(lang, 'ดำเนินการไม่สำเร็จ', 'Unsuccessful')}</span>;
  }

  // Awaiting payment (application submitted, checkout not completed).
  if (owesPayment) {
    return <span className="tag tag-warn">⏳ {tr(lang, 'รอชำระเงิน', 'Pending payment')}</span>;
  }

  // Selection-specific badges (use the masked view_status).
  if (isSelection && !paid) {
    const view = b.view_status || 'applied';
    if (view === 'applied') {
      return <span className="tag" style={{ background: 'var(--cream-deep)', color: 'var(--muted)' }}>{tr(lang, '🕓 อยู่ระหว่างพิจารณา', '🕓 Under review')}</span>;
    }
    if (view === 'approved') {
      return <span className="tag" style={{ background: '#e7f3ee', color: 'var(--teal-deep)' }}>{tr(lang, '✓ ผ่านการคัดเลือก', '✓ Approved')}</span>;
    }
    if (view === 'waitlisted') {
      return <span className="tag tag-warn">{tr(lang, `ตัวสำรอง อันดับ ${b.waitlist_rank ?? '—'}`, `Waitlist #${b.waitlist_rank ?? '—'}`)}</span>;
    }
    if (view === 'rejected') {
      return <span className="tag" style={{ background: '#fde7d3', color: '#a04a14', fontWeight: 700 }}>✕ {tr(lang, 'สิทธิ์การเข้าร่วมเต็มแล้ว', 'Participation slots are full')}</span>;
    }
  }

  if (expired) {
    return <span className="tag" style={{ background: 'var(--cream-deep)', color: 'var(--muted)' }}>⏱ {tr(lang, 'หมดเวลาจอง', 'hold expired')}</span>;
  }
  if (b.status === 'cancelled') {
    if (b.payment_status === 'refunded') {
      return <span className="tag" style={{ background: '#fde7d3', color: '#a04a14' }}>↩ {tr(lang, 'คืนเงินแล้ว', 'refunded')}</span>;
    }
    return <span className="tag" style={{ background: 'var(--cream-deep)', color: 'var(--muted)' }}>× {tr(lang, 'ยกเลิกแล้ว', 'cancelled')}</span>;
  }
  if (paid) {
    return <span className="tag" style={{ background: 'var(--teal)', color: '#fff' }}>✓ {tr(lang, 'ชำระแล้ว', 'paid')}</span>;
  }
  if (b.payment_status === 'pending') {
    return <span className="tag tag-warn">{tr(lang, 'รอชำระ', 'pending')}</span>;
  }
  return <span className="tag">{b.status}</span>;
}
