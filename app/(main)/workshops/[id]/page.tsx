'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import type { Workshop, Location, Review } from '@/lib/types';
import { useLang, T, tr } from '@/lib/i18n';
import { Reveal } from '@/components/design/Reveal';
import { Btn } from '@/components/design/RippleButton';
import { Cloud, WaveLine, Star } from '@/components/design/Doodles';
import { Countdown } from '@/components/design/Countdown';
import { BookingModal, type BookingResult } from '@/components/workshops/BookingModal';
import { ReviewModal } from '@/components/workshops/ReviewModal';
import { AnnounceCountdown } from '@/components/workshops/AnnounceCountdown';
import { ApplicationConsentModal } from '@/components/workshops/ApplicationConsentModal';
import { fmtDateTime, sqliteToMs } from '@/lib/datetime';
import {
  getEffectivePrice,
  safeParseArray,
  parseSchedule,
  parseMapCoords,
  coordsToEmbedSrc,
  isShortMapLink,
  hasWorkshopEnded,
  hasWorkshopStarted,
  isWorkshopOngoing,
  getWorkshopDays,
} from '@/lib/workshop-utils';
import { visibleAppStatus } from '@/lib/selection-status';
import { platformStyle, platformLabel } from '@/lib/online-platform';

type UserBooking = {
  id: string;
  status: string;
  payment_status: string;
  expires_at: string | null;
  app_status: string | null;
  application_json: string | null;
};
type Instructor = {
  id: string;
  name: string;
  email: string;
  role: string;
  avatar_url: string | null;
  portfolio_id: string | null;
};

export default function WorkshopDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { lang } = useLang();
  const [workshop, setWorkshop] = useState<Workshop | null>(null);
  const [location, setLocation] = useState<Location | null>(null);
  // A workshop can have several facilitators; index 0 is the owning teacher.
  const [instructors, setInstructors] = useState<Instructor[]>([]);
  const [bookingCount, setBookingCount] = useState(0);
  const [userBooking, setUserBooking] = useState<UserBooking | null>(null);
  const [userAttended, setUserAttended] = useState(false);
  const [userCompleted, setUserCompleted] = useState(false);
  const [userIncompleteReason, setUserIncompleteReason] = useState<string | null>(null);
  const [userReview, setUserReview] = useState<Review | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [consentOpen, setConsentOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [verifyFailed, setVerifyFailed] = useState(false);
  const [booking, setBooking] = useState(false);
  const [bookingOpen, setBookingOpen] = useState(false);
  const [loginPromptOpen, setLoginPromptOpen] = useState(false);
  // null = still checking; true/false = known login state.
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [openDays, setOpenDays] = useState<number[]>([0]);

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      const res = await fetch(`/api/workshops/${id}`);
      if (!res.ok && res.status !== 404) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as {
        workshop: Workshop;
        location: Location | null;
        instructor: Instructor | null;
        instructors?: Instructor[];
        bookingCount: number;
        userBooking: UserBooking | null;
        userAttended?: boolean;
        userCompleted?: boolean;
        userIncompleteReason?: string | null;
        userReview?: Review | null;
      };
      setWorkshop(data.workshop);
      setLocation(data.location);
      // `instructors` is the current shape; fall back to the single-instructor
      // key so a cached/older API response still renders.
      setInstructors(
        data.instructors && data.instructors.length > 0
          ? data.instructors
          : data.instructor
            ? [data.instructor]
            : [],
      );
      setBookingCount(data.bookingCount || 0);
      setUserBooking(data.userBooking);
      setUserAttended(!!data.userAttended);
      setUserCompleted(!!data.userCompleted);
      setUserIncompleteReason(data.userIncompleteReason ?? null);
      setUserReview(data.userReview || null);
    } catch (e) {
      console.error('Failed to load workshop', e);
      setLoadError(true);
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // Login status — gate the booking form so guests are prompted to sign in first.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/auth/me');
        const data = (await res.json()) as { user: { id: string } | null };
        if (!cancelled) setAuthed(!!data.user);
      } catch {
        if (!cancelled) setAuthed(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Booking CTA: guests get the login/register prompt; signed-in users get the
  // application form.
  function handleBookClick() {
    if (authed) setBookingOpen(true);
    else setLoginPromptOpen(true);
  }

  // When Stripe redirects back with ?session_id=..., verify the payment
  // server-side, then strip the query param and refetch. This is the path
  // that works without webhook delivery (local dev, or before live mode
  // webhook is configured).
  useEffect(() => {
    const sessionId = searchParams.get('session_id');
    if (!sessionId) return;
    (async () => {
      try {
        const res = await fetch('/api/payments/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: sessionId }),
        });
        if (!res.ok) throw new Error(`verify HTTP ${res.status}`);
      } catch (e) {
        console.error('Payment verification failed', e);
        setVerifyFailed(true);
      }
      // Clean the URL so a refresh doesn't re-verify
      router.replace(`/workshops/${id}`);
      load();
    })();
  }, [searchParams, router, id, load]);

  async function handleBooking(application?: unknown): Promise<BookingResult> {
    setBooking(true);
    try {
      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workshop_id: id, application }),
      });
      const data = (await res.json()) as BookingResult;
      if (!res.ok) {
        setBooking(false);
        return { error: data.error || tr(lang, 'เกิดข้อผิดพลาด', 'Something went wrong') };
      }
      // The modal renders the right popup / redirect from the result.
      return data;
    } catch {
      setBooking(false);
      return { error: tr(lang, 'เกิดข้อผิดพลาด', 'Something went wrong') };
    }
  }

  // Resume a submitted-but-unpaid booking (user abandoned checkout earlier).
  async function resumePayment() {
    if (!userBooking) return;
    setBooking(true);
    try {
      const res = await fetch(`/api/bookings/${userBooking.id}/pay`, { method: 'POST' });
      const data = (await res.json()) as { checkoutUrl?: string; error?: string };
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      } else {
        alert(data.error || tr(lang, 'เกิดข้อผิดพลาด', 'Something went wrong'));
        setBooking(false);
      }
    } catch {
      alert(tr(lang, 'เกิดข้อผิดพลาด', 'Something went wrong'));
      setBooking(false);
    }
  }

  if (loading) {
    return (
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '120px 32px', textAlign: 'center' }}>
        <div
          style={{
            width: 32,
            height: 32,
            border: '2px solid var(--teal)',
            borderTopColor: 'transparent',
            borderRadius: '50%',
            margin: '0 auto',
            animation: 'float 1s linear infinite',
          }}
        />
      </div>
    );
  }

  if (!workshop) {
    return (
      <div style={{ maxWidth: 800, margin: '0 auto', padding: '120px 32px', textAlign: 'center' }}>
        <p style={{ color: 'var(--muted)', fontSize: 18, marginBottom: 16 }}>
          {loadError
            ? tr(lang, 'โหลดข้อมูลไม่สำเร็จ กรุณาลองใหม่', 'Failed to load. Please try again.')
            : tr(lang, 'ไม่พบ Workshop นี้', 'Workshop not found')}
        </p>
        {loadError ? (
          <Btn kind="teal" onClick={() => { setLoading(true); load(); }}>
            {tr(lang, 'ลองใหม่', 'Retry')}
          </Btn>
        ) : (
          <Btn kind="teal" href="/workshops">
            {tr(lang, 'กลับไปหน้ารวม', 'Back to all events')}
          </Btn>
        )}
      </div>
    );
  }

  const spotsLeft = workshop.max_participants - bookingCount;
  const scheduleDays = parseSchedule(workshop.schedule_json);
  const learnItems = safeParseArray<string>(workshop.learn_json, []);
  const targetItems = safeParseArray<string>(workshop.target_json, []);
  const locationLabel = location
    ? `${location.name}, ${location.subdistrict}, ${location.district}, ${location.province}`
    : workshop.location;

  // Workshop date(s) — formatted per scheduling type.
  const fmtFullDate = (d: string) =>
    new Date(d + 'T00:00:00').toLocaleDateString(lang === 'th' ? 'th-TH' : 'en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  const partDates = safeParseArray<string>(workshop.dates_json, []);
  const workshopType = workshop.workshop_type || 'one_day';

  return (
    <>
      {/* Hero banner */}
      <section className="bg-teal-section" style={{ padding: '40px 0' }}>
        <div className="container" style={{ textAlign: 'center' }}>
          <h1
            className="display-th"
            style={{ fontSize: 'clamp(28px, 4.2vw, 44px)', margin: 0, lineHeight: 1.15, color: '#fff' }}
          >
            {workshop.title}
          </h1>
        </div>
      </section>

      {/* Content + sticky booking */}
      <section className="section" style={{ paddingTop: 48, paddingBottom: 96 }}>
        <div className="container">
          {verifyFailed && (
            <div style={{ background: '#fdf1e7', border: '1px solid #e8b98a', color: '#8a4b1a', borderRadius: 12, padding: '12px 16px', fontSize: 14, marginBottom: 20 }}>
              {tr(lang, 'ยืนยันการชำระเงินอัตโนมัติไม่สำเร็จ หากคุณชำระเงินแล้วแต่สถานะยังไม่อัปเดต กรุณารีเฟรชหน้าอีกครั้งหรือติดต่อผู้ดูแล', 'Automatic payment verification failed. If you paid but the status has not updated, please refresh or contact the admin.')}
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 48 }} className="ws-detail-grid">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 48, minWidth: 0 }}>
              {/* Tags */}
              <Reveal>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {hasWorkshopEnded(workshop) ? (
                    <span className="tag" style={{ background: 'var(--cream-deep)', color: 'var(--muted)' }}>{tr(lang, 'ปิดรับ', 'Closed')}</span>
                  ) : workshop.status === 'cancelled' ? (
                    <span className="tag" style={{ background: '#fde7d3', color: '#a04a14' }}>{tr(lang, 'ยกเลิก', 'Cancelled')}</span>
                  ) : (
                    <span className="tag tag-accent">{tr(lang, 'เปิดจอง', 'Open')}</span>
                  )}
                  <span className="tag">Workshop · Onsite</span>
                  {workshop.category && <span className="tag">{workshop.category}</span>}
                </div>
              </Reveal>

              {workshop.description && (
                <Reveal>
                  <p
                    style={{
                      fontSize: 'clamp(15px, 1.2vw, 17px)',
                      lineHeight: 1.8,
                      color: 'var(--ink)',
                      whiteSpace: 'pre-wrap',
                      margin: 0,
                    }}
                  >
                    {workshop.description}
                  </p>
                </Reveal>
              )}

              {/* Workshop date(s) */}
              <Reveal>
                <span className="eyebrow">
                  <T th="กำหนดการ" en="when" />
                </span>
                <h2 className="display-th" style={{ fontSize: 'clamp(28px, 3.5vw, 40px)', margin: '14px 0 20px' }}>
                  <T th="วันที่จัดกิจกรรม" en="Workshop dates" />
                </h2>
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'flex-start',
                    gap: 16,
                    maxWidth: '100%',
                  }}
                >
                  <span style={{ fontSize: 24, lineHeight: 1, marginTop: 2 }}>📅</span>
                  <div style={{ minWidth: 0 }}>
                    {workshopType === 'multi_day' && workshop.end_date ? (
                      <>
                        <div style={{ fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--teal-deep)', marginBottom: 4 }}>
                          {tr(lang, 'จัดต่อเนื่อง', 'Consecutive days')}
                        </div>
                        <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink)', lineHeight: 1.5 }}>
                          {fmtFullDate(workshop.date)}
                          <span style={{ color: 'var(--muted)', margin: '0 8px' }}>→</span>
                          {fmtFullDate(workshop.end_date)}
                        </div>
                      </>
                    ) : workshopType === 'multi_part' && partDates.length > 0 ? (
                      <>
                        <div style={{ fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--teal-deep)', marginBottom: 6 }}>
                          {tr(lang, `แบ่งเป็น ${partDates.length} วัน`, `${partDates.length} sessions`)}
                        </div>
                        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {partDates.map((d, idx) => (
                            <li key={d} style={{ fontSize: 15.5, fontWeight: 600, color: 'var(--ink)', display: 'flex', gap: 8 }}>
                              <span className="mono" style={{ color: 'var(--teal)', fontWeight: 500 }}>
                                {String(idx + 1).padStart(2, '0')}
                              </span>
                              {fmtFullDate(d)}
                            </li>
                          ))}
                        </ul>
                      </>
                    ) : (
                      <>
                        <div style={{ fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--teal-deep)', marginBottom: 4 }}>
                          {tr(lang, 'จัดวันเดียว', 'One day')}
                        </div>
                        <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink)', lineHeight: 1.5 }}>
                          {fmtFullDate(workshop.date)}
                        </div>
                      </>
                    )}
                    <div style={{ fontSize: 13.5, color: 'var(--muted)', marginTop: 8 }}>
                      {tr(lang, 'เวลา', 'Time')} {workshop.time_start}–{workshop.time_end} {tr(lang, 'น.', '')}
                    </div>
                    {workshop.admission_type === 'selection' && workshop.announce_at && (
                      <div style={{ fontSize: 13.5, color: 'var(--teal-deep)', marginTop: 6, fontWeight: 600 }}>
                        📣 {tr(lang, 'ประกาศผลคัดเลือก', 'Results announced')}: {fmtDateTime(workshop.announce_at, lang, 'long')}
                      </div>
                    )}
                  </div>
                </div>
              </Reveal>

              {/* Target audience — who this workshop is for */}
              {targetItems.length > 0 && (
                <Reveal>
                  <span className="eyebrow">
                    <T th="เหมาะกับใคร" en="who it's for" />
                  </span>
                  <h2 className="display-th" style={{ fontSize: 'clamp(28px, 3.5vw, 40px)', margin: '14px 0 24px' }}>
                    <T th="กิจกรรมนี้เหมาะกับใคร" en="Who it's for" />
                  </h2>
                  <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 40px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {targetItems.map((item, idx) => (
                      <li key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                        <span style={{ flexShrink: 0, marginTop: 2, fontSize: 20, lineHeight: 1 }}>👥</span>
                        <span style={{ fontSize: 16, lineHeight: 1.6, color: 'var(--ink)' }}>{item}</span>
                      </li>
                    ))}
                  </ul>
                </Reveal>
              )}

              {/* Learn */}
              {learnItems.length > 0 && (
                <Reveal>
                  <span className="eyebrow">
                    <T th="ที่คุณจะได้กลับไป" en="what you'll take back" />
                  </span>
                  <h2 className="display-th" style={{ fontSize: 'clamp(28px, 3.5vw, 40px)', margin: '14px 0 24px' }}>
                    <T th="สิ่งที่คุณจะได้เรียนรู้" en="What you'll learn" />
                  </h2>
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {learnItems.map((item, idx) => (
                      <li key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                        <Star
                          color="var(--accent)"
                          style={{ width: 22, height: 22, flexShrink: 0, marginTop: 2 }}
                        />
                        <span style={{ fontSize: 16, lineHeight: 1.6, color: 'var(--ink)' }}>{item}</span>
                      </li>
                    ))}
                  </ul>
                </Reveal>
              )}

              {/* Timeline — accordion: days listed, click to expand activities */}
              {scheduleDays.length > 0 && (() => {
                const dayLabel = (d: { label: string }, i: number) =>
                  d.label.trim() || tr(lang, `วันที่ ${i + 1}`, `Day ${i + 1}`);
                const multi = scheduleDays.length > 1;
                const toggleDay = (i: number) =>
                  setOpenDays((prev) =>
                    prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i],
                  );

                const renderItems = (items: { time: string; detail: string }[]) => (
                  <ol
                    style={{
                      listStyle: 'none',
                      padding: '0 0 0 24px',
                      margin: 0,
                      borderLeft: '2px dashed var(--teal-200)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 28,
                    }}
                  >
                    {items.map((item, idx) => (
                      <li key={idx} style={{ position: 'relative' }}>
                        <span
                          style={{
                            position: 'absolute',
                            left: -33,
                            top: 4,
                            width: 16,
                            height: 16,
                            borderRadius: '50%',
                            background: 'var(--teal)',
                            boxShadow: '0 0 0 4px var(--paper)',
                          }}
                        />
                        <div
                          className="mono"
                          style={{
                            fontSize: 12,
                            color: 'var(--teal)',
                            fontWeight: 600,
                            letterSpacing: '.06em',
                            textTransform: 'uppercase',
                          }}
                        >
                          {item.time || '—'}
                        </div>
                        <p style={{ fontSize: 16, lineHeight: 1.6, color: 'var(--ink)', margin: '4px 0 0' }}>
                          {item.detail}
                        </p>
                      </li>
                    ))}
                  </ol>
                );

                return (
                  <Reveal>
                    <span className="eyebrow">
                      <T th="ตารางวันนั้น" en="that day's schedule" />
                    </span>
                    <h2 className="display-th" style={{ fontSize: 'clamp(28px, 3.5vw, 40px)', margin: '14px 0 24px' }}>
                      <T th="ตารางกิจกรรม" en="Timeline" />
                    </h2>

                    {!multi ? (
                      renderItems(scheduleDays[0].items)
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {scheduleDays.map((d, i) => {
                          const open = openDays.includes(i);
                          return (
                            <div
                              key={i}
                              style={{
                                borderRadius: 16,
                                boxShadow: 'inset 0 0 0 1px var(--cream-deep)',
                                overflow: 'hidden',
                                background: open ? 'var(--paper)' : 'transparent',
                              }}
                            >
                              <button
                                type="button"
                                onClick={() => toggleDay(i)}
                                aria-expanded={open}
                                style={{
                                  width: '100%',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  gap: 12,
                                  padding: '16px 20px',
                                  background: 'none',
                                  border: 0,
                                  cursor: 'pointer',
                                  textAlign: 'left',
                                }}
                              >
                                <span style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                                  <span
                                    className="mono"
                                    style={{ fontSize: 13, fontWeight: 600, color: 'var(--teal)' }}
                                  >
                                    {String(i + 1).padStart(2, '0')}
                                  </span>
                                  <span style={{ fontSize: 16.5, fontWeight: 600, color: 'var(--ink)' }}>
                                    {dayLabel(d, i)}
                                  </span>
                                  <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>
                                    · {d.items.length} {tr(lang, 'กิจกรรม', 'items')}
                                  </span>
                                </span>
                                <span
                                  aria-hidden
                                  style={{
                                    fontSize: 13,
                                    color: 'var(--teal)',
                                    transform: open ? 'rotate(180deg)' : 'none',
                                    transition: 'transform .2s ease',
                                    flexShrink: 0,
                                  }}
                                >
                                  ▼
                                </span>
                              </button>
                              {open && (
                                <div style={{ padding: '4px 20px 22px' }}>
                                  {d.items.length > 0 ? (
                                    renderItems(d.items)
                                  ) : (
                                    <p style={{ fontSize: 14, color: 'var(--muted)', margin: 0 }}>
                                      {tr(lang, 'ยังไม่มีรายละเอียดสำหรับวันนี้', 'No schedule for this day yet')}
                                    </p>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </Reveal>
                );
              })()}

              {/* Facilitators — one card per person, in the admin's order */}
              {instructors.length > 0 && (
                <Reveal>
                  <span className="eyebrow">
                    <T th="ผู้นำกิจกรรม" en="facilitator" />
                  </span>
                  <h2
                    className="display-th"
                    style={{ fontSize: 'clamp(28px, 3.5vw, 40px)', margin: '14px 0 24px' }}
                  >
                    <T th="คนที่จะอยู่กับคุณทั้งวัน" en="Who'll be with you all day" />
                  </h2>
                  <div style={{ display: 'grid', gap: 16 }}>
                  {instructors.map((ins) => (
                  <div
                    key={ins.id}
                    style={{
                      display: 'flex',
                      gap: 24,
                      alignItems: 'flex-start',
                      padding: 24,
                      borderRadius: 22,
                      background: 'var(--paper)',
                      boxShadow: 'inset 0 0 0 1px var(--cream-deep)',
                      flexWrap: 'wrap',
                    }}
                  >
                    <div
                      style={{
                        width: 96,
                        height: 96,
                        borderRadius: 18,
                        background: 'var(--teal-50)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        overflow: 'hidden',
                      }}
                    >
                      {ins.avatar_url ? (
                        <img
                          src={ins.avatar_url}
                          alt={ins.name}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      ) : (
                        <span
                          style={{
                            fontFamily: 'Mitr, sans-serif',
                            fontSize: 44,
                            fontWeight: 500,
                            color: 'var(--teal-deep)',
                          }}
                        >
                          {ins.name[0]?.toUpperCase() || '?'}
                        </span>
                      )}
                    </div>
                    <div style={{ flex: 1, minWidth: 220 }}>
                      <div
                        className="mono"
                        style={{
                          fontSize: 11,
                          color: 'var(--muted)',
                          letterSpacing: '.12em',
                          textTransform: 'uppercase',
                          marginBottom: 6,
                        }}
                      >
                        {ins.role === 'teacher'
                          ? tr(lang, 'ผู้สอน · LEAD FACILITATOR', 'instructor · lead facilitator')
                          : ins.role === 'admin'
                            ? tr(lang, 'ผู้ก่อตั้ง & LEAD FACILITATOR', 'founder & lead facilitator')
                            : tr(lang, 'ผู้ดูแลกิจกรรม', 'host')}
                      </div>
                      <h3
                        className="display-th"
                        style={{ fontSize: 22, margin: '0 0 10px', lineHeight: 1.25 }}
                      >
                        {ins.name}
                      </h3>
                      <p
                        style={{
                          fontSize: 14.5,
                          color: 'var(--muted)',
                          lineHeight: 1.65,
                          margin: '0 0 14px',
                        }}
                      >
                        <T
                          th="ผู้ที่ออกแบบและนำกิจกรรมนี้ — เตรียมพื้นที่ให้คุณได้เรียนรู้แบบสบาย ๆ"
                          en="Designs and leads this workshop — creating space for unhurried learning"
                        />
                      </p>
                      {ins.portfolio_id && (
                        <Link
                          href={`/p/${ins.portfolio_id}`}
                          style={{
                            color: 'var(--teal)',
                            fontWeight: 600,
                            fontSize: 14,
                            textDecoration: 'none',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                          }}
                        >
                          <T
                            th="ดูผลงานของผู้สอน"
                            en="See the facilitator's portfolio"
                          />{' '}
                          <span className="mono">→</span>
                        </Link>
                      )}
                    </div>
                  </div>
                  ))}
                  </div>
                </Reveal>
              )}

              {/* How to find us — map + address */}
              {locationLabel && (
                <Reveal>
                  <span className="eyebrow">
                    <T th="สถานที่ · แผนที่" en="location + map" />
                  </span>
                  <h2
                    className="display-th"
                    style={{ fontSize: 'clamp(28px, 3.5vw, 40px)', margin: '14px 0 8px' }}
                  >
                    <T th="วิธีมาหาเรา" en="How to find us" />
                  </h2>
                  <p
                    style={{
                      fontSize: 14.5,
                      color: 'var(--muted)',
                      margin: '0 0 20px',
                      maxWidth: 600,
                      lineHeight: 1.6,
                    }}
                  >
                    <T
                      th="แผนที่ของเรา · กดปุ่ม Google Maps เพื่อเปิดดูเส้นทาง landmark ระหว่างทาง"
                      en="Our location · tap Google Maps to see directions and landmarks along the way"
                    />
                  </p>

                  <FindUs
                    locationLabel={locationLabel}
                    /* Prefer the map link from the linked location master-data;
                       fall back to the (legacy) per-workshop override if set. */
                    mapUrl={location?.map_url ?? workshop.map_url}
                    location={location}
                  />
                </Reveal>
              )}
            </div>

            {/* Poster (static) + sticky booking card */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div
                className="ph ph-teal-100"
                style={{ aspectRatio: '297 / 420', borderRadius: 22, overflow: 'hidden', position: 'relative' }}
              >
                {workshop.image_url ? (
                  <img
                    src={workshop.image_url}
                    alt={workshop.title}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  <>
                    <Cloud
                      color="var(--teal)"
                      stroke={3}
                      style={{ position: 'absolute', top: 24, right: 24, width: 88, height: 56 }}
                    />
                    <WaveLine
                      color="var(--teal-200)"
                      stroke={2.5}
                      style={{ position: 'absolute', bottom: 24, left: 24, right: 24, width: 'calc(100% - 48px)', height: 36 }}
                      count={2}
                    />
                  </>
                )}
              </div>

              <div
                style={{
                  position: 'sticky',
                  top: 100,
                  background: 'var(--paper)',
                  borderRadius: 24,
                  padding: 32,
                  boxShadow: '0 12px 40px -16px rgba(13,30,29,.15)',
                }}
              >
                <BookingCardContent
                  workshop={workshop}
                  spotsLeft={spotsLeft}
                  bookingCount={bookingCount}
                  userBooking={userBooking}
                  userAttended={userAttended}
                  userCompleted={userCompleted}
                  userIncompleteReason={userIncompleteReason}
                  userReview={userReview}
                  booking={booking}
                  onBook={handleBookClick}
                  onResume={resumePayment}
                  onReview={() => setReviewOpen(true)}
                  onViewApplication={() => setConsentOpen(true)}
                  lang={lang}
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      <style jsx>{`
        @media (max-width: 920px) {
          .ws-detail-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>

      {bookingOpen && (
        <BookingModal
          onClose={() => setBookingOpen(false)}
          workshop={workshop}
          submitting={booking}
          onSubmit={(application) => handleBooking(application)}
        />
      )}

      {loginPromptOpen && (
        <LoginPromptModal
          redirectTo={`/workshops/${id}`}
          onClose={() => setLoginPromptOpen(false)}
          lang={lang}
        />
      )}

      {reviewOpen && (
        <ReviewModal
          workshopId={workshop.id}
          workshopTitle={workshop.title}
          initial={null}
          onClose={() => setReviewOpen(false)}
          onSaved={(review) => {
            setUserReview(review);
            setReviewOpen(false);
          }}
        />
      )}

      {consentOpen && userBooking && (
        <ApplicationConsentModal
          bookingId={userBooking.id}
          applicationJson={userBooking.application_json}
          workshopTitle={workshop.title}
          requireConsent={workshop.require_consent === 1}
          onClose={() => setConsentOpen(false)}
          onSaved={(consent) => {
            // Reflect the new consent locally so re-opening shows the saved value.
            setUserBooking((prev) => {
              if (!prev) return prev;
              let app: Record<string, unknown> = {};
              try { app = prev.application_json ? JSON.parse(prev.application_json) : {}; } catch { app = {}; }
              app.consent = { photoVideo: consent, label: consent === 'granted' ? 'ยินยอม' : 'ไม่ยินยอม' };
              return { ...prev, application_json: JSON.stringify(app) };
            });
          }}
        />
      )}
    </>
  );
}

function BookingCardContent({
  workshop,
  spotsLeft,
  bookingCount,
  userBooking,
  userAttended,
  userCompleted,
  userIncompleteReason,
  userReview,
  booking,
  onBook,
  onResume,
  onReview,
  onViewApplication,
  lang,
}: {
  workshop: Workshop;
  spotsLeft: number;
  bookingCount: number;
  userBooking: UserBooking | null;
  userAttended: boolean;
  userCompleted: boolean;
  userIncompleteReason: string | null;
  userReview: Review | null;
  booking: boolean;
  onBook: () => void;
  onResume: () => void;
  onReview: () => void;
  onViewApplication: () => void;
  lang: 'th' | 'en';
}) {
  const eff = getEffectivePrice(workshop);
  // Show "Free" when the payment model is free OR the effective price is ฿0.
  const isFree = (workshop.payment_type || 'paid') === 'free' || eff.price <= 0;
  const pct =
    workshop.max_participants > 0
      ? Math.round((bookingCount / workshop.max_participants) * 100)
      : 0;
  const lowSeats = spotsLeft > 0 && spotsLeft <= 4;
  const isSelection = workshop.admission_type === 'selection';
  const paymentType = workshop.payment_type || 'paid';
  // Organizer/admin cancelled the whole event → no booking, show the reason.
  const cancelled = workshop.status === 'cancelled';
  // Event finished → block any new booking.
  const ended = hasWorkshopEnded(workshop);
  // First day already under way → registration closes (matches the "ปิดรับ"
  // badge in listings). Multi-day events must not accept joiners mid-run.
  const started = hasWorkshopStarted(workshop);
  // Currently taking place (start → last day's end) — multi-day aware.
  const ongoing = isWorkshopOngoing(workshop);
  const wsDays = getWorkshopDays(workshop);
  const lastDay = wsDays[wsDays.length - 1] || workshop.date;
  // Selection result the user is allowed to see (masked until announcement).
  const visStatus = userBooking ? visibleAppStatus(workshop, userBooking.app_status ?? 'applied') : null;
  const isRejected = isSelection && visStatus === 'rejected';
  // Selection accepts applications beyond capacity (waitlist), so the "sold
  // out" gate only applies to direct booking.
  const soldOut = !isSelection && spotsLeft <= 0;
  // A live selection application this user already submitted (track, don't re-apply).
  const hasApplied =
    isSelection &&
    !!userBooking &&
    userBooking.payment_status !== 'paid' &&
    userBooking.status !== 'confirmed' &&
    visStatus !== 'rejected';
  const isPaid = !!userBooking && userBooking.payment_status === 'paid';
  // Has a secured seat (paid or confirmed) — eligible to view the application.
  const booked = !!userBooking && (userBooking.payment_status === 'paid' || userBooking.status === 'confirmed');
  // A pending booking with an expires_at in the future = user has a live hold
  const hasLiveHold =
    !!userBooking &&
    !isPaid &&
    !!userBooking.expires_at &&
    sqliteToMs(userBooking.expires_at) > Date.now();
  // Direct booking submitted but not paid (incl. abandoned checkout / expired
  // hold) → let the user resume payment instead of re-applying.
  const owesPayment =
    !isSelection &&
    !!userBooking &&
    userBooking.payment_status === 'pending' &&
    userBooking.status !== 'cancelled' &&
    paymentType !== 'free';

  return (
    <>
      {/* Price */}
      <div
        className="mono"
        style={{
          fontSize: 10.5,
          letterSpacing: '.12em',
          textTransform: 'uppercase',
          color: 'var(--muted)',
        }}
      >
        {isFree ? tr(lang, 'ค่าเข้าร่วม', 'Entry') : tr(lang, 'ราคา / ที่นั่ง', 'Per seat')}
      </div>

      {isFree ? (
        <div style={{ fontFamily: 'var(--font-display-th)', fontWeight: 600, fontSize: 'clamp(36px, 4vw, 42px)', color: 'var(--teal)', letterSpacing: '-.02em', lineHeight: 1, margin: '4px 0 6px' }}>
          {tr(lang, 'ฟรี', 'Free')}
        </div>
      ) : eff.isPromo ? (
        <div style={{ marginTop: 4 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <span
              style={{
                fontFamily: 'var(--font-display-th)', fontWeight: 600,
                fontSize: 'clamp(36px, 4vw, 42px)',
                color: 'var(--teal)',
                letterSpacing: '-.02em',
                lineHeight: 1,
              }}
            >
              ฿{eff.price.toLocaleString()}
            </span>
            <span
              style={{
                fontSize: 16,
                color: 'var(--muted)',
                textDecoration: 'line-through',
              }}
            >
              ฿{eff.originalPrice.toLocaleString()}
            </span>
            <span style={{ background: 'var(--accent)', color: 'var(--ink)', fontWeight: 700, fontSize: 13, borderRadius: 8, padding: '2px 8px', lineHeight: 1.4 }}>
              {tr(lang, 'ลด', 'Save')} {Math.round((1 - eff.price / eff.originalPrice) * 100)}%
            </span>
          </div>
          {eff.promoEnd && <PromoCountdown endsAt={eff.promoEnd} lang={lang} />}
        </div>
      ) : (
        <div
          style={{
            fontFamily: 'var(--font-display-th)', fontWeight: 600,
            fontSize: 'clamp(36px, 4vw, 42px)',
            color: 'var(--ink)',
            letterSpacing: '-.02em',
            lineHeight: 1,
            margin: '4px 0 6px',
          }}
        >
          ฿{eff.price.toLocaleString()}
        </div>
      )}

      {paymentType === 'deposit' && (
        <div style={{ fontSize: 12.5, color: 'var(--teal-deep)', margin: '0 0 6px', fontWeight: 600 }}>
          {tr(lang, `มัดจำ ฿${(workshop.deposit_amount || 0).toLocaleString()} · คืนได้วันงาน (โอนเท่านั้น)`, `Deposit ฿${(workshop.deposit_amount || 0).toLocaleString()} · refundable on event day (transfer only)`)}
        </div>
      )}

      {workshop.short_description && (
        <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: '6px 0 22px', lineHeight: 1.5 }}>
          {workshop.short_description}
        </p>
      )}

      {/* Seat progress */}
      <div style={{ marginBottom: 18 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 12,
            marginBottom: 8,
          }}
        >
          <span
            className="mono"
            style={{
              color: 'var(--muted)',
              letterSpacing: '.06em',
              textTransform: 'uppercase',
            }}
          >
            {isSelection ? tr(lang, 'ที่นั่งทั้งหมด', 'Total seats') : tr(lang, 'ที่นั่งที่จองแล้ว', 'Booked')}
          </span>
          <span style={{ fontWeight: 600, color: 'var(--ink)' }}>
            {bookingCount}/{workshop.max_participants}
          </span>
        </div>
        <div
          style={{
            height: 8,
            borderRadius: 99,
            background: 'var(--cream)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${Math.min(100, pct)}%`,
              background: pct >= 80 ? '#e25c3b' : 'var(--teal)',
              borderRadius: 99,
              transition: 'width 1s ease',
            }}
          />
        </div>
        {lowSeats && (
          <div
            style={{
              fontSize: 12.5,
              color: '#a04a14',
              marginTop: 10,
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: 5,
            }}
          >
            ⚠ {tr(lang, `เหลือเพียง ${spotsLeft} ที่นั่ง`, `Only ${spotsLeft} seats left`)}
          </div>
        )}
      </div>

      {/* Announcement date + countdown for selection workshops */}
      {isSelection && workshop.announce_at && !isRejected && !ended && (
        <div style={{ marginBottom: 14 }}>
          <AnnounceCountdown
            announceAt={workshop.announce_at}
            heading={
              hasApplied
                ? tr(lang, 'คุณสมัครแล้ว — รอประกาศผลวันที่', "You've applied — results on")
                : tr(lang, 'ประกาศผลคัดเลือก', 'Results announcement')
            }
          />
        </div>
      )}

      {/* Primary action */}
      {cancelled ? (
        <div
          style={{ width: '100%', textAlign: 'center', fontSize: 14.5, fontWeight: 600, color: '#b3261e', background: '#fdeceb', border: '1px solid #f3c9c5', borderRadius: 14, padding: '15px 18px', lineHeight: 1.6 }}
        >
          {tr(lang, 'กิจกรรมมีการเปลี่ยนแปลงกำหนดการ', 'This event has been changed / cancelled')}
        </div>
      ) : ended ? (
        userCompleted ? (
          userReview ? (
            // A review is one-time and immutable — show it read-only, no edit.
            <div
              style={{
                background: 'var(--cream)',
                borderRadius: 16,
                padding: '16px 18px',
                border: '1px solid var(--cream-deep)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                <span className="mono" style={{ fontSize: 11, color: 'var(--muted)', letterSpacing: '.1em', textTransform: 'uppercase' }}>
                  {tr(lang, 'รีวิวของคุณ', 'Your review')}
                </span>
                <span style={{ color: '#f5b301', letterSpacing: 2, fontSize: 15 }}>
                  {'★'.repeat(userReview.rating)}
                  <span style={{ color: 'var(--cream-deep)' }}>{'★'.repeat(5 - userReview.rating)}</span>
                </span>
              </div>
              {userReview.comment && (
                <p style={{ fontSize: 13.5, color: 'var(--ink)', lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap' }}>
                  {userReview.comment}
                </p>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={onReview}
              className="btn btn-teal"
              style={{ width: '100%', justifyContent: 'center', fontSize: 15, padding: '15px 22px' }}
            >
              {tr(lang, 'รีวิวกิจกรรม', 'Review workshop')} <span aria-hidden>★</span>
            </button>
          )
        ) : (
          <button
            type="button"
            disabled
            className="btn"
            style={{ width: '100%', justifyContent: 'center', fontSize: 15, padding: '15px 22px', background: 'var(--cream-deep)', color: 'var(--muted)', cursor: 'not-allowed' }}
          >
            {userIncompleteReason === 'incomplete_days'
              ? tr(lang, 'เงื่อนไขเวลาเข้าร่วมไม่ครบถ้วน', 'Attendance requirement not met')
              : userIncompleteReason === 'not_registered'
                ? tr(lang, 'เกินกำหนดเวลาลงทะเบียน', 'Missed the registration window')
                : tr(lang, 'กิจกรรมจบแล้ว', 'Event ended')}
          </button>
        )
      ) : isPaid ? (
        <>
          <Countdown
            date={workshop.date}
            timeStart={workshop.time_start}
            timeEnd={workshop.time_end}
            endDate={lastDay}
          />
          {/* While the event is ongoing, booked users can view their application
              and edit only the PDPA consent. */}
          {ongoing && booked && (
            <button
              type="button"
              onClick={onViewApplication}
              className="btn btn-paper"
              style={{ width: '100%', justifyContent: 'center', marginTop: 10 }}
            >
              {tr(lang, 'ดูใบสมัคร', 'View application')}
            </button>
          )}
        </>
      ) : isRejected ? (
        <button
          type="button"
          disabled
          className="btn"
          style={{ width: '100%', justifyContent: 'center', fontSize: 15, padding: '15px 22px', background: '#fde7d3', color: '#a04a14', cursor: 'not-allowed' }}
        >
          {tr(lang, 'สิทธิ์การเข้าร่วมเต็มแล้ว', 'Participation slots are full')}
        </button>
      ) : owesPayment ? (
        <>
          {hasLiveHold && <HoldCountdown expiresAt={userBooking!.expires_at!} lang={lang} />}
          <button
            type="button"
            onClick={onResume}
            disabled={booking}
            className="btn btn-teal"
            style={{
              width: '100%',
              justifyContent: 'center',
              fontSize: 15,
              padding: '15px 22px',
              marginTop: hasLiveHold ? 12 : 0,
              marginBottom: 10,
            }}
          >
            {booking ? tr(lang, 'กำลังโหลด...', 'Loading...') : tr(lang, 'ดำเนินการต่อ', 'Continue')}{' '}
            <span className="mono">→</span>
          </button>
          <Link href="/me/bookings" style={{ display: 'block', textAlign: 'center', fontSize: 12.5, color: 'var(--muted)', textDecoration: 'underline', textUnderlineOffset: 3 }}>
            {tr(lang, 'จัดการการจอง', 'Manage booking')}
          </Link>
        </>
      ) : hasApplied ? (
        <Link
          href="/me/bookings"
          className="btn btn-teal"
          style={{ width: '100%', justifyContent: 'center', fontSize: 15, padding: '15px 22px', marginBottom: 10 }}
        >
          {tr(lang, 'ดูสถานะการสมัคร', 'View application status')} <span className="mono">→</span>
        </Link>
      ) : started ? (
        <button
          type="button"
          disabled
          className="btn"
          style={{ width: '100%', justifyContent: 'center', fontSize: 15, padding: '15px 22px', background: 'var(--cream-deep)', color: 'var(--muted)', cursor: 'not-allowed' }}
        >
          {tr(lang, 'ปิดรับสมัคร — กิจกรรมเริ่มแล้ว', 'Registration closed — event started')}
        </button>
      ) : (
        <>
          <button
            type="button"
            onClick={onBook}
            disabled={booking || soldOut}
            className="btn btn-teal"
            style={{
              width: '100%',
              justifyContent: 'center',
              fontSize: 15,
              padding: '15px 22px',
              marginBottom: 10,
            }}
          >
            {booking
              ? tr(lang, 'กำลังดำเนินการ...', 'Processing...')
              : soldOut
                ? tr(lang, 'เต็มแล้ว', 'Sold out')
                : isSelection
                  ? tr(lang, 'สมัครเข้าร่วม', 'Apply to join')
                  : tr(lang, 'จองที่นั่งเลย', 'Book a seat')}{' '}
            <span className="mono">→</span>
          </button>
        </>
      )}

      {/* Join link — online workshops only, and only once the seat is secured.
          The API withholds `online_url` from everyone else, so its presence is
          already the permission check; `booked` just avoids a flash. */}
      {!!workshop.is_online && booked && workshop.online_url && (
        <JoinOnlineButton workshop={workshop} lang={lang} />
      )}

      {/* Perks list */}
      <ul
        style={{
          listStyle: 'none',
          padding: 0,
          margin: '22px 0 0',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          fontSize: 13,
          color: 'var(--muted)',
        }}
      >
        {[
          tr(lang, 'จองที่นั่งทันที · ชำระเงินภายใน 30 นาที', 'Seat held instantly · pay within 30 minutes'),
          tr(lang, 'ที่นั่งจำกัด · ชำระแล้วไม่คืนเงิน', 'Limited seats · paid bookings non-refundable'),
        ].map((line) => (
          <li key={line} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: 'var(--teal)', fontWeight: 700, flexShrink: 0 }}>✓</span>
            {line}
          </li>
        ))}
      </ul>
    </>
  );
}

/**
 * Guests who tap the booking CTA get this instead of the application form — a
 * prompt to sign in or register, each carrying a redirect back to the workshop.
 */
function LoginPromptModal({
  redirectTo,
  onClose,
  lang,
}: {
  redirectTo: string;
  onClose: () => void;
  lang: 'th' | 'en';
}) {
  const q = `redirect=${encodeURIComponent(redirectTo)}`;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
        <button
          type="button"
          onClick={onClose}
          aria-label={tr(lang, 'ปิด', 'Close')}
          style={{ position: 'absolute', top: 16, right: 18, background: 'none', border: 0, fontSize: 22, lineHeight: 1, color: 'var(--muted)', cursor: 'pointer' }}
        >
          ×
        </button>
        <div className="mono" style={{ fontSize: 11, color: 'var(--teal)', letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: 10 }}>
          {tr(lang, 'ต้องเข้าสู่ระบบก่อน', 'Sign in required')}
        </div>
        <h3 className="display-th" style={{ fontSize: 22, margin: '0 0 12px', lineHeight: 1.3 }}>
          {tr(lang, 'เข้าสู่ระบบเพื่อจองที่นั่ง', 'Sign in to book a seat')}
        </h3>
        <p style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.6, margin: '0 0 24px' }}>
          {tr(lang, 'กรุณาเข้าสู่ระบบหรือสมัครสมาชิกก่อน เพื่อดำเนินการจองและกรอกใบสมัคร', 'Please sign in or create an account to continue with your booking.')}
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Link href={`/auth/login?${q}`} className="btn btn-teal" style={{ width: '100%', justifyContent: 'center', fontSize: 15, padding: '14px 22px' }}>
            {tr(lang, 'เข้าสู่ระบบ', 'Sign in')} <span className="mono">→</span>
          </Link>
          <Link href={`/auth/register?${q}`} className="btn" style={{ width: '100%', justifyContent: 'center', background: 'var(--cream)', color: 'var(--ink)', fontSize: 14, padding: '13px 22px' }}>
            {tr(lang, 'สมัครสมาชิก', 'Create an account')}
          </Link>
        </div>
      </div>
    </div>
  );
}

/**
 * 10-minute (or whatever the server set) hold countdown for a pending booking.
 * Reloads the page when it hits zero so the seat-released state is reflected.
 */
function HoldCountdown({ expiresAt, lang }: { expiresAt: string; lang: 'th' | 'en' }) {
  const target = sqliteToMs(expiresAt);
  const [now, setNow] = useState<number>(0);

  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (now === 0) {
    return (
      <div
        style={{ background: 'var(--cream)', borderRadius: 14, height: 76 }}
        aria-hidden
      />
    );
  }

  const remain = Math.max(0, target - now);
  if (remain === 0) {
    return (
      <div
        style={{
          padding: '14px 16px',
          background: 'var(--cream)',
          borderRadius: 14,
          textAlign: 'center',
          fontSize: 13,
          color: '#a04a14',
          fontWeight: 600,
        }}
      >
        {tr(lang, 'หมดเวลาจองชั่วคราว · ที่นั่งถูกปล่อยแล้ว', 'Hold expired · seat released')}
      </div>
    );
  }

  const minutes = Math.floor(remain / 60000);
  const seconds = Math.floor((remain % 60000) / 1000);
  const fmt = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  const urgent = remain < 2 * 60 * 1000; // last 2 mins → emphasise

  return (
    <div
      style={{
        padding: '14px 16px',
        background: urgent ? '#a04a14' : 'var(--ink)',
        color: '#fff',
        borderRadius: 14,
        textAlign: 'center',
        transition: 'background .25s ease',
      }}
    >
      <div
        className="mono"
        style={{
          fontSize: 10.5,
          letterSpacing: '.16em',
          textTransform: 'uppercase',
          color: 'var(--accent)',
          fontWeight: 600,
          marginBottom: 4,
        }}
      >
        ⏱ {tr(lang, 'ที่นั่งถูก hold ไว้', 'Seat on hold')}
      </div>
      <div
        style={{
          fontFamily: 'Archivo Black, monospace',
          fontSize: 28,
          letterSpacing: '.06em',
          lineHeight: 1,
        }}
      >
        {fmt}
      </div>
      <div style={{ fontSize: 11, opacity: 0.8, marginTop: 4 }}>
        {tr(
          lang,
          'จ่ายให้ทันก่อนหมดเวลา ไม่งั้นที่นั่งจะถูกปล่อย',
          'Pay before the timer runs out or the seat is released'
        )}
      </div>
    </div>
  );
}

/**
 * Decide what to embed + where the "Open in Maps" button should point.
 * Priority:
 *   1. `<iframe src="...">` paste → use the extracted src verbatim.
 *   2. Embed URL already → use as-is.
 *   3. URL with coords (`@LAT,LNG` / `?q=lat,lng` / `!3d...!4d...`) → build a
 *      coords-pinned embed so the map shows the exact place.
 *   4. Short link (`maps.app.goo.gl/...`) → returns shouldResolve=true so the
 *      component can call /api/maps/resolve to follow the redirect.
 *   5. Anything else → fall back to a geocoded search by address.
 */
function resolveMapUrls(
  mapUrl: string | null | undefined,
  addressFallback: string
): { embedSrc: string; openUrl: string; shouldResolve: boolean } {
  const query = encodeURIComponent(addressFallback);
  const addrEmbed = `https://maps.google.com/maps?q=${query}&output=embed`;
  const addrOpen = `https://www.google.com/maps/search/?api=1&query=${query}`;

  if (!mapUrl || !mapUrl.trim()) {
    return { embedSrc: addrEmbed, openUrl: addrOpen, shouldResolve: false };
  }

  const iframeMatch = mapUrl.match(/<iframe[^>]*\bsrc=["']([^"']+)["']/i);
  if (iframeMatch) {
    return { embedSrc: iframeMatch[1], openUrl: iframeMatch[1], shouldResolve: false };
  }

  const u = mapUrl.trim();

  if (u.includes('/maps/embed') || u.includes('output=embed')) {
    return { embedSrc: u, openUrl: u, shouldResolve: false };
  }

  const coords = parseMapCoords(u);
  if (coords) {
    return {
      embedSrc: coordsToEmbedSrc(coords.lat, coords.lng, coords.zoom),
      openUrl: u,
      shouldResolve: false,
    };
  }

  // Short link: open button works, embed has to wait for /api/maps/resolve
  if (isShortMapLink(u)) {
    return { embedSrc: addrEmbed, openUrl: u, shouldResolve: true };
  }

  return { embedSrc: addrEmbed, openUrl: u, shouldResolve: false };
}

function FindUs({
  locationLabel,
  mapUrl,
  location,
}: {
  locationLabel: string;
  mapUrl: string | null;
  location: Location | null;
}) {
  const { lang } = useLang();
  const [copied, setCopied] = useState(false);
  const coverImage = (() => {
    if (!location?.gallery_json) return null;
    try {
      const arr = JSON.parse(location.gallery_json) as string[];
      return Array.isArray(arr) && arr.length ? arr[0] : null;
    } catch {
      return null;
    }
  })();
  const initial = resolveMapUrls(mapUrl, locationLabel);
  const [embedSrc, setEmbedSrc] = useState(initial.embedSrc);
  const openUrl = initial.openUrl;

  // Follow short link server-side to pull out real coords
  useEffect(() => {
    if (!initial.shouldResolve || !mapUrl) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/maps/resolve?url=${encodeURIComponent(mapUrl)}`);
        if (!res.ok) return;
        const data = (await res.json()) as { finalUrl?: string };
        if (cancelled || !data.finalUrl) return;
        const coords = parseMapCoords(data.finalUrl);
        if (coords) setEmbedSrc(coordsToEmbedSrc(coords.lat, coords.lng, coords.zoom));
      } catch {
        // network fail — keep the address-fallback embed
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapUrl]);

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(locationLabel);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // older browsers — silent fail
    }
  }

  return (
    <>
      {/* Map */}
      <div
        style={{
          position: 'relative',
          borderRadius: 18,
          overflow: 'hidden',
          background: 'var(--cream)',
          boxShadow: 'inset 0 0 0 1px var(--cream-deep)',
          aspectRatio: '16 / 10',
        }}
      >
        <iframe
          src={embedSrc}
          title="Google Maps"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          style={{ width: '100%', height: '100%', border: 0, display: 'block' }}
        />
        <a
          href={openUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-paper btn-sm"
          style={{
            position: 'absolute',
            top: 14,
            right: 14,
            boxShadow: '0 6px 16px -4px rgba(13,30,29,.25)',
          }}
        >
          Google Maps <span className="mono">↗</span>
        </a>
      </div>

      {/* Address card */}
      <div
        style={{
          marginTop: 20,
          padding: 22,
          background: 'var(--cream)',
          borderRadius: 18,
          display: 'flex',
          gap: 18,
          alignItems: 'flex-start',
          flexWrap: 'wrap',
        }}
      >
        {/* Cover image (first gallery image) */}
        {coverImage && (
          <div
            style={{
              width: 120,
              height: 120,
              borderRadius: 14,
              overflow: 'hidden',
              flexShrink: 0,
              background: 'var(--cream-deep)',
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={coverImage} alt={location?.name || ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
        )}

        <div style={{ flex: 1, minWidth: 200 }}>
          <div
            className="mono"
            style={{
              fontSize: 11,
              color: 'var(--muted)',
              letterSpacing: '.12em',
              textTransform: 'uppercase',
              marginBottom: 8,
            }}
          >
            {tr(lang, 'ที่อยู่', 'Address')}
          </div>
          <div style={{ fontSize: 15, lineHeight: 1.55, marginBottom: 16 }}>{locationLabel}</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            {location && (
              <Link href={`/locations/${location.id}`} className="btn btn-teal btn-sm">
                {tr(lang, 'ดูรายละเอียดสถานที่', 'View location details')} <span className="mono">→</span>
              </Link>
            )}
            <button
              type="button"
              onClick={copyAddress}
              className="btn btn-paper btn-sm"
              style={{ background: 'transparent' }}
            >
              {copied
                ? `✓ ${tr(lang, 'คัดลอกแล้ว', 'Copied')}`
                : tr(lang, 'คัดลอกที่อยู่', 'Copy address')}
            </button>
            <a
              href={openUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-ghost btn-sm"
            >
              {tr(lang, 'เปิด Google Maps', 'Open Google Maps')} <span className="mono">↗</span>
            </a>
          </div>
        </div>
      </div>
    </>
  );
}

/** Promo end countdown — nudges FOMO in the booking box. Thai wall-clock (UTC+7). */
function PromoCountdown({ endsAt, lang }: { endsAt: string; lang: 'th' | 'en' }) {
  const iso = (endsAt.length <= 10 ? endsAt + 'T23:59' : endsAt) + ':00+07:00';
  const target = new Date(iso).getTime();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(id);
  }, []);
  const diff = target - now;
  if (Number.isNaN(target) || diff <= 0) return null;
  const totalMin = Math.floor(diff / 60000);
  const days = Math.floor(totalMin / 1440);
  const hours = Math.floor((totalMin % 1440) / 60);
  const mins = totalMin % 60;
  const left =
    days > 0
      ? tr(lang, `${days} วัน ${hours} ชม.`, `${days}d ${hours}h`)
      : tr(lang, `${hours} ชม. ${mins} นาที`, `${hours}h ${mins}m`);
  return (
    <div style={{ marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 6, background: '#fff3cd', color: '#8a5a00', border: '1px solid #ffe08a', borderRadius: 999, padding: '4px 12px', fontSize: 13, fontWeight: 700 }}>
      ⏳ {tr(lang, 'โปรโมชันเหลือเวลาอีก', 'Promo ends in')} {left}
    </div>
  );
}

/** Join button for an ONLINE workshop. Colour and mark follow the platform the
 *  admin picked; 'other' has no brand mark and shows the typed name instead. */
function JoinOnlineButton({ workshop, lang }: { workshop: Workshop; lang: 'th' | 'en' }) {
  const style = platformStyle(workshop.online_platform);
  const name = platformLabel(workshop.online_platform, workshop.online_platform_other);
  return (
    <a
      href={workshop.online_url || '#'}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        width: '100%',
        padding: '14px 22px',
        borderRadius: 999,
        fontSize: 15,
        fontWeight: 700,
        textDecoration: 'none',
        background: style.bg,
        color: style.fg,
        border: style.border ? `1px solid ${style.border}` : '1px solid transparent',
      }}
    >
      <PlatformMark platform={style.value} />
      {tr(lang, `เข้าร่วมทาง ${name}`, `Join on ${name}`)}
    </a>
  );
}

/** Simple brand-suggestive marks. Drawn inline because the page's CSP blocks
 *  remote images, and 'other' deliberately renders nothing. */
function PlatformMark({ platform }: { platform: string }) {
  if (platform === 'zoom') {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="2" y="6" width="13" height="12" rx="3" fill="currentColor" />
        <path d="M16 11l5-3.2v8.4L16 13v-2z" fill="currentColor" />
      </svg>
    );
  }
  if (platform === 'meet') {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="2" y="6" width="12" height="12" rx="2.5" fill="#1f7a45" />
        <path d="M15 11l6-3.6v9.2L15 13v-2z" fill="#fbbc04" />
        <path d="M15 11l6-3.6V11h-6z" fill="#ea4335" />
      </svg>
    );
  }
  if (platform === 'teams') {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="3" y="5" width="12" height="14" rx="2.5" fill="currentColor" />
        <text x="9" y="15.5" textAnchor="middle" fontSize="9" fontWeight="700" fill="#5059C9">
          T
        </text>
        <circle cx="18.5" cy="8" r="2.6" fill="currentColor" opacity=".85" />
        <path d="M16 12h5v4.2a2.6 2.6 0 01-5 0V12z" fill="currentColor" opacity=".85" />
      </svg>
    );
  }
  return null;
}
