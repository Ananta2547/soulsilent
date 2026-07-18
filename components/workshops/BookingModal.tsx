'use client';

/* Pre-booking application modal. Step 1 shows read-only profile/autofill data;
 * Step 2 collects the workshop's custom questions; then submits → payment. */
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useLang, T, tr, pick } from '@/lib/i18n';
import { fmtDateTime } from '@/lib/datetime';
import { getVault } from '@/lib/vault';
import { Btn } from '@/components/design/RippleButton';
import type { ApplicationQuestion, Workshop } from '@/lib/types';

/** What POST /api/bookings returns; drives the post-submit popup. */
export type BookingResult = {
  submitted?: boolean;
  mode?: 'selection' | 'free' | 'deposit' | 'paid';
  checkoutUrl?: string;
  amount?: number;
  bookingId?: string;
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
const PDPA_SEARCH_URL =
  'https://www.google.com/search?q=Personal+Data+Protection+Act&oq=pdpa&gs_lcrp=EgZjaHJvbWUyDwgAEEUYORiDARixAxiABDIQCAEQLhivARjHARiABBiOBTIHCAIQABiABDIHCAMQABiABDIHCAQQABiABDIHCAUQABiABDIHCAYQABiABDIHCAcQABiABDIHCAgQABiABDIHCAkQABiABNIBCDI3OTJqMGo3qAIAsAIA&sourceid=chrome&ie=UTF-8';
const consentLink: React.CSSProperties = { color: 'var(--teal-deep)', textDecoration: 'underline', fontWeight: 600 };

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

export function BookingModal({
  onClose,
  workshop,
  submitting,
  onSubmit,
}: {
  onClose: () => void;
  workshop: Workshop;
  submitting: boolean;
  onSubmit: (application: unknown) => Promise<BookingResult>;
}) {
  const { lang } = useLang();
  const [step, setStep] = useState<1 | 2>(1);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [vault, setVault] = useState<Vault>({});
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [consent, setConsent] = useState<'' | 'granted' | 'denied'>('');
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<BookingResult | null>(null);

  const requireConsent = !!workshop.require_consent;

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

  const fullName = [vault.firstName, vault.lastName].filter(Boolean).join(' ') || profile?.name || '—';
  const prefixLabel = vault.prefix && PREFIX_LABEL[vault.prefix] ? pick(PREFIX_LABEL[vault.prefix], lang) : '';
  // DOB now lives in the autofill vault; fall back to the legacy profile column.
  const age = ageFrom(vault.dob || profile?.date_of_birth);
  const genderLabel =
    vault.gender === 'other'
      ? vault.genderOther || '—'
      : vault.gender && GENDER_LABEL[vault.gender]
        ? pick(GENDER_LABEL[vault.gender], lang)
        : '—';

  // Required applicant info (read from profile + autofill vault). The Next
  // button stays locked until all are present — the user edits them on the
  // "ข้อมูลกรอกอัตโนมัติ" (autofill) settings page, not in this popup.
  // Emergency contact is OPTIONAL (may be left blank). Health/allergies is
  // required (put "ไม่มี" if none).
  const incomplete =
    !(vault.firstName || '').trim() ||
    !(vault.lastName || '').trim() ||
    !(vault.nickname || '').trim() ||
    age == null ||
    !vault.gender ||
    (vault.gender === 'other' && !(vault.genderOther || '').trim()) ||
    !(vault.phone || profile?.phone || '').trim() ||
    !(vault.facebook || '').trim() ||
    !(vault.medical || '').trim();

  function goNext() {
    if (incomplete) {
      setErr(tr(lang, 'ข้อมูลผู้สมัครไม่ครบ — กรุณาไปกรอกให้ครบที่หน้า "ข้อมูลกรอกอัตโนมัติ" ก่อน', 'Your applicant info is incomplete — please complete it on the Autofill page first.'));
      return;
    }
    setErr(null);
    setStep(2);
  }

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
        fullName,
        age,
        gender: genderLabel,
        email: profile?.email || '',
        phone: vault.phone || profile?.phone || '',
        facebook: vault.facebook || '',
        lineId: vault.lineId || '',
        emergency: { name: vault.emName || '', relation: vault.emRelation || '', phone: vault.emPhone || '' },
        medical: vault.medical || '',
        dietary: vault.dietary || '',
      },
      answers: questions.map((q) => ({ id: q.id, label: q.label, value: answers[q.id] ?? '' })),
      ...(requireConsent
        ? { consent: { photoVideo: consent, label: consent === 'granted' ? 'ยินยอม' : 'ไม่ยินยอม' } }
        : {}),
    };
    const r = await onSubmit(application);
    if (r.error) {
      setErr(r.error);
      return;
    }
    // PAID direct → straight to Stripe (no intermediate popup).
    if (r.mode === 'paid' && r.checkoutUrl) {
      window.location.href = r.checkoutUrl;
      return;
    }
    // selection / free / deposit → show the matching success popup.
    setResult(r);
  }

  // ---- Success popup (after submit, except paid which redirects) ----
  if (result) {
    const isDeposit = result.mode === 'deposit';
    return (
      <div
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
        style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(13,30,29,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 16px', overflowY: 'auto' }}
      >
        <div style={{ width: '100%', maxWidth: 440, background: 'var(--paper)', borderRadius: 22, boxShadow: '0 30px 80px -24px rgba(13,30,29,.5)', overflow: 'hidden', textAlign: 'center', padding: '36px 28px' }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--teal)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, margin: '0 auto 18px' }}>
            ✓
          </div>
          <h2 className="display-th" style={{ fontSize: 22, margin: '0 0 10px' }}>
            <T th="ส่งใบสมัครสำเร็จ" en="Application Submitted Successfully" />
          </h2>
          {result.mode === 'selection' && (
            <p style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.6, margin: '0 0 22px' }}>
              {workshop.announce_at
                ? tr(
                    lang,
                    `เราจะประกาศผลการคัดเลือกในวันที่ ${fmtDateTime(workshop.announce_at, 'th', 'long')} — ติดตามสถานะได้ที่หน้าการจองของฉัน`,
                    `Selection results will be announced on ${fmtDateTime(workshop.announce_at, 'en', 'long')}. Track your status on My Bookings.`
                  )
                : tr(lang, 'ติดตามสถานะการคัดเลือกได้ที่หน้าการจองของฉัน', 'Track your selection status on My Bookings.')}
            </p>
          )}
          {isDeposit && (
            <div style={{ background: 'var(--cream)', borderRadius: 14, padding: '12px 16px', margin: '0 0 22px', fontSize: 13.5, color: 'var(--ink)', lineHeight: 1.55 }}>
              <T th="เงินมัดจำสามารถขอคืนได้ในวันงาน (เฉพาะการโอนเท่านั้น)" en="Deposit is refundable on the event day (Transfer only)." />
            </div>
          )}
          {result.mode === 'free' && <div style={{ height: 8 }} />}

          {isDeposit && result.checkoutUrl ? (
            <Btn kind="teal" onClick={() => { window.location.href = result.checkoutUrl!; }} style={{ width: '100%', justifyContent: 'center' }}>
              {tr(lang, 'ดำเนินการชำระเงิน', 'Proceed to Payment')} <span className="mono">→</span>
            </Btn>
          ) : (
            <Link href="/me/bookings" className="btn btn-teal" style={{ width: '100%', justifyContent: 'center' }}>
              {tr(lang, 'ดูหน้าการจอง', 'View Booking Page')}
            </Link>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(13,30,29,.45)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 16px', overflowY: 'auto' }}
    >
      <div style={{ width: '100%', maxWidth: 560, background: 'var(--paper)', borderRadius: 22, boxShadow: '0 30px 80px -24px rgba(13,30,29,.5)', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--cream-deep)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="mono" style={{ fontSize: 11, color: 'var(--muted)', letterSpacing: '.1em', textTransform: 'uppercase' }}>
              {tr(lang, `ขั้นตอน ${step}/2`, `Step ${step}/2`)}
            </div>
            <h2 className="display-th" style={{ fontSize: 20, margin: '2px 0 0' }}>
              {step === 1 ? <T th="ตรวจสอบข้อมูลผู้สมัคร" en="Review your details" /> : <T th="คำถามเพิ่มเติม" en="A few questions" />}
            </h2>
          </div>
          <button type="button" onClick={onClose} aria-label="close" style={{ background: 'none', border: 0, fontSize: 22, color: 'var(--muted)', cursor: 'pointer', lineHeight: 1 }}>
            ×
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 24px', maxHeight: '60vh', overflowY: 'auto' }}>
          {step === 1 ? (
            <>
              <p style={{ fontSize: 13, color: 'var(--muted)', margin: '0 0 16px', lineHeight: 1.6 }}>
                <T th="ข้อมูลนี้ดึงจากโปรไฟล์ของคุณอัตโนมัติ — แก้ไขได้ที่หน้าตั้งค่า" en="Pulled from your profile automatically — edit it in settings." />
              </p>
              {incomplete && (
                <div style={{ marginBottom: 14, padding: 12, background: '#fde7d3', color: '#a04a14', borderRadius: 12, fontSize: 13, lineHeight: 1.55 }}>
                  {tr(lang, 'ข้อมูลผู้สมัครยังไม่ครบ (ช่องที่ขึ้น "—") — กรุณาไปกรอกให้ครบที่หน้า "ข้อมูลกรอกอัตโนมัติ" ก่อน จึงจะดำเนินการต่อได้', 'Your applicant info is incomplete (fields showing "—"). Please complete them on the "Autofill" page before continuing.')}
                </div>
              )}
              <ReadGroup lang={lang} title={tr(lang, 'ชื่อ & อายุ', 'Name & age')}>
                <Row label={tr(lang, 'คำนำหน้า', 'Title')} value={prefixLabel || '—'} />
                <Row label={tr(lang, 'ชื่อ-นามสกุล', 'Full name')} value={fullName} required missing={!(vault.firstName || '').trim() || !(vault.lastName || '').trim()} />
                <Row label={tr(lang, 'ชื่อเล่น', 'Nickname')} value={vault.nickname || '—'} required missing={!(vault.nickname || '').trim()} />
                <Row label={tr(lang, 'อายุ', 'Age')} value={age != null ? tr(lang, `${age} ปี`, `${age} yrs`) : '—'} required missing={age == null} />
                <Row label={tr(lang, 'เพศ', 'Gender')} value={genderLabel} required missing={!vault.gender || (vault.gender === 'other' && !(vault.genderOther || '').trim())} />
              </ReadGroup>
              <ReadGroup lang={lang} title={tr(lang, 'ช่องทางติดต่อ', 'Contact')}>
                <Row label={tr(lang, 'โทร', 'Phone')} value={vault.phone || profile?.phone || '—'} required missing={!(vault.phone || profile?.phone || '').trim()} />
                <Row label={tr(lang, 'อีเมล', 'Email')} value={profile?.email || '—'} />
                <Row label="Facebook" value={vault.facebook || '—'} required missing={!(vault.facebook || '').trim()} />
                <Row label="Line ID" value={vault.lineId || '—'} />
              </ReadGroup>
              <ReadGroup lang={lang} title={tr(lang, 'สุขภาพ & อาหาร', 'Health & food')}>
                <Row label={tr(lang, 'เงื่อนไขสุขภาพ / แพ้', 'Medical / allergies')} value={vault.medical || '—'} required missing={!(vault.medical || '').trim()} />
                <Row label={tr(lang, 'ข้อจำกัดอาหาร', 'Food restrictions')} value={vault.dietary || '—'} />
              </ReadGroup>
              <ReadGroup lang={lang} title={tr(lang, 'ผู้ติดต่อฉุกเฉิน', 'Emergency contact')}>
                <p style={{ gridColumn: '1 / -1', margin: 0, fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.6 }}>
                  {tr(
                    lang,
                    'ข้อมูลผู้ติดต่อฉุกเฉินของคุณจะถูกเก็บรักษาเป็นความลับอย่างเคร่งครัด และจะถูกนำมาใช้โดยทีมงานเฉพาะในกรณีที่เกิดเหตุฉุกเฉินเท่านั้น',
                    'Your emergency contact details are kept strictly confidential and are used by our team only in case of an emergency.'
                  )}
                </p>
              </ReadGroup>
            </>
          ) : (
            <>
              {err && (
                <div style={{ marginBottom: 14, padding: 12, background: '#fde7d3', color: '#a04a14', borderRadius: 12, fontSize: 13 }}>{err}</div>
              )}
              {questions.length === 0 ? (
                <p style={{ fontSize: 14, color: 'var(--muted)', margin: 0 }}>
                  <T th="เวิร์กชอปนี้ไม่มีคำถามเพิ่มเติม — กดยืนยันเพื่อชำระเงินได้เลย" en="No extra questions for this workshop — confirm to pay." />
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {questions.map((q) => (
                    <div key={q.id}>
                      <label style={{ display: 'block', fontSize: 13.5, fontWeight: 600, color: 'var(--ink)', marginBottom: 6 }}>
                        {q.label}
                        {q.required && <span style={{ color: '#d35d52' }}> *</span>}
                      </label>
                      {q.type === 'textarea' ? (
                        <textarea className="field" rows={3} value={(answers[q.id] as string) || ''} onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))} />
                      ) : q.type === 'select' ? (
                        <select className="field" value={(answers[q.id] as string) || ''} onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}>
                          <option value="">{tr(lang, '— เลือก —', '— Select —')}</option>
                          {(q.options || []).map((opt, i) => (
                            <option key={i} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </select>
                      ) : q.type === 'radio' ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {(q.options || []).map((opt, i) => (
                            <label key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: 'var(--ink)', cursor: 'pointer' }}>
                              <input type="radio" name={q.id} checked={answers[q.id] === opt} onChange={() => setAnswers((a) => ({ ...a, [q.id]: opt }))} />
                              {opt}
                            </label>
                          ))}
                        </div>
                      ) : q.type === 'checkbox' ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {(q.options || []).map((opt, i) => {
                            const cur = Array.isArray(answers[q.id]) ? (answers[q.id] as string[]) : [];
                            return (
                              <label key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: 'var(--ink)', cursor: 'pointer' }}>
                                <input
                                  type="checkbox"
                                  checked={cur.includes(opt)}
                                  onChange={(e) =>
                                    setAnswers((a) => {
                                      const arr = Array.isArray(a[q.id]) ? (a[q.id] as string[]) : [];
                                      return { ...a, [q.id]: e.target.checked ? [...arr, opt] : arr.filter((x) => x !== opt) };
                                    })
                                  }
                                />
                                {opt}
                              </label>
                            );
                          })}
                        </div>
                      ) : (
                        <input className="field" value={(answers[q.id] as string) || ''} onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))} />
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* PDPA photo/video consent — required, at the very bottom */}
              {requireConsent && (
                <div style={{ marginTop: 20, paddingTop: 18, borderTop: '1px solid var(--cream-deep)' }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)', marginBottom: 8 }}>
                    {tr(lang, 'ขอความยินยอมการบันทึกเสียง ภาพและวิดีโอ', 'Audio, photo & video consent')}
                    <span style={{ color: '#d35d52' }}> *</span>
                  </div>
                  <div style={{ background: 'var(--cream)', borderRadius: 12, padding: '14px 16px', fontSize: 12.5, color: 'var(--ink)', lineHeight: 1.65, marginBottom: 12 }}>
                    <p style={{ margin: '0 0 8px', fontWeight: 600 }}>
                      {tr(lang, 'ขอความยินยอม (Consent Clause) การบันทึกเสียง ภาพและวิดีโอเพื่อการประชาสัมพันธ์', 'Consent clause for recording audio, photos & videos for public relations')}
                    </p>
                    <p style={{ margin: '0 0 8px' }}>
                      {lang === 'th' ? (
                        <>
                          ตาม &ldquo;
                          <a href={PDPA_ACT_URL} target="_blank" rel="noopener noreferrer" style={consentLink}>
                            พระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562
                          </a>
                          &rdquo; หรือ PDPA (
                          <a href={PDPA_SEARCH_URL} target="_blank" rel="noopener noreferrer" style={consentLink}>
                            Personal Data Protection Act
                          </a>
                          ) ที่เป็นกฎหมายให้สิทธิแก่เจ้าของข้อมูลส่วนบุคคลในการควบคุมการเก็บรวบรวม ใช้ และเปิดเผยข้อมูลของตน โดยกำหนดให้องค์กรหรือผู้ควบคุมข้อมูลต้องขอความยินยอมอย่างชัดเจน โปร่งใส และมีการป้องกันข้อมูลส่วนบุคคล (เช่น ชื่อ เบอร์โทร อีเมล รูปถ่าย) ให้ปลอดภัย
                        </>
                      ) : (
                        <>
                          Under Thailand&rsquo;s{' '}
                          <a href={PDPA_ACT_URL} target="_blank" rel="noopener noreferrer" style={consentLink}>
                            Personal Data Protection Act
                          </a>{' '}
                          (PDPA, B.E. 2562), data subjects have the right to control the collection, use, and disclosure of their personal data. Organizations must obtain clear, transparent consent and keep personal data (name, phone, email, photos) secure.
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
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: 'var(--ink)', cursor: 'pointer' }}>
                      <input type="radio" name="pdpa-consent" checked={consent === 'granted'} onChange={() => setConsent('granted')} />
                      {tr(lang, 'ยินยอม', 'I consent')}
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: 'var(--ink)', cursor: 'pointer' }}>
                      <input type="radio" name="pdpa-consent" checked={consent === 'denied'} onChange={() => setConsent('denied')} />
                      {tr(lang, 'ไม่ยินยอม', 'I do not consent')}
                    </label>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid var(--cream-deep)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {step === 1 ? (
            <>
              <Link href="/me/settings?tab=autofill" className="btn btn-paper btn-sm">
                {tr(lang, 'แก้ไขข้อมูลกรอกอัตโนมัติ', 'Edit autofill data')}
              </Link>
              <Btn
                kind="teal"
                onClick={goNext}
                disabled={incomplete}
                style={{ marginLeft: 'auto', justifyContent: 'center', opacity: incomplete ? 0.5 : 1, cursor: incomplete ? 'not-allowed' : 'pointer' }}
              >
                {tr(lang, 'ถัดไป', 'Next')} <span className="mono">→</span>
              </Btn>
            </>
          ) : (
            <>
              <button type="button" onClick={() => setStep(1)} className="btn btn-paper btn-sm">
                ← {tr(lang, 'ย้อนกลับ', 'Back')}
              </button>
              <Btn kind="teal" onClick={submit} disabled={submitting} style={{ marginLeft: 'auto', justifyContent: 'center' }}>
                {submitting
                  ? tr(lang, 'กำลังดำเนินการ…', 'Processing…')
                  : workshop.admission_type === 'selection' || workshop.payment_type === 'free'
                    ? tr(lang, 'ส่งใบสมัคร', 'Submit Application')
                    : tr(lang, 'ส่งใบสมัคร & ชำระเงิน', 'Submit & Pay')}
              </Btn>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ReadGroup({ title, children }: { title: string; lang: 'th' | 'en'; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div className="mono" style={{ fontSize: 10.5, color: 'var(--teal-deep)', letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 8 }}>
        {title}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px' }}>{children}</div>
    </div>
  );
}

function Row({ label, value, required, missing }: { label: string; value: string; required?: boolean; missing?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--muted)' }}>
        {label}
        {required && <span style={{ color: '#d35d52' }}> *</span>}
      </div>
      <div style={{ fontSize: 14, color: missing ? '#d35d52' : 'var(--ink)', fontWeight: 500, wordBreak: 'break-word' }}>{value}</div>
    </div>
  );
}
