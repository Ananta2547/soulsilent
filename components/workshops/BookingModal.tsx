'use client';

/* Pre-booking application popup, built from the "Application Popups" design.
 * Step 1 reviews the applicant's autofill data (or lists what is missing);
 * step 2 asks the workshop's questions, travel and PDPA consent; a paid
 * round then passes through the QR warning before the booking is created.
 * Every screen is a cream shell with paper cards, a mono eyebrow, and a
 * closing band that says what happens next. */
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useLang, tr, pick } from '@/lib/i18n';
import { fmtDate, fmtDateTime } from '@/lib/datetime';
import { getVault } from '@/lib/vault';
import { getEffectivePrice } from '@/lib/workshop-utils';
import { TRAVEL_OPTIONS, type TravelMethod } from '@/lib/travel';
import type { ApplicationQuestion, Workshop } from '@/lib/types';

/** What POST /api/bookings returns; drives the post-submit popup. */
export type BookingResult = {
  submitted?: boolean;
  mode?: 'selection' | 'free' | 'deposit' | 'paid';
  checkoutUrl?: string;
  amount?: number;
  bookingId?: string;
  /** Group booking secured without payment: the link its members follow. */
  inviteUrl?: string | null;
  error?: string;
};

type Profile = { name?: string; email?: string; phone?: string; date_of_birth?: string | null };
type Vault = {
  prefix?: string;
  firstName?: string;
  lastName?: string;
  nickname?: string;
  dob?: string;
  gender?: string;
  genderOther?: string;
  phone?: string;
  lineId?: string;
  facebook?: string;
  emName?: string;
  emRelation?: string;
  emPhone?: string;
  medical?: string;
  dietary?: string;
};

const PREFIX_LABEL: Record<string, { th: string; en: string }> = {
  mr: { th: 'นาย', en: 'Mr.' },
  mrs: { th: 'นาง', en: 'Mrs.' },
  ms: { th: 'นางสาว', en: 'Ms.' },
};
const GENDER_LABEL: Record<string, { th: string; en: string }> = {
  female: { th: 'หญิง', en: 'Female' },
  male: { th: 'ชาย', en: 'Male' },
  nonbinary: { th: 'ไม่ระบุเพศ', en: 'Non-binary' },
};

// PDPA references linked from the consent clause.
const PDPA_ACT_URL = 'https://ratchakitcha.soc.go.th/documents/17082307.pdf';
const consentLink: React.CSSProperties = { color: 'var(--teal-deep)', textDecoration: 'underline', fontWeight: 600 };

const baht = (n: number) => '฿' + Math.round(n).toLocaleString();

function ageFrom(dob?: string | null): number | null {
  if (!dob) return null;
  const d = new Date(dob + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let a = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) a--;
  return a >= 0 ? a : null;
}

/** Whole days from now until `iso`, floored at 0. */
function daysUntil(iso: string): number {
  const ms = new Date(iso).getTime() - Date.now();
  return Number.isFinite(ms) ? Math.max(0, Math.ceil(ms / 86400000)) : 0;
}

export function BookingModal({
  onClose,
  workshop,
  submitting,
  onSubmit,
  /** 'claim' = taking over a seat somebody already paid for. Same form, but
   *  nothing is owed, so the payment warning and the pay wording drop out. */
  mode = 'book',
  bookingKind = 'group',
  privatePrice = null,
  tierLabel = null,
  groupSeats = 1,
}: {
  onClose: () => void;
  workshop: Workshop;
  submitting: boolean;
  onSubmit: (application: unknown) => Promise<BookingResult>;
  mode?: 'book' | 'claim';
  /** Session-based activities: 'private' takes the whole round at privatePrice. */
  bookingKind?: 'group' | 'private';
  /** Price of the picked tier when it is not the plain seat price. */
  privatePrice?: number | null;
  /** Name of the picked tier, shown on the form so the learner sees what
   *  they chose. */
  tierLabel?: string | null;
  /** Group tiers: how many seats this booking buys (the booker included). */
  groupSeats?: number;
}) {
  const claiming = mode === 'claim';
  const { lang } = useLang();
  const th = lang === 'th';
  const [step, setStep] = useState<1 | 2>(1);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [vault, setVault] = useState<Vault>({});
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [consent, setConsent] = useState<'' | 'granted' | 'denied'>('');
  // How the applicant gets to the venue. Private vehicles must give a plate so
  // staff can arrange parking and identify vehicles on site.
  const [travel, setTravel] = useState<TravelMethod | ''>('');
  const [plate, setPlate] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<BookingResult | null>(null);

  const requireConsent = !!workshop.require_consent;
  // Nobody travels to an online workshop, so the travel question (and the plate
  // that follows a private vehicle) is dropped from the form entirely rather
  // than asked and ignored.
  const isOnline = !!workshop.is_online;

  const questions = useMemo<ApplicationQuestion[]>(() => {
    try {
      const q = JSON.parse(workshop.application_form || '[]');
      return Array.isArray(q) ? q : [];
    } catch {
      return [];
    }
  }, [workshop.application_form]);

  // Fresh mount per open (parent renders conditionally) → load profile + vault.
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/auth/me');
        const d = (await r.json()) as { user?: Profile };
        setProfile(d.user || null);
      } catch {}
      try {
        const raw = await getVault();
        if (raw && Object.keys(raw).length > 0) setVault(raw as unknown as Vault);
      } catch {}
    })();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const fullName = [vault.firstName, vault.lastName].filter(Boolean).join(' ') || profile?.name || '';
  const prefixLabel = vault.prefix && PREFIX_LABEL[vault.prefix] ? pick(PREFIX_LABEL[vault.prefix], lang) : '';
  // DOB now lives in the autofill vault; fall back to the legacy profile column.
  const age = ageFrom(vault.dob || profile?.date_of_birth);
  const phone = vault.phone || profile?.phone || '';

  // Age restriction (per workshop). null on either end = no limit there. Only
  // block when we actually know the age — a missing DOB is handled by the
  // `missing` gate below (it asks the user to complete their profile first).
  const minAge = workshop.min_age ?? null;
  const maxAge = workshop.max_age ?? null;
  const ageBlocked = age != null && ((minAge != null && age < minAge) || (maxAge != null && age > maxAge));
  const genderLabel =
    vault.gender === 'other'
      ? vault.genderOther || ''
      : vault.gender && GENDER_LABEL[vault.gender]
        ? pick(GENDER_LABEL[vault.gender], lang)
        : '';

  // Required applicant info (read from profile + autofill vault). The Next
  // button stays locked until all are present — the user edits them on the
  // "ข้อมูลกรอกอัตโนมัติ" (autofill) settings page, not in this popup.
  // Emergency contact is OPTIONAL. Health/allergies is required ("ไม่มี" if none).
  const missing: string[] = [];
  if (!(vault.firstName || '').trim() || !(vault.lastName || '').trim()) missing.push(tr(lang, 'ชื่อ-นามสกุล', 'Full name'));
  if (!(vault.nickname || '').trim()) missing.push(tr(lang, 'ชื่อเล่น', 'Nickname'));
  if (age == null) missing.push(tr(lang, 'อายุ', 'Age'));
  if (!vault.gender || (vault.gender === 'other' && !(vault.genderOther || '').trim())) missing.push(tr(lang, 'เพศ', 'Gender'));
  if (!phone.trim()) missing.push(tr(lang, 'โทร', 'Phone'));
  if (!(vault.lineId || '').trim()) missing.push('Line ID');
  if (!(vault.medical || '').trim()) missing.push(tr(lang, 'เงื่อนไขสุขภาพ / แพ้', 'Medical / allergies'));
  const incomplete = missing.length > 0;

  const travelOption = TRAVEL_OPTIONS.find((o) => o.value === travel);
  const travelNeedsPlate = !!travelOption?.needsPlate;

  // An online workshop with no custom questions and no consent clause has
  // nothing left to ask, so step 2 would be an empty page. Drop it: step 1
  // submits directly and the header stops promising a second step.
  const hasStep2 = !isOnline || questions.length > 0 || requireConsent;

  // Anything that leads to a payment QR (paid / deposit) → the QR warning
  // popup comes first and the booking is created only after the user confirms.
  const willPay = !claiming && workshop.payment_type !== 'free' && workshop.admission_type !== 'selection';
  const isDepositType = workshop.payment_type === 'deposit';
  const seatPrice = getEffectivePrice(workshop).price;
  const fullTotal = privatePrice != null ? privatePrice : seatPrice * Math.max(1, groupSeats);
  const dueNow = isDepositType ? workshop.deposit_amount : fullTotal;

  const submitLabel = submitting
    ? tr(lang, 'กำลังดำเนินการ…', 'Processing…')
    : claiming
      ? tr(lang, 'ยืนยันรับสิทธิ์', 'Confirm and claim')
      : !willPay
        ? tr(lang, 'ส่งใบสมัคร', 'Submit application')
        : tr(lang, 'ส่งใบสมัคร & ไปหน้าชำระเงิน', 'Submit & go to payment');

  function goNext() {
    if (incomplete) return;
    setErr(null);
    setStep(2);
  }

  // Holds the built application while the QR warning popup is shown — the booking
  // is NOT created until the user confirms, so Cancel leaves nothing in the DB and
  // takes no seat quota.
  const [pendingApp, setPendingApp] = useState<Record<string, unknown> | null>(null);
  const [paying, setPaying] = useState(false);

  async function submit() {
    setErr(null);
    for (const q of questions) {
      if (!q.required) continue;
      const v = answers[q.id];
      const empty = q.type === 'checkbox' ? !(Array.isArray(v) && v.length > 0) : !v || (typeof v === 'string' && !v.trim());
      if (empty) {
        setErr(tr(lang, 'กรุณาตอบคำถามที่จำเป็นให้ครบ', 'Please answer all required questions.'));
        return;
      }
    }
    if (!isOnline) {
      if (!travel) {
        setErr(tr(lang, 'กรุณาเลือกวิธีการเดินทาง', 'Please choose how you will travel here.'));
        return;
      }
      if (travelNeedsPlate && !plate.trim()) {
        setErr(tr(lang, 'กรุณากรอกทะเบียนรถ', 'Please enter your vehicle plate number.'));
        return;
      }
    }
    if (requireConsent && !consent) {
      setErr(tr(lang, 'กรุณาเลือกความยินยอมการบันทึกเสียง ภาพและวิดีโอ', 'Please choose your audio/photo/video consent.'));
      return;
    }
    const application = {
      profile: {
        prefix: vault.prefix || '',
        firstName: vault.firstName || '',
        lastName: vault.lastName || '',
        nickname: vault.nickname || '',
        fullName: fullName || '—',
        age,
        gender: genderLabel || '—',
        email: profile?.email || '',
        phone,
        facebook: vault.facebook || '',
        lineId: vault.lineId || '',
        emergency: { name: vault.emName || '', relation: vault.emRelation || '', phone: vault.emPhone || '' },
        medical: vault.medical || '',
        dietary: vault.dietary || '',
      },
      answers: questions.map((q) => ({ id: q.id, label: q.label, value: answers[q.id] ?? '' })),
      // Left out for online workshops — the question was never asked, and an
      // empty travel object would read on admin screens as one the applicant
      // skipped. formatTravel() prints "—" when the key is absent.
      ...(isOnline
        ? {}
        : {
            travel: {
              method: travel,
              // Store the Thai label too so admin screens read correctly without
              // having to map the code back.
              label: travelOption?.th || '',
              plate: travelNeedsPlate ? plate.trim() : '',
            },
          }),
      ...(requireConsent
        ? { consent: { photoVideo: consent, label: consent === 'granted' ? 'ยินยอม' : 'ไม่ยินยอม' } }
        : {}),
    };
    if (willPay) {
      setPendingApp(application);
      return;
    }
    const r = await onSubmit(application);
    if (r.error) {
      setErr(r.error);
      return;
    }
    setResult(r);
  }

  // Confirm from the QR warning popup → NOW create the booking (holds the seat +
  // starts the 10-min countdown) and continue to payment.
  async function confirmAndPay() {
    if (!pendingApp || paying) return;
    setErr(null);
    setPaying(true);
    const r = await onSubmit(pendingApp);
    setPaying(false);
    if (r.error) {
      setErr(r.error);
      setPendingApp(null);
      return;
    }
    if (r.mode === 'paid' && r.checkoutUrl) {
      window.location.href = r.checkoutUrl;
      return;
    }
    // deposit → the matching success popup (with its own Proceed-to-Payment button)
    setPendingApp(null);
    setResult(r);
  }

  const whenLine = `${fmtDate(workshop.date, lang, 'medium')} · ${workshop.time_start}–${workshop.time_end}`;
  const seatsLine =
    groupSeats > 1
      ? tr(lang, `${groupSeats} คน (รวมคุณ)`, `${groupSeats} people (you included)`)
      : bookingKind === 'private'
        ? tr(lang, 'เหมาทั้งรอบ', 'the whole round')
        : tr(lang, '1 ที่นั่ง', 'one seat');

  // ---- 4a · QR payment warning — shown BEFORE the booking is created ----
  if (pendingApp) {
    return (
      <Shell onClose={() => !paying && setPendingApp(null)} maxWidth={440} paper>
        <div style={{ background: 'var(--ink)', padding: '26px 26px 22px' }}>
          <Eyebrow color="var(--accent)">{tr(lang, 'ก่อนไปหน้าชำระเงิน', 'Before the payment page')}</Eyebrow>
          <h2 className="display-th" style={{ fontSize: 25, margin: '8px 0 0', color: '#fff', lineHeight: 1.18 }}>
            {th ? <>QR ของคุณมีอายุ<br />10 นาที</> : <>Your QR lives<br />for 10 minutes</>}
          </h2>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 14 }}>
            <span className="display-th" style={{ fontSize: 44, color: 'var(--accent)', lineHeight: 1 }}>10:00</span>
            <span className="mono" style={{ fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', color: '#9ab1ae' }}>{tr(lang, 'เริ่มนับเมื่อกดต่อไป', 'starts when you continue')}</span>
          </div>
        </div>
        <div style={{ padding: '22px 26px 24px' }}>
          {err && <ErrBox>{err}</ErrBox>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 18 }}>
            <Numbered n="1">{tr(lang, 'สแกนและโอนภายใน 10 นาที — ระบบจะยืนยันที่นั่งให้อัตโนมัติ', 'Scan and pay within 10 minutes — your seat is confirmed automatically.')}</Numbered>
            <Numbered n="2">{tr(lang, 'อย่าบันทึกภาพ QR ไว้จ่ายทีหลัง และอย่าสแกนซ้ำ', 'Do not save the QR to pay later, and do not scan it twice.')}</Numbered>
            <Numbered n="!" warn>
              {th ? (
                <>จ่ายช้าหรือจ่ายซ้ำ <b>เงินจะถูกตัดแต่ระบบไม่รับชำระ</b> และไม่ได้ที่นั่งเพิ่ม — ต้องรอธนาคารคืนเงิน</>
              ) : (
                <>A late or repeat payment <b>is taken by your bank but rejected by us</b> and grants no extra seat — you wait for the bank to refund it.</>
              )}
            </Numbered>
          </div>
          <div style={{ background: 'var(--cream)', borderRadius: 16, padding: '12px 15px', marginBottom: 18, fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.6 }}>
            {tr(lang, 'กดยกเลิกได้ — ยังไม่มีการจองเกิดขึ้น และไม่กินที่นั่งของใคร', 'Cancel is safe — nothing is booked yet and no seat is taken.')}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" onClick={() => setPendingApp(null)} disabled={paying} className="btn btn-paper" style={{ flex: 1, justifyContent: 'center', background: 'var(--cream)' }}>
              {tr(lang, 'ยกเลิก', 'Cancel')}
            </button>
            <button type="button" onClick={confirmAndPay} disabled={paying} className="btn btn-ink" style={{ flex: 1.4, justifyContent: 'center' }}>
              {paying ? tr(lang, 'กำลังดำเนินการ…', 'Processing…') : <>{tr(lang, 'รับทราบ ไปชำระเงิน', 'Got it, pay now')} <span className="mono">→</span></>}
            </button>
          </div>
        </div>
      </Shell>
    );
  }

  // ---- Success popups (after submit, except paid which redirects) ----
  if (result) {
    // 5f · claim — the seat was paid for by somebody else.
    if (claiming) {
      return (
        <Shell onClose={onClose} maxWidth={440} paper>
          <Band tone="teal" eyebrow={tr(lang, 'ไม่ต้องชำระเงิน', 'Nothing to pay')} title={tr(lang, 'ที่นั่งเป็นของคุณแล้ว', 'The seat is yours')} />
          <div style={{ padding: '22px 26px 24px' }}>
            <p style={{ fontSize: 13.5, color: 'var(--muted)', lineHeight: 1.65, margin: '0 0 16px' }}>
              {tr(lang, 'เพื่อนของคุณจ่ายค่าที่นั่งนี้ไว้แล้ว — ใบสมัครของคุณถูกบันทึกเรียบร้อย', 'Your friend already paid for this seat — your application is saved.')}
            </p>
            <RoundCard title={workshop.title} when={whenLine} place={isOnline ? 'ONLINE' : workshop.location || '—'} label={tr(lang, 'รอบของคุณ', 'Your round')} />
            <Link href="/me/bookings" className="btn btn-teal" style={{ width: '100%', justifyContent: 'center', boxSizing: 'border-box' }}>
              {tr(lang, 'ดูหน้าการจอง', 'View my bookings')}
            </Link>
            <p style={{ margin: '12px 0 0', textAlign: 'center', fontSize: 12, color: 'var(--muted)' }}>
              {tr(lang, 'รายละเอียดการเตรียมตัวจะส่งทางอีเมลก่อนวันงาน', 'Preparation details arrive by email before the day.')}
            </p>
          </div>
        </Shell>
      );
    }

    // 5e · selection — nothing to pay until picked.
    if (result.mode === 'selection') {
      const at = workshop.announce_at;
      return (
        <Shell onClose={onClose} maxWidth={440} paper>
          <Band tone="cream" eyebrow={tr(lang, 'อยู่ระหว่างคัดเลือก', 'Under selection')} title={tr(lang, 'ส่งใบสมัครเรียบร้อย', 'Application sent')} />
          <div style={{ padding: '22px 26px 24px' }}>
            <Eyebrow color="var(--muted)">{tr(lang, 'ประกาศผล', 'Results')}</Eyebrow>
            <div className="display-th" style={{ fontSize: 27, color: 'var(--ink)', lineHeight: 1.2, margin: '5px 0 3px' }}>
              {at ? fmtDateTime(at, lang, 'medium') : tr(lang, 'จะแจ้งให้ทราบ', 'To be announced')}
            </div>
            <p style={{ fontSize: 13, color: 'var(--muted)', margin: '0 0 18px' }}>
              {at ? tr(lang, `อีก ${daysUntil(at)} วัน`, `in ${daysUntil(at)} days`) : tr(lang, 'ติดตามได้ที่หน้าการจอง', 'Watch your bookings page')}
            </p>
            <div style={{ background: 'var(--cream)', borderRadius: 18, padding: '14px 16px', marginBottom: 18, display: 'flex', flexDirection: 'column', gap: 9 }}>
              <Numbered n="01" plain>{tr(lang, 'ผู้จัดอ่านใบสมัครทุกใบด้วยตัวเอง', 'The host reads every application.')}</Numbered>
              <Numbered n="02" plain>{tr(lang, 'แจ้งผลทางอีเมลและในหน้าการจอง', 'Results go out by email and on your bookings page.')}</Numbered>
              <Numbered n="03" plain>{tr(lang, 'ถ้าได้รับเลือก จึงค่อยชำระเงิน', 'You pay only if you are picked.')}</Numbered>
            </div>
            <Link href="/me/bookings" className="btn btn-teal" style={{ width: '100%', justifyContent: 'center', boxSizing: 'border-box' }}>
              {tr(lang, 'ดูหน้าการจอง', 'View my bookings')}
            </Link>
          </div>
        </Shell>
      );
    }

    // 4b · deposit — one more step: the QR.
    if (result.mode === 'deposit' && result.checkoutUrl) {
      return (
        <Shell onClose={onClose} maxWidth={440} paper>
          <Band tone="cream" eyebrow={tr(lang, 'ขั้นที่ 1 เสร็จแล้ว', 'Step 1 done')} title={tr(lang, 'ส่งใบสมัครเรียบร้อย', 'Application sent')} />
          <div style={{ padding: '22px 26px 24px' }}>
            <Eyebrow color="var(--muted)">{tr(lang, 'เหลืออีกขั้นเดียว · มัดจำ', 'One step left · deposit')}</Eyebrow>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, margin: '6px 0 4px' }}>
              <span className="display-th" style={{ fontSize: 38, color: 'var(--ink)', lineHeight: 1 }}>{baht(result.amount ?? dueNow)}</span>
              <span style={{ fontSize: 13, color: 'var(--muted)' }}>{tr(lang, `จากยอดเต็ม ${baht(fullTotal)}`, `of ${baht(fullTotal)} in full`)}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 18 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--teal)' }} />
              <span style={{ fontSize: 13, color: 'var(--teal-deep)', fontWeight: 600 }}>{tr(lang, 'ขอคืนมัดจำได้ในวันงาน (เฉพาะการโอน)', 'Deposit refundable on the day (transfer only)')}</span>
            </div>
            <div style={{ background: 'var(--ink)', borderRadius: 18, padding: '14px 16px', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <span style={{ fontSize: 14 }}>⚠️</span>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--accent)', letterSpacing: '.01em' }}>{tr(lang, 'QR หมดอายุใน 10 นาที', 'The QR expires in 10 minutes')}</span>
              </div>
              <div style={{ fontSize: 12.5, color: '#d7e0df', lineHeight: 1.55, marginTop: 6 }}>{qrWarningText(lang)}</div>
            </div>
            <button type="button" onClick={() => { window.location.href = result.checkoutUrl!; }} className="btn btn-teal" style={{ width: '100%', justifyContent: 'center' }}>
              {tr(lang, 'ดำเนินการชำระเงิน', 'Proceed to payment')} <span className="mono">→</span>
            </button>
            <p style={{ margin: '12px 0 0', textAlign: 'center', fontSize: 12, color: 'var(--muted)' }}>
              {tr(lang, 'ที่นั่งถูกกันไว้ให้จนกว่า QR จะหมดอายุ', 'Your seat is held until the QR expires.')}
            </p>
          </div>
        </Shell>
      );
    }

    // 4c · free group with an invite link for the rest of the party.
    if (result.inviteUrl) {
      const friends = Math.max(0, groupSeats - 1);
      return (
        <Shell onClose={onClose} maxWidth={440} paper>
          <Band tone="cream" eyebrow={tr(lang, 'ที่นั่งเป็นของกลุ่มคุณแล้ว', 'The seats are your group’s')} title={tr(lang, 'ส่งใบสมัครเรียบร้อย', 'Application sent')} />
          <div style={{ padding: '22px 26px 24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <span style={{ display: 'flex', alignItems: 'center' }}>
                <span style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--teal)', color: '#fff', fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{tr(lang, 'คุณ', 'you')}</span>
                {Array.from({ length: Math.min(friends, 4) }, (_, i) => (
                  <span key={i} style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--cream-deep)', color: 'var(--muted)', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', marginLeft: -7 }}>?</span>
                ))}
              </span>
              <span style={{ fontSize: 13, color: 'var(--ink)' }}>
                <b>{tr(lang, `1 จาก ${groupSeats} ที่นั่ง`, `1 of ${groupSeats} seats`)}</b> {tr(lang, `ถูกใช้แล้ว — ชวนอีก ${friends} คน`, `taken — invite ${friends} more`)}
              </span>
            </div>
            <Eyebrow color="var(--muted)" style={{ marginBottom: 8 }}>{tr(lang, 'ลิงก์เชิญเพื่อนในกลุ่ม', 'Invite link for your group')}</Eyebrow>
            <CopyRow url={result.inviteUrl} lang={lang} />
            <p style={{ margin: '0 0 16px', fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.6 }}>
              {tr(lang, 'แต่ละคนต้องเข้าสู่ระบบและกรอกใบสมัครของตัวเอง', 'Each person signs in and fills in their own application.')}
            </p>
            <div style={{ display: 'flex', gap: 10, background: 'var(--cream)', borderRadius: 16, padding: '12px 15px', marginBottom: 18 }}>
              <span style={{ flexShrink: 0, color: 'var(--accent)', fontSize: 14, lineHeight: 1.4 }}>✺</span>
              <span style={{ fontSize: 12.5, color: 'var(--ink)', lineHeight: 1.6 }}>
                {tr(lang, 'ใครเปิดลิงก์และกดรับสิทธิ์จะได้ที่นั่งทันทีจนครบจำนวน — ส่งให้เฉพาะคนในกลุ่ม', 'Whoever opens it and claims takes a seat until they run out — send it only to your group.')}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <Link href="/me/bookings" className="btn btn-paper" style={{ flex: 1, justifyContent: 'center', background: 'var(--cream)', boxSizing: 'border-box' }}>
                {tr(lang, 'ดูหน้าการจอง', 'My bookings')}
              </Link>
              <ShareButton url={result.inviteUrl} title={workshop.title} lang={lang} />
            </div>
            <p style={{ margin: '12px 0 0', textAlign: 'center', fontSize: 12, color: 'var(--muted)' }}>
              {tr(lang, 'เปิดลิงก์นี้อีกครั้งได้จากหน้ากิจกรรม', 'You can open this link again from the journey page.')}
            </p>
          </div>
        </Shell>
      );
    }

    // Free single seat — nothing else to do.
    return (
      <Shell onClose={onClose} maxWidth={440} paper>
        <Band tone="cream" eyebrow={tr(lang, 'ที่นั่งเป็นของคุณแล้ว', 'The seat is yours')} title={tr(lang, 'ส่งใบสมัครเรียบร้อย', 'Application sent')} />
        <div style={{ padding: '22px 26px 24px' }}>
          <RoundCard title={workshop.title} when={whenLine} place={isOnline ? 'ONLINE' : workshop.location || '—'} label={tr(lang, 'รอบของคุณ', 'Your round')} />
          <Link href="/me/bookings" className="btn btn-teal" style={{ width: '100%', justifyContent: 'center', boxSizing: 'border-box' }}>
            {tr(lang, 'ดูหน้าการจอง', 'View my bookings')}
          </Link>
          <p style={{ margin: '12px 0 0', textAlign: 'center', fontSize: 12, color: 'var(--muted)' }}>
            {tr(lang, 'รายละเอียดการเตรียมตัวจะส่งทางอีเมลก่อนวันงาน', 'Preparation details arrive by email before the day.')}
          </p>
        </div>
      </Shell>
    );
  }

  // ---- 5g · Age restriction — blocks entry to the application form ----
  if (ageBlocked) {
    const rangeTh = minAge != null && maxAge != null ? `${minAge}–${maxAge} ปี` : minAge != null ? `${minAge} ปีขึ้นไป` : `ไม่เกิน ${maxAge} ปี`;
    const rangeEn = minAge != null && maxAge != null ? `${minAge}–${maxAge}` : minAge != null ? `${minAge} and over` : `up to ${maxAge}`;
    return (
      <Shell onClose={onClose} maxWidth={420} paper>
        <div style={{ padding: '28px 26px 24px' }}>
          <Eyebrow color="#a04a14">{tr(lang, 'คุณสมบัติไม่ตรงเงื่อนไข', 'Not eligible')}</Eyebrow>
          <h2 className="display-th" style={{ fontSize: 24, margin: '9px 0 0', lineHeight: 1.25 }}>
            {th ? <>รอบนี้จำกัดอายุ<br />{rangeTh}</> : <>This round is for<br />ages {rangeEn}</>}
          </h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--cream)', borderRadius: 16, padding: '12px 15px', margin: '16px 0 14px' }}>
            <Eyebrow color="var(--muted)">{tr(lang, 'อายุของคุณ', 'Your age')}</Eyebrow>
            <b className="display-th" style={{ fontSize: 20, color: 'var(--ink)', marginLeft: 'auto' }}>{tr(lang, `${age} ปี`, `${age}`)}</b>
          </div>
          <p style={{ fontSize: 13.5, color: 'var(--muted)', lineHeight: 1.65, margin: '0 0 20px' }}>
            {tr(lang, 'ผู้จัดกำหนดช่วงอายุไว้เพื่อให้เนื้อหาเหมาะกับกลุ่มผู้เข้าร่วม — ลองดูกิจกรรมอื่นที่เปิดรับทุกวัย', 'The host set an age range so the content fits the group — try another journey that is open to all ages.')}
          </p>
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" onClick={onClose} className="btn btn-paper" style={{ flex: 1, justifyContent: 'center', background: 'var(--cream)' }}>{tr(lang, 'ปิด', 'Close')}</button>
            <Link href="/journeys" className="btn btn-ink" style={{ flex: 1.2, justifyContent: 'center', boxSizing: 'border-box' }}>
              {tr(lang, 'ดูกิจกรรมอื่น', 'Other activities')} <span className="mono">→</span>
            </Link>
          </div>
        </div>
      </Shell>
    );
  }

  const stepPills = hasStep2 ? (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <Pill on={step === 1} done={step === 2}>{step === 2 ? '✓ ' : '1 · '}{tr(lang, 'ข้อมูลผู้สมัคร', 'Applicant')}</Pill>
      <span style={{ width: 14, height: 1, background: 'rgba(13,30,29,.15)' }} />
      <Pill on={step === 2}>2 · {tr(lang, 'คำถามเพิ่มเติม', 'A few questions')}</Pill>
    </div>
  ) : (
    <Eyebrow>{claiming ? tr(lang, 'รับสิทธิ์ · ขั้นตอนเดียว', 'Claim · one step') : tr(lang, 'ขั้นตอนเดียว · ออนไลน์', 'One step · online')}</Eyebrow>
  );

  // Rows of what the applicant already has; the design merges related fields.
  const nameLine = [prefixLabel, fullName].filter(Boolean).join(' ');
  const ageGender = [age != null ? tr(lang, `${age} ปี`, `${age} yrs`) : '', genderLabel].filter(Boolean).join(' · ');
  const socials = [vault.lineId, vault.facebook].filter(Boolean).join(' · ');

  const editLink = (
    <Link href="/me/settings?tab=autofill" style={{ fontSize: 13, color: 'var(--teal-deep)', fontWeight: 600, textDecoration: 'underline', textUnderlineOffset: 3 }}>
      {tr(lang, 'แก้ไขข้อมูลกรอกอัตโนมัติ', 'Edit autofill data')}
    </Link>
  );

  return (
    <Shell onClose={onClose} maxWidth={hasStep2 && step === 2 ? 640 : 560} top>
      {/* Header */}
      <div style={{ background: 'var(--paper)', padding: '20px 26px 18px', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {step === 1 && incomplete ? <Pill on>1 · {tr(lang, 'ข้อมูลผู้สมัคร', 'Applicant')}</Pill> : stepPills}
          <h2 className="display-th" style={{ fontSize: 24, margin: '10px 0 0' }}>
            {step === 2
              ? tr(lang, willPay ? 'อีกไม่กี่ข้อ ก่อนถึงการชำระเงิน' : 'อีกไม่กี่ข้อ ก่อนส่งใบสมัคร', willPay ? 'A few things before payment' : 'A few things before you send')
              : incomplete
                ? tr(lang, `ยังขาดข้อมูลอยู่ ${missing.length} ช่อง`, `${missing.length} fields still missing`)
                : hasStep2
                  ? tr(lang, 'ตรวจดูอีกครั้งก่อนส่ง', 'Check once more before sending')
                  : willPay
                    ? tr(lang, 'ยืนยันข้อมูล แล้วชำระเงินได้เลย', 'Confirm and go straight to payment')
                    : tr(lang, 'ยืนยันข้อมูล แล้วส่งได้เลย', 'Confirm and send')}
          </h2>
          <p style={{ margin: '5px 0 0', fontSize: 13, color: 'var(--muted)' }}>
            {step === 2
              ? `${workshop.title} · ${whenLine}${groupSeats > 1 ? ` · ${seatsLine}` : ''}`
              : incomplete
                ? tr(lang, 'กรอกให้ครบก่อน จึงจะจองต่อได้', 'Fill these in first, then you can continue.')
                : !hasStep2 && isOnline
                  ? tr(lang, 'ลิงก์เข้าห้องจะส่งไปที่อีเมลด้านล่าง', 'The room link goes to the email below.')
                  : tr(lang, 'ดึงจากโปรไฟล์ของคุณอัตโนมัติ', 'Pulled from your profile automatically.')}
          </p>
        </div>
        <CloseBtn onClick={onClose} />
      </div>

      {/* Body */}
      <div style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {err && <ErrBox>{err}</ErrBox>}

        {step === 1 && incomplete && (
          <>
            <Card>
              <Eyebrow color="#a04a14" style={{ marginBottom: 10 }}>{tr(lang, 'ต้องกรอกเพิ่ม', 'Still needed')}</Eyebrow>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {missing.map((m) => (
                  <span key={m} style={{ padding: '8px 14px', borderRadius: 999, background: '#fdeee0', color: '#a04a14', fontSize: 13, fontWeight: 600 }}>{m}</span>
                ))}
              </div>
              <Link href="/me/settings?tab=autofill" className="btn btn-ink" style={{ marginTop: 14, width: '100%', justifyContent: 'center', boxSizing: 'border-box' }}>
                {tr(lang, 'ไปกรอกข้อมูลกรอกอัตโนมัติ', 'Go fill in autofill data')} <span className="mono">→</span>
              </Link>
            </Card>
            {(nameLine || phone || profile?.email) && (
              <Card>
                <Eyebrow style={{ marginBottom: 10 }}>{tr(lang, 'ที่มีอยู่แล้ว', 'Already there')}</Eyebrow>
                <KV rows={[[tr(lang, 'ชื่อ-นามสกุล', 'Full name'), nameLine], [tr(lang, 'โทร', 'Phone'), phone], [tr(lang, 'อีเมล', 'Email'), profile?.email || '']]} />
              </Card>
            )}
          </>
        )}

        {step === 1 && !incomplete && hasStep2 && (
          <>
            <div style={{ background: 'var(--teal-50)', borderRadius: 22, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <Eyebrow>{tr(lang, 'รอบที่เลือก', 'Your pick')}</Eyebrow>
                <div style={{ fontSize: 13.5, color: 'var(--ink)', marginTop: 4, lineHeight: 1.5 }}>
                  {[tierLabel, seatsLine, whenLine].filter(Boolean).join(' · ')}
                </div>
              </div>
              {!claiming && <b className="display-th" style={{ fontSize: 22, color: 'var(--teal-deep)' }}>{workshop.payment_type === 'free' ? tr(lang, 'ฟรี', 'Free') : baht(fullTotal)}</b>}
            </div>
            <Card>
              <Eyebrow style={{ marginBottom: 10 }}>{tr(lang, 'ชื่อ & อายุ', 'Name & age')}</Eyebrow>
              <KV rows={[[tr(lang, 'ชื่อ-นามสกุล', 'Full name'), nameLine], [tr(lang, 'ชื่อเล่น', 'Nickname'), vault.nickname || ''], [tr(lang, 'อายุ · เพศ', 'Age · gender'), ageGender]]} />
            </Card>
            <Card>
              <Eyebrow style={{ marginBottom: 10 }}>{tr(lang, 'ช่องทางติดต่อ', 'Contact')}</Eyebrow>
              <KV rows={[[tr(lang, 'โทร', 'Phone'), phone], [tr(lang, 'อีเมล', 'Email'), profile?.email || ''], ['Line · Facebook', socials]]} />
            </Card>
            <Card>
              <Eyebrow style={{ marginBottom: 10 }}>{tr(lang, 'สุขภาพ & อาหาร', 'Health & food')}</Eyebrow>
              <KV
                rows={[
                  [tr(lang, 'เงื่อนไขสุขภาพ / แพ้', 'Medical / allergies'), vault.medical || ''],
                  [tr(lang, 'ข้อจำกัดอาหาร', 'Food restrictions'), vault.dietary || ''],
                ]}
                tail={[tr(lang, 'ผู้ติดต่อฉุกเฉิน', 'Emergency contact'), tr(lang, 'เก็บเป็นความลับ ใช้เฉพาะกรณีฉุกเฉินในวันงาน', 'Kept private; used only in an emergency on the day.')]}
              />
            </Card>
          </>
        )}

        {step === 1 && !incomplete && !hasStep2 && (
          <Card>
            <Eyebrow style={{ marginBottom: 10 }}>{tr(lang, 'ผู้สมัคร', 'Applicant')}</Eyebrow>
            <KV
              rows={[
                [tr(lang, 'ชื่อ-นามสกุล', 'Full name'), `${nameLine}${vault.nickname ? ` (${vault.nickname})` : ''}`],
                [tr(lang, 'อายุ · เพศ', 'Age · gender'), ageGender],
                [tr(lang, 'อีเมล · Line', 'Email · Line'), [profile?.email, vault.lineId].filter(Boolean).join(' · ')],
                [tr(lang, 'โทร', 'Phone'), phone],
              ]}
            />
            <div style={{ marginTop: 12 }}>{editLink}</div>
          </Card>
        )}

        {step === 2 && (
          <>
            {!isOnline && (
              <Card pad="18px 20px">
                <Eyebrow style={{ marginBottom: 4 }}>01 — {tr(lang, 'การเดินทาง', 'Getting there')}</Eyebrow>
                <QLabel required>{tr(lang, 'คุณจะเดินทางมายังไง', 'How will you travel here?')}</QLabel>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {TRAVEL_OPTIONS.map((o) => (
                    <Chip
                      key={o.value}
                      on={travel === o.value}
                      onClick={() => {
                        setTravel(o.value);
                        // Switching to public transport drops any plate typed
                        // earlier so it can't be submitted by accident.
                        if (!o.needsPlate) setPlate('');
                      }}
                    >
                      {pick(o, lang)}
                    </Chip>
                  ))}
                </div>
                {travelNeedsPlate && (
                  <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px dashed var(--teal-100)' }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)', marginBottom: 7 }}>
                      {tr(lang, 'ทะเบียนรถ', 'Vehicle plate')} <span style={{ color: '#d35d52' }}>*</span>
                    </div>
                    <input className="field" value={plate} onChange={(e) => setPlate(e.target.value)} placeholder={tr(lang, 'เช่น กข 1234 กรุงเทพมหานคร', 'e.g. 1กข 1234 Bangkok')} />
                  </div>
                )}
              </Card>
            )}

            {questions.length > 0 && (
              <Card pad="18px 20px">
                <Eyebrow style={{ marginBottom: 14 }}>{isOnline ? '01' : '02'} — {tr(lang, 'คำถามจากผู้จัด', 'From the host')}</Eyebrow>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                  {questions.map((q) => (
                    <div key={q.id}>
                      <QLabel required={q.required} optionalLabel={tr(lang, 'ไม่บังคับ', 'optional')}>{q.label}</QLabel>
                      {q.type === 'textarea' ? (
                        <textarea className="field" rows={3} value={(answers[q.id] as string) || ''} onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))} />
                      ) : q.type === 'select' ? (
                        <select className="field" value={(answers[q.id] as string) || ''} onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}>
                          <option value="">{tr(lang, '— เลือก —', '— Select —')}</option>
                          {(q.options || []).map((opt, i) => (
                            <option key={i} value={opt}>{opt}</option>
                          ))}
                        </select>
                      ) : q.type === 'radio' ? (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                          {(q.options || []).map((opt, i) => (
                            <Chip key={i} on={answers[q.id] === opt} onClick={() => setAnswers((a) => ({ ...a, [q.id]: opt }))}>{opt}</Chip>
                          ))}
                        </div>
                      ) : q.type === 'checkbox' ? (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                          {(q.options || []).map((opt, i) => {
                            const cur = Array.isArray(answers[q.id]) ? (answers[q.id] as string[]) : [];
                            const on = cur.includes(opt);
                            return (
                              <Chip key={i} on={on} onClick={() => setAnswers((a) => {
                                const arr = Array.isArray(a[q.id]) ? (a[q.id] as string[]) : [];
                                return { ...a, [q.id]: on ? arr.filter((x) => x !== opt) : [...arr, opt] };
                              })}>
                                {on ? '✓ ' : ''}{opt}
                              </Chip>
                            );
                          })}
                        </div>
                      ) : (
                        <input className="field" value={(answers[q.id] as string) || ''} onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))} />
                      )}
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {requireConsent && (
              <Card pad="18px 20px">
                <Eyebrow style={{ marginBottom: 4 }}>{String((isOnline ? 1 : 2) + (questions.length > 0 ? 1 : 0)).padStart(2, '0')} — {tr(lang, 'ความยินยอม (PDPA)', 'Consent (PDPA)')}</Eyebrow>
                <QLabel required>{tr(lang, 'ในงานมีการถ่ายภาพ วิดีโอ และบันทึกเสียง', 'Photos, video and audio are recorded at the event')}</QLabel>
                <ul style={{ margin: '0 0 12px', paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 5, fontSize: 13.5, color: 'var(--ink)', lineHeight: 1.6 }}>
                  <li>{tr(lang, 'ใช้เพื่อประชาสัมพันธ์กิจกรรมของ Soul Silent เท่านั้น', 'Used only to promote Soul Silent activities')}</li>
                  <li>{tr(lang, 'เผยแพร่บนเว็บไซต์และโซเชียลของเราและทีมผู้จัด', 'Published on our website and social channels and the organisers’')}</li>
                  <li>{tr(lang, 'ถอนความยินยอมภายหลังได้ ตาม พ.ร.บ. คุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562', 'You can withdraw consent later under the PDPA (B.E. 2562)')}</li>
                </ul>
                <details style={{ marginBottom: 14 }}>
                  <summary style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: 'var(--teal-deep)', fontWeight: 600, listStyle: 'none', padding: '2px 0' }}>
                    <span className="mono" style={{ fontSize: 11 }}>▾</span>
                    <span style={{ textDecoration: 'underline', textUnderlineOffset: 3 }}>{tr(lang, 'อ่านข้อความยินยอมฉบับเต็ม', 'Read the full consent clause')}</span>
                  </summary>
                  <div style={{ marginTop: 10, background: 'var(--cream)', borderRadius: 14, padding: '12px 14px', fontSize: 12.5, color: 'var(--ink)', lineHeight: 1.65 }}>
                    <p style={{ margin: '0 0 8px' }}>
                      {th ? (
                        <>
                          ตาม &ldquo;<a href={PDPA_ACT_URL} target="_blank" rel="noopener noreferrer" style={consentLink}>พระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562</a>&rdquo; หรือ PDPA (Personal Data Protection Act) ที่เป็นกฎหมายให้สิทธิแก่เจ้าของข้อมูลส่วนบุคคลในการควบคุมการเก็บรวบรวม ใช้ และเปิดเผยข้อมูลของตน โดยกำหนดให้องค์กรหรือผู้ควบคุมข้อมูลต้องขอความยินยอมอย่างชัดเจน โปร่งใส และมีการป้องกันข้อมูลส่วนบุคคล (เช่น ชื่อ เบอร์โทร อีเมล รูปถ่าย) ให้ปลอดภัย
                        </>
                      ) : (
                        <>
                          Under Thailand&rsquo;s <a href={PDPA_ACT_URL} target="_blank" rel="noopener noreferrer" style={consentLink}>Personal Data Protection Act</a> (PDPA, B.E. 2562), data subjects have the right to control the collection, use, and disclosure of their personal data. Organizations must obtain clear, transparent consent and keep personal data (name, phone, email, photos) secure.
                        </>
                      )}
                    </p>
                    <p style={{ margin: 0 }}>
                      {tr(
                        lang,
                        'และเนื่องจากภายในงานครั้งนี้ จะมีการบันทึกเสียง ภาพและวิดีโอ เพื่อนำไปใช้ในการประชาสัมพันธ์กิจกรรม การตลาด และการสื่อสารภาพลักษณ์ของแบรนด์ ผ่านช่องทางต่าง ๆ ของ Soul Silent และทีมผู้จัด เช่น เว็บไซต์ โซเชียลมีเดีย (Facebook, Instagram, TikTok ฯลฯ) ทางทีมงานจึงขออนุญาต และขอความยินยอม จากทุกท่านในการบันทึกและเผยแพร่ข้อมูลดังกล่าว',
                        'This event will be recorded (audio, photos & video) for activity PR, marketing, and brand communication across the channels of Soul Silent and the organizing team (website, social media — Facebook, Instagram, TikTok, etc.). We therefore ask for your consent to record and publish such data.'
                      )}
                    </p>
                  </div>
                </details>
                <div style={{ display: 'flex', gap: 6, background: 'var(--cream)', borderRadius: 999, padding: 4 }}>
                  <Seg on={consent === 'granted'} onClick={() => setConsent('granted')}>{tr(lang, 'ยินยอม', 'I consent')}</Seg>
                  <Seg on={consent === 'denied'} onClick={() => setConsent('denied')}>{tr(lang, 'ไม่ยินยอม', 'I do not consent')}</Seg>
                </div>
              </Card>
            )}
          </>
        )}
      </div>

      {/* Footer */}
      {step === 1 && incomplete ? (
        <div style={{ background: 'var(--paper)', padding: '16px 22px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>{tr(lang, 'ที่นั่งยังไม่ถูกกันไว้', 'No seat is held yet')}</span>
          <button type="button" disabled className="btn btn-teal" style={{ marginLeft: 'auto', opacity: 0.45, cursor: 'not-allowed' }}>
            {tr(lang, 'ถัดไป', 'Next')} <span className="mono">→</span>
          </button>
        </div>
      ) : step === 1 && hasStep2 ? (
        <div style={{ background: 'var(--paper)', padding: '16px 22px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          {editLink}
          <button type="button" onClick={goNext} className="btn btn-ink" style={{ marginLeft: 'auto' }}>
            {tr(lang, 'ถัดไป', 'Next')} <span className="mono">→</span>
          </button>
        </div>
      ) : willPay ? (
        <div style={{ background: 'var(--ink)', padding: '18px 22px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, background: 'rgba(245,194,67,.14)', borderRadius: 16, padding: '12px 14px', marginBottom: 14 }}>
            <span style={{ fontSize: 15, lineHeight: 1.3 }}>⚠️</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)', lineHeight: 1.45 }}>{tr(lang, 'หน้าถัดไปคือ QR ชำระเงิน — มีอายุ 10 นาที', 'Next is the payment QR — it lives 10 minutes')}</div>
              <div style={{ fontSize: 12.5, color: '#d7e0df', lineHeight: 1.55, marginTop: 3 }}>{qrWarningText(lang)}</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            {step === 2 && (
              <button type="button" onClick={() => setStep(1)} style={{ background: 'transparent', border: 0, color: '#9ab1ae', font: 'inherit', fontSize: 13.5, cursor: 'pointer', padding: '6px 0' }}>
                ← {tr(lang, 'ย้อนกลับ', 'Back')}
              </button>
            )}
            <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
              <Eyebrow color="#9ab1ae">{isDepositType ? tr(lang, 'มัดจำ', 'Deposit') : tr(lang, 'ยอดชำระ', 'Amount due')}</Eyebrow>
              <div className="display-th" style={{ fontSize: 22, color: '#fff', lineHeight: 1.1 }}>
                {baht(dueNow)}
                {isDepositType && <span style={{ fontSize: 12, color: '#9ab1ae', marginLeft: 6 }}>{tr(lang, `จากยอดเต็ม ${baht(fullTotal)}`, `of ${baht(fullTotal)}`)}</span>}
              </div>
            </div>
            <button type="button" onClick={submit} disabled={submitting} className="btn btn-teal" style={{ flex: '1 0 100%', justifyContent: 'center' }}>
              {submitLabel} {!submitting && <span className="mono">→</span>}
            </button>
          </div>
        </div>
      ) : (
        <div style={{ background: 'var(--paper)', padding: '16px 22px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          {step === 2 ? (
            <button type="button" onClick={() => setStep(1)} className="btn btn-paper btn-sm" style={{ background: 'var(--cream)' }}>
              ← {tr(lang, 'ย้อนกลับ', 'Back')}
            </button>
          ) : (
            editLink
          )}
          <button type="button" onClick={submit} disabled={submitting} className="btn btn-teal" style={{ marginLeft: 'auto' }}>
            {submitLabel} {!submitting && <span className="mono">→</span>}
          </button>
        </div>
      )}
    </Shell>
  );
}

function qrWarningText(lang: 'th' | 'en'): string {
  return tr(
    lang,
    'อย่าบันทึก QR ไว้จ่ายทีหลัง และอย่าสแกนซ้ำ — เงินจะถูกตัดแต่ระบบไม่รับชำระ และไม่ได้ที่นั่งเพิ่ม (ธนาคารคืนเงินภายหลัง)',
    'Do not save the QR to pay later or scan it twice — the bank takes the money but we reject it, and no extra seat is granted (the bank refunds it later).',
  );
}

/* ---------- building blocks shared by every screen ---------- */

/** Backdrop + rounded card. `paper` = white card (small dialogs); default is
 *  the cream shell the multi-card screens sit in. */
function Shell({ children, onClose, maxWidth, paper, top }: { children: React.ReactNode; onClose: () => void; maxWidth: number; paper?: boolean; top?: boolean }) {
  return (
    <div
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(13,30,29,.55)', display: 'flex', alignItems: top ? 'flex-start' : 'center', justifyContent: 'center', padding: '40px 16px', overflowY: 'auto' }}
    >
      <div role="dialog" aria-modal="true" className="pop-mitr" style={{ width: '100%', maxWidth, background: paper ? 'var(--paper)' : 'var(--cream)', borderRadius: 28, boxShadow: '0 30px 70px -22px rgba(13,30,29,.5)', overflow: 'hidden', position: 'relative' }}>
        {children}
      </div>
    </div>
  );
}

function CloseBtn({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label="close" style={{ background: 'var(--cream)', border: 0, width: 34, height: 34, borderRadius: '50%', fontSize: 20, color: 'var(--ink)', cursor: 'pointer', lineHeight: 1, flexShrink: 0 }}>
      ×
    </button>
  );
}

/** Success header band: check circle + eyebrow + title. */
function Band({ tone, eyebrow, title }: { tone: 'cream' | 'teal'; eyebrow: string; title: string }) {
  const teal = tone === 'teal';
  return (
    <div style={{ background: teal ? 'var(--teal)' : 'var(--cream)', padding: '24px 26px 22px', display: 'flex', alignItems: 'center', gap: 14 }}>
      <span style={{ flexShrink: 0, width: 42, height: 42, borderRadius: '50%', background: teal ? 'var(--paper)' : 'var(--teal)', color: teal ? 'var(--teal-deep)' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 21 }}>✓</span>
      <div style={{ minWidth: 0 }}>
        <Eyebrow color={teal ? 'var(--accent)' : 'var(--teal-deep)'}>{eyebrow}</Eyebrow>
        <h2 className="display-th" style={{ fontSize: 21, margin: '3px 0 0', color: teal ? '#fff' : 'var(--ink)' }}>{title}</h2>
      </div>
    </div>
  );
}

function RoundCard({ title, when, place, label }: { title: string; when: string; place: string; label: string }) {
  return (
    <div style={{ background: 'var(--cream)', borderRadius: 18, padding: '16px 18px', marginBottom: 18 }}>
      <Eyebrow color="var(--muted)" style={{ marginBottom: 8 }}>{label}</Eyebrow>
      <div className="display-th" style={{ fontSize: 19, color: 'var(--ink)', lineHeight: 1.3 }}>{title}</div>
      <div style={{ fontSize: 13, color: 'var(--ink)', marginTop: 6, lineHeight: 1.55 }}>
        {when}
        <br />
        {place}
      </div>
    </div>
  );
}

function Eyebrow({ children, color = 'var(--teal-deep)', style }: { children: React.ReactNode; color?: string; style?: React.CSSProperties }) {
  return (
    <div className="mono" style={{ fontSize: 9.5, letterSpacing: '.16em', textTransform: 'uppercase', color, ...style }}>
      {children}
    </div>
  );
}

function Pill({ children, on, done }: { children: React.ReactNode; on?: boolean; done?: boolean }) {
  return (
    <span
      className="mono"
      style={{
        fontSize: 9.5,
        letterSpacing: '.12em',
        textTransform: 'uppercase',
        padding: '4px 10px',
        borderRadius: 999,
        display: 'inline-block',
        color: on ? '#fff' : done ? 'var(--teal-deep)' : 'var(--muted)',
        background: on ? 'var(--ink)' : done ? 'var(--teal-50)' : 'var(--cream)',
      }}
    >
      {children}
    </span>
  );
}

function Card({ children, pad = '16px 20px' }: { children: React.ReactNode; pad?: string }) {
  return <div style={{ background: 'var(--paper)', borderRadius: 22, padding: pad }}>{children}</div>;
}

/** Label / value rows with hairlines between; empty values print as "—". */
function KV({ rows, tail }: { rows: [string, string][]; tail?: [string, string] }) {
  const all: { label: string; value: string; soft?: boolean }[] = rows.map(([label, value]) => ({ label, value: value || '—' }));
  if (tail) all.push({ label: tail[0], value: tail[1], soft: true });
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
      {all.map((r, i) => (
        <div key={r.label}>
          {i > 0 && <div style={{ height: 1, background: 'rgba(13,30,29,.06)', marginBottom: 9 }} />}
          <div style={{ display: 'flex', gap: 16, alignItems: 'baseline' }}>
            <span style={{ flex: '0 0 130px', fontSize: 12.5, color: 'var(--muted)' }}>{r.label}</span>
            <span style={{ flex: 1, fontSize: r.soft ? 13.5 : 14, color: r.soft ? 'var(--muted)' : 'var(--ink)', fontWeight: r.soft ? 400 : 500, lineHeight: 1.55, wordBreak: 'break-word' }}>{r.value}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function QLabel({ children, required, optionalLabel }: { children: React.ReactNode; required?: boolean; optionalLabel?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10 }}>
      <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)' }}>
        {children}
        {required && <span style={{ color: '#d35d52' }}> *</span>}
      </span>
      {!required && optionalLabel && <Eyebrow color="var(--muted)" style={{ marginLeft: 'auto', letterSpacing: '.1em' }}>{optionalLabel}</Eyebrow>}
    </div>
  );
}

/** Option chip: selected = teal-50 with an inset teal ring. */
function Chip({ children, on, onClick }: { children: React.ReactNode; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      style={{
        border: 0,
        font: 'inherit',
        padding: '10px 16px',
        borderRadius: 999,
        background: on ? 'var(--teal-50)' : 'var(--cream)',
        boxShadow: on ? 'inset 0 0 0 2px var(--teal)' : 'none',
        fontSize: 13.5,
        fontWeight: on ? 600 : 400,
        color: on ? 'var(--teal-deep)' : 'var(--ink)',
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}

/** Half of a segmented yes/no control. */
function Seg({ children, on, onClick }: { children: React.ReactNode; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      style={{ flex: 1, textAlign: 'center', padding: '10px 6px', borderRadius: 999, border: 0, font: 'inherit', background: on ? 'var(--teal)' : 'transparent', color: on ? '#fff' : 'var(--ink)', fontSize: 13.5, fontWeight: on ? 700 : 600, cursor: 'pointer' }}
    >
      {children}
    </button>
  );
}

function Numbered({ n, children, warn, plain }: { n: string; children: React.ReactNode; warn?: boolean; plain?: boolean }) {
  if (plain) {
    return (
      <span style={{ display: 'flex', gap: 9, fontSize: 13, color: 'var(--ink)', lineHeight: 1.55 }}>
        <span className="mono" style={{ color: 'var(--muted)', fontSize: 11 }}>{n}</span>
        {children}
      </span>
    );
  }
  return (
    <div style={{ display: 'flex', gap: 11 }}>
      <span className="mono" style={{ flexShrink: 0, width: 22, height: 22, borderRadius: '50%', background: warn ? 'var(--accent)' : 'var(--cream)', color: 'var(--ink)', fontSize: 10, fontWeight: warn ? 700 : 400, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{n}</span>
      <span style={{ fontSize: 13.5, color: 'var(--ink)', lineHeight: 1.55 }}>{children}</span>
    </div>
  );
}

function ErrBox({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: '12px 14px', background: '#fdeee0', color: '#a04a14', borderRadius: 14, fontSize: 13, lineHeight: 1.55, marginBottom: 14 }}>{children}</div>;
}

function CopyRow({ url, lang }: { url: string; lang: 'th' | 'en' }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Blocked in some in-app browsers — the field is selectable by hand.
      setCopied(false);
    }
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--cream)', borderRadius: 16, padding: '8px 8px 8px 14px', marginBottom: 10 }}>
      <input readOnly value={url} onFocus={(e) => e.currentTarget.select()} style={{ flex: 1, minWidth: 0, border: 0, background: 'transparent', fontSize: 12.5, color: 'var(--ink)', fontFamily: 'JetBrains Mono, monospace' }} />
      <button type="button" onClick={copy} className="btn btn-teal btn-sm" style={{ flexShrink: 0 }}>
        {copied ? tr(lang, 'คัดลอกแล้ว', 'Copied') : tr(lang, 'คัดลอก', 'Copy')}
      </button>
    </div>
  );
}

/** Native share sheet where there is one (phones); otherwise copies. */
function ShareButton({ url, title, lang }: { url: string; title: string; lang: 'th' | 'en' }) {
  const [done, setDone] = useState(false);
  async function share() {
    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({ title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setDone(true);
      setTimeout(() => setDone(false), 2000);
    } catch {
      /* dismissed */
    }
  }
  return (
    <button type="button" onClick={share} className="btn btn-ink" style={{ flex: 1, justifyContent: 'center' }}>
      {done ? tr(lang, 'คัดลอกลิงก์แล้ว', 'Link copied') : tr(lang, 'ส่งลิงก์ให้เพื่อน', 'Send to friends')}
    </button>
  );
}
