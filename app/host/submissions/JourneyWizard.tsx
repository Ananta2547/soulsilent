'use client';

/*
 * Host · สร้างกิจกรรม — the design "Host Create Journey v4". A full sheet over
 * the Host Dashboard: pick single or round (chooser), then a step editor with
 * the card as it will look on the site beside it, then "บันทึกแล้ว". Saves go to
 * the host API (api/teacher/submissions) like the old forms did; fields admin
 * keeps for itself (short line, category, tags, colour, deposit, co-hosts) are
 * not here, and the server keeps them as admin set them.
 */
import './journey-wizard.css';
import '@/app/admin/admin.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ImageUploader } from '@/components/admin/image/ImageUploader';
import { PickDate, PickTime, PickDateTime, AdmSelect } from '@/components/admin/pickers';
import { ApplicationEditor } from '@/components/workshops/ApplicationEditor';
import { cleanQuestions } from '@/lib/application-form';
import { ASPECTS } from '@/lib/image-aspects';
import { parseImageMeta } from '@/lib/image-meta';
import { safeParseArray } from '@/lib/workshop-utils';
import { parseTiers, type PriceTier } from '@/lib/pricing';
import { ONLINE_VENUE } from '@/lib/online-platform';
import type { ApplicationQuestion, ImageMeta, ScheduleDay, Workshop, WorkshopMaster } from '@/lib/types';

export type WizardKind = 'single' | 'round';
type Loc = { id: string; name: string; province: string };

const TH_MS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const TH_D = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
const dOf = (s: string) => new Date(`${s}T00:00:00`);
const fD = (s: string) => {
  if (!s) return '';
  const d = dOf(s);
  return `${d.getDate()} ${TH_MS[d.getMonth()]} ${d.getFullYear() + 543}`;
};
const fDW = (s: string) => `${TH_D[dOf(s).getDay()]} ${fD(s)}`;
const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const PLATFORMS = [
  { v: 'zoom', label: 'Zoom' },
  { v: 'meet', label: 'Google Meet' },
  { v: 'teams', label: 'Teams' },
  { v: 'other', label: 'อื่น ๆ' },
];
const platLabel = (v: string, other: string) => (v === 'other' ? other.trim() || 'อื่น ๆ' : PLATFORMS.find((p) => p.v === v)?.label || v);
const MODES: Record<PriceTier['mode'], string> = { seat: 'ต่อคน', round: 'เหมาทั้งรอบ', pack: 'แพ็กคงที่', range: 'กลุ่มระบุจำนวน' };
const TIER_PH: Record<PriceTier['mode'], string> = { seat: 'เช่น ราคาปกติ / นักเรียน', round: 'เช่น เหมารอบส่วนตัว', pack: 'เช่น แพ็ก 3 คน', range: 'เช่น กลุ่ม 2–5 คน' };

/** Everything the editor holds, for both kinds. */
type S = {
  title: string;
  desc: string;
  imageUrl: string;
  imageMeta: ImageMeta | null;
  wtype: 'one_day' | 'multi_day' | 'multi_part';
  date: string;
  endDate: string;
  dates: string[];
  tStart: string;
  tEnd: string;
  venue: '' | 'onsite' | 'online';
  locationId: string;
  platform: string;
  platformOther: string;
  onlineUrl: string;
  seats: string;
  ageMin: string;
  ageMax: string;
  payment: string;
  price: string;
  promoOn: boolean;
  promoPrice: string;
  promoStart: string;
  promoEnd: string;
  admission: 'direct' | 'selection';
  announce: string;
  confirmMain: string;
  confirmWait: string;
  closeAt: string;
  schedule: { time: string; detail: string }[];
  learn: string[];
  target: string[];
  tiers: PriceTier[];
  mSeats: string;
  locationIds: string[];
  closeDays: string;
  closeTime: string;
  questions: ApplicationQuestion[];
  consent: boolean;
};

const blank = (): S => ({
  title: '', desc: '', imageUrl: '', imageMeta: null,
  wtype: 'one_day', date: '', endDate: '', dates: [], tStart: '09:00', tEnd: '17:00',
  venue: '', locationId: '', platform: 'zoom', platformOther: '', onlineUrl: '', seats: '20', ageMin: '', ageMax: '',
  payment: 'paid', price: '', promoOn: false, promoPrice: '', promoStart: '', promoEnd: '',
  admission: 'direct', announce: '', confirmMain: '', confirmWait: '', closeAt: '',
  schedule: [], learn: [], target: [],
  tiers: [], mSeats: '20', locationIds: [], closeDays: '1', closeTime: '18:00',
  questions: [], consent: false,
});

const numStr = (v: number | null | undefined) => (v === null || v === undefined ? '' : String(v));

/** A saved single activity as editor state. */
function fromWorkshop(w: Workshop & Record<string, unknown>): S {
  const sched = safeParseArray<ScheduleDay>(w.schedule_json, []).flatMap((d) => d.items || []);
  return {
    ...blank(),
    title: w.title || '',
    desc: w.description || '',
    imageUrl: w.image_url || '',
    imageMeta: parseImageMeta((w.image_meta as string | null) ?? null),
    wtype: (w.workshop_type as S['wtype']) || 'one_day',
    date: w.date || '',
    endDate: w.end_date || '',
    dates: safeParseArray<string>(w.dates_json, []),
    tStart: w.time_start || '09:00',
    tEnd: w.time_end || '17:00',
    venue: w.is_online ? 'online' : w.location_id ? 'onsite' : '',
    locationId: w.location_id || '',
    platform: w.online_platform || 'zoom',
    platformOther: w.online_platform_other || '',
    onlineUrl: (w.online_url as string) || '',
    seats: String(w.max_participants || 20),
    ageMin: numStr(w.min_age),
    ageMax: numStr(w.max_age),
    payment: w.payment_type || 'paid',
    price: w.price ? String(w.price) : '',
    promoOn: w.promo_price != null,
    promoPrice: numStr(w.promo_price),
    promoStart: w.promo_start || '',
    promoEnd: w.promo_end || '',
    admission: w.admission_type === 'selection' ? 'selection' : 'direct',
    announce: w.announce_at || '',
    confirmMain: w.confirm_main_by || '',
    confirmWait: w.confirm_waitlist_by || '',
    closeAt: w.close_at || '',
    schedule: sched.map((i) => ({ time: i.time || '09:00', detail: i.detail || '' })),
    learn: safeParseArray<string>(w.learn_json, []),
    target: safeParseArray<string>(w.target_json, []),
    questions: safeParseArray<ApplicationQuestion>(w.application_form, []),
    consent: !!w.require_consent,
  };
}

/** A saved round activity as editor state. */
function fromMaster(m: WorkshopMaster): S {
  const tiers = parseTiers(m.price_tiers_json);
  return {
    ...blank(),
    title: m.title || '',
    desc: m.description || '',
    imageUrl: m.cover_image_url || '',
    imageMeta: parseImageMeta(m.cover_image_meta ?? null),
    tiers: m.price_group != null && !tiers.some((t) => t.mode === 'seat') ? [{ id: 'base-seat', label: 'ราคา/คน', price: m.price_group, mode: 'seat' }, ...tiers] : tiers,
    mSeats: String(m.default_max_participants ?? 20),
    locationIds: safeParseArray<string>(m.location_ids_json, []),
    ageMin: numStr(m.age_min),
    ageMax: numStr(m.age_max),
    closeDays: m.close_days_before == null ? '' : String(m.close_days_before),
    closeTime: m.close_time || '18:00',
    target: safeParseArray<string>(m.target_json, []),
    learn: safeParseArray<string>(m.takeaways_json, []),
    questions: safeParseArray<ApplicationQuestion>(m.application_form, []),
    consent: !!m.require_consent,
  };
}

/** Every day of a multi-day activity, for its per-day hours. */
function daysOf(s: S): string[] {
  if (s.wtype === 'multi_part') return [...new Set(s.dates)].sort();
  if (s.wtype !== 'multi_day' || !s.date || !s.endDate || s.endDate <= s.date) return [];
  const out: string[] = [];
  for (let d = dOf(s.date); ymd(d) <= s.endDate; d.setDate(d.getDate() + 1)) out.push(ymd(d));
  return out;
}

/** The card as it shows on the site (design system JourneyCard). */
function PreviewCard(p: { title: string; date: string; time?: string; location: string; price?: number | string; original?: number; free: boolean; tags: { label: string; accent?: boolean }[]; image: string }) {
  const priceN = typeof p.price === 'number' ? p.price : 0;
  return (
    <div className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', color: 'var(--ink)' }}>
      <div className="ph ph-teal card-media" style={{ aspectRatio: '297 / 420', borderRadius: 14, marginBottom: 16, position: 'relative', overflow: 'hidden' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {p.image ? <img src={p.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span className="mono">POSTER · A3</span>}
        {p.original && priceN > 0 && (
          <span className="tag tag-accent" style={{ position: 'absolute', top: 10, right: 10, fontWeight: 700 }}>
            ลด {Math.round((1 - priceN / p.original) * 100)}%
          </span>
        )}
      </div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
        {p.tags.map((t) => (
          <span key={t.label} className={t.accent ? 'tag tag-accent' : 'tag'}>
            {t.label}
          </span>
        ))}
      </div>
      <h3 className="display-th u-clamp-2" style={{ fontSize: 20, margin: '0 0 6px', lineHeight: 1.2 }}>
        {p.title}
      </h3>
      <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 14, lineHeight: 1.55, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" style={{ flexShrink: 0, marginTop: 3 }} aria-hidden>
            <rect x="3" y="5" width="18" height="16" rx="2.5" />
            <path d="M3 9.5H21M8 3v3.5M16 3v3.5" />
          </svg>
          <span>
            {p.date}
            {p.time ? ` · ${p.time}` : ''}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" style={{ flexShrink: 0, marginTop: 3 }} aria-hidden>
            <path d="M12 21s-6.5-6.2-6.5-11.2a6.5 6.5 0 0 1 13 0C18.5 14.8 12 21 12 21Z" />
            <circle cx="12" cy="9.8" r="2.3" />
          </svg>
          <span>{p.location}</span>
        </div>
      </div>
      <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 14 }}>
        <div>
          <div style={{ fontSize: 10, fontFamily: "'JetBrains Mono','IBM Plex Sans Thai',monospace", color: 'var(--muted)', letterSpacing: '.1em', textTransform: 'uppercase' }}>เริ่มต้น</div>
          {p.free ? (
            <div style={{ fontFamily: 'Archivo Black, Mitr', fontSize: 22, color: 'var(--teal)' }}>ฟรี</div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <span style={{ fontFamily: 'Archivo Black, Mitr', fontSize: 22, color: p.original ? 'var(--teal)' : 'var(--ink)' }}>฿{typeof p.price === 'number' ? p.price.toLocaleString() : '—'}</span>
              {p.original && <span style={{ fontSize: 12, color: 'var(--muted)', textDecoration: 'line-through' }}>฿{p.original.toLocaleString()}</span>}
            </div>
          )}
        </div>
        <span className="btn btn-teal btn-sm" aria-hidden>
          จอง <span className="mono">→</span>
        </span>
      </div>
    </div>
  );
}

/** One list of short lines (what you get, who it suits). */
function LineList({ legend, items, onChange, ph }: { legend: string; items: string[]; onChange: (v: string[]) => void; ph: string }) {
  return (
    <div className="adm-field">
      <span className="adm-field-label">{legend}</span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.length === 0 && <p className="adm-soft-empty" style={{ padding: 12, margin: 0 }}>ยังไม่มีหัวข้อ</p>}
        {items.map((v, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ width: 20, textAlign: 'center', color: 'var(--teal)', flexShrink: 0 }}>•</span>
            <input type="text" value={v} onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))} style={{ flex: 1, minWidth: 0 }} placeholder={ph} />
            <button type="button" className="adm-icon-btn adm-minus" onClick={() => onChange(items.filter((_, j) => j !== i))} aria-label="ลบ">
              −
            </button>
          </div>
        ))}
        <div>
          <button type="button" className="adm-link-btn" onClick={() => onChange([...items, ''])}>
            + เพิ่ม
          </button>
        </div>
      </div>
    </div>
  );
}

export function JourneyWizard({
  kind: kind0,
  editingId,
  initial,
  onClose,
  onSaved,
}: {
  /** null = start at the chooser. */
  kind: WizardKind | null;
  editingId?: string;
  /** The saved row when editing. */
  initial?: (Workshop & Record<string, unknown>) | WorkshopMaster | null;
  onClose: (changed: boolean) => void;
  /** After any successful save (the list reloads). */
  onSaved: () => void;
}) {
  const [kind, setKind] = useState<WizardKind | null>(kind0);
  const [s, setS] = useState<S>(() => (initial ? (kind0 === 'round' ? fromMaster(initial as WorkshopMaster) : fromWorkshop(initial as Workshop & Record<string, unknown>)) : blank()));
  const [baseline, setBaseline] = useState(() => JSON.stringify(s));
  const [step, setStep] = useState(0);
  const [id, setId] = useState<string | undefined>(editingId);
  const [saved, setSaved] = useState(false);
  const [waiting, setWaiting] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; err?: boolean } | null>(null);
  const [pvOpen, setPvOpen] = useState(false);
  const [locations, setLocations] = useState<Loc[]>([]);
  const [vw, setVw] = useState(1400);
  const [didSave, setDidSave] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const cardAreaRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [cardScale, setCardScale] = useState(1);
  const noteT = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const set = (patch: Partial<S>) => setS((x) => ({ ...x, ...patch }));

  useEffect(() => {
    fetch('/api/locations')
      .then((r) => r.json() as Promise<{ locations: Loc[] }>)
      .then((d) => setLocations(d.locations || []))
      .catch(() => {});
  }, []);

  // Size class from the window (the sheet is fixed to it).
  useEffect(() => {
    const on = () => setVw(window.innerWidth);
    on();
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  const phone = vw < 760;
  const wide = !phone && vw >= 1100;

  // Keep the preview card inside the poster panel on short screens.
  useEffect(() => {
    if (!wide) return;
    const fit = () => {
      const a = cardAreaRef.current;
      const c = cardRef.current;
      if (!a || !c || !c.offsetHeight) return;
      const v = Math.round(Math.min(1, Math.max(0.4, (a.clientHeight - 8) / c.offsetHeight), a.clientWidth / c.offsetWidth) * 100) / 100;
      setCardScale((old) => (old === v ? old : v));
    };
    const t = setInterval(fit, 300);
    return () => clearInterval(t);
  }, [wide, kind, saved]);

  const dirty = !saved && JSON.stringify(s) !== baseline;
  const close = () => {
    if (busy) return;
    if (dirty && !window.confirm('ยังไม่ได้บันทึก — ปิดแล้วข้อมูลที่กรอกจะหาย ปิดเลยไหม?')) return;
    onClose(didSave);
  };
  const closeRef = useRef(close);
  useEffect(() => {
    closeRef.current = close;
  });
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current();
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, []);

  const flash = (text: string, err = false) => {
    setNote({ text, err });
    clearTimeout(noteT.current);
    noteT.current = setTimeout(() => setNote(null), err ? 4200 : 2400);
  };

  const single = kind === 'single';
  const round = kind === 'round';

  // ---------- derived ----------
  let dateOk = false;
  let dateErr = '';
  if (s.wtype === 'one_day') dateOk = !!s.date;
  else if (s.wtype === 'multi_day') {
    dateOk = !!(s.date && s.endDate && s.endDate > s.date);
    if (s.date && s.endDate && s.endDate <= s.date) dateErr = 'วันสิ้นสุดต้องมากกว่าวันเริ่มต้น (ต้องเป็นคนละวัน)';
  } else dateOk = s.dates.length > 0;
  const timeErr = s.tStart >= s.tEnd;
  const priceN = Number(s.price) || 0;
  const free = s.payment === 'free';
  const venueOk = s.venue === 'online' || (s.venue === 'onsite' && !!s.locationId);
  const loc = locations.find((l) => l.id === s.locationId);

  const req = single
    ? [
        { k: 'ชื่อกิจกรรม', ok: !!s.title.trim(), step: 0 },
        { k: 'วันที่จัด', ok: dateOk && !timeErr, step: 1 },
        { k: 'สถานที่', ok: venueOk, step: 1 },
        { k: 'ราคา', ok: free || priceN > 0, step: 2 },
      ]
    : [
        { k: 'ชื่อกิจกรรม', ok: !!s.title.trim(), step: 0 },
        { k: 'ราคาอย่างน้อย 1 แบบ', ok: s.tiers.length > 0, step: 1 },
      ];
  const missing = req.filter((r) => !r.ok);

  const STEPS: [string, string, string][] = single
    ? [
        ['basic', 'ข้อมูลหลัก', 'ชื่อ รายละเอียด และโปสเตอร์ — สิ่งแรกที่ผู้เข้าร่วมเห็น'],
        ['when', 'วันเวลา & สถานที่', 'จัดวันไหน กี่โมง ที่ไหน และรับได้กี่คน'],
        ['price', 'ราคา & การรับสมัคร', 'ค่าเข้าร่วม วิธีรับคน และวันปิดรับสมัคร'],
        ['form', 'ใบสมัคร & PDPA', 'ถามเพิ่มเฉพาะที่จำเป็นกับกิจกรรมนี้ — ไม่บังคับ'],
        ['content', 'เนื้อหา', 'ตารางเวลา สิ่งที่จะได้ และเหมาะกับใคร — ไม่บังคับ แต่ช่วยให้คนตัดสินใจง่ายขึ้น'],
        ['review', 'ตรวจทาน', 'ดูทุกอย่างอีกครั้งก่อนบันทึก'],
      ]
    : [
        ['basic', 'ข้อมูลหลัก', 'ชื่อ รายละเอียด และโปสเตอร์ — ใช้กับทุกรอบ'],
        ['rprice', 'ราคา & ที่นั่ง', 'ตั้งราคาครั้งเดียว ใช้กับทุกรอบที่คุณเปิด'],
        ['rules', 'สถานที่ & เงื่อนไข', 'ที่ที่เปิดรอบได้ อายุผู้เข้าร่วม และเวลาปิดรับจอง'],
        ['form', 'ใบสมัคร & PDPA', 'ถามเพิ่มเฉพาะที่จำเป็น — บันทึกแล้วใช้กับทุกรอบที่ยังไม่เริ่ม'],
        ['content', 'เนื้อหา', 'เหมาะกับใคร และได้อะไรจากกิจกรรม — ไม่บังคับ'],
        ['review', 'ตรวจทาน', 'ดูทุกอย่างอีกครั้งก่อนบันทึก — เพิ่มรอบได้หลังบันทึก'],
      ];
  const cur = STEPS[step]?.[0] || 'basic';
  const last = STEPS.length - 1;

  const stepDone = (key: string): boolean => {
    switch (key) {
      case 'basic':
        return !!s.title.trim();
      case 'when':
        return dateOk && venueOk && !timeErr;
      case 'price':
        return free || priceN > 0;
      case 'rprice':
        return s.tiers.length > 0;
      case 'rules':
        return true;
      case 'review':
        return missing.length === 0;
      default:
        return false;
    }
  };

  let pvDate = 'ยังไม่ได้เลือกวัน';
  if (round) pvDate = 'หลายรอบ · เลือกวันที่สะดวก';
  else if (s.wtype === 'one_day' && s.date) pvDate = fDW(s.date);
  else if (s.wtype === 'multi_day' && s.date && s.endDate) pvDate = `${fD(s.date)} – ${fD(s.endDate)}`;
  else if (s.wtype === 'multi_part' && s.dates.length) pvDate = `${s.dates.length} วัน · เริ่ม ${fD([...s.dates].sort()[0])}`;
  const seatTier = s.tiers.find((t) => t.mode === 'seat') || s.tiers[0];
  const promoN = Number(s.promoPrice) || 0;
  const promoLive = single && !free && s.promoOn && promoN > 0 && promoN < priceN;
  const venueText =
    s.venue === 'online' ? `ออนไลน์ · ${platLabel(s.platform, s.platformOther)}` : loc ? `${loc.name} (${loc.province})` : s.venue === 'onsite' ? 'ยังไม่ได้เลือกสถานที่' : '';
  const pv = {
    title: s.title.trim() || 'ชื่อกิจกรรมของคุณ',
    date: pvDate,
    time: round ? undefined : `${s.tStart}–${s.tEnd}`,
    location: round ? (s.locationIds.length === 1 && s.locationIds[0] === ONLINE_VENUE ? 'ออนไลน์' : 'เลือกสถานที่ตอนเปิดรอบ') : venueText || 'ยังไม่เลือกสถานที่',
    price: round ? (seatTier && Number(seatTier.price) > 0 ? Number(seatTier.price) : '—') : free ? undefined : promoLive ? promoN : priceN || '—',
    original: promoLive ? priceN : undefined,
    free: single && free,
    tags: [{ label: single ? 'กิจกรรมเดี่ยว' : 'จองรอบ' }, ...(single && s.admission === 'selection' ? [{ label: 'คัดเลือก', accent: true }] : [])],
    image: s.imageUrl,
  };

  const selErr = useMemo(() => {
    if (!single || s.admission !== 'selection') return '';
    const ev = s.wtype === 'multi_part' ? [...s.dates].sort()[0] || '' : s.date;
    const start = ev ? `${ev}T${s.tStart}` : '';
    if (s.announce && start && s.announce >= start) return 'วันประกาศผลต้องอยู่ก่อนวันกิจกรรม';
    if (s.announce && s.confirmMain && s.confirmMain <= s.announce) return 'ยืนยันตัวจริงต้องอยู่หลังวันประกาศผล';
    if (s.confirmMain && s.confirmWait && s.confirmWait <= s.confirmMain) return 'ยืนยันตัวสำรองต้องอยู่หลังยืนยันตัวจริง';
    return '';
  }, [single, s.admission, s.announce, s.confirmMain, s.confirmWait, s.date, s.dates, s.tStart, s.wtype]);

  function go(n: number) {
    setStep(n);
    setNote(null);
    (phone ? bodyRef.current : scrollRef.current)?.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ---------- save ----------
  function singleBody() {
    const days = daysOf(s);
    const isOnline = s.venue === 'online';
    const base = initial && single ? (initial as Workshop & Record<string, unknown>) : null;
    return {
      title: s.title.trim(),
      description: s.desc,
      image_url: s.imageUrl || '',
      image_meta: s.imageMeta,
      workshop_type: s.wtype,
      date: s.wtype === 'multi_part' ? days[0] || '' : s.date,
      end_date: s.wtype === 'multi_day' ? s.endDate || null : null,
      dates: s.wtype === 'multi_part' ? days : [],
      time_start: s.tStart,
      time_end: s.tEnd,
      day_times: s.wtype === 'one_day' ? [] : days.map((d) => ({ date: d, time_start: s.tStart, time_end: s.tEnd })),
      location: '',
      location_id: isOnline ? '' : s.locationId,
      is_online: isOnline,
      online_platform: isOnline ? s.platform : null,
      online_platform_other: isOnline && s.platform === 'other' ? s.platformOther.trim() : null,
      online_url: isOnline ? s.onlineUrl.trim() : null,
      max_participants: Number(s.seats) || 20,
      min_age: s.ageMin.trim() === '' ? null : Number(s.ageMin),
      max_age: s.ageMax.trim() === '' ? null : Number(s.ageMax),
      payment_type: free ? 'free' : s.payment === 'deposit' ? 'deposit' : 'paid',
      price: free ? 0 : priceN,
      promo_price: !free && s.promoOn && s.promoPrice.trim() !== '' ? Number(s.promoPrice) : null,
      promo_start: !free && s.promoOn ? s.promoStart || null : null,
      promo_end: !free && s.promoOn ? s.promoEnd || null : null,
      admission_type: s.admission,
      announce_at: s.admission === 'selection' ? s.announce || null : null,
      confirm_main_by: s.admission === 'selection' ? s.confirmMain || null : null,
      confirm_waitlist_by: s.admission === 'selection' ? s.confirmWait || null : null,
      close_at: s.closeAt || null,
      require_consent: s.consent,
      application_form: s.questions,
      schedule: s.schedule.some((i) => i.detail.trim()) ? [{ label: '', items: s.schedule.filter((i) => i.detail.trim()) }] : [],
      learn_items: s.learn.map((x) => x.trim()).filter(Boolean),
      target_items: s.target.map((x) => x.trim()).filter(Boolean),
      map_url: (base?.map_url as string) || '',
    };
  }

  function roundBody() {
    return {
      title: s.title.trim(),
      description: s.desc,
      cover_image_url: s.imageUrl || null,
      cover_image_meta: s.imageMeta,
      target: s.target.map((x) => x.trim()).filter(Boolean),
      takeaways: s.learn.map((x) => x.trim()).filter(Boolean),
      price_group: null,
      price_private: null,
      price_group_booking: initial && round ? ((initial as WorkshopMaster).price_group_booking ?? null) : null,
      price_tiers: s.tiers.map((t) => ({ ...t, price: Number(t.price) || 0 })),
      default_max_participants: Number(s.mSeats) || 20,
      kind: 'round',
      location_ids: s.locationIds,
      age_min: s.ageMin.trim(),
      age_max: s.ageMax.trim(),
      close_days_before: s.closeDays.trim(),
      close_time: s.closeTime,
    };
  }

  /** Save as it is; `final` = the "บันทึกกิจกรรม" button (checks more, then shows SAVED). */
  async function save(final: boolean) {
    if (!kind) return;
    if (!s.title.trim()) {
      flash('กรุณากรอกชื่อกิจกรรม', true);
      return go(0);
    }
    if (single && !id && !dateOk) {
      flash('เลือกวันที่จัดก่อนบันทึก', true);
      return go(1);
    }
    if (final && single && (timeErr || dateErr)) {
      flash(timeErr ? 'เวลาเริ่มต้องอยู่ก่อนเวลาจบ' : dateErr, true);
      return go(1);
    }
    if (final && selErr) {
      flash(selErr, true);
      return go(2);
    }
    const app = cleanQuestions(s.questions);
    if ('error' in app) {
      flash(`ใบสมัคร: ${app.error}`, true);
      return go(3);
    }
    setBusy(true);
    try {
      const data = single ? singleBody() : roundBody();
      const r = await fetch(id ? `/api/teacher/submissions/${kind}/${id}` : '/api/teacher/submissions', {
        method: id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(id ? data : { kind, data }),
      });
      const d = (await r.json()) as { id?: string; error?: string; waiting?: string[] };
      if (!r.ok) return flash(d.error || 'บันทึกไม่สำเร็จ', true);
      const newId = id || d.id;
      if (round && newId) {
        // The form + PDPA reach the rounds through their own route.
        const a = await fetch(`/api/teacher/masters/${newId}/application`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ questions: app.questions, require_consent: s.consent }),
        });
        if (!a.ok) {
          const e = (await a.json().catch(() => ({}))) as { error?: string };
          flash(`บันทึกกิจกรรมแล้ว แต่ใบสมัครยังไม่บันทึก: ${e.error || 'เกิดข้อผิดพลาด'}`, true);
        }
      }
      setId(newId);
      setDidSave(true);
      setBaseline(JSON.stringify(s));
      setWaiting(d.waiting || []);
      onSaved();
      if (final) {
        setSaved(true);
        bodyRef.current?.scrollTo({ top: 0 });
      } else flash(d.waiting?.length ? `บันทึกแล้ว — รออนุมัติ: ${d.waiting.join(', ')}` : 'บันทึกแล้ว');
    } catch {
      flash('บันทึกไม่สำเร็จ', true);
    } finally {
      setBusy(false);
    }
  }

  async function sendForReview() {
    if (!id) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/teacher/submissions/single/${id}/submit`, { method: 'POST' });
      const d = (await r.json()) as { error?: string };
      if (!r.ok) return flash(d.error || 'ส่งไม่สำเร็จ', true);
      onSaved();
      onClose(true);
    } finally {
      setBusy(false);
    }
  }

  // ---------- pieces ----------
  const tierSet = (i: number, patch: Partial<PriceTier>) => set({ tiers: s.tiers.map((t, j) => (j === i ? { ...t, ...patch } : t)) });
  const cd = s.closeDays.trim();
  const reviewRows: { label: string; value: string; step: number; empty: string }[] = single
    ? [
        { label: 'ชื่อ', value: s.title.trim(), step: 0, empty: 'ยังไม่ได้ใส่' },
        { label: 'วันเวลา', value: dateOk ? `${pvDate} · ${s.tStart}–${s.tEnd} น.` : '', step: 1, empty: 'ยังไม่ได้เลือกวัน' },
        { label: 'สถานที่', value: venueOk ? venueText : '', step: 1, empty: 'ยังไม่ได้เลือก' },
        { label: 'ที่นั่ง', value: `${Number(s.seats) || 20} ที่`, step: 1, empty: '' },
        { label: 'ราคา', value: free ? 'ฟรี' : priceN > 0 ? `฿${priceN.toLocaleString()}${promoLive ? ` · โปร ฿${promoN.toLocaleString()}` : ''}` : '', step: 2, empty: 'ยังไม่ได้ใส่' },
        { label: 'รับสมัคร', value: s.admission === 'direct' ? 'จองตรง' : 'คัดเลือก', step: 2, empty: '' },
        { label: 'ใบสมัคร', value: (s.questions.length ? `${s.questions.length} คำถาม` : 'ไม่มีคำถามเพิ่ม') + (s.consent ? ' · PDPA' : ''), step: 3, empty: '' },
      ]
    : [
        { label: 'ชื่อ', value: s.title.trim(), step: 0, empty: 'ยังไม่ได้ใส่' },
        { label: 'ราคา', value: s.tiers.map((t) => `${t.label || MODES[t.mode]} ฿${(Number(t.price) || 0).toLocaleString()}`).join(' · '), step: 1, empty: 'ยังไม่มีราคา' },
        { label: 'ที่นั่ง/รอบ', value: `${Number(s.mSeats) || 20} ที่`, step: 1, empty: '' },
        {
          label: 'สถานที่',
          value: s.locationIds.length === 0 ? 'ทุกสถานที่ (ยกเว้นออนไลน์)' : s.locationIds.map((x) => (x === ONLINE_VENUE ? 'ออนไลน์' : locations.find((l) => l.id === x)?.name || x)).join(', '),
          step: 2,
          empty: '',
        },
        { label: 'ปิดรับจอง', value: cd === '' ? 'เปิดรับจองจนรอบเริ่ม' : `${Number(cd) === 0 ? 'วันกิจกรรม' : `${cd} วันก่อน`} เวลา ${s.closeTime} น.`, step: 2, empty: '' },
        { label: 'ใบสมัคร', value: (s.questions.length ? `${s.questions.length} คำถาม` : 'ไม่มีคำถามเพิ่ม') + (s.consent ? ' · PDPA' : ''), step: 3, empty: '' },
      ];

  const posterTrigger = (
    <span className={`jw-poster-up${s.imageUrl ? ' has-img' : ''}`}>
      {s.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={s.imageUrl} alt="" />
      ) : (
        <>
          <svg width="30" height="30" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)' }}>อัปโหลดรูป</span>
          <span style={{ fontSize: 11.5, lineHeight: '16px' }}>
            A3 แนวตั้ง · 29.7×42
            <br />
            สูงสุด 8MB · ครอบตัดได้
          </span>
        </>
      )}
    </span>
  );

  const card = <PreviewCard {...pv} />;
  const readyCount = `${req.length - missing.length} / ${req.length}`;

  return (
    <div className={`jw-root adm adm-host-forms${phone ? ' is-phone' : ''}${wide ? ' is-wide' : ''}`}>
      <div className="jw-scrim" onClick={close} aria-hidden />
      <section className={`jw-sheet${kind && !saved ? ' has-kind' : ''}`} role="dialog" aria-modal="true" aria-label="สร้างกิจกรรม">
        {phone && <div className="jw-grip" aria-hidden />}
        <header className="jw-head">
          <div className="jw-head-l">
            <span className="jw-mark" aria-hidden>
              a
            </span>
            <span className="jw-eyebrow">{kind ? `host · ${single ? 'กิจกรรมเดี่ยว' : 'กิจกรรมจองรอบ'}` : 'host'}</span>
            {kind && !saved && (
              <>
                <span className="jw-draft">{id ? 'แก้ไข' : 'ร่าง'}</span>
                {!id && (
                  <button type="button" className="jw-link" onClick={() => setKind(null)}>
                    เปลี่ยนรูปแบบ
                  </button>
                )}
              </>
            )}
          </div>
          <div className="jw-head-r">
            {kind && !saved && (
              <button type="button" className="jw-soft" onClick={() => save(false)} disabled={busy}>
                {busy ? 'กำลังบันทึก…' : 'บันทึกร่าง'}
              </button>
            )}
            <button type="button" className="jw-x" onClick={close} aria-label="ปิด">
              <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </header>
        {note && (
          <div className={`jw-toast${note.err ? ' is-err' : ''}`} role="status">
            {note.text}
          </div>
        )}

        <div ref={bodyRef} className={`jw-body${kind && !saved ? ' is-editor' : ''}`}>
          {/* ============ CHOOSER ============ */}
          {!kind && !saved && (
            <div className="jw-chooser">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span className="jw-kicker">01 — เริ่มจากรูปแบบ</span>
                <h2 className="jw-h2">
                  กิจกรรมของคุณ
                  <br />
                  จัดแบบไหน.
                </h2>
                <p className="jw-lead">บันทึกเป็นร่างได้ทุกเมื่อ แล้วค่อยส่งให้ทีมตรวจเมื่อพร้อม — อนุมัติแล้วกิจกรรมจึงขึ้นบนเว็บ</p>
              </div>
              <div className="jw-kinds">
                {(
                  [
                    { k: 'single', word: 'ONCE.', eb: '01 — กิจกรรมเดี่ยว', title: 'จัดครั้งเดียว', lead: 'กิจกรรมที่มีวันจัดแน่นอน — วันเดียวจบ หลายวันติดกัน หรือแบ่งเป็นพาร์ทหลายวัน', points: ['วันเดียว · ต่อเนื่อง · แบ่งพาร์ท', 'จองตรง หรือคัดเลือก', 'ฟรี หรือเก็บเงิน'] },
                    { k: 'round', word: 'AGAIN.', eb: '02 — กิจกรรมจองรอบ', title: 'เปิดหลายรอบ', lead: 'กิจกรรมเดิมที่เปิดซ้ำได้เรื่อย ๆ — ผู้เข้าร่วมเลือกรอบที่สะดวกเอง', points: ['ตั้งราคาครั้งเดียว', 'ต่อคน · แพ็ก · เหมารอบ', 'เพิ่มรอบหลังบันทึก'] },
                  ] as const
                ).map((k, i) => (
                  <button
                    key={k.k}
                    type="button"
                    className={`jw-kind${i === 0 ? ' is-dark' : ''}`}
                    onClick={() => {
                      setKind(k.k);
                      setStep(0);
                    }}
                  >
                    <span className="jw-kind-word" aria-hidden>
                      {k.word}
                    </span>
                    <span className="jw-kind-top">
                      <span className="jw-kind-eb">{k.eb}</span>
                      <span className="jw-kind-arrow">↗</span>
                    </span>
                    <span className="jw-kind-bottom">
                      <span className="jw-kind-title">{k.title}</span>
                      <span className="jw-kind-lead">{k.lead}</span>
                      <span className="jw-chips">
                        {k.points.map((p) => (
                          <span key={p} className="jw-chip">
                            {p}
                          </span>
                        ))}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
              <div className="jw-flow">
                {['สร้างกิจกรรม', 'บันทึกเป็นร่าง', 'ส่งให้ทีมตรวจ', 'อนุมัติแล้วขึ้นเว็บ'].map((f, i) => (
                  <span key={f}>
                    <b>0{i + 1}</b>
                    {f}
                  </span>
                ))}
                <span className="jw-fun">it can be fun! ✺</span>
              </div>
            </div>
          )}

          {/* ============ EDITOR ============ */}
          {kind && !saved && (
            <div className="jw-ed">
              <div className="jw-poster">
                <span className="jw-giant" aria-hidden>
                  {single ? 'JOURNEY.' : 'ROUNDS.'}
                </span>
                {wide ? (
                  <>
                    <div className="jw-pv-top">
                      <span className="jw-pv-k">ตัวอย่างบนเว็บ</span>
                      <span className="jw-pv-n">{readyCount} พร้อม</span>
                    </div>
                    <div ref={cardAreaRef} className="jw-pv-area">
                      <div ref={cardRef} className="jw-pv-card" style={{ transform: `scale(${cardScale})` }}>
                        {card}
                        <span className="jw-pv-scribble" aria-hidden>
                          หน้าตาบนเว็บ ✺
                        </span>
                      </div>
                    </div>
                    <div className="jw-ready">
                      {req.map((r) => (
                        <button key={r.k} type="button" className={r.ok ? 'is-ok' : ''} onClick={() => go(r.step)}>
                          <i>{r.ok ? '✓' : ''}</i>
                          <span>{r.k}</span>
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="jw-mini">
                    <div className="jw-mini-thumb ph ph-teal">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {s.imageUrl && <img src={s.imageUrl} alt="" />}
                    </div>
                    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                      <span className="jw-mini-t">{pv.title}</span>
                      <span className="jw-mini-d">{pv.date}</span>
                      <span className="jw-mini-r">{readyCount} พร้อมส่งตรวจ</span>
                    </div>
                    <button type="button" className="jw-mini-btn" onClick={() => setPvOpen(true)}>
                      ดูการ์ด
                    </button>
                  </div>
                )}
              </div>

              <form
                className="jw-form"
                noValidate
                onSubmit={(e) => {
                  e.preventDefault();
                  save(true);
                }}
              >
                <nav className="jw-tabs" aria-label="ขั้นตอน" style={{ gridTemplateColumns: `repeat(${STEPS.length}, minmax(0, auto))` }}>
                  {STEPS.map(([key, label], i) => {
                    const on = i === step;
                    const done = stepDone(key);
                    return (
                      <button key={key} type="button" className={`jw-tab${on ? ' is-on' : ''}${done ? ' is-done' : ''}`} aria-current={on ? 'step' : undefined} onClick={() => go(i)}>
                        <span className="jw-tab-n">{done && !on ? '✓' : i + 1}</span>
                        <span className="jw-tab-l">{label}</span>
                        <span className="jw-tab-bar" aria-hidden />
                      </button>
                    );
                  })}
                </nav>
                <div ref={scrollRef} className="jw-scroll">
                  <div className="jw-inner">
                    <div className="jw-step-h">
                      <span className="jw-kicker">
                        ขั้นที่ {pad(step + 1)} จาก {pad(STEPS.length)}
                      </span>
                      <h3>{STEPS[step][1]}.</h3>
                      <p className="jw-lead">{STEPS[step][2]}</p>
                    </div>
                    <div className="jw-stack">
                      {/* ── ข้อมูลหลัก ── */}
                      {cur === 'basic' && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24 }}>
                          <div style={{ flex: '0 0 200px' }}>
                            <span style={{ display: 'block', fontSize: 13, lineHeight: '18px', fontWeight: 600, marginBottom: 6 }}>โปสเตอร์</span>
                            <div style={{ width: 200 }}>
                              <ImageUploader
                                label="โปสเตอร์กิจกรรม (A3 แนวตั้ง)"
                                folder="workshop"
                                primary={single ? ASPECTS.WORKSHOP_HERO : ASPECTS.WORKSHOP_MASTER}
                                value={s.imageUrl}
                                meta={s.imageMeta}
                                onChange={({ url, meta }) => set({ imageUrl: url, imageMeta: meta })}
                                trigger={posterTrigger}
                                menuStyle={{ left: 12, top: 12 }}
                              />
                            </div>
                          </div>
                          <div style={{ flex: '1 1 300px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 18 }}>
                            <div className="adm-field">
                              <label htmlFor="jw-title">
                                ชื่อกิจกรรม <span style={{ color: '#a3261a' }}>*</span>
                              </label>
                              <input id="jw-title" value={s.title} onChange={(e) => set({ title: e.target.value })} placeholder="เช่น เดินวาดเมืองเก่า ริมน้ำเจ้าพระยา" />
                              <p className="adm-hint">ชื่อนี้ขึ้นบนการ์ดและหน้ากิจกรรม — สั้น ชัด อ่านแล้วนึกภาพออก</p>
                            </div>
                            <div className="adm-field">
                              <label htmlFor="jw-desc">รายละเอียด</label>
                              <textarea id="jw-desc" rows={7} value={s.desc} onChange={(e) => set({ desc: e.target.value })} placeholder="เล่าให้ผู้เข้าร่วมฟังว่าวันนั้นจะได้เจออะไร" />
                            </div>
                          </div>
                        </div>
                      )}

                      {/* ── วันเวลา & สถานที่ (single) ── */}
                      {cur === 'when' && (
                        <>
                          <div className="adm-field">
                            <span className="adm-field-label">จัดกี่วัน</span>
                            <div className="jw-tiles" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
                              {(
                                [
                                  ['one_day', 'วันเดียว', 'จัดวันเดียวจบ'],
                                  ['multi_day', 'ต่อเนื่อง', 'หลายวันติดกัน'],
                                  ['multi_part', 'แบ่งพาร์ท', 'หลายวันไม่ติดกัน'],
                                ] as const
                              ).map(([v, l, h]) => (
                                <button key={v} type="button" className={`jw-tile${s.wtype === v ? ' is-on' : ''}`} onClick={() => set({ wtype: v })}>
                                  <b>{l}</b>
                                  <span>{h}</span>
                                </button>
                              ))}
                            </div>
                          </div>
                          <div className="jw-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
                            {s.wtype === 'multi_part' ? (
                              <div className="adm-field">
                                <span className="adm-field-label">เพิ่มวัน</span>
                                <PickDate value="" onChange={(v) => v && set({ dates: [...new Set([...s.dates, v])].sort() })} placeholder="กดเพื่อเลือกวัน" />
                              </div>
                            ) : (
                              <>
                                <div className="adm-field">
                                  <span className="adm-field-label">{s.wtype === 'one_day' ? 'วันที่จัด' : 'วันเริ่มต้น'}</span>
                                  <PickDate value={s.date} onChange={(v) => set({ date: v })} />
                                </div>
                                {s.wtype === 'multi_day' && (
                                  <div className="adm-field">
                                    <span className="adm-field-label">วันสิ้นสุด</span>
                                    <PickDate value={s.endDate} onChange={(v) => set({ endDate: v })} />
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                          {s.wtype === 'multi_part' && (
                            <div className="jw-part-chips" style={{ marginTop: -8 }}>
                              {s.dates.map((d) => (
                                <span key={d}>
                                  {fD(d)}
                                  <button type="button" onClick={() => set({ dates: s.dates.filter((x) => x !== d) })} aria-label="ลบวัน">
                                    ×
                                  </button>
                                </span>
                              ))}
                              {s.dates.length === 0 && <p className="adm-hint" style={{ margin: 0 }}>ยังไม่ได้เลือกวัน เช่น จัดทุกวันเสาร์ หรือวันที่ 1, 8, 15 — กดช่องด้านบนเพื่อเพิ่มทีละวัน</p>}
                            </div>
                          )}
                          {dateErr && (
                            <p className="jw-err" style={{ marginTop: -10 }}>
                              {dateErr}
                            </p>
                          )}
                          <div className="adm-field">
                            <span className="adm-field-label">{s.wtype === 'one_day' ? 'เวลา (24 ชม.)' : 'เวลาของแต่ละวัน (24 ชม.)'}</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                              <PickTime value={s.tStart} onChange={(v) => set({ tStart: v })} />
                              <span style={{ color: 'var(--muted)' }}>–</span>
                              <PickTime value={s.tEnd} onChange={(v) => set({ tEnd: v })} />
                            </div>
                            {timeErr && (
                              <p className="jw-err" style={{ marginTop: 6 }}>
                                เวลาเริ่มต้องอยู่ก่อนเวลาจบ
                              </p>
                            )}
                            {s.wtype !== 'one_day' && <p className="adm-hint">ใช้กับทุกวันของกิจกรรม</p>}
                          </div>
                          <div className="jw-rule" />
                          <div className="adm-field">
                            <span className="adm-field-label">
                              สถานที่ <span style={{ color: '#a3261a' }}>*</span>
                            </span>
                            <div className="jw-pills">
                              {(
                                [
                                  ['onsite', 'สถานที่จริง'],
                                  ['online', 'ออนไลน์'],
                                ] as const
                              ).map(([v, l]) => (
                                <button key={v} type="button" className={`jw-pill${s.venue === v ? ' is-on' : ''}`} onClick={() => set({ venue: v })}>
                                  {l}
                                </button>
                              ))}
                            </div>
                            <p className="adm-hint">เลือกได้เฉพาะสถานที่ในรายการ — ถ้าไม่มีสถานที่ที่ต้องการ ติดต่อทีมงานให้เพิ่มก่อน</p>
                          </div>
                          {s.venue === 'onsite' && (
                            <div className="adm-field">
                              <span className="adm-field-label">เลือกสถานที่</span>
                              <AdmSelect value={s.locationId} onChange={(e) => set({ locationId: e.target.value })} aria-label="สถานที่">
                                <option value="">— เลือกสถานที่ —</option>
                                {locations.map((l) => (
                                  <option key={l.id} value={l.id}>
                                    {l.name} ({l.province})
                                  </option>
                                ))}
                              </AdmSelect>
                              {locations.length === 0 && (
                                <p className="adm-soft-empty" style={{ marginTop: 8 }}>
                                  ยังไม่มีสถานที่ในระบบ — ติดต่อทีมงานให้เพิ่ม
                                </p>
                              )}
                            </div>
                          )}
                          {s.venue === 'online' && (
                            <div className="jw-box">
                              <div className="adm-field">
                                <span className="adm-field-label">แพลตฟอร์ม</span>
                                <div className="jw-seg" style={{ alignSelf: 'flex-start' }}>
                                  {PLATFORMS.map((p) => (
                                    <button key={p.v} type="button" className={s.platform === p.v ? 'is-on' : ''} onClick={() => set({ platform: p.v })}>
                                      {p.label}
                                    </button>
                                  ))}
                                </div>
                              </div>
                              {s.platform === 'other' && (
                                <div className="adm-field">
                                  <label htmlFor="jw-plat">ชื่อแพลตฟอร์ม</label>
                                  <input id="jw-plat" className="is-white" value={s.platformOther} onChange={(e) => set({ platformOther: e.target.value })} placeholder="เช่น Webex, LINE Meeting" />
                                </div>
                              )}
                              <div className="adm-field">
                                <label htmlFor="jw-url">ลิงก์ห้องประชุม</label>
                                <input id="jw-url" type="url" className="is-white" value={s.onlineUrl} onChange={(e) => set({ onlineUrl: e.target.value })} placeholder="https://…" />
                                <p className="adm-hint">ลิงก์นี้จะแสดงเฉพาะผู้ที่ได้ที่นั่งแล้ว (ชำระเงินสำเร็จ หรือยืนยันแล้วสำหรับกิจกรรมฟรี)</p>
                              </div>
                            </div>
                          )}
                          <div className="jw-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
                            <div className="adm-field">
                              <label htmlFor="jw-seats">ที่นั่งสูงสุด</label>
                              <input id="jw-seats" type="number" min={1} value={s.seats} onChange={(e) => set({ seats: e.target.value })} />
                            </div>
                            <div className="adm-field">
                              <label htmlFor="jw-amin">อายุต่ำสุด (ปี)</label>
                              <input id="jw-amin" type="number" min={0} max={120} value={s.ageMin} onChange={(e) => set({ ageMin: e.target.value })} placeholder="ไม่จำกัด" />
                            </div>
                            <div className="adm-field">
                              <label htmlFor="jw-amax">อายุสูงสุด (ปี)</label>
                              <input id="jw-amax" type="number" min={0} max={120} value={s.ageMax} onChange={(e) => set({ ageMax: e.target.value })} placeholder="ไม่จำกัด" />
                            </div>
                          </div>
                        </>
                      )}

                      {/* ── ราคา & การรับสมัคร (single) ── */}
                      {cur === 'price' && (
                        <>
                          <div className="adm-field">
                            <span className="adm-field-label">ค่าเข้าร่วม</span>
                            <div className="jw-seg" style={{ alignSelf: 'flex-start' }}>
                              <button type="button" className={!free ? 'is-on' : ''} onClick={() => set({ payment: s.payment === 'deposit' ? 'deposit' : 'paid' })}>
                                เก็บค่าเข้าร่วม
                              </button>
                              <button type="button" className={free ? 'is-on' : ''} onClick={() => set({ payment: 'free', price: '', promoOn: false })}>
                                ฟรี
                              </button>
                            </div>
                          </div>
                          {!free && (
                            <>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-end' }}>
                                <div className="adm-field" style={{ flex: '0 1 240px' }}>
                                  <label htmlFor="jw-price">
                                    ราคา (บาท) <span style={{ color: '#a3261a' }}>*</span>
                                  </label>
                                  <div style={{ position: 'relative' }}>
                                    <span style={{ position: 'absolute', left: 14, top: 11, color: 'var(--muted)', fontWeight: 600 }}>฿</span>
                                    <input id="jw-price" type="number" min={0} value={s.price} onChange={(e) => set({ price: e.target.value })} style={{ paddingLeft: 32 }} placeholder="0" />
                                  </div>
                                </div>
                                {!s.promoOn && (
                                  <button type="button" className="adm-btn soft" onClick={() => set({ promoOn: true })}>
                                    + เพิ่มโปรโมชัน
                                  </button>
                                )}
                              </div>
                              {s.promoOn && (
                                <div className="jw-box is-promo">
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <span style={{ fontFamily: 'Mitr, sans-serif', fontWeight: 500, fontSize: 15, flex: 1 }}>โปรโมชัน</span>
                                    <button type="button" className="adm-btn sm danger" onClick={() => set({ promoOn: false, promoPrice: '', promoStart: '', promoEnd: '' })}>
                                      เอาออก
                                    </button>
                                  </div>
                                  <div className="jw-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, alignItems: 'start' }}>
                                    <div className="adm-field">
                                      <label htmlFor="jw-promo">ราคาโปร</label>
                                      <input id="jw-promo" type="number" min={0} className="is-white" value={s.promoPrice} onChange={(e) => set({ promoPrice: e.target.value })} placeholder="ปล่อยว่าง = ไม่มีโปร" />
                                    </div>
                                    <div className="adm-field">
                                      <span className="adm-field-label">เริ่ม</span>
                                      <PickDateTime value={s.promoStart} onChange={(v) => set({ promoStart: v })} />
                                    </div>
                                    <div className="adm-field">
                                      <span className="adm-field-label">สิ้นสุด</span>
                                      <PickDateTime value={s.promoEnd} onChange={(v) => set({ promoEnd: v })} />
                                    </div>
                                  </div>
                                  {promoLive && (
                                    <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: 0 }}>
                                      ฿{priceN.toLocaleString()} → ฿{promoN.toLocaleString()} · ลด {Math.round((1 - promoN / priceN) * 100)}%
                                    </p>
                                  )}
                                </div>
                              )}
                            </>
                          )}
                          {free && (
                            <div className="jw-free">
                              <b>ฟรี</b>
                              <span>ผู้เข้าร่วมจองได้เลยโดยไม่ต้องชำระเงิน · ไม่มีโปรโมชัน</span>
                            </div>
                          )}
                          <div className="jw-rule" />
                          <div className="adm-field">
                            <span className="adm-field-label">รับผู้เข้าร่วมแบบไหน</span>
                            <div className="jw-tiles" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
                              {(
                                [
                                  ['direct', 'จองตรง', 'สมัคร → จ่ายเลย ได้ที่นั่งทันที'],
                                  ['selection', 'คัดเลือก', 'สมัคร → ประกาศผล → ยืนยัน'],
                                ] as const
                              ).map(([v, l, h]) => (
                                <button key={v} type="button" className={`jw-tile${s.admission === v ? ' is-on' : ''}`} onClick={() => set({ admission: v })}>
                                  <b>{l}</b>
                                  <span>{h}</span>
                                </button>
                              ))}
                            </div>
                          </div>
                          {s.admission === 'selection' && (
                            <div className="jw-box">
                              <p style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>
                                กำหนดการคัดเลือก <span style={{ fontWeight: 400, color: 'var(--muted)' }}>· ประกาศผล → ยืนยันตัวจริง → ยืนยันตัวสำรอง</span>
                              </p>
                              <div className="jw-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                                <div className="adm-field">
                                  <span className="adm-field-label">ประกาศผลคัดเลือก</span>
                                  <PickDateTime value={s.announce} onChange={(v) => set({ announce: v })} />
                                </div>
                                <div className="adm-field">
                                  <span className="adm-field-label">ยืนยันตัวจริง ภายใน</span>
                                  <PickDateTime value={s.confirmMain} onChange={(v) => set({ confirmMain: v })} />
                                </div>
                                <div className="adm-field">
                                  <span className="adm-field-label">ยืนยันตัวสำรอง ภายใน</span>
                                  <PickDateTime value={s.confirmWait} onChange={(v) => set({ confirmWait: v })} />
                                </div>
                              </div>
                              {selErr && <p className="jw-err">{selErr}</p>}
                            </div>
                          )}
                          <div className="adm-field" style={{ maxWidth: 320 }}>
                            <span className="adm-field-label">ปิดรับสมัคร</span>
                            <PickDateTime value={s.closeAt} onChange={(v) => set({ closeAt: v })} />
                            <p className="adm-hint">ไม่ใส่ = ปิดรับเมื่อกิจกรรมเริ่ม</p>
                          </div>
                        </>
                      )}

                      {/* ── ราคา & ที่นั่ง (round) ── */}
                      {cur === 'rprice' && (
                        <>
                          <div className="adm-field" style={{ maxWidth: 220 }}>
                            <label htmlFor="jw-mseats">ที่นั่งต่อรอบ</label>
                            <input id="jw-mseats" type="number" min={1} value={s.mSeats} onChange={(e) => set({ mSeats: e.target.value })} />
                            <p className="adm-hint">ค่าเริ่มต้นตอนเปิดรอบ — แก้เป็นรายรอบได้</p>
                          </div>
                          <div className="adm-field">
                            <span className="adm-field-label">
                              ราคา <span style={{ color: '#a3261a' }}>*</span> <span style={{ fontWeight: 400, color: 'var(--muted)' }}>· ใช้กับทุกรอบ · การ์ดโชว์ราคาต่อคนแถวแรก</span>
                            </span>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                              {s.tiers.length === 0 && (
                                <p className="adm-notice is-warn" style={{ margin: 0 }}>
                                  ยังไม่มีราคา — เพิ่มอย่างน้อย 1 แบบ จึงจะเปิดรอบได้
                                </p>
                              )}
                              {s.tiers.map((t, i) => (
                                <div key={t.id} className="adm-soft-card">
                                  <div className="adm-soft-card-head" style={{ gap: 8 }}>
                                    <span className="adm-soft-card-n">
                                      ราคา {i + 1} · {MODES[t.mode]}
                                    </span>
                                    <div style={{ flex: 1 }} />
                                    <button type="button" className="adm-btn sm danger" onClick={() => set({ tiers: s.tiers.filter((_, j) => j !== i) })}>
                                      ลบ
                                    </button>
                                  </div>
                                  <div className="adm-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
                                    <div className="adm-field">
                                      <label>ชื่อราคา</label>
                                      <input className="is-white" value={t.label} onChange={(e) => tierSet(i, { label: e.target.value })} placeholder={TIER_PH[t.mode]} />
                                    </div>
                                    <div className="adm-field">
                                      <label>{t.mode === 'round' ? 'บาท (ทั้งรอบ)' : 'บาท/คน'}</label>
                                      <input type="number" min={0} className="is-white" value={t.price || ''} onChange={(e) => tierSet(i, { price: Number(e.target.value) })} />
                                    </div>
                                    {t.mode === 'pack' && (
                                      <div className="adm-field">
                                        <label>คนต่อแพ็ก (รวมผู้จอง)</label>
                                        <input type="number" min={2} className="is-white" value={t.size ?? 3} onChange={(e) => tierSet(i, { size: Number(e.target.value) })} />
                                      </div>
                                    )}
                                    {t.mode === 'range' && (
                                      <div className="adm-field">
                                        <label>จำนวนคน (ต่ำสุด–สูงสุด)</label>
                                        <div style={{ display: 'flex', gap: 6 }}>
                                          <input type="number" min={2} className="is-white" value={t.min ?? 2} onChange={(e) => tierSet(i, { min: Number(e.target.value) })} />
                                          <input type="number" min={2} className="is-white" value={t.max ?? 5} onChange={(e) => tierSet(i, { max: Number(e.target.value) })} />
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                  <label className="adm-inline-check">
                                    <input type="checkbox" checked={t.mode === 'round' ? true : !!t.lock} disabled={t.mode === 'round'} onChange={(e) => tierSet(i, { lock: e.target.checked })} />
                                    <span>
                                      ล็อกรอบเป็นส่วนตัว (Private)
                                      <span className="adm-meta" style={{ display: 'block', fontSize: 12, marginTop: 2 }}>
                                        {t.mode === 'round'
                                          ? `เหมารอบย่อมปิดรับคนอื่นเสมอ · ที่นั่ง ${Number(s.mSeats) || 20} คน`
                                          : t.lock
                                            ? 'Private: จองแล้วรอบนั้นไม่รับคนอื่น · จองได้เฉพาะรอบว่าง'
                                            : t.mode === 'pack' || t.mode === 'range'
                                              ? 'Public: รับได้หลายกลุ่มจนกว่าที่นั่งจะเต็ม'
                                              : 'Public: นั่งร่วมกับคนอื่นจนกว่าที่นั่งจะเต็ม'}
                                      </span>
                                    </span>
                                  </label>
                                </div>
                              ))}
                              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                                <span style={{ fontSize: 12.5, color: 'var(--muted)', marginRight: 4 }}>เพิ่มราคา</span>
                                {(Object.keys(MODES) as PriceTier['mode'][]).map((m) => (
                                  <button
                                    key={m}
                                    type="button"
                                    className="adm-btn sm soft"
                                    onClick={() =>
                                      set({
                                        tiers: [
                                          ...s.tiers,
                                          {
                                            id: `t-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
                                            label: '',
                                            price: 0,
                                            mode: m,
                                            ...(m === 'round' ? { lock: true } : m === 'pack' ? { size: 3 } : m === 'range' ? { min: 2, max: 5 } : {}),
                                          },
                                        ],
                                      })
                                    }
                                  >
                                    + {MODES[m]}
                                  </button>
                                ))}
                              </div>
                            </div>
                          </div>
                        </>
                      )}

                      {/* ── สถานที่ & เงื่อนไข (round) ── */}
                      {cur === 'rules' && (
                        <>
                          <div className="adm-field">
                            <span className="adm-field-label">
                              สถานที่ที่เปิดรอบได้ <span style={{ fontWeight: 400, color: 'var(--muted)' }}>· เลือกอีกครั้งตอนเปิดรอบ</span>
                            </span>
                            <div className="adm-checklist">
                              {[{ id: ONLINE_VENUE, name: 'ออนไลน์', province: 'Zoom · Meet · Teams · อื่น ๆ' }, ...locations].map((l) => (
                                <label key={l.id}>
                                  <input
                                    type="checkbox"
                                    checked={s.locationIds.includes(l.id)}
                                    onChange={(e) => set({ locationIds: e.target.checked ? [...s.locationIds, l.id] : s.locationIds.filter((x) => x !== l.id) })}
                                  />
                                  <span style={{ flex: 1, fontSize: 14 }}>{l.name}</span>
                                  <span className="adm-meta">{l.province}</span>
                                </label>
                              ))}
                            </div>
                            {locations.length === 0 && (
                              <p className="adm-soft-empty" style={{ marginTop: 8 }}>
                                ยังไม่มีสถานที่ในระบบ — ติดต่อทีมงานให้เพิ่ม
                              </p>
                            )}
                            <p className="adm-hint">
                              {s.locationIds.length === 0
                                ? 'ไม่เลือกเลย = เลือกได้ทุกสถานที่ตอนเปิดรอบ (ยกเว้นออนไลน์)'
                                : s.locationIds.length === 1 && s.locationIds[0] === ONLINE_VENUE
                                  ? 'จัดออนไลน์เท่านั้น — ใส่ลิงก์ห้องเป็นรายรอบ'
                                  : `เปิดรอบได้ ${s.locationIds.length} แบบที่เลือก`}
                            </p>
                          </div>
                          <div className="jw-rule" />
                          <div className="adm-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
                            <div className="adm-field">
                              <label htmlFor="jw-ramin">อายุต่ำสุด (ปี)</label>
                              <input id="jw-ramin" type="number" min={0} max={120} value={s.ageMin} onChange={(e) => set({ ageMin: e.target.value })} placeholder="ไม่จำกัด" />
                            </div>
                            <div className="adm-field">
                              <label htmlFor="jw-ramax">อายุสูงสุด (ปี)</label>
                              <input id="jw-ramax" type="number" min={0} max={120} value={s.ageMax} onChange={(e) => set({ ageMax: e.target.value })} placeholder="ไม่จำกัด" />
                            </div>
                          </div>
                          <p className="adm-hint" style={{ marginTop: -14 }}>
                            นับจากวันเกิดของผู้จองในวันกิจกรรม · รวมคนรับสิทธิ์และเพื่อนในกลุ่ม
                          </p>
                          <div className="adm-field">
                            <span className="adm-field-label">ปิดรับจอง</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 14 }}>
                              <input type="number" min={0} max={365} value={s.closeDays} onChange={(e) => set({ closeDays: e.target.value })} style={{ width: 90 }} placeholder="—" aria-label="จำนวนวัน" />
                              <span>วันก่อนวันกิจกรรม เวลา</span>
                              <PickTime value={s.closeTime} onChange={(v) => set({ closeTime: v })} />
                            </div>
                            <p className="adm-hint">
                              {cd === '' ? 'เปิดรับจองจนรอบเริ่ม' : `${Number(cd) === 0 ? 'ปิดรับจองวันกิจกรรม' : `ปิดรับจอง ${Number(cd)} วันก่อนวันกิจกรรม`} เวลา ${s.closeTime || '23:59'} น.`} · เว้นว่าง =
                              เปิดรับจองจนรอบเริ่ม
                            </p>
                          </div>
                        </>
                      )}

                      {/* ── ใบสมัคร & PDPA ── */}
                      {cur === 'form' && <ApplicationEditor questions={s.questions} onQuestions={(q) => set({ questions: q })} consent={s.consent} onConsent={(on) => set({ consent: on })} disabled={busy} />}

                      {/* ── เนื้อหา ── */}
                      {cur === 'content' && (
                        <>
                          {single && (
                            <div className="adm-field">
                              <span className="adm-field-label">ตารางกิจกรรม (Timeline)</span>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {s.schedule.length === 0 && (
                                  <p className="adm-soft-empty" style={{ padding: 12, margin: 0 }}>
                                    ยังไม่มีช่วงเวลา — เช่น 09:00 ลงทะเบียน + welcome drink
                                  </p>
                                )}
                                {s.schedule.map((it, i) => (
                                  <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                    <div style={{ width: 150, flexShrink: 0 }}>
                                      <PickTime value={it.time} onChange={(v) => set({ schedule: s.schedule.map((x, j) => (j === i ? { ...x, time: v } : x)) })} />
                                    </div>
                                    <input
                                      type="text"
                                      value={it.detail}
                                      onChange={(e) => set({ schedule: s.schedule.map((x, j) => (j === i ? { ...x, detail: e.target.value } : x)) })}
                                      style={{ flex: 1, minWidth: 0 }}
                                      placeholder="ลงทะเบียน + welcome drink"
                                    />
                                    <button type="button" className="adm-icon-btn adm-minus" onClick={() => set({ schedule: s.schedule.filter((_, j) => j !== i) })} aria-label="ลบ">
                                      −
                                    </button>
                                  </div>
                                ))}
                                <div>
                                  <button
                                    type="button"
                                    className="adm-link-btn"
                                    onClick={() => set({ schedule: [...s.schedule, { time: s.schedule.length ? s.schedule[s.schedule.length - 1].time : s.tStart, detail: '' }] })}
                                  >
                                    + เพิ่มช่วงเวลา
                                  </button>
                                </div>
                              </div>
                            </div>
                          )}
                          {single ? (
                            <>
                              <LineList legend="สิ่งที่จะได้เรียนรู้" items={s.learn} onChange={(v) => set({ learn: v })} ph="เทคนิคพื้นฐาน..." />
                              <LineList legend="เหมาะกับใคร" items={s.target} onChange={(v) => set({ target: v })} ph="เช่น คนที่อยากพักใจ..." />
                            </>
                          ) : (
                            <>
                              <LineList legend="เหมาะกับใคร" items={s.target} onChange={(v) => set({ target: v })} ph="เช่น คนที่อยากพักใจ..." />
                              <LineList legend="ได้อะไรจากกิจกรรม" items={s.learn} onChange={(v) => set({ learn: v })} ph="เช่น เทคนิคการหายใจ..." />
                            </>
                          )}
                        </>
                      )}

                      {/* ── ตรวจทาน ── */}
                      {cur === 'review' && (
                        <>
                          {missing.length > 0 && (
                            <div className="adm-notice" style={{ borderRadius: 16 }}>
                              ยังขาด {missing.map((m) => m.k).join(', ')} — บันทึกเป็นร่างได้ แต่ต้องกรอกให้ครบก่อนส่งให้ทีมตรวจ
                            </div>
                          )}
                          <dl className="jw-review">
                            {reviewRows.map((r) => (
                              <div key={r.label}>
                                <dt>{r.label}</dt>
                                <dd className={r.value ? '' : 'is-miss'}>{r.value || r.empty}</dd>
                                <button type="button" className="adm-link-btn" style={{ fontSize: 13 }} onClick={() => go(r.step)}>
                                  แก้ไข
                                </button>
                              </div>
                            ))}
                          </dl>
                          <p style={{ fontSize: 13.5, lineHeight: '21px', color: 'var(--muted)', margin: 0 }}>คุณเป็นผู้จัดหลักของกิจกรรมนี้ — ถ้ามีผู้จัดร่วม แจ้งทีมงานเพิ่มให้ได้หลังอนุมัติ</p>
                          {round && (
                            <div className="jw-next-note">
                              <b>ต่อจากนี้:</b> หลังบันทึก กด “จัดรอบ” เพื่อเพิ่มรอบในปฏิทิน แล้วกลับมากด “ส่งให้ทีมตรวจ”
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <div className="jw-foot">
                  {step > 0 && (
                    <button type="button" className="jw-back" onClick={() => go(step - 1)}>
                      ← ย้อนกลับ
                    </button>
                  )}
                  <div style={{ flex: 1 }} />
                  {!phone && step === last && <span className="jw-hint">{missing.length ? `ยังขาด ${missing.length} อย่าง — บันทึกเป็นร่างได้` : 'ครบแล้ว'}</span>}
                  {step < last ? (
                    <button type="button" className="jw-next" onClick={() => go(step + 1)}>
                      {phone ? 'ถัดไป →' : `ถัดไป · ${STEPS[step + 1][1]} →`}
                    </button>
                  ) : (
                    <button type="submit" className="jw-save" disabled={busy}>
                      {busy ? 'กำลังบันทึก…' : 'บันทึกกิจกรรม ✓'}
                    </button>
                  )}
                </div>
              </form>

              {!wide && pvOpen && (
                <div className="jw-pv-over">
                  <div style={{ alignSelf: 'stretch', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className="jw-pv-k">ตัวอย่างบนเว็บ</span>
                    <button type="button" className="jw-x" onClick={() => setPvOpen(false)} aria-label="ปิดตัวอย่าง">
                      <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                        <path strokeLinecap="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  <div style={{ width: '100%', maxWidth: 300 }}>{card}</div>
                </div>
              )}
            </div>
          )}

          {/* ============ SAVED ============ */}
          {saved && (
            <div className="jw-saved">
              <span className="jw-saved-word" aria-hidden>
                SAVED.
              </span>
              <span className="jw-saved-tick">✓</span>
              <h2>{editingId ? 'บันทึกการแก้ไขแล้ว.' : 'บันทึกเป็นร่างแล้ว.'}</h2>
              <p>
                {waiting.length
                  ? `ข้อความและรูปใช้กับหน้าเว็บแล้ว ส่วน ${waiting.join(', ')} รอทีมงานอนุมัติ — หน้าเว็บยังใช้ค่าเดิมจนกว่าจะอนุมัติ`
                  : round
                    ? 'ต่อไปกด “จัดรอบ” เพื่อเพิ่มรอบในปฏิทิน แล้วกลับมากด “ส่งให้ทีมตรวจ” — อนุมัติแล้วกิจกรรมจึงขึ้นบนเว็บ'
                    : 'กด “ส่งให้ทีมตรวจ” เมื่อพร้อม ทีมงานจะแจ้งผลทาง LINE — อนุมัติแล้วกิจกรรมจึงขึ้นบนเว็บ'}
              </p>
              <span className="jw-saved-fun">ใกล้แล้ว ✺</span>
              <div className="jw-saved-acts">
                <button type="button" className="adm-btn" onClick={() => setSaved(false)}>
                  แก้ไขต่อ
                </button>
                {round && id ? (
                  <Link href={`/host/sessions/${id}`} className="adm-btn ink">
                    ไปหน้าจัดรอบ →
                  </Link>
                ) : editingId ? (
                  <button type="button" className="adm-btn ink" onClick={() => onClose(true)}>
                    กลับไปที่รายการ
                  </button>
                ) : (
                  <button
                    type="button"
                    className="adm-btn ink"
                    onClick={sendForReview}
                    disabled={busy || missing.length > 0}
                    title={missing.length ? `ยังขาด ${missing.map((m) => m.k).join(', ')}` : undefined}
                  >
                    ส่งให้ทีมตรวจ
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
