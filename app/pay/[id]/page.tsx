'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useLang, T, tr, type Lang } from '@/lib/i18n';
import { Btn } from '@/components/design/RippleButton';
import { Icon } from '@/components/design/Icon';
import { BeamMark } from '@/components/design/BeamMark';
import { fmtDate, sqliteToMs } from '@/lib/datetime';

/**
 * /pay/{id} — the payment page for a booking, replacing Beam's hosted checkout
 * for PromptPay.
 *
 * The hosted page could not be used: it mints a brand-new QR every time the
 * shopper switches payment method and back, all of them payable, each on its own
 * 30-minute clock. One booking would collect several live QR images, and paying
 * an older one took real money for a seat that was already paid for.
 *
 * Here there is exactly one QR. It is created once by /api/bookings/{id}/qr and
 * stored, so a reload, a second device or a return visit inside the hold all
 * show the same image, and no control on this page can produce another.
 *
 * The countdown is the SEAT HOLD, not the QR. Beam grants every QR 30 minutes
 * regardless of what we ask for and offers no way to cancel one, so the image
 * stays scannable for another 20 minutes after the seat is gone — which is why
 * the note matters and why a late payment is refunded rather than accepted.
 *
 * TWO LAYOUTS, not one reflowed. The desktop design sets the booking beside the
 * QR; the phone design leads with a dark amount-and-clock card, stacks the rest,
 * and pins the card-payment button to the bottom of the screen. They differ in
 * composition rather than in width, so each gets its own tree and CSS shows one.
 * Everything carrying content is a shared piece below, so the two cannot drift
 * apart in wording.
 *
 * Deliberately OUTSIDE the (main) route group, so it gets no site header, nav or
 * footer: this is a checkout, and every link off it is a chance to wander away
 * mid-payment and come back to an expired hold.
 */

type BookingSummary = {
  title: string | null;
  date: string | null;
  endDate: string | null;
  workshopType: string | null;
  timeStart: string | null;
  timeEnd: string | null;
  location: string | null;
  locName: string | null;
  locProvince: string | null;
  locDistrict: string | null;
  imageUrl: string | null;
};

type PayState = 'loading' | 'ready' | 'paid' | 'expired' | 'error';

/** "name-province, district", falling back to the legacy free-text location —
 *  the same rule the workshop cards use, so the two never disagree. */
function fmtLocation(b: BookingSummary): string {
  const name = (b.locName || '').trim();
  const province = (b.locProvince || '').trim();
  const district = (b.locDistrict || '').trim();
  if (name || province || district) {
    const head = [name, province].filter(Boolean).join('-');
    return district ? `${head}, ${district}` : head;
  }
  return (b.location || '').trim();
}

function fmtDateLabel(b: BookingSummary, lang: Lang): string {
  if (!b.date) return '';
  if (b.workshopType === 'multi_day' && b.endDate) {
    return `${fmtDate(b.date, lang, 'medium')} – ${fmtDate(b.endDate, lang, 'medium')}`;
  }
  return fmtDate(b.date, lang, 'long');
}

const MONO_LABEL: CSSProperties = {
  fontSize: 10.5,
  letterSpacing: '0.16em',
  textTransform: 'uppercase',
  color: 'var(--muted)',
};

/* ── Shared pieces ───────────────────────────────────────────────────────── */

/** Date · time · place, at whatever scale the surrounding layout asks for. */
function BookingMeta({
  booking,
  lang,
  size,
}: {
  booking: BookingSummary;
  lang: Lang;
  size: number;
}) {
  const row: CSSProperties = { display: 'flex', gap: 9, alignItems: 'center' };
  const dateLabel = fmtDateLabel(booking, lang);
  const locationLabel = fmtLocation(booking);
  return (
    <>
      {dateLabel && (
        <span style={row}>
          <Icon name="date" size={size} style={{ color: 'var(--teal)' }} />
          {dateLabel}
        </span>
      )}
      {booking.timeStart && (
        <span style={row}>
          <Icon name="time" size={size} style={{ color: 'var(--teal)' }} />
          {booking.timeStart}–{booking.timeEnd}
        </span>
      )}
      {locationLabel && (
        <span style={{ ...row, alignItems: 'flex-start' }}>
          <Icon name="location" size={size} style={{ color: 'var(--teal)', marginTop: 3 }} />
          {locationLabel}
        </span>
      )}
    </>
  );
}

function PosterTile({
  booking,
  width,
  radius,
}: {
  booking: BookingSummary | null;
  width: string;
  radius: number;
}) {
  return (
    <div
      className="ph ph-teal"
      style={{
        width,
        aspectRatio: '190 / 253',
        borderRadius: radius,
        flexShrink: 0,
        overflow: 'hidden',
      }}
    >
      {booking?.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={booking.imageUrl}
          alt={booking.title || ''}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      ) : (
        // Not every workshop has a poster. Naming the empty tile beats a blank
        // rectangle that reads like an image failed to load.
        <T th="โปสเตอร์กิจกรรม" en="workshop poster" />
      )}
    </div>
  );
}

/** The hourglass note. The QR outlives the seat by twenty minutes and Beam gives
 *  no way to kill it, so saying this plainly is the only protection left. */
function HoldNote({
  circle,
  handSize,
  bodySize,
}: {
  circle: number;
  handSize: number;
  bodySize: number;
}) {
  return (
    <>
      <span
        style={{
          width: circle,
          height: circle,
          borderRadius: '50%',
          background: 'var(--accent)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <Icon
          name="duration"
          size={Math.round(circle * 0.53)}
          align="baseline"
          style={{ color: 'var(--ink)' }}
        />
      </span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span className="hand" style={{ fontSize: handSize, color: 'var(--teal)' }}>
          <T th="หมายเหตุ" en="note" />
        </span>
        <span style={{ fontSize: bodySize, lineHeight: 1.7, color: 'var(--muted)' }}>
          <T
            th="กรุณาชำระภายในเวลาที่กำหนด หากชำระสำเร็จหลังหมดเวลาระบบจะทำการคืนเงินอัตโนมัติ และถือว่าการจองที่นั่งไม่สำเร็จ"
            en="Please pay within the time shown. A payment that completes after the countdown is refunded automatically and the seat booking is treated as unsuccessful."
          />
        </span>
      </div>
    </>
  );
}

/** The gift link, shown the moment the payment lands — the seat is secured,
 *  so the link now works, and the buyer can send it on. */
function GiftLinkPanel({ url }: { url: string }) {
  const { lang } = useLang();
  const [copied, setCopied] = useState(false);
  return (
    <div style={{ width: '100%', maxWidth: 420, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <span style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.65, textAlign: 'center' }}>
        <T
          th="ชำระเงินเรียบร้อย — ส่งลิงก์นี้ให้ผู้รับ เพื่อกดรับสิทธิ์และกรอกใบสมัครของตัวเอง"
          en="Payment received — send this link to the recipient so they can claim the seat and fill in their own application."
        />
      </span>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          border: '1px solid var(--cream-deep)',
          background: 'var(--cream)',
          borderRadius: 12,
          padding: '10px 12px',
        }}
      >
        <input
          readOnly
          value={url}
          onFocus={(e) => e.currentTarget.select()}
          style={{ flex: 1, minWidth: 0, border: 0, background: 'transparent', fontSize: 12.5, color: 'var(--ink)', fontFamily: 'JetBrains Mono, monospace' }}
        />
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            } catch {
              // Blocked in some in-app browsers — the field is selectable.
              setCopied(false);
            }
          }}
          className="btn btn-teal"
          style={{ flexShrink: 0, padding: '9px 16px', fontSize: 13 }}
        >
          {copied ? tr(lang, 'คัดลอกแล้ว', 'Copied') : tr(lang, 'คัดลอก', 'Copy')}
        </button>
      </div>
      <span style={{ fontSize: 12, color: '#8a5a00', background: '#fcefcf', border: '1px solid #f0dfae', borderRadius: 12, padding: '10px 13px', lineHeight: 1.6 }}>
        <T
          th="ลิงก์นี้ใช้ได้ครั้งเดียว — ใครก็ตามที่เปิดและกดรับสิทธิ์จะได้ที่นั่งนี้ไป เปิดดูอีกครั้งได้จากหน้ากิจกรรม"
          en="This link works once — whoever opens it and claims takes the seat. You can find it again on the workshop page."
        />
      </span>
      <Link href="/me/bookings" className="btn btn-paper" style={{ justifyContent: 'center' }}>
        {tr(lang, 'ไปที่การจองของฉัน', 'Go to my bookings')}
      </Link>
    </div>
  );
}

/** loading / paid / expired / error — identical wording on both layouts. */
function StateBody({
  state,
  error,
  retryable,
  onRetry,
  giftUrl,
}: {
  state: PayState;
  error: string | null;
  retryable: boolean;
  onRetry: () => void;
  /** Set when the seat just paid for was bought for somebody else: the link
   *  that hands it to them, which only exists once the money is in. */
  giftUrl?: string | null;
}) {
  if (state === 'loading') {
    return (
      <>
        <span className="mono" style={{ ...MONO_LABEL, letterSpacing: '0.18em', color: 'var(--teal)' }}>
          promptpay
        </span>
        <span style={{ fontSize: 15, color: 'var(--muted)' }}>
          <T th="กำลังสร้าง QR…" en="Creating your QR…" />
        </span>
      </>
    );
  }
  if (state === 'paid') {
    return (
      <>
        <span className="display-en" style={{ fontSize: 46, color: 'var(--teal)' }}>
          PAID
        </span>
        {giftUrl ? (
          // A gift: the buyer is not the one attending, so the thing they came
          // for is the link, and this is the first moment it is worth anything.
          <GiftLinkPanel url={giftUrl} />
        ) : (
          <span style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.65 }}>
            <T
              th="ได้รับการชำระเงินแล้ว กำลังพาไปหน้าการจอง…"
              en="Payment received — taking you to your bookings…"
            />
          </span>
        )}
      </>
    );
  }
  if (state === 'expired') {
    return (
      <>
        <span className="tag tag-warn">
          <T th="หมดเวลา" en="time is up" />
        </span>
        <span
          style={{
            fontFamily: 'var(--font-display-th)',
            fontWeight: 500,
            fontSize: 21,
            lineHeight: 1.3,
          }}
        >
          <T
            th="หมดเวลาชำระเงิน ที่นั่งถูกปล่อยคืนแล้ว"
            en="Time is up — the seat has been released."
          />
        </span>
        <span style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.65 }}>
          <T
            th="ถ้าคุณเพิ่งสแกนจ่ายไป ระบบจะคืนเงินให้อัตโนมัติภายใน 1-3 วันทำการ"
            en="If you have just paid, the money is refunded automatically within 1-3 business days."
          />
        </span>
        <Btn kind="teal" href="/me/bookings" style={{ justifyContent: 'center', minWidth: 200 }}>
          <T th="ไปที่การจองของฉัน" en="Go to my bookings" />
        </Btn>
      </>
    );
  }
  return (
    <>
      <span
        style={{
          fontFamily: 'var(--font-display-th)',
          fontWeight: 500,
          fontSize: 20,
          color: '#b91c1c',
        }}
      >
        {error}
      </span>
      {retryable && (
        <Btn kind="teal" onClick={onRetry} style={{ justifyContent: 'center', minWidth: 150 }}>
          <T th="ลองอีกครั้ง" en="Try again" />
        </Btn>
      )}
    </>
  );
}

/* ── Page ────────────────────────────────────────────────────────────────── */

export default function PayPage() {
  const { lang } = useLang();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id as string;

  const [image, setImage] = useState<string | null>(null);
  const [amount, setAmount] = useState<number>(0);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [booking, setBooking] = useState<BookingSummary | null>(null);
  const [state, setState] = useState<PayState>('loading');
  const [error, setError] = useState<string | null>(null);
  // Set only for a gift, once it is paid for: the link to hand to the receiver.
  const [giftUrl, setGiftUrl] = useState<string | null>(null);
  const [retryable, setRetryable] = useState(false);
  const [cardLoading, setCardLoading] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  // Counts polls so every fifth one asks Beam directly instead of only reading
  // our own row. The webhook is the primary path; this is what saves a user who
  // has paid from watching a live countdown because the webhook was late.
  const pollCount = useRef(0);

  const load = useCallback(
    async (deep: boolean) => {
      if (!id) return;
      try {
        const res = await fetch(`/api/bookings/${id}/qr${deep ? '?deep=1' : ''}`);
        const data = (await res.json()) as {
          image?: string;
          amount?: number;
          expiresAt?: string | null;
          booking?: BookingSummary;
          paid?: boolean;
          expired?: boolean;
          error?: string;
          retryable?: boolean;
        };

        // Kept on screen through every outcome, failures included. A panel that
        // empties out at the moment the answer arrives reads like the booking
        // itself vanished rather than the payment attempt.
        if (data.booking) setBooking(data.booking);
        if (typeof data.amount === 'number') setAmount(data.amount);

        if (data.paid) {
          setState('paid');
          // A gift stays here instead: the link is the whole point of the
          // purchase and this is the first moment it works, so it is put in
          // front of the buyer rather than left behind a redirect.
          const gift = await fetch(`/api/bookings/${id}/transfer`)
            .then((r) => r.json() as Promise<{ url?: string | null; kind?: string }>)
            .catch(() => ({ url: null }));
          if (gift.url && gift.kind === 'gift') {
            setGiftUrl(gift.url);
            return;
          }
          // Straight to the bookings page, which already knows how to say "your
          // seat is confirmed — no need to scan again".
          router.replace(`/me/bookings?paid=1&booking=${id}`);
          return;
        }
        if (data.expired) {
          setState('expired');
          return;
        }
        if (!res.ok || !data.image) {
          setError(data.error || tr(lang, 'เกิดข้อผิดพลาด', 'Something went wrong'));
          setRetryable(!!data.retryable);
          setState('error');
          return;
        }

        setImage(data.image);
        setExpiresAt(data.expiresAt ?? null);
        setError(null);
        setState('ready');
      } catch {
        setError(tr(lang, 'เชื่อมต่อไม่ได้ กรุณาลองใหม่', 'Connection failed — please try again'));
        setRetryable(true);
        setState('error');
      }
    },
    [id, lang, router],
  );

  useEffect(() => {
    // Wrapped rather than called bare so the first state update lands in a
    // later tick — a synchronous setState in an effect body cascades renders.
    (async () => {
      await load(false);
    })();
  }, [load]);

  // Poll while the QR is on screen. PromptPay is scanned on a phone while this
  // tab sits idle, so nothing here can know the payment landed without asking.
  useEffect(() => {
    if (state !== 'ready') return;
    const t = setInterval(() => {
      pollCount.current += 1;
      void load(pollCount.current % 5 === 0);
    }, 3000);
    return () => clearInterval(t);
  }, [state, load]);

  // Separate one-second tick for the countdown, so the display moves smoothly
  // without a network request behind every second.
  useEffect(() => {
    if (state !== 'ready') return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [state]);

  const deadline = expiresAt ? sqliteToMs(expiresAt) : NaN;
  const remaining = Number.isFinite(deadline) ? Math.max(0, deadline - now) : NaN;
  const mm = Number.isFinite(remaining) ? Math.floor(remaining / 60000) : 0;
  const ss = Number.isFinite(remaining) ? Math.floor((remaining % 60000) / 1000) : 0;
  const clock = `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
  const runningLow = remaining < 120000;

  // The hold ran out while the page was open. Ask the server rather than
  // deciding here — a payment may have landed in the same seconds.
  useEffect(() => {
    if (state !== 'ready' || !Number.isFinite(remaining) || remaining > 0) return;
    (async () => {
      await load(true);
    })();
  }, [state, remaining, load]);

  async function payByCard() {
    setCardLoading(true);
    try {
      const res = await fetch(`/api/bookings/${id}/card`, { method: 'POST' });
      const data = (await res.json()) as { checkoutUrl?: string; error?: string };
      if (!res.ok || !data.checkoutUrl) {
        alert(data.error || tr(lang, 'เกิดข้อผิดพลาด', 'Something went wrong'));
        return;
      }
      window.location.href = data.checkoutUrl;
    } catch {
      alert(tr(lang, 'เชื่อมต่อไม่ได้ กรุณาลองใหม่', 'Connection failed — please try again'));
    } finally {
      setCardLoading(false);
    }
  }

  // Beam has returned the image bare so far, but a data: prefix is the other
  // common shape — accept either rather than render a broken image.
  const src = image ? (image.startsWith('data:') ? image : `data:image/png;base64,${image}`) : null;

  /**
   * Save the QR to the phone.
   *
   * On a phone the QR is on the same screen as the banking app, so there is
   * nothing to point a camera at — the way through is to save the image and open
   * it from inside the bank's app. Handed over as a blob rather than the data
   * URI directly, because Safari refuses a `download` on a data: link.
   */
  function saveQr() {
    if (!src) return;
    fetch(src)
      .then((r) => r.blob())
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `promptpay-${id}.png`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        // Give the download a moment to start before the handle goes away.
        setTimeout(() => URL.revokeObjectURL(url), 10_000);
      })
      .catch(() => {
        // A browser that blocks the download can still long-press the image.
        alert(
          tr(
            lang,
            'บันทึกรูปไม่สำเร็จ กดค้างที่รูป QR เพื่อบันทึกแทนได้',
            'Could not save — long-press the QR image to save it instead',
          ),
        );
      });
  }

  const qrAlt = tr(lang, 'QR พร้อมเพย์สำหรับชำระเงิน', 'PromptPay QR for this payment');

  /* ── Desktop ─────────────────────────────────────────────────────────── */
  const desktop = (
    <div className="pay pay-desktop">
      <section className="pay-left">
        <div className="pay-col" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <Link
            href="/me/bookings"
            style={{ fontSize: 20, color: 'var(--teal)' }}
            aria-label={tr(lang, 'กลับ', 'Back')}
          >
            ←
          </Link>
          <Link
            href="/"
            style={{
              fontFamily: 'var(--font-display-th)',
              fontWeight: 500,
              fontSize: 20,
              letterSpacing: '-0.01em',
              color: 'var(--ink)',
            }}
          >
            All<span style={{ color: 'var(--teal)' }}>Soul</span>Learn
          </Link>
        </div>

        <h1 className="display-th pay-col" style={{ fontSize: 40, margin: 0 }}>
          <T th="ชำระเงิน" en="Payment" />
        </h1>

        <div
          className="pay-col"
          style={{
            background: 'var(--paper)',
            borderRadius: 22,
            padding: 26,
            display: 'flex',
            flexDirection: 'column',
            gap: 20,
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span className="mono" style={MONO_LABEL}>
              <T th="รายการที่จอง" en="your booking" />
            </span>
            <span
              style={{
                fontFamily: 'var(--font-display-th)',
                fontWeight: 500,
                fontSize: 21,
                lineHeight: 1.25,
                color: 'var(--teal-deep)',
              }}
            >
              {booking?.title || '—'}
            </span>
          </div>

          <div style={{ display: 'flex', gap: 18, alignItems: 'flex-start' }}>
            <PosterTile booking={booking} width="min(190px, 42%)" radius={14} />
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
                fontSize: 13.5,
                color: 'var(--muted)',
                lineHeight: 1.65,
                minWidth: 0,
              }}
            >
              {booking && <BookingMeta booking={booking} lang={lang} size={17} />}
              <span
                className="mono"
                style={{
                  display: 'flex',
                  gap: 9,
                  alignItems: 'center',
                  fontSize: 10,
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                }}
              >
                <Icon name="participants" size={17} style={{ color: 'var(--teal)' }} />
                <T th="1 ที่นั่ง · จองไว้ชั่วคราว" en="1 seat · held temporarily" />
              </span>
            </div>
          </div>

          <div style={{ height: 1, background: 'rgba(13,30,29,.08)' }} />

          <div
            style={{
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'space-between',
              gap: 16,
            }}
          >
            <span className="mono" style={MONO_LABEL}>
              <T th="ยอดที่ต้องชำระ" en="amount due" />
            </span>
            <span className="display-en" style={{ fontSize: 40, color: 'var(--teal)' }}>
              ฿{amount.toLocaleString()}
            </span>
          </div>
        </div>

        <div className="pay-col" style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
          <HoldNote circle={34} handSize={21} bodySize={13} />
        </div>

        <Link
          href="/me/bookings"
          className="pay-col"
          style={{ fontSize: 13, color: 'var(--muted)', marginTop: 'auto' }}
        >
          <T th="ไว้ทีหลัง — ไปที่การจองของฉัน" en="Later — go to my bookings" />
        </Link>
      </section>

      <section className="pay-right">
        <div
          className="card card-cream card-static"
          style={{
            width: '100%',
            maxWidth: 400,
            padding: 28,
            display: 'flex',
            flexDirection: 'column',
            gap: 22,
          }}
        >
          {state === 'ready' && src ? (
            <>
              <Btn
                kind="teal"
                onClick={payByCard}
                disabled={cardLoading}
                style={{ width: '100%', justifyContent: 'center' }}
              >
                <T th="จ่ายด้วยบัตรเครดิต / Mobile banking" en="Pay by card / Mobile banking" />
              </Btn>

              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <span style={{ flex: 1, height: 1, background: 'rgba(13,30,29,.12)' }} />
                <span className="mono" style={MONO_LABEL}>
                  <T th="หรือ" en="or" />
                </span>
                <span style={{ flex: 1, height: 1, background: 'rgba(13,30,29,.12)' }} />
              </div>

              <div
                style={{
                  background: 'var(--paper)',
                  borderRadius: 18,
                  padding: 22,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 16,
                }}
              >
                <BeamMark width={126} />
                {/* Beam returns a ready-made PNG, so no QR library is needed —
                    and this is the ONLY image this booking will ever be shown. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={src}
                  alt={qrAlt}
                  style={{ width: '100%', aspectRatio: '1', objectFit: 'contain', borderRadius: 14 }}
                />
                <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>
                  <T th="สแกน QR ด้วยแอปธนาคาร" en="Scan with your banking app" />
                </span>
              </div>

              <div
                style={{
                  borderBottom: '1px solid rgba(13,30,29,.12)',
                  paddingBottom: 14,
                  display: 'flex',
                  alignItems: 'baseline',
                  justifyContent: 'center',
                  gap: 10,
                }}
              >
                <span style={{ fontSize: 14 }}>
                  <T th="ชำระภายใน" en="Pay within" />
                </span>
                <span
                  className="display-en"
                  style={{
                    fontSize: 30,
                    fontVariantNumeric: 'tabular-nums',
                    color: runningLow ? '#b91c1c' : 'var(--teal)',
                  }}
                >
                  {clock}
                </span>
                <span style={{ fontSize: 14 }}>
                  <T th="นาที" en="min" />
                </span>
              </div>

              <span
                className="mono"
                style={{
                  fontSize: 10,
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                  color: 'var(--muted)',
                  textAlign: 'center',
                }}
              >
                <T th="ชำระเงินอย่างปลอดภัยผ่าน beam" en="secure checkout by beam" />
              </span>
            </>
          ) : (
            <div className="pay-state">
              <StateBody
                state={state}
                error={error}
                retryable={retryable}
                onRetry={() => void load(false)}
                giftUrl={giftUrl}
              />
            </div>
          )}
        </div>
      </section>
    </div>
  );

  /* ── Phone ───────────────────────────────────────────────────────────── */
  const mobile = (
    <div className="pay-m">
      <header className="pay-m-bar">
        <Link
          href="/me/bookings"
          style={{ fontSize: 20, color: 'var(--teal)' }}
          aria-label={tr(lang, 'กลับ', 'Back')}
        >
          ←
        </Link>
        <span style={{ fontFamily: 'var(--font-display-th)', fontWeight: 500, fontSize: 17 }}>
          <T th="ชำระเงิน" en="Payment" />
        </span>
        <span
          className="mono"
          style={{
            marginLeft: 'auto',
            fontSize: 10,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: 'var(--muted)',
          }}
        >
          <T th="ขั้นที่ 2 / 2" en="step 2 / 2" />
        </span>
      </header>

      <div className="pay-m-body">
        {/* Amount and clock together on ink: on a phone these are the two facts
            that must survive a glance, so they get the one dark surface. */}
        <div
          style={{
            background: 'var(--ink)',
            borderRadius: 22,
            padding: 22,
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            gap: 16,
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span className="mono" style={{ ...MONO_LABEL, fontSize: 10, color: 'rgba(255,255,255,.55)' }}>
              <T th="ยอดที่ต้องชำระ" en="amount due" />
            </span>
            <span className="display-en" style={{ fontSize: 40, color: '#fff', lineHeight: 0.9 }}>
              ฿{amount.toLocaleString()}
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
            <span className="mono" style={{ ...MONO_LABEL, fontSize: 10, color: 'rgba(255,255,255,.55)' }}>
              <T th="ชำระภายใน" en="Pay within" />
            </span>
            <span
              className="display-en"
              style={{
                fontSize: 26,
                fontVariantNumeric: 'tabular-nums',
                lineHeight: 0.9,
                // Amber rather than red: against ink, red goes muddy while the
                // accent yellow still reads as urgent.
                color: runningLow ? 'var(--accent)' : '#fff',
              }}
            >
              {state === 'ready' ? clock : '—'}
            </span>
          </div>
        </div>

        {state === 'ready' && src ? (
          <>
            <div className="pay-m-card" style={{ alignItems: 'center', gap: 14 }}>
              <BeamMark width={108} />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={src}
                alt={qrAlt}
                style={{ width: '100%', aspectRatio: '1', objectFit: 'contain', borderRadius: 14 }}
              />
              <span
                style={{ fontSize: 12.5, color: 'var(--muted)', textAlign: 'center', lineHeight: 1.6 }}
              >
                <T
                  th="บันทึกรูปแล้วเปิดในแอปธนาคาร หรือสแกนจากอีกเครื่อง"
                  en="Save the image and open your banking app, or scan from another device"
                />
              </span>
              <Btn kind="ghost" size="sm" onClick={saveQr}>
                <T th="บันทึกรูป QR" en="Save QR image" />
              </Btn>
            </div>

            <div className="pay-m-card" style={{ gap: 16 }}>
              <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                <PosterTile booking={booking} width="62px" radius={12} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 }}>
                  <span className="mono" style={{ ...MONO_LABEL, fontSize: 10 }}>
                    <T th="รายการที่จอง" en="your booking" />
                  </span>
                  <span
                    style={{
                      fontFamily: 'var(--font-display-th)',
                      fontWeight: 500,
                      fontSize: 17,
                      lineHeight: 1.25,
                      color: 'var(--teal-deep)',
                    }}
                  >
                    {booking?.title || '—'}
                  </span>
                  <span className="mono" style={{ ...MONO_LABEL, fontSize: 9.5, letterSpacing: '0.14em' }}>
                    <T th="1 ที่นั่ง · จองไว้ชั่วคราว" en="1 seat · held temporarily" />
                  </span>
                </div>
              </div>

              <div style={{ height: 1, background: 'rgba(13,30,29,.08)' }} />

              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                  fontSize: 13,
                  color: 'var(--muted)',
                  lineHeight: 1.5,
                }}
              >
                {booking && <BookingMeta booking={booking} lang={lang} size={16} />}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '0 4px' }}>
              <HoldNote circle={30} handSize={19} bodySize={12.5} />
            </div>

            <Link href="/me/bookings" style={{ fontSize: 13, color: 'var(--muted)', textAlign: 'center' }}>
              <T th="ไว้ทีหลัง — ไปที่การจองของฉัน" en="Later — go to my bookings" />
            </Link>
          </>
        ) : (
          <div className="pay-m-card pay-state" style={{ paddingTop: 32, paddingBottom: 32 }}>
            <StateBody
              state={state}
              error={error}
              retryable={retryable}
              onRetry={() => void load(false)}
              giftUrl={giftUrl}
            />
          </div>
        )}
      </div>

      {/* Pinned: the card lane must stay reachable however far down the page the
          user has scrolled, without competing with the QR for the fold. */}
      <footer className="pay-m-foot">
        <Btn
          kind="teal"
          onClick={payByCard}
          disabled={cardLoading || state !== 'ready'}
          style={{ width: '100%', justifyContent: 'center', minHeight: 50 }}
        >
          <T th="จ่ายด้วยบัตรเครดิต / Mobile banking" en="Pay by card / Mobile banking" />
        </Btn>
        <span
          className="mono"
          style={{
            fontSize: 9.5,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: 'var(--muted)',
            textAlign: 'center',
          }}
        >
          <T th="ชำระเงินอย่างปลอดภัยผ่าน beam" en="secure checkout by beam" />
        </span>
      </footer>
    </div>
  );

  return (
    <>
      {desktop}
      {mobile}
    </>
  );
}
