'use client';

import { Suspense, useEffect, useState, useCallback } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import type { WorkshopMaster, Workshop, Location, Review } from '@/lib/types';
import { useLang, T, tr } from '@/lib/i18n';
import { Reveal } from '@/components/design/Reveal';
import { Btn } from '@/components/design/RippleButton';
import { Icon, Stars } from '@/components/design/Icon';
import { useLoadingTracker } from '@/components/design/DataLoading';
import { ShareButton } from '@/components/design/ShareButton';
import { Cloud, WaveLine, Star } from '@/components/design/Doodles';
import { Countdown } from '@/components/design/Countdown';
import { BookingModal, type BookingResult } from '@/components/workshops/BookingModal';
import { SessionPickerModal, type BookingKind, type PickableSession } from '@/components/workshops/SessionPickerModal';
import type { PriceTier } from '@/lib/pricing';
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
  getWorkshopStatusBadge,
} from '@/lib/workshop-utils';
import { learnServerClock } from '@/lib/server-clock';
import { visibleAppStatus } from '@/lib/selection-status';
import { GiftModal } from '@/components/workshops/GiftModal';
import { TransferLinkModal } from '@/components/workshops/TransferLinkModal';
import { platformStyle, platformLabel } from '@/lib/online-platform';

type UserBooking = {
  id: string;
  status: string;
  payment_status: string;
  expires_at: string | null;
  app_status: string | null;
  application_json: string | null;
  /** Group booking (migration 056): seats bought, or a member's parent. */
  group_size?: number | null;
  parent_booking_id?: string | null;
};
type GroupInvite = { url: string; size: number; claimed: number };
type Instructor = {
  id: string;
  name: string;
  email: string;
  role: string;
  avatar_url: string | null;
  portfolio_id: string | null;
};

/** The gift flow is built and live in the API, but the button that starts it is
 *  held back from the public page until the flow is signed off. Flip to true to
 *  bring it back — nothing else has to change. */
const GIFT_BUTTON_ENABLED = false;

export default function WorkshopDetailPage() {
  // useSearchParams (?date from a teacher's profile) needs a Suspense
  // boundary above it.
  return (
    <Suspense fallback={null}>
      <WorkshopDetailInner />
    </Suspense>
  );
}

function WorkshopDetailInner() {
  const { id } = useParams<{ id: string }>();
  const { lang } = useLang();
  const [workshop, setWorkshop] = useState<Workshop | null>(null);
  const [location, setLocation] = useState<Location | null>(null);
  // A workshop can have several facilitators; index 0 is the owning teacher.
  const [instructors, setInstructors] = useState<Instructor[]>([]);
  const [bookingCount, setBookingCount] = useState(0);
  const [userBooking, setUserBooking] = useState<UserBooking | null>(null);
  const [groupInvite, setGroupInvite] = useState<GroupInvite | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [userAttended, setUserAttended] = useState(false);
  const [userCompleted, setUserCompleted] = useState(false);
  const [userIncompleteReason, setUserIncompleteReason] = useState<string | null>(null);
  const [userReview, setUserReview] = useState<Review | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [consentOpen, setConsentOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [booking, setBooking] = useState(false);
  const [bookingOpen, setBookingOpen] = useState(false);
  // A round under a master books through the calendar popup first: pick the
  // day (siblings under the same master), the round, and group or private.
  // The chosen round — which may be a sibling, not this page — then goes
  // through the same application form.
  const [master, setMaster] = useState<WorkshopMaster | null>(null);
  const [siblings, setSiblings] = useState<PickableSession[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  // The browser's back button from the payment page restores this page from
  // the bfcache exactly as it was left — button reading "กำลังดำเนินการ" and
  // disabled. The restore event is the one place that state can be reset.
  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted) {
        setBooking(false);
        setChosen(null);
        setPickerOpen(false);
      }
    };
    window.addEventListener('pageshow', onShow);
    return () => window.removeEventListener('pageshow', onShow);
  }, []);
  const [chosen, setChosen] = useState<{ session: PickableSession; kind: BookingKind; tier: PriceTier; seats: number } | null>(null);
  const search = useSearchParams();
  const pickedDate = search.get('date');
  const [loginPromptOpen, setLoginPromptOpen] = useState(false);
  const [giftOpen, setGiftOpen] = useState(false);
  // The handover link, once minted — the same modal serves a gift the buyer is
  // about to send and a seat its holder is passing on.
  const [transferLink, setTransferLink] = useState<{
    url: string;
    kind: 'gift' | 'transfer';
    recipient?: string | null;
  } | null>(null);
  const [transferBusy, setTransferBusy] = useState(false);
  // null = still checking; true/false = known login state.
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [openDays, setOpenDays] = useState<number[]>([0]);

  // Holds the loading screen until the workshop itself is here. Refreshes
  // after a booking reuse load() and are left untracked.
  const track = useLoadingTracker();

  const load = useCallback(async () => {
    setLoadError(false);
    // The whole load is tracked, not just the response: counting it done at
    // the response headers cleared the loading screen a beat before the page
    // had its data, and the old spinner flashed in that gap.
    await track(
      (async () => {
        try {
          const res = await fetch(`/api/workshops/${id}`);
          if (!res.ok && res.status !== 404) throw new Error(`HTTP ${res.status}`);
          learnServerClock(res);
          const data = (await res.json()) as {
            workshop: Workshop;
            location: Location | null;
            instructor: Instructor | null;
            instructors?: Instructor[];
            bookingCount: number;
            userBooking: UserBooking | null;
            groupInvite?: GroupInvite | null;
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
          setGroupInvite(data.groupInvite || null);
          setUserAttended(!!data.userAttended);
          setUserCompleted(!!data.userCompleted);
          setUserIncompleteReason(data.userIncompleteReason ?? null);
          setUserReview(data.userReview || null);
        } catch (e) {
          console.error('Failed to load workshop', e);
          setLoadError(true);
        }
        setLoading(false);
      })(),
    );
  }, [id, track]);

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

  useEffect(() => {
    if (!workshop?.master_id) return;
    let alive = true;
    fetch(`/api/workshop-masters/${workshop.master_id}`)
      .then((r) => (r.ok ? (r.json() as Promise<{ master: WorkshopMaster; sessions: PickableSession[] }>) : null))
      .then((d) => {
        if (!alive || !d) return;
        setMaster(d.master);
        setSiblings(d.sessions || []);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [workshop?.master_id]);

  // Booking CTA: guests get the login/register prompt; signed-in users get the
  // application form — for a round, the calendar popup comes first.
  function handleBookClick() {
    if (!authed) {
      setLoginPromptOpen(true);
      return;
    }
    if (workshop?.master_id && master && master.kind !== 'single') setPickerOpen(true);
    else setBookingOpen(true);
  }

  async function submitChosen(application: unknown): Promise<BookingResult> {
    if (!chosen) return { error: 'no session' };
    setBooking(true);
    try {
      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workshop_id: chosen.session.id, application, booking_kind: chosen.kind, tier_id: chosen.tier.id, group_size: chosen.seats }),
      });
      const data = (await res.json()) as BookingResult;
      if (!res.ok) {
        setBooking(false);
        return { error: data.error || tr(lang, 'เกิดข้อผิดพลาด', 'Something went wrong') };
      }
      return data;
    } catch {
      setBooking(false);
      return { error: tr(lang, 'เกิดข้อผิดพลาด', 'Something went wrong') };
    }
  }

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

  // Gift: same sign-in gate as booking — the buyer needs an account, because the
  // seat is held under theirs until the receiver claims it.
  function handleGiftClick() {
    if (authed) setGiftOpen(true);
    else setLoginPromptOpen(true);
  }

  async function submitGift(recipient: { name: string; phone: string }): Promise<string | null> {
    setBooking(true);
    try {
      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workshop_id: id, gift: recipient }),
      });
      const data = (await res.json()) as { checkoutUrl?: string; claimUrl?: string; error?: string };
      if (!res.ok) {
        setBooking(false);
        return data.error || tr(lang, 'เกิดข้อผิดพลาด', 'Something went wrong');
      }
      // Straight to the QR. The link is minted here but stays out of sight
      // until the money lands — a link handed over before payment is one that
      // can be sent to a friend who then finds a seat nobody paid for.
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
        return null;
      }
      // Free workshop → the seat is already secured, so hand over the link now.
      setBooking(false);
      setGiftOpen(false);
      if (data.claimUrl) setTransferLink({ url: data.claimUrl, kind: 'gift', recipient: recipient.name });
      load();
      return null;
    } catch {
      setBooking(false);
      return tr(lang, 'เกิดข้อผิดพลาด', 'Something went wrong');
    }
  }

  // Hand this seat to somebody else. The endpoint is idempotent, so pressing it
  // again returns the link that already exists rather than a second one.
  async function openTransferLink() {
    if (!userBooking || transferBusy) return;
    setTransferBusy(true);
    try {
      const res = await fetch(`/api/bookings/${userBooking.id}/transfer`, { method: 'POST' });
      const data = (await res.json()) as { url?: string; kind?: 'gift' | 'transfer'; error?: string };
      if (data.url) setTransferLink({ url: data.url, kind: data.kind || 'transfer' });
      else alert(data.error || tr(lang, 'เกิดข้อผิดพลาด', 'Something went wrong'));
    } catch {
      alert(tr(lang, 'เกิดข้อผิดพลาด', 'Something went wrong'));
    }
    setTransferBusy(false);
  }

  // Nothing to draw while this page's requests are open — the loading screen is
  // over it already (components/design/DataLoading.tsx).
  if (loading) return null;

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

  // Defined once and rendered by both headers. The desktop hero carries only
  // the title and leaves these below it; the phone design folds them into the
  // teal band. Two copies of the status logic would be two chances to disagree
  // about whether a workshop is open.
  const tagRow = (
    <>
      {hasWorkshopEnded(workshop) ? (
        <span className="tag" style={{ background: 'var(--cream-deep)', color: 'var(--muted)' }}>
          {tr(lang, 'ปิดรับ', 'Closed')}
        </span>
      ) : workshop.status === 'cancelled' ? (
        <span className="tag" style={{ background: '#fde7d3', color: '#a04a14' }}>
          {tr(lang, 'ยกเลิก', 'Cancelled')}
        </span>
      ) : !getWorkshopStatusBadge(workshop).open ? (
        <span className="tag" style={{ background: 'var(--cream-deep)', color: 'var(--muted)' }}>
          {tr(lang, 'ปิดรับ', 'Closed')}
        </span>
      ) : (
        <span className="tag tag-accent">{tr(lang, 'เปิดจอง', 'Open')}</span>
      )}
      <span className="tag">Workshop · {workshop.is_online ? 'Online' : 'Onsite'}</span>
      {workshop.category && <span className="tag">{workshop.category}</span>}
    </>
  );

  const timeLabel = `${workshop.time_start}-${workshop.time_end}`;
  const dateLine =
    workshopType === 'multi_day' && workshop.end_date
      ? `${fmtFullDate(workshop.date)} - ${fmtFullDate(workshop.end_date)}`
      : workshopType === 'multi_part' && partDates.length > 0
        ? partDates.map(fmtFullDate).join(' \u00b7 ')
        : fmtFullDate(workshop.date);

  return (
    <>
      {/* Phone header. Shown only under 920px, where it replaces the desktop
          hero outright - see .ws-m-head in globals.css. */}
      <div className="ws-m-head">
        <div className="ws-m-bar">
          <Link
            href="/workshops"
            aria-label={tr(lang, 'ย้อนกลับ', 'Back')}
            style={{
              width: 44,
              height: 44,
              borderRadius: 999,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--ink)',
              fontSize: 24,
              lineHeight: 1,
              flexShrink: 0,
            }}
          >
            ‹
          </Link>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              className="mono"
              style={{
                fontSize: 9.5,
                letterSpacing: '.18em',
                textTransform: 'uppercase',
                color: 'var(--teal)',
              }}
            >
              workshop
            </div>
            <div
              style={{
                fontSize: 13.5,
                fontWeight: 600,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {workshop.title}
            </div>
          </div>
          <ShareButton title={workshop.title} text={workshop.short_description || undefined} compact />
        </div>

        <section className="bg-teal-section" style={{ padding: '24px 20px 26px' }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>{tagRow}</div>
          <h1
            className="display-th"
            style={{ fontSize: 27, margin: 0, lineHeight: 1.2, color: '#fff', textWrap: 'pretty' }}
          >
            {workshop.title}
          </h1>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              marginTop: 16,
              fontSize: 13.5,
              color: 'rgba(255,255,255,.86)',
            }}
          >
            <span style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <Icon name="date" size={16} style={{ marginTop: 2 }} />
              {dateLine} · {timeLabel}
            </span>
            {locationLabel && (
              <span style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <Icon name="location" size={16} style={{ marginTop: 2 }} />
                {locationLabel}
              </span>
            )}
          </div>
        </section>

        <div className="ph ph-teal-100" style={{ aspectRatio: '297 / 420', position: 'relative', overflow: 'hidden' }}>
          {workshop.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={workshop.image_url}
              alt={workshop.title}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            <>
              {/* animate={false} because the draw-on stroke only runs inside a
                  .draw-in ancestor (Reveal). This header is above the fold and
                  never scrolls in, so an animated doodle here stays invisible. */}
              <Cloud
                color="var(--teal)"
                stroke={3}
                animate={false}
                style={{ position: 'absolute', top: 28, right: 24, width: 96, height: 62 }}
              />
              <WaveLine
                color="var(--teal-200)"
                stroke={2.5}
                animate={false}
                count={2}
                style={{
                  position: 'absolute',
                  bottom: 28,
                  left: 24,
                  width: 'calc(100% - 48px)',
                  height: 38,
                }}
              />
            </>
          )}
        </div>

      </div>

      {/* Hero banner */}
      <section className="bg-teal-section ws-d-hero" style={{ padding: '40px 0' }}>
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
      <section className="section ws-detail-main" style={{ paddingTop: 48, paddingBottom: 96 }}>
        <div className="container">
          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 48 }} className="ws-detail-grid">
            <div className="ws-detail-left">
              {/* Tags — the phone header prints these itself, inside the teal
                  band, so hide them here rather than showing the row twice. */}
              <Reveal className="ws-d-tags">
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  {tagRow}
                  <span style={{ marginLeft: 'auto' }}>
                    <ShareButton title={workshop.title} text={workshop.short_description || undefined} />
                  </span>
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
                  <Icon name="date" size={24} align="baseline" style={{ marginTop: 2, color: 'var(--teal)' }} />
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
                    {workshop.close_at && (
                      <div style={{ fontSize: 13.5, color: getWorkshopStatusBadge(workshop).open ? 'var(--teal-deep)' : 'var(--muted)', marginTop: 6, fontWeight: 600 }}>
                        <Icon name="reminder" size={16} /> {tr(lang, 'ปิดรับสมัคร', 'Registration closes')}: {fmtDateTime(`${workshop.close_at}:00+07:00`, lang, 'long')}
                      </div>
                    )}
                    {workshop.admission_type === 'selection' && workshop.announce_at && (
                      <div style={{ fontSize: 13.5, color: 'var(--teal-deep)', marginTop: 6, fontWeight: 600 }}>
                        <Icon name="reminder" size={16} /> {tr(lang, 'ประกาศผลคัดเลือก', 'Results announced')}: {fmtDateTime(workshop.announce_at, lang, 'long')}
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
                        <Icon name="participants" size={20} align="baseline" style={{ marginTop: 2, color: 'var(--teal)' }} />
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
                  <div className="ws-fac-list">
                  {instructors.map((ins) => (
                  <div key={ins.id} className="ws-fac-card">
                    <div className="ws-fac-avatar">
                      {ins.avatar_url ? (
                        <img
                          src={ins.avatar_url}
                          alt={ins.name}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      ) : (
                        <span style={{ fontFamily: 'Mitr, sans-serif', fontWeight: 500, color: 'var(--teal-deep)' }}>
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
                      <h3 className="display-th">{ins.name}</h3>
                      <p
                        className="ws-fac-bio"
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
                  {instructors.length > 1 && (
                    <div className="mono ws-fac-hint">
                      {tr(lang, 'เลื่อนเพื่อดูผู้สอนคนถัดไป →', 'Swipe for the next facilitator →')}
                    </div>
                  )}
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
              {/* The phone header prints its own full-bleed poster, so this one
                  is desktop-only - see .ws-d-poster. */}
              <div
                className="ph ph-teal-100 ws-d-poster"
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
                id="ws-booking-card"
                className="ws-book-card"
              >
                <BookingCardContent
                  workshop={workshop}
                  spotsLeft={spotsLeft}
                  userBooking={userBooking}
                  userAttended={userAttended}
                  userCompleted={userCompleted}
                  userIncompleteReason={userIncompleteReason}
                  userReview={userReview}
                  booking={booking}
                  onBook={handleBookClick}
                  onGift={handleGiftClick}
                  onTransfer={openTransferLink}
                  transferBusy={transferBusy}
                  groupInvite={groupInvite}
                  onInvite={() => setInviteOpen(true)}
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

      {/* Pinned price bar, phones only (.ws-m-cta is display:none above 920px,
          where the booking card is a permanently visible sidebar instead).

          The button scrolls to the booking card rather than booking directly.
          BookingCardContent has far more states than a bar can show — already
          booked, awaiting payment, hold expired, attended, review due, sign-in
          required — and a second copy of that logic here would drift from it.
          One button, one source of truth for what happens next. */}
      <div className="ws-m-cta">
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.1 }}>
            {(workshop.payment_type || 'paid') === 'free' || getEffectivePrice(workshop).price <= 0
              ? tr(lang, 'ฟรี', 'Free')
              : `฿${getEffectivePrice(workshop).price.toLocaleString()}`}
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
            {spotsLeft <= 0
              ? tr(lang, 'เต็มแล้ว', 'Sold out')
              : spotsLeft <= 4
                ? tr(lang, `เหลือเพียง ${spotsLeft} ที่นั่ง`, `Only ${spotsLeft} seats left`)
                : tr(lang, `รับ ${workshop.max_participants} ที่นั่ง`, `${workshop.max_participants} seats`)}
          </div>
        </div>
        <button
          type="button"
          onClick={() =>
            document
              .getElementById('ws-booking-card')
              ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
          }
          style={{
            border: 0,
            cursor: 'pointer',
            borderRadius: 999,
            padding: '13px 24px',
            fontSize: 15,
            fontWeight: 600,
            background: 'var(--teal)',
            color: '#fff',
            flexShrink: 0,
          }}
        >
          {hasWorkshopEnded(workshop) || workshop.status === 'cancelled'
            ? tr(lang, 'ดูรายละเอียด', 'View details')
            : tr(lang, 'จองที่นั่ง', 'Book a seat')}
          <span aria-hidden style={{ marginLeft: 8 }}>→</span>
        </button>
      </div>

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

      {pickerOpen && master && (
        <SessionPickerModal
          master={master}
          sessions={siblings}
          initialDate={pickedDate || workshop.date}
          onClose={() => setPickerOpen(false)}
          onNext={(session, kind, tier, seats) => {
            setPickerOpen(false);
            setChosen({ session, kind, tier, seats });
          }}
        />
      )}
      {chosen && (
        <BookingModal
          onClose={() => setChosen(null)}
          workshop={chosen.session}
          submitting={booking}
          onSubmit={submitChosen}
          bookingKind={chosen.kind}
          tierLabel={chosen.tier.id === 'seat' ? null : chosen.tier.label}
          privatePrice={chosen.tier.id === 'seat' ? null : chosen.tier.mode === 'round' ? chosen.tier.price : chosen.tier.price * chosen.seats}
          groupSeats={chosen.seats}
        />
      )}

      {giftOpen && (
        <GiftModal
          workshopTitle={workshop.title}
          submitting={booking}
          onClose={() => setGiftOpen(false)}
          onSubmit={submitGift}
        />
      )}

      {inviteOpen && groupInvite && (
        <TransferLinkModal
          url={groupInvite.url}
          kind="invite"
          invite={{ slots: Math.max(0, groupInvite.size - 1), claimed: groupInvite.claimed }}
          onClose={() => setInviteOpen(false)}
        />
      )}

      {transferLink && (
        <TransferLinkModal
          url={transferLink.url}
          kind={transferLink.kind}
          recipient={transferLink.recipient}
          onClose={() => setTransferLink(null)}
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
  userBooking,
  userAttended,
  userCompleted,
  userIncompleteReason,
  userReview,
  booking,
  onBook,
  onGift,
  onTransfer,
  transferBusy,
  groupInvite,
  onInvite,
  onResume,
  onReview,
  onViewApplication,
  lang,
}: {
  workshop: Workshop;
  spotsLeft: number;
  userBooking: UserBooking | null;
  userAttended: boolean;
  userCompleted: boolean;
  userIncompleteReason: string | null;
  userReview: Review | null;
  booking: boolean;
  onBook: () => void;
  onGift: () => void;
  onTransfer: () => void;
  transferBusy: boolean;
  /** Set when this user's paid booking is a group: the link its members follow. */
  groupInvite: GroupInvite | null;
  onInvite: () => void;
  onResume: () => void;
  onReview: () => void;
  onViewApplication: () => void;
  lang: 'th' | 'en';
}) {
  const eff = getEffectivePrice(workshop);
  // Show "Free" when the payment model is free OR the effective price is ฿0.
  const isFree = (workshop.payment_type || 'paid') === 'free' || eff.price <= 0;
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
  // Registration is open — same rule as the cards and the booking API: not
  // started, not past the admin's close_at, not past a selection's announce.
  const regOpen = getWorkshopStatusBadge(workshop).open;
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

      {/* Seats. Only the capacity is shown — how many are already taken is kept
          off the public page so a class that has just opened does not look
          empty. Scarcity still surfaces once it is real: the last few seats,
          or none. */}
      <div style={{ marginBottom: 18 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 12,
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
            {tr(lang, 'ที่นั่งทั้งหมด', 'Total seats')}
          </span>
          <span style={{ fontWeight: 600, color: 'var(--ink)' }}>
            {workshop.max_participants} {tr(lang, 'ที่นั่ง', 'seats')}
          </span>
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
                <Stars value={userReview.rating} size={14} />
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
              {tr(lang, 'รีวิวกิจกรรม', 'Review workshop')} <Icon name="rating" size={16} filled />
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
          {/* Passing the seat on. Not for a free seat — there is nothing to
              pass on that the receiver could not book themselves — and only
              before the day: once the workshop is under way nobody could take
              it up, and the API refuses too. */}
          {/* A group: the link its members follow, with how many have come. */}
          {groupInvite && (
            <button
              type="button"
              onClick={onInvite}
              className="btn btn-teal"
              style={{ width: '100%', justifyContent: 'center', marginTop: 10, gap: 8 }}
            >
              {tr(lang, 'ลิงก์เชิญเพื่อน', 'Invite link')}
              <span className="mono" style={{ fontSize: 12, opacity: 0.85 }}>
                {groupInvite.claimed}/{Math.max(0, groupInvite.size - 1)}
              </span>
            </button>
          )}
          {userBooking?.parent_booking_id && (
            <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: '10px 0 0', textAlign: 'center' }}>
              {tr(lang, 'ที่นั่งนี้เป็นส่วนหนึ่งของการจองกลุ่ม', 'This seat is part of a group booking')}
            </p>
          )}
          {regOpen && !isFree && !groupInvite && !userBooking?.parent_booking_id && (
            <button
              type="button"
              onClick={onTransfer}
              disabled={transferBusy}
              style={{
                width: '100%',
                marginTop: 10,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                background: 'transparent',
                border: '1.5px solid var(--teal)',
                color: 'var(--teal-deep)',
                borderRadius: 999,
                padding: '13px 20px',
                fontSize: 14.5,
                fontWeight: 600,
                cursor: transferBusy ? 'wait' : 'pointer',
              }}
            >
              {transferBusy
                ? tr(lang, 'กำลังสร้างลิงก์…', 'Creating link…')
                : tr(lang, 'โอนย้ายสิทธิ์ให้เพื่อน', 'Transfer to a friend')}
              <span aria-hidden className="mono">↗</span>
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
          <div style={{ display: 'flex', gap: 10, marginTop: hasLiveHold ? 12 : 0, marginBottom: 10 }}>
            <button
              type="button"
              onClick={onResume}
              disabled={booking}
              className="btn btn-teal"
              style={{
                flex: 1,
                minWidth: 0,
                justifyContent: 'center',
                fontSize: 15,
                padding: '15px 22px',
              }}
            >
              {booking ? tr(lang, 'กำลังโหลด...', 'Loading...') : tr(lang, 'ดำเนินการต่อ', 'Continue')}{' '}
              <span className="mono">→</span>
            </button>
            {/* An unpaid booking is not a seat yet, so buying one as a gift is
                still open to them. */}
            {GIFT_BUTTON_ENABLED && !isSelection && !isFree && <GiftSquare onClick={onGift} disabled={booking} lang={lang} />}
          </div>
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
      ) : !regOpen ? (
        <button
          type="button"
          disabled
          className="btn"
          style={{ width: '100%', justifyContent: 'center', fontSize: 15, padding: '15px 22px', background: 'var(--cream-deep)', color: 'var(--muted)', cursor: 'not-allowed' }}
        >
          {started
            ? tr(lang, 'ปิดรับสมัคร — กิจกรรมเริ่มแล้ว', 'Registration closed — event started')
            : tr(lang, 'ปิดรับสมัครแล้ว', 'Registration closed')}
        </button>
      ) : (
        <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
          <button
            type="button"
            onClick={onBook}
            disabled={booking || soldOut}
            className="btn btn-teal"
            style={{
              flex: 1,
              minWidth: 0,
              justifyContent: 'center',
              fontSize: 15,
              padding: '15px 22px',
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
          {/* Buying it for someone else. Not on a free workshop — the friend
              can book that themselves — and not on a selection one, where the
              place is decided on the applicant. */}
          {GIFT_BUTTON_ENABLED && !isSelection && !isFree && <GiftSquare onClick={onGift} disabled={booking || soldOut} lang={lang} />}
        </div>
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
          tr(lang, 'จองที่นั่งทันที · ชำระเงินภายใน 10 นาที', 'Seat held instantly · pay within 10 minutes'),
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

/** Square gift button that sits beside the primary CTA. Square on purpose: it
 *  is an alternative to the main action, not a second one competing with it. */
function GiftSquare({ onClick, disabled, lang }: { onClick: () => void; disabled?: boolean; lang: 'th' | 'en' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={tr(lang, 'ซื้อเป็นของขวัญให้คนอื่น', 'Buy this as a gift')}
      aria-label={tr(lang, 'ซื้อเป็นของขวัญให้คนอื่น', 'Buy this as a gift')}
      style={{
        width: 52,
        height: 52,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--teal-deep)',
        borderRadius: 16,
        border: '1.5px solid var(--teal)',
        background: 'var(--teal-50)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <Icon name="gift" size={24} align="0" />
    </button>
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
  const th = lang === 'th';
  return (
    <div
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(13,30,29,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 16px', overflowY: 'auto' }}
    >
      <div role="dialog" aria-modal="true" className="pop-mitr" style={{ width: '100%', maxWidth: 420, background: 'var(--paper)', borderRadius: 28, boxShadow: '0 30px 70px -22px rgba(13,30,29,.5)', overflow: 'hidden', position: 'relative' }}>
        <button
          type="button"
          onClick={onClose}
          aria-label={tr(lang, 'ปิด', 'Close')}
          style={{ position: 'absolute', top: 18, right: 18, background: 'var(--cream)', border: 0, width: 32, height: 32, borderRadius: '50%', fontSize: 19, color: 'var(--ink)', cursor: 'pointer', lineHeight: 1 }}
        >
          ×
        </button>
        <div style={{ padding: '30px 26px 24px' }}>
          <div className="mono" style={{ fontSize: 9.5, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--teal-deep)' }}>
            {tr(lang, 'ต้องเข้าสู่ระบบก่อน', 'Sign in required')}
          </div>
          <h2 className="display-th" style={{ fontSize: 25, margin: '9px 0 0', lineHeight: 1.22 }}>
            {th ? <>เก็บที่นั่งนี้ไว้<br />ในชื่อของคุณ</> : <>Keep this seat<br />under your name</>}
          </h2>
          <p style={{ fontSize: 13.5, color: 'var(--muted)', lineHeight: 1.65, margin: '10px 0 20px' }}>
            {tr(lang, 'ใบสมัครจะกรอกให้อัตโนมัติจากโปรไฟล์ และดูสถานะการจองได้ทุกเมื่อ', 'Your application fills itself in from your profile, and you can check your booking any time.')}
          </p>
          <div style={{ background: 'var(--cream)', borderRadius: 18, padding: '14px 16px', marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 9 }}>
            <span style={{ display: 'flex', gap: 9, fontSize: 13, color: 'var(--ink)', lineHeight: 1.5 }}><span style={{ color: 'var(--teal)' }}>✓</span>{tr(lang, 'กรอกข้อมูลครั้งเดียว ใช้กับทุกกิจกรรม', 'Fill in your details once, use them for every activity')}</span>
            <span style={{ display: 'flex', gap: 9, fontSize: 13, color: 'var(--ink)', lineHeight: 1.5 }}><span style={{ color: 'var(--teal)' }}>✓</span>{tr(lang, 'ติดตามสถานะและใบเสร็จได้ในหน้าการจอง', 'Track status and receipts on your bookings page')}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            <Link href={`/auth/login?${q}`} className="btn btn-teal" style={{ width: '100%', justifyContent: 'center', boxSizing: 'border-box' }}>
              {tr(lang, 'เข้าสู่ระบบ', 'Sign in')} <span className="mono">→</span>
            </Link>
            <Link href={`/auth/register?${q}`} className="btn btn-paper" style={{ width: '100%', justifyContent: 'center', boxSizing: 'border-box', background: 'var(--cream)' }}>
              {tr(lang, 'สมัครสมาชิก', 'Create an account')}
            </Link>
          </div>
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
        <Icon name="duration" size={15} /> {tr(lang, 'ที่นั่งถูก hold ไว้', 'Seat on hold')}
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
      <div className="ws-map">
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
      <div className="ws-addr">
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
          <div className="ws-addr-actions">
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
            {/* Phones already get this link as the button floating on the map,
                and the design drops it from the card there. */}
            <a
              href={openUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-ghost btn-sm ws-addr-ghost"
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
      <Icon name="duration" size={15} /> {tr(lang, 'โปรโมชันเหลือเวลาอีก', 'Promo ends in')} {left}
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
