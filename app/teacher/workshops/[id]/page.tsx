'use client';

/* Check-in for one workshop or round — design "Teacher Check-in v2" (PC) and
 * the check-in screens of "Teacher Mobile App".
 *
 * Tab เช็คชื่อ: search + status filters, one row per participant with the
 * มา / ไม่มา toggle (per day for multi-day workshops) and, once someone is
 * marked present, a "รีวิว" button with their AAR answers. Tapping a name opens
 * a drawer with their application, nickname and a private note. The side
 * column sums up the check-in, links to the AAR survey and shows the payout.
 *
 * Tab AAR: the survey builder (text / one choice / many choices, stars always
 * last), its QR code and the answers so far. On phones the side column
 * becomes a third tab, การเงิน. */

import { useEffect, useMemo, useState } from 'react';
import { useParams, usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import QRCode from 'qrcode';
import { PageLoader } from '@/components/design/PageLoader';
import { PdpaBadge } from '@/components/workshops/PdpaBadge';
import { applicantName } from '@/lib/applicant';
import type { Workshop } from '@/lib/types';
import { getWorkshopDays } from '@/lib/workshop-utils';
import { sqliteToMs } from '@/lib/datetime';
import { OTHER, answerText, newQuestionId, type Survey, type SurveyQuestion, type SurveyQuestionType, type SurveyResponse } from '@/lib/survey';
import { IcoCal, IcoClock, IcoPin, baht, fmtLong, fmtShort } from '@/components/teacher/tdb';

type Row = {
  id: string;
  user_id: string;
  amount: number;
  attendance_json: string | null;
  application_json: string | null;
  facilitator_note: string | null;
  user_name: string | null;
  user_email: string | null;
  teacher_nickname: string | null;
  payment_status?: string;
  status?: string;
  app_status?: string;
  waitlist_rank?: number | null;
  confirmed_at?: string | null;
  group_size?: number | null;
  parent_booking_id?: string | null;
  booking_tier_label?: string | null;
  group_claimed?: number;
};
type Finance = { gross: number; deduction: number; net: number };
type Data = { workshop: Workshop; bookings: Row[]; finance: Finance };
type SurveyData = { survey: Survey | null; template: Survey | null; responses: SurveyResponse[] };
type Tab = 'roster' | 'aar' | 'fin';
type Filter = 'all' | 'in' | 'out' | 'left';

type AppProfile = {
  fullName?: string;
  firstName?: string;
  lastName?: string;
  age?: number | null;
  gender?: string;
  phone?: string;
  email?: string;
  facebook?: string;
  lineId?: string;
  emergency?: { name?: string; relation?: string; phone?: string };
  medical?: string;
  dietary?: string;
};

function parseMap(json: string | null): Record<string, number> {
  try {
    return json ? (JSON.parse(json) as Record<string, number>) : {};
  } catch {
    return {};
  }
}
function parseApp(json: string | null): { profile: AppProfile; answers: { label: string; value: unknown }[] } {
  try {
    const p = json ? (JSON.parse(json) as { profile?: AppProfile; answers?: { label: string; value: unknown }[] }) : null;
    return { profile: p?.profile || {}, answers: p?.answers || [] };
  } catch {
    return { profile: {}, answers: [] };
  }
}
const initialOf = (name: string) => (name.trim()[0] || '?').toUpperCase();
const stars = (n: number) => '★'.repeat(n) + '☆'.repeat(Math.max(0, 5 - n));

/** The four classic after-action review questions — where a new survey starts. */
const starter = (): SurveyQuestion[] => [
  { id: newQuestionId(), type: 'text', label: 'ก่อนเริ่มกิจกรรม คุณคาดหวังอะไรไว้บ้าง', options: [], allowOther: false, required: true },
  { id: newQuestionId(), type: 'text', label: 'สิ่งที่เกิดขึ้นจริงเป็นอย่างไร', options: [], allowOther: false, required: true },
  { id: newQuestionId(), type: 'text', label: 'ทำไมจึงต่างหรือเหมือนกับที่คาดไว้', options: [], allowOther: false, required: false },
  { id: newQuestionId(), type: 'text', label: 'ครั้งหน้าอยากให้ปรับหรือเพิ่มอะไร', options: [], allowOther: false, required: false },
];
const blankQ = (type: SurveyQuestionType): SurveyQuestion => ({ id: newQuestionId(), type, label: '', options: type === 'text' ? [] : ['', ''], allowOther: false, required: true });
const QTYPES: [SurveyQuestionType, string][] = [
  ['text', 'ข้อความ'],
  ['single', 'เลือกข้อเดียว'],
  ['multi', 'เลือกหลายข้อ'],
];

function appStatus(s: string, rank: number | null | undefined): [string, string, string] {
  if (s === 'approved') return ['ผ่านการคัดเลือก', '#eaf6f4', '#075a51'];
  if (s === 'waitlisted') return [`ตัวสำรอง #${rank ?? '—'}`, '#fcefcf', '#a06a14'];
  if (s === 'rejected') return ['ไม่ผ่าน', '#fde7d3', '#a04a14'];
  return ['รอพิจารณา', '#ede5cf', '#6a7a78'];
}

export default function TeacherCheckinPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  // A round's roster lives under the session manager so the rail lights
  // "จัดรอบสอน"; a one-day workshop's under "Workshop เดี่ยว".
  const underSessions = usePathname().startsWith('/teacher/sessions/');

  const [data, setData] = useState<Data | null>(null);
  const [sv, setSv] = useState<SurveyData | null>(null);
  // ?tab=aar lands on the survey (the old survey page redirects here). The
  // layout only renders pages after its sign-in check, on the client.
  const [tab, setTab] = useState<Tab>(() => (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('tab') === 'aar' ? 'aar' : 'roster'));
  const [dayIdx, setDayIdx] = useState(0);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [nickDraft, setNickDraft] = useState('');
  const [noteDraft, setNoteDraft] = useState('');
  const [noteSaved, setNoteSaved] = useState(false);
  const [reviewOf, setReviewOf] = useState<string | null>(null);
  const [slipOpen, setSlipOpen] = useState(false);
  const [qrBig, setQrBig] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [pvStars, setPvStars] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  // Survey builder.
  const [sTitle, setSTitle] = useState('');
  const [sIntro, setSIntro] = useState('');
  const [questions, setQuestions] = useState<SurveyQuestion[]>([]);
  const [isOpen, setIsOpen] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    const empty: Data = { workshop: null as unknown as Workshop, bookings: [], finance: { gross: 0, deduction: 0, net: 0 } };
    fetch(`/api/teacher/workshops/${id}`)
      .then((r) => (r.ok ? (r.json() as Promise<Data>) : empty))
      .catch(() => empty)
      .then((d) => {
        if (alive) setData(d);
      });
    fetch(`/api/teacher/workshops/${id}/survey`)
      .then((r) => (r.ok ? (r.json() as Promise<SurveyData & { workshop: { title: string } }>) : null))
      .catch(() => null)
      .then((d) => {
        if (!alive || !d) return;
        setSv({ survey: d.survey, template: d.template, responses: d.responses || [] });
        const src = d.survey || d.template;
        setSTitle(src?.title || `AAR · ${d.workshop.title}`);
        setSIntro(src?.intro || '');
        setQuestions(src ? src.questions : starter());
        setIsOpen(d.survey ? d.survey.is_open : true);
      });
    return () => {
      alive = false;
    };
  }, [id]);

  // Old links (and bookmarks) open a round under /teacher/workshops — move it
  // to the session manager's path so the rail shows where the teacher is.
  const isRound = data?.workshop?.master_kind === 'round';
  useEffect(() => {
    if (isRound && !underSessions) router.replace(`/teacher/sessions/round/${id}${tab === 'aar' ? '?tab=aar' : ''}`);
  }, [isRound, underSessions, router, id, tab]);

  const surveyUrl = typeof window !== 'undefined' ? `${window.location.origin}/survey/${id}` : '';
  const saved = !!sv?.survey;
  useEffect(() => {
    if (!saved || !surveyUrl) return;
    QRCode.toDataURL(surveyUrl, { width: 720, margin: 2, errorCorrectionLevel: 'M' })
      .then(setQr)
      .catch(() => setQr(null));
  }, [saved, surveyUrl]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  // Esc closes whatever is on top.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (qrBig) setQrBig(false);
      else if (previewOpen) setPreviewOpen(false);
      else if (reviewOf) setReviewOf(null);
      else if (slipOpen) setSlipOpen(false);
      else if (drawerId) setDrawerId(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [qrBig, previewOpen, reviewOf, slipOpen, drawerId]);

  const bookings = useMemo(() => data?.bookings || [], [data]);
  const w = data?.workshop || null;
  const days = w ? getWorkshopDays(w) : [];
  const responses = sv?.responses || [];
  const responseOf = (userId: string) => responses.find((r) => r.user_id === userId) || null;
  const nameOf = (b: Row) => applicantName(b.application_json, b.user_name);
  const stateOf = (b: Row, di = dayIdx): 'in' | 'out' | 'left' => {
    const v = parseMap(b.attendance_json)[String(di)];
    return v === 1 ? 'in' : v === 0 ? 'out' : 'left';
  };
  const presentAny = (b: Row) => Object.values(parseMap(b.attendance_json)).some((v) => v === 1);

  const sum = useMemo(() => {
    const s = { in: 0, out: 0, left: 0 };
    bookings.forEach((b) => {
      const v = parseMap(b.attendance_json)[String(dayIdx)];
      if (v === 1) s.in++;
      else if (v === 0) s.out++;
      else s.left++;
    });
    return s;
  }, [bookings, dayIdx]);
  const total = bookings.length;
  const q = query.trim().toLowerCase();
  const people = bookings.filter((b) => {
    if (filter !== 'all' && stateOf(b) !== filter) return false;
    if (!q) return true;
    return [nameOf(b), b.teacher_nickname, b.user_email].some((v) => (v || '').toLowerCase().includes(q));
  });

  async function setAtt(bookingId: string, di: number, value: number | null) {
    const key = `${bookingId}:${di}`;
    setPending((s) => new Set(s).add(key));
    setData((d) =>
      d
        ? {
            ...d,
            bookings: d.bookings.map((b) => {
              if (b.id !== bookingId) return b;
              const map = parseMap(b.attendance_json);
              if (value === null) delete map[String(di)];
              else map[String(di)] = value;
              return { ...b, attendance_json: JSON.stringify(map) };
            }),
          }
        : d,
    );
    try {
      await fetch(`/api/teacher/bookings/${bookingId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dayIndex: di, value }),
      });
    } finally {
      setPending((s) => {
        const n = new Set(s);
        n.delete(key);
        return n;
      });
    }
  }
  const toggle = (b: Row, to: 'in' | 'out') => setAtt(b.id, dayIdx, stateOf(b) === to ? null : to === 'in' ? 1 : 0);
  async function markRest() {
    const rest = bookings.filter((b) => stateOf(b) === 'left');
    await Promise.all(rest.map((b) => setAtt(b.id, dayIdx, 1)));
    setToast(`เช็คว่า “มา” เพิ่ม ${rest.length} คนแล้ว`);
  }

  function openDrawer(b: Row) {
    setDrawerId(b.id);
    setNickDraft(b.teacher_nickname || '');
    setNoteDraft(b.facilitator_note || '');
    setNoteSaved(false);
  }
  async function saveNick(b: Row) {
    const value = nickDraft.trim();
    setData((d) => (d ? { ...d, bookings: d.bookings.map((x) => (x.id === b.id ? { ...x, teacher_nickname: value || null } : x)) } : d));
    await fetch(`/api/teacher/bookings/${b.id}/nickname`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nickname: value }) }).catch(() => {});
    setToast('บันทึกชื่อเล่นแล้ว');
  }
  async function saveNote(b: Row) {
    const res = await fetch(`/api/teacher/bookings/${b.id}/note`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ facilitator_note: noteDraft }) }).catch(() => null);
    if (res?.ok) {
      setData((d) => (d ? { ...d, bookings: d.bookings.map((x) => (x.id === b.id ? { ...x, facilitator_note: noteDraft.trim() || null } : x)) } : d));
      setNoteSaved(true);
    } else setToast('บันทึกหมายเหตุไม่สำเร็จ');
  }

  // ---- survey builder ----
  const edit = (fn: (qs: SurveyQuestion[]) => SurveyQuestion[]) => {
    setQuestions(fn);
    setDirty(true);
  };
  const patchQ = (i: number, p: Partial<SurveyQuestion>) => edit((qs) => qs.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const moveQ = (i: number, d: -1 | 1) =>
    edit((qs) => {
      const j = i + d;
      if (j < 0 || j >= qs.length) return qs;
      const n = [...qs];
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });
  async function saveSurvey(nextOpen = isOpen) {
    if (saving) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/teacher/workshops/${id}/survey`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: sTitle, intro: sIntro, questions, is_open: nextOpen }),
      });
      const d = (await res.json()) as { survey?: Survey; error?: string };
      if (!res.ok || !d.survey) {
        setToast(d.error || 'บันทึกไม่สำเร็จ');
        return;
      }
      const s = d.survey;
      setSv((x) => ({ survey: s, template: null, responses: x?.responses || [] }));
      setQuestions(s.questions);
      setIsOpen(s.is_open);
      setDirty(false);
      setToast(nextOpen !== isOpen ? (s.is_open ? 'เปิดรับคำตอบแล้ว' : 'ปิดรับคำตอบแล้ว') : 'บันทึกแบบสอบถามแล้ว');
    } catch {
      setToast('บันทึกไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center h-40">
        <PageLoader />
      </div>
    );
  }
  if (!w) return <div className="tdb-empty"><p>ไม่พบเวิร์กชอป</p></div>;

  const backHref = w.master_kind === 'round' && w.master_id ? `/teacher/sessions/${w.master_id}` : '/teacher/workshops';
  const backLabel = w.master_kind === 'round' ? '← ปฏิทินรอบ' : '← Workshop เดี่ยว';
  const payoutPaid = w.payout_status === 'paid';
  const avg = responses.length ? responses.reduce((s, r) => s + r.rating, 0) / responses.length : 0;
  const presentCount = bookings.filter(presentAny).length;
  const pendingNames = bookings.filter((b) => presentAny(b) && !responseOf(b.user_id)).map(nameOf);
  const sState = !saved ? { label: 'ยังไม่ได้บันทึก', bg: '#f6f1e6', color: '#6a7a78' } : isOpen ? { label: 'เปิดรับคำตอบ', bg: '#eaf6f4', color: '#075a51' } : { label: 'ปิดรับคำตอบ', bg: '#f6e7e4', color: '#9a4a3f' };
  const drawer = drawerId ? bookings.find((b) => b.id === drawerId) || null : null;
  const drawerPos = drawer ? bookings.indexOf(drawer) : -1;
  const reviewRow = reviewOf ? bookings.find((b) => b.id === reviewOf) || null : null;
  const reviewResp = reviewRow ? responseOf(reviewRow.user_id) : null;
  const dayLabel = (di: number) => (days.length > 1 ? `วันที่ ${di + 1} · ${fmtShort(days[di])}` : fmtShort(days[0]));

  const badgesOf = (b: Row) => {
    const out: [string, string, string][] = [];
    if (b.parent_booking_id) {
      const p = bookings.find((x) => x.id === b.parent_booking_id);
      out.push([`สมาชิกกลุ่ม${p ? ` · ${nameOf(p)}` : ''}`, '#eaf6f4', '#075a51']);
    } else if ((b.group_size || 1) > 1) {
      out.push([`กลุ่ม ${b.group_size} คน · รับสิทธิ์ ${b.group_claimed || 0}/${(b.group_size || 1) - 1}`, '#fcefcf', '#8a5a00']);
    }
    if (b.booking_tier_label) out.push([b.booking_tier_label, '#f6f1e6', '#6a7a78']);
    if (w.admission_type === 'selection' && b.app_status) out.push(appStatus(b.app_status, b.waitlist_rank));
    return out;
  };

  const avClass = (b: Row) => (stateOf(b) === 'in' ? 'in' : stateOf(b) === 'out' ? 'out' : '');

  const summaryPanel = (
    <div className="tdb-panel">
      <span className="tdb-mono-label">สรุปการเช็คชื่อ{days.length > 1 ? ` · ${dayLabel(dayIdx)}` : ''}</span>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, margin: '8px 0 14px' }}>
        <span style={{ fontFamily: "'Mitr', sans-serif", fontWeight: 500, fontSize: 48, lineHeight: 1, color: 'var(--teal)' }}>{sum.in + sum.out}</span>
        <span style={{ fontFamily: "'Mitr', sans-serif", fontWeight: 500, fontSize: 20 }}>/ {total} คน</span>
      </div>
      <div className="tdb-sumbar">
        <i style={{ width: `${total ? (sum.in / total) * 100 : 0}%`, background: 'var(--teal)' }} />
        <i style={{ width: `${total ? (sum.out / total) * 100 : 0}%`, background: '#d35d52' }} />
      </div>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 10, fontSize: 12.5, color: 'var(--muted)' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <i style={{ width: 8, height: 8, borderRadius: 99, background: 'var(--teal)' }} />
          มา {sum.in}
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <i style={{ width: 8, height: 8, borderRadius: 99, background: '#d35d52' }} />
          ไม่มา {sum.out}
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <i style={{ width: 8, height: 8, borderRadius: 99, background: 'var(--cream-deep)' }} />
          ยังไม่เช็ค {sum.left}
        </span>
      </div>
      {sum.left > 0 && (
        <button type="button" onClick={markRest} className="tdb-hide-phone" style={{ marginTop: 16, width: '100%', border: 0, background: '#eaf6f4', color: 'var(--teal-deep)', borderRadius: 999, padding: '11px 16px', font: 'inherit', fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}>
          เช็คที่เหลือ {sum.left} คนว่า “มา”
        </button>
      )}
    </div>
  );

  const financePanel = (
    <div className="tdb-panel" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <span style={{ fontFamily: "'Mitr', sans-serif", fontWeight: 500, fontSize: 17 }}>{w.master_kind === 'round' ? 'การเงินรอบนี้' : 'การเงิน Workshop นี้'}</span>
        <span style={{ fontSize: 11.5, fontWeight: 600, borderRadius: 999, padding: '4px 11px', background: payoutPaid ? '#eaf6f4' : '#fcefcf', color: payoutPaid ? '#075a51' : '#8a5a00' }}>{payoutPaid ? 'โอนแล้ว' : 'รอโอน'}</span>
      </div>
      <div>
        <div className="tdb-fin-row">
          <span style={{ color: 'var(--muted)' }}>รายรับรวม</span>
          <span className="mono">{baht(data.finance.gross)}</span>
        </div>
        <div className="tdb-fin-row">
          <span style={{ color: 'var(--muted)' }}>หักค่าใช้จ่าย</span>
          <span className="mono" style={{ color: '#a04a14' }}>− {baht(data.finance.deduction)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '10px 0 0' }}>
          <span style={{ fontWeight: 600, fontSize: 14 }}>ยอดโอนสุทธิ</span>
          <span style={{ fontFamily: "'Mitr', sans-serif", fontWeight: 500, fontSize: 26, color: 'var(--teal-deep)' }}>{baht(data.finance.net)}</span>
        </div>
      </div>
      {w.payout_remark && (
        <div style={{ fontSize: 12.5, lineHeight: 1.55, background: 'var(--cream)', borderRadius: 12, padding: '10px 12px' }}>
          <span className="tdb-mono-label" style={{ display: 'block', fontSize: 10, marginBottom: 2 }}>หมายเหตุจากทีมงาน</span>
          {w.payout_remark}
        </div>
      )}
      {w.payout_slip_url && (
        <button type="button" onClick={() => setSlipOpen(true)} className="btn btn-ink btn-sm" style={{ justifyContent: 'center' }}>
          ดูสลิปโอนเงิน <span className="mono">↗</span>
        </button>
      )}
    </div>
  );

  const photosLink = w.photos_drive_url ? (
    <a href={w.photos_drive_url} target="_blank" rel="noopener noreferrer" className="tdb-panel" style={{ padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none', color: 'var(--ink)' }}>
      <span style={{ width: 40, height: 40, borderRadius: 12, background: '#eaf6f4', color: 'var(--teal)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3.5 7.5A2 2 0 0 1 5.5 5.5h4l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2Z" />
        </svg>
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontWeight: 600, fontSize: 14 }}>ภาพถ่ายกิจกรรม</span>
        <span style={{ display: 'block', fontSize: 12, color: 'var(--muted)' }}>Google Drive · ทีมงานอัปโหลดไว้</span>
      </span>
      <span className="mono" style={{ color: 'var(--teal)' }}>↗</span>
    </a>
  ) : null;

  const qrTile = (size: 'mini' | 'big') =>
    qr ? (
      <button type="button" onClick={() => setQrBig(true)} aria-label="แสดง QR" className="tdb-qr-mini" style={size === 'big' ? { width: '100%', height: 'auto', aspectRatio: '1', padding: 14, background: 'var(--cream)', borderRadius: 18, opacity: isOpen ? 1 : 0.5 } : undefined}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qr} alt="QR" style={size === 'big' ? { background: '#fff', borderRadius: 10, padding: 8 } : undefined} />
      </button>
    ) : size === 'mini' ? (
      <span className="tdb-qr-mini empty" aria-hidden>
        ▦
      </span>
    ) : (
      <div style={{ aspectRatio: '1', borderRadius: 18, background: 'var(--cream)', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 24, lineHeight: 1.6, fontSize: 13, color: 'var(--muted)' }}>
        บันทึกแบบสอบถามก่อน
        <br />
        แล้ว QR จะขึ้นที่นี่
      </div>
    );

  return (
    <div>
      <Link href={backHref} className="tdb-back">{backLabel}</Link>

      <div className="tdb-head" style={{ margin: '16px 0 22px' }}>
        <div style={{ flex: 1, minWidth: 280, maxWidth: 'none' }}>
          <span className="tdb-eyebrow">เช็คชื่อ · {w.master_kind === 'round' ? 'รอบสอน' : 'Workshop เดี่ยว'}</span>
          <h1 className="tdb-h1 sm" style={{ marginTop: 12 }}>{w.title}</h1>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <span className="tdb-chipinfo">
              <IcoCal />
              {fmtLong(days[0])}
              {days.length > 1 ? ` · ${days.length} วัน` : ''}
            </span>
            <span className="tdb-chipinfo" style={{ fontFamily: 'var(--font-mono)' }}>
              <IcoClock />
              {w.time_start}–{w.time_end}
            </span>
            {w.location && (
              <span className="tdb-chipinfo">
                <IcoPin />
                {w.location}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="tdb-seg pillcount full" role="tablist" style={{ marginBottom: 22 }}>
        {(
          [
            ['roster', 'เช็คชื่อ', `${sum.in + sum.out}/${total}`, ''],
            ['aar', 'แบบสอบถาม AAR', String(responses.length), ''],
            ['fin', 'การเงิน', '', 'tdb-phone-only'],
          ] as const
        ).map(([k, label, n, cls]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={`${tab === k ? 'on' : ''} ${cls}`} onClick={() => setTab(k)} style={{ fontSize: 14, padding: '10px 20px' }}>
            {label}
            {n && <span className="n">{n}</span>}
          </button>
        ))}
      </div>

      {/* ================= ROSTER ================= */}
      {tab === 'roster' && (
        <div className="tdb-split">
          <section className="tdb-maincol tdb-maincol-pad">
            <div className="tdb-phone-only">{summaryPanel}</div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 4 }}>
              <div className="tdb-search">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6a7a78" strokeWidth="2" strokeLinecap="round">
                  <circle cx="10.8" cy="10.8" r="6.6" />
                  <path d="M15.6 15.6l4.4 4.4" />
                </svg>
                <input type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ค้นหาชื่อหรือชื่อเล่น" className="field" />
              </div>
              <div className="tdb-seg" style={{ padding: 3, gap: 2 }}>
                {(
                  [
                    ['all', 'ทั้งหมด', total],
                    ['in', 'มา', sum.in],
                    ['out', 'ไม่มา', sum.out],
                    ['left', 'ยังไม่เช็ค', sum.left],
                  ] as const
                ).map(([k, label, n]) => (
                  <button key={k} type="button" className={filter === k ? 'on' : ''} onClick={() => setFilter(k)} style={{ fontSize: 12.5, fontWeight: 500, padding: '8px 13px' }}>
                    {label} <span className="n">{n}</span>
                  </button>
                ))}
              </div>
            </div>

            {days.length > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span className="tdb-mono-label">เช็คชื่อของ</span>
                {days.map((d, di) => (
                  <button key={d} type="button" className={`tdb-chip ${dayIdx === di ? 'on' : ''}`} style={{ fontWeight: 600 }} onClick={() => setDayIdx(di)}>
                    {dayLabel(di)}
                  </button>
                ))}
              </div>
            )}

            {bookings.length === 0 ? (
              <div className="tdb-dashed">ยังไม่มีผู้ชำระเงิน</div>
            ) : people.length === 0 ? (
              <div className="tdb-dashed">ไม่พบผู้เข้าร่วมที่ตรงกับตัวกรอง</div>
            ) : (
              people.map((b) => {
                const st = stateOf(b);
                const busy = pending.has(`${b.id}:${dayIdx}`);
                const r = responseOf(b.user_id);
                const name = nameOf(b);
                return (
                  <div key={b.id} className="tdb-person" style={{ marginLeft: b.parent_booking_id ? 22 : 0 }}>
                    <button type="button" className="tdb-person-main" onClick={() => openDrawer(b)}>
                      <span className={`tdb-av ${avClass(b)}`}>{initialOf(name)}</span>
                      <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 5 }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                          <span className="tdb-person-name">{name}</span>
                          {b.teacher_nickname && <span className="tdb-nick">“{b.teacher_nickname}”</span>}
                          <PdpaBadge applicationJson={b.application_json} lang="th" />
                        </span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          {badgesOf(b).map(([label, bg, color]) => (
                            <span key={label} className="tdb-badge" style={{ background: bg, color }}>
                              {label}
                            </span>
                          ))}
                          <span className="tdb-hide-phone" style={{ fontSize: 12, color: 'var(--muted)' }}>{b.user_email || ''}</span>
                        </span>
                      </span>
                    </button>
                    <div className="tdb-person-side">
                      {presentAny(b) && (
                        <button type="button" className={`tdb-rv ${r ? 'done' : ''}`} onClick={() => setReviewOf(b.id)} title={r ? 'ดูคำตอบแบบสอบถามและรีวิว' : 'ยังไม่ได้ตอบแบบสอบถาม'}>
                          รีวิว{r ? ` ★${r.rating}` : ' · ยังไม่ตอบ'}
                        </button>
                      )}
                      <div className="tdb-inout" role="group" aria-label={`เช็คชื่อ ${name}`}>
                        <button type="button" disabled={busy} aria-pressed={st === 'in'} className={st === 'in' ? 'in' : ''} onClick={() => toggle(b, 'in')}>
                          ✓ มา
                        </button>
                        <button type="button" disabled={busy} aria-pressed={st === 'out'} className={st === 'out' ? 'out' : ''} onClick={() => toggle(b, 'out')}>
                          ไม่มา
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </section>

          <aside className="tdb-aside tdb-hide-phone">
            {summaryPanel}
            <div className="tdb-dark-card">
              <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                {qrTile('mini')}
                <div style={{ minWidth: 0 }}>
                  <span className="tdb-mono-label" style={{ color: '#a5d9d1' }}>แบบสอบถาม AAR</span>
                  <div style={{ fontFamily: "'Mitr', sans-serif", fontWeight: 500, fontSize: 18, lineHeight: 1.25, marginTop: 4 }}>
                    {saved ? `ตอบแล้ว ${responses.length}/${presentCount} คน${responses.length ? ` · ★ ${avg.toFixed(1)}` : ''}` : 'ยังไม่ได้สร้างแบบสอบถาม'}
                  </div>
                  <div style={{ fontSize: 12.5, color: '#9aaba8', marginTop: 2 }}>{saved ? (isOpen ? 'เปิดรับคำตอบอยู่' : 'ปิดรับคำตอบแล้ว') : 'สร้างคำถามแล้วให้ผู้เข้าร่วมสแกน QR หลังจบกิจกรรม'}</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {saved && (
                  <button type="button" onClick={() => setQrBig(true)} className="btn btn-sm" style={{ background: 'var(--accent)', color: 'var(--ink)' }}>
                    แสดง QR เต็มจอ
                  </button>
                )}
                <button type="button" onClick={() => setTab('aar')} className="btn btn-sm" style={{ background: 'rgba(255,255,255,.1)', color: '#fff' }}>
                  {saved ? 'ดูคำตอบ / แก้คำถาม' : 'สร้างแบบสอบถาม'}
                </button>
              </div>
            </div>
            {financePanel}
            {photosLink}
          </aside>

          {sum.left > 0 && bookings.length > 0 && (
            <div className="tdb-floatbar">
              <span style={{ flex: 1, fontSize: 13 }}>เหลือ {sum.left} คนยังไม่เช็ค</span>
              <button type="button" onClick={markRest}>
                ที่เหลือ = มา
              </button>
            </div>
          )}
        </div>
      )}

      {/* ================= AAR ================= */}
      {tab === 'aar' && (
        <div className="tdb-split">
          <section className="tdb-maincol">
            <div className="tdb-dark-card tdb-phone-only" style={{ flexDirection: 'row', alignItems: 'center', padding: 16 }}>
              {qrTile('mini')}
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start' }}>
                <span style={{ fontSize: 11, fontWeight: 600, borderRadius: 99, padding: '4px 10px', background: sState.bg, color: sState.color }}>{sState.label}</span>
                <span style={{ fontFamily: "'Mitr', sans-serif", fontSize: 17, lineHeight: 1.2 }}>
                  ตอบแล้ว {responses.length}/{presentCount} คน
                </span>
                {saved && (
                  <button type="button" onClick={() => setQrBig(true)} className="btn btn-sm" style={{ background: 'var(--accent)', color: 'var(--ink)' }}>
                    แสดง QR เต็มจอ
                  </button>
                )}
              </div>
            </div>

            {!saved && (
              <div style={{ fontSize: 13, background: '#fcefcf', color: '#8a5a00', borderRadius: 14, padding: '11px 14px' }}>
                {sv?.template ? 'คัดลอกคำถามจากรอบอื่นของกิจกรรมนี้มาให้แล้ว — แก้ไขได้ตามต้องการ แล้วกดบันทึกเพื่อสร้าง QR' : 'เริ่มจากคำถาม AAR มาตรฐาน 4 ข้อให้แล้ว — แก้ไขได้ตามต้องการ แล้วกดบันทึกเพื่อสร้าง QR'}
              </div>
            )}

            <div className="tdb-panel" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span className="tdb-mono-label">ชื่อแบบสอบถาม</span>
                <input
                  type="text"
                  value={sTitle}
                  maxLength={200}
                  onChange={(e) => {
                    setSTitle(e.target.value);
                    setDirty(true);
                  }}
                  className="field"
                  style={{ fontFamily: "'Mitr', sans-serif", fontSize: 18, fontWeight: 500 }}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span className="tdb-mono-label">คำอธิบาย · ไม่บังคับ</span>
                <textarea
                  rows={2}
                  value={sIntro}
                  maxLength={2000}
                  onChange={(e) => {
                    setSIntro(e.target.value);
                    setDirty(true);
                  }}
                  className="field"
                  style={{ fontSize: 14, resize: 'vertical' }}
                  placeholder="เช่น ขอบคุณที่มาร่วมกัน ใช้เวลาประมาณ 3 นาที"
                />
              </label>
            </div>

            {questions.map((qq, i) => (
              <div key={qq.id} className="tdb-q">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span className="tdb-q-n">{i + 1}</span>
                  <div className="tdb-qtypes">
                    {QTYPES.map(([t, label]) => (
                      <button
                        key={t}
                        type="button"
                        className={qq.type === t ? 'on' : ''}
                        onClick={() => patchQ(i, { type: t, options: t === 'text' ? [] : qq.options.length ? qq.options : ['', ''], allowOther: t === 'text' ? false : qq.allowOther })}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <button type="button" className={`tdb-toggle ${qq.required ? 'on' : ''}`} onClick={() => patchQ(i, { required: !qq.required })} aria-pressed={qq.required}>
                    <i />
                    บังคับตอบ
                  </button>
                  <span style={{ display: 'inline-flex', gap: 2 }}>
                    <button type="button" className="tdb-icon-btn" disabled={i === 0} onClick={() => moveQ(i, -1)} aria-label="เลื่อนขึ้น">↑</button>
                    <button type="button" className="tdb-icon-btn" disabled={i === questions.length - 1} onClick={() => moveQ(i, 1)} aria-label="เลื่อนลง">↓</button>
                    <button type="button" className="tdb-icon-btn danger" onClick={() => edit((qs) => qs.filter((_, j) => j !== i))} aria-label="ลบคำถาม">×</button>
                  </span>
                </div>
                <input type="text" value={qq.label} maxLength={300} onChange={(e) => patchQ(i, { label: e.target.value })} placeholder="พิมพ์คำถาม" className="field" style={{ fontSize: 15, fontWeight: 500 }} />
                {qq.type === 'text' ? (
                  <div style={{ borderRadius: 14, border: '1.5px dashed var(--cream-deep)', padding: '12px 14px', fontSize: 13, color: '#9aaba8' }}>ผู้ตอบพิมพ์คำตอบเอง</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {qq.options.map((o, oi) => (
                      <div key={oi} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span className={`tdb-mark ${qq.type === 'multi' ? 'sq' : ''}`} />
                        <input
                          type="text"
                          value={o}
                          maxLength={200}
                          onChange={(e) => patchQ(i, { options: qq.options.map((x, k) => (k === oi ? e.target.value : x)) })}
                          placeholder={`ตัวเลือกที่ ${oi + 1}`}
                          className="field"
                          style={{ padding: '9px 12px', fontSize: 14 }}
                        />
                        <button type="button" className="tdb-icon-btn" onClick={() => patchQ(i, { options: qq.options.filter((_, k) => k !== oi) })} aria-label="ลบตัวเลือก">×</button>
                      </div>
                    ))}
                    {qq.allowOther && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13.5, color: 'var(--muted)', padding: '4px 0' }}>
                        <span className={`tdb-mark ${qq.type === 'multi' ? 'sq' : ''}`} />
                        <span style={{ flex: 1 }}>อื่น ๆ (ผู้ตอบพิมพ์เอง)</span>
                        <button type="button" className="tdb-icon-btn" onClick={() => patchQ(i, { allowOther: false })} aria-label="เอาอื่น ๆ ออก">×</button>
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 16, paddingTop: 2 }}>
                      <button type="button" className="tdb-textlink" style={{ padding: 0 }} onClick={() => patchQ(i, { options: [...qq.options, ''] })}>
                        + เพิ่มตัวเลือก
                      </button>
                      {!qq.allowOther && (
                        <button type="button" className="tdb-textlink" style={{ padding: 0 }} onClick={() => patchQ(i, { allowOther: true })}>
                          + เพิ่ม “อื่น ๆ”
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '6px 2px' }}>
              <span style={{ fontSize: 13, color: 'var(--muted)' }}>เพิ่มคำถาม</span>
              {QTYPES.map(([t, label]) => (
                <button key={t} type="button" className="btn btn-paper btn-sm" onClick={() => edit((qs) => [...qs, blankQ(t)])}>
                  + {label}
                </button>
              ))}
            </div>

            <div style={{ borderRadius: 22, border: '1.5px dashed var(--cream-deep)', padding: '18px 20px', display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 26, color: 'var(--accent)', letterSpacing: 2 }}>★★★★★</span>
              <span style={{ flex: 1, minWidth: 220 }}>
                <span style={{ display: 'block', fontWeight: 600, fontSize: 14 }}>ส่วนท้ายเสมอ · ให้ดาวและรีวิว</span>
                <span style={{ display: 'block', fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.55, marginTop: 2 }}>ผู้ตอบให้ดาว 1–5 (บังคับ) และเขียนรีวิวสั้น ๆ ได้ — นับเป็นรีวิวของกิจกรรมนี้</span>
              </span>
            </div>

            <div className="tdb-savebar">
              <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <i style={{ background: !saved || dirty ? 'var(--accent)' : '#5fd1c1' }} />
                {!saved ? 'ยังไม่ได้บันทึก' : dirty ? 'มีการแก้ไขที่ยังไม่บันทึก' : 'บันทึกแล้ว · ใช้ QR ได้เลย'}
              </span>
              <button type="button" onClick={() => saveSurvey()} disabled={saving} className="btn btn-teal" style={{ padding: '12px 22px', fontSize: 14, opacity: saving ? 0.6 : 1 }}>
                {saving ? 'กำลังบันทึก…' : saved ? 'บันทึกการแก้ไข' : 'บันทึกและสร้าง QR'}
              </button>
            </div>
          </section>

          <aside className="tdb-aside">
            <div className="tdb-panel tdb-hide-phone" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <span className="tdb-mono-label">QR สำหรับผู้เข้าร่วม</span>
                <span style={{ fontSize: 11.5, fontWeight: 600, borderRadius: 999, padding: '4px 11px', background: sState.bg, color: sState.color }}>{sState.label}</span>
              </div>
              {qrTile('big')}
              <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: 'var(--muted)' }}>ให้ผู้เข้าร่วมสแกนหลังจบกิจกรรม · ต้องเข้าสู่ระบบ และตอบได้เฉพาะคนที่ถูกเช็คชื่อว่า “มา” คนละ 1 ครั้ง</p>
              {saved && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <button type="button" onClick={() => setQrBig(true)} className="btn btn-ink" style={{ justifyContent: 'center', padding: '13px 20px', fontSize: 14 }}>
                    แสดง QR เต็มจอ
                  </button>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <button
                      type="button"
                      className="tdb-soft-btn"
                      style={{ justifyContent: 'center', padding: 10, fontSize: 13 }}
                      onClick={() =>
                        navigator.clipboard?.writeText(surveyUrl).then(() => {
                          setCopied(true);
                          setTimeout(() => setCopied(false), 1500);
                        })
                      }
                    >
                      {copied ? 'คัดลอกแล้ว' : 'คัดลอกลิงก์'}
                    </button>
                    {qr && (
                      <a href={qr} download={`aar-qr-${id}.png`} className="tdb-soft-btn" style={{ justifyContent: 'center', padding: 10, fontSize: 13 }}>
                        ดาวน์โหลด QR
                      </a>
                    )}
                  </div>
                  <button type="button" disabled={saving} onClick={() => saveSurvey(!isOpen)} style={{ border: 0, background: 'transparent', padding: 8, font: 'inherit', fontSize: 13, fontWeight: 600, cursor: 'pointer', color: isOpen ? '#a04a14' : 'var(--teal)' }}>
                    {isOpen ? 'ปิดรับคำตอบ' : 'เปิดรับคำตอบอีกครั้ง'}
                  </button>
                </div>
              )}
              <button type="button" onClick={() => setPreviewOpen(true)} className="tdb-textlink" style={{ padding: 0 }}>
                ดูตัวอย่างหน้าที่ผู้ตอบเห็น →
              </button>
            </div>

            <div className="tdb-panel">
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginBottom: 10 }}>
                <span style={{ fontFamily: "'Mitr', sans-serif", fontWeight: 500, fontSize: 17 }}>คำตอบ</span>
                <span style={{ fontSize: 13, color: 'var(--muted)' }}>
                  {responses.length} คน{responses.length ? ` · ★ ${avg.toFixed(1)}` : ''}
                </span>
              </div>
              {responses.length === 0 && <div style={{ fontSize: 13, color: 'var(--muted)', padding: '8px 0' }}>ยังไม่มีคำตอบ</div>}
              {responses.map((r) => {
                const b = bookings.find((x) => x.user_id === r.user_id);
                const name = b ? nameOf(b) : 'ผู้เข้าร่วม';
                return (
                  <button key={r.id} type="button" className="tdb-resp" onClick={() => b && setReviewOf(b.id)}>
                    <span className="tdb-av in" style={{ width: 32, height: 32, fontSize: 13, background: '#eaf6f4', color: 'var(--teal-deep)' }}>{initialOf(name)}</span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                        <span style={{ fontWeight: 600, fontSize: 13.5 }}>{name}</span>
                        <span style={{ color: '#e0a526', fontSize: 13, letterSpacing: 1 }}>{stars(r.rating)}</span>
                      </span>
                      <span style={{ display: 'block', fontSize: 12.5, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.comment || '—'}</span>
                    </span>
                  </button>
                );
              })}
              {pendingNames.length > 0 && (
                <div style={{ marginTop: 8, paddingTop: 10, boxShadow: 'inset 0 1px 0 rgba(13,30,29,.07)', fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.55 }}>ยังไม่ตอบ: {pendingNames.join(', ')}</div>
              )}
              <button type="button" onClick={() => setPreviewOpen(true)} className="tdb-textlink tdb-phone-only" style={{ padding: '10px 0 0' }}>
                ดูตัวอย่างหน้าที่ผู้ตอบเห็น →
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* ================= FINANCE (phones) ================= */}
      {tab === 'fin' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {financePanel}
          {photosLink}
        </div>
      )}

      {/* ================= drawer: participant ================= */}
      {drawer && (
        <div className="tdb-drawer-back" onMouseDown={(e) => e.target === e.currentTarget && setDrawerId(null)}>
          <section className="tdb-drawer" role="dialog" aria-modal="true" aria-label={nameOf(drawer)}>
            {(() => {
              const b = drawer;
              const name = nameOf(b);
              const { profile: p, answers } = parseApp(b.application_json);
              const em = p.emergency || {};
              const st = stateOf(b);
              const fields: [string, string, boolean?][] = [
                ['ชื่อ-นามสกุล', p.fullName || [p.firstName, p.lastName].filter(Boolean).join(' ') || name, true],
                ['อายุ', p.age != null ? String(p.age) : '—'],
                ['เพศ', p.gender || '—'],
                ['โทร', p.phone || '—'],
                ['อีเมล', p.email || b.user_email || '—'],
                ['Facebook', p.facebook || '—'],
                ['Line ID', p.lineId || '—'],
                ['ติดต่อฉุกเฉิน', [em.name, em.relation, em.phone].filter(Boolean).join(' · ') || '—', true],
                ['สุขภาพ / แพ้', p.medical || '—'],
                ['ข้อจำกัดอาหาร', p.dietary || '—'],
              ];
              return (
                <>
                  <div style={{ padding: '24px 26px 20px', display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                    <span className={`tdb-av ${avClass(b)}`} style={{ width: 56, height: 56, fontSize: 20 }}>{initialOf(name)}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <h2 style={{ fontFamily: "'Mitr', sans-serif", fontWeight: 500, fontSize: 22, lineHeight: 1.2, margin: '2px 0 6px' }}>{name}</h2>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {badgesOf(b).map(([label, bg, color]) => (
                          <span key={label} className="tdb-badge" style={{ background: bg, color }}>
                            {label}
                          </span>
                        ))}
                        <PdpaBadge applicationJson={b.application_json} lang="th" />
                      </div>
                    </div>
                    <button type="button" className="tdb-x" onClick={() => setDrawerId(null)} aria-label="ปิด">
                      ×
                    </button>
                  </div>

                  <div style={{ padding: '0 26px 24px', display: 'flex', flexDirection: 'column', gap: 22, flex: 1 }}>
                    <div style={{ background: 'var(--cream)', borderRadius: 18, padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 600, fontSize: 14 }}>{dayLabel(dayIdx)}</span>
                      <div className="tdb-inout" style={{ background: '#fff' }}>
                        <button type="button" className={st === 'in' ? 'in' : ''} onClick={() => toggle(b, 'in')}>
                          ✓ มา
                        </button>
                        <button type="button" className={st === 'out' ? 'out' : ''} onClick={() => toggle(b, 'out')}>
                          ไม่มา
                        </button>
                      </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <span className="tdb-mono-label">ชื่อเล่น · เห็นเฉพาะผู้สอน</span>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <input type="text" value={nickDraft} onChange={(e) => setNickDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && saveNick(b)} placeholder="ชื่อเล่นของนักเรียน" className="field" style={{ padding: '11px 14px', fontSize: 14 }} />
                        <button type="button" onClick={() => saveNick(b)} className="btn btn-teal btn-sm" style={{ flexShrink: 0, opacity: nickDraft.trim() === (b.teacher_nickname || '') ? 0.5 : 1 }}>
                          บันทึก
                        </button>
                      </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <span className="tdb-mono-label">ข้อมูลผู้สมัคร</span>
                      <div className="tdb-fields">
                        {fields.map(([k, v, span]) => (
                          <div key={k} style={{ gridColumn: span ? '1 / -1' : undefined }}>
                            <div className="k">{k}</div>
                            <div className="v" style={{ color: k === 'สุขภาพ / แพ้' && v !== '—' ? '#a04a14' : undefined }}>{v}</div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {answers.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <span className="tdb-mono-label">คำตอบในใบสมัคร</span>
                        {answers.map((a, i) => (
                          <div key={i} style={{ background: 'var(--cream)', borderRadius: 14, padding: '11px 14px' }}>
                            <div style={{ fontSize: 12, color: 'var(--muted)' }}>{a.label}</div>
                            <div style={{ fontSize: 14, fontWeight: 500, marginTop: 2 }}>{(Array.isArray(a.value) ? a.value.join(', ') : String(a.value ?? '')) || '—'}</div>
                          </div>
                        ))}
                      </div>
                    )}

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                        <span className="tdb-mono-label">หมายเหตุสำหรับผู้สอน</span>
                        <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>🔒 ผู้เข้าร่วมไม่เห็น</span>
                      </div>
                      <textarea
                        rows={3}
                        value={noteDraft}
                        onChange={(e) => {
                          setNoteDraft(e.target.value);
                          setNoteSaved(false);
                        }}
                        className="field"
                        style={{ fontSize: 14, resize: 'vertical' }}
                        placeholder="เช่น พฤติกรรมในคลาส ข้อควรระวังพิเศษ จุดเด่น"
                      />
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                        <button type="button" onClick={() => saveNote(b)} className="btn btn-teal btn-sm" style={{ opacity: noteDraft === (b.facilitator_note || '') ? 0.5 : 1 }}>
                          บันทึกหมายเหตุ
                        </button>
                        {noteSaved && <span style={{ fontSize: 12.5, color: 'var(--teal-deep)' }}>✓ บันทึกแล้ว</span>}
                      </div>
                    </div>
                  </div>

                  <div style={{ position: 'sticky', bottom: 0, background: '#fff', padding: '14px 26px', display: 'flex', justifyContent: 'space-between', gap: 10, boxShadow: 'inset 0 1px 0 rgba(13,30,29,.08)' }}>
                    <button type="button" className="tdb-soft-btn" style={{ padding: '10px 16px', fontSize: 13, opacity: drawerPos > 0 ? 1 : 0.4 }} disabled={drawerPos <= 0} onClick={() => openDrawer(bookings[drawerPos - 1])}>
                      ‹ คนก่อน
                    </button>
                    <span style={{ alignSelf: 'center', fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--muted)' }}>
                      {drawerPos + 1} / {bookings.length}
                    </span>
                    <button type="button" className="tdb-soft-btn" style={{ padding: '10px 16px', fontSize: 13, opacity: drawerPos < bookings.length - 1 ? 1 : 0.4 }} disabled={drawerPos >= bookings.length - 1} onClick={() => openDrawer(bookings[drawerPos + 1])}>
                      คนถัดไป ›
                    </button>
                  </div>
                </>
              );
            })()}
          </section>
        </div>
      )}

      {/* ================= review popup ================= */}
      {reviewRow && (
        <div className="tdb-backdrop" style={{ zIndex: 120 }} onMouseDown={(e) => e.target === e.currentTarget && setReviewOf(null)}>
          <section className="tdb-modal" role="dialog" aria-modal="true" style={{ maxWidth: 560, padding: 28, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <span className="tdb-mono-label" style={{ color: 'var(--teal)', letterSpacing: '.16em' }}>คำตอบแบบสอบถาม AAR</span>
                <h3 style={{ fontFamily: "'Mitr', sans-serif", fontWeight: 500, fontSize: 22, margin: '6px 0 0' }}>{nameOf(reviewRow)}</h3>
              </div>
              <button type="button" className="tdb-x" onClick={() => setReviewOf(null)} aria-label="ปิด">
                ×
              </button>
            </div>
            {!reviewResp ? (
              <div style={{ background: 'var(--cream)', borderRadius: 16, padding: 20, fontSize: 14, color: 'var(--muted)', textAlign: 'center' }}>
                {saved ? 'ผู้เข้าร่วมคนนี้ยังไม่ได้ตอบแบบสอบถาม' : 'ยังไม่ได้สร้างแบบสอบถาม AAR สำหรับกิจกรรมนี้'}
              </div>
            ) : (
              <>
                <div style={{ background: '#fff8e6', borderRadius: 18, padding: '16px 18px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 26, letterSpacing: 3, color: '#e0a526' }}>{stars(reviewResp.rating)}</span>
                    <span style={{ fontFamily: "'Mitr', sans-serif", fontSize: 18 }}>{reviewResp.rating}/5</span>
                  </div>
                  {reviewResp.comment && <div style={{ fontSize: 14.5, lineHeight: 1.65, marginTop: 8, whiteSpace: 'pre-line' }}>{reviewResp.comment}</div>}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {(sv?.survey?.questions || []).map((qq, qi) => (
                    <div key={qq.id} style={{ display: 'flex', gap: 12 }}>
                      <span className="tdb-q-n" style={{ width: 24, height: 24, fontSize: 11 }}>{qi + 1}</span>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.5 }}>{qq.label}</div>
                        <div style={{ fontSize: 14.5, lineHeight: 1.6, marginTop: 2, whiteSpace: 'pre-line', wordBreak: 'break-word' }}>{answerText(qq, reviewResp.answers[qq.id]) || '—'}</div>
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)' }}>
                  ตอบเมื่อ {(() => {
                    const ms = sqliteToMs(reviewResp.created_at);
                    return ms ? new Date(ms).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' }) : reviewResp.created_at;
                  })()}
                </div>
              </>
            )}
          </section>
        </div>
      )}

      {/* ================= slip ================= */}
      {slipOpen && w.payout_slip_url && (
        <div className="tdb-backdrop center" style={{ zIndex: 120 }} onMouseDown={(e) => e.target === e.currentTarget && setSlipOpen(false)}>
          <section className="tdb-modal" role="dialog" aria-modal="true" style={{ maxWidth: 460, padding: 22, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h3 style={{ fontFamily: "'Mitr', sans-serif", fontWeight: 500, fontSize: 19, margin: 0, flex: 1 }}>สลิปโอนเงิน</h3>
              <a href={w.payout_slip_url} target="_blank" rel="noopener noreferrer" className="tdb-soft-btn">
                เปิดเต็มจอ ↗
              </a>
              <button type="button" className="tdb-x" onClick={() => setSlipOpen(false)} aria-label="ปิด">
                ×
              </button>
            </div>
            <div style={{ background: 'var(--cream)', borderRadius: 16, padding: 10, maxHeight: 'calc(100dvh - 180px)', overflow: 'auto', display: 'flex', justifyContent: 'center' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={w.payout_slip_url} alt="สลิปโอนเงิน" style={{ maxWidth: '100%', height: 'auto', borderRadius: 8 }} />
            </div>
          </section>
        </div>
      )}

      {/* ================= QR full screen ================= */}
      {qrBig && qr && (
        <div className="tdb-qrfull" onMouseDown={(e) => e.target === e.currentTarget && setQrBig(false)}>
          <button type="button" className="tdb-qrfull-x" onClick={() => setQrBig(false)} aria-label="ปิด">
            ×
          </button>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, letterSpacing: '.24em', textTransform: 'uppercase', color: '#d4ece8' }}>สแกนเพื่อทำแบบสอบถามและรีวิว</span>
          <div style={{ fontFamily: "'Mitr', sans-serif", fontWeight: 500, fontSize: 'clamp(24px, 3.4vw, 40px)', color: '#fff', lineHeight: 1.15, maxWidth: 760 }}>{sTitle || w.title}</div>
          <div className="tdb-qrfull-box">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr} alt="QR" />
          </div>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: '#d4ece8', wordBreak: 'break-all' }}>{surveyUrl.replace(/^https?:\/\//, '')}</span>
          <span style={{ fontFamily: 'var(--font-hand)', fontWeight: 700, fontSize: 28, color: 'var(--accent)' }}>ขอบคุณที่มาด้วยกันวันนี้ ✺</span>
        </div>
      )}

      {/* ================= participant preview ================= */}
      {previewOpen && (
        <div className="tdb-backdrop" style={{ zIndex: 120, flexDirection: 'column', alignItems: 'center', gap: 12 }} onMouseDown={(e) => e.target === e.currentTarget && setPreviewOpen(false)}>
          <div style={{ width: '100%', maxWidth: 400, display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#fff', padding: '0 12px' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '.16em', textTransform: 'uppercase' }}>ตัวอย่าง · มุมมองผู้ตอบบนมือถือ</span>
            <button type="button" onClick={() => setPreviewOpen(false)} aria-label="ปิด" style={{ background: 'rgba(255,255,255,.14)', border: 0, width: 36, height: 36, borderRadius: 999, fontSize: 19, color: '#fff', cursor: 'pointer' }}>
              ×
            </button>
          </div>
          <section className="tdb-modal" style={{ maxWidth: 400, padding: '22px 18px 24px', background: 'var(--cream)', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ padding: '4px 4px 6px' }}>
              <span className="tdb-mono-label" style={{ color: 'var(--teal)', letterSpacing: '.2em' }}>แบบสอบถามหลังกิจกรรม</span>
              <h3 style={{ fontFamily: "'Mitr', sans-serif", fontWeight: 500, fontSize: 22, lineHeight: 1.2, margin: '8px 0 4px' }}>{sTitle || w.title}</h3>
              <div style={{ fontSize: 13, color: 'var(--muted)' }}>{fmtLong(days[0])}</div>
            </div>
            {sIntro && <div style={{ background: '#fff', borderRadius: 18, padding: '14px 16px', fontSize: 14, lineHeight: 1.65, whiteSpace: 'pre-line' }}>{sIntro}</div>}
            {questions.map((qq, i) => (
              <div key={qq.id} style={{ background: '#fff', borderRadius: 18, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ fontWeight: 600, fontSize: 15, lineHeight: 1.5 }}>
                  {i + 1}. {qq.label || '(ยังไม่มีคำถาม)'}
                  {qq.required && <span style={{ color: '#a04a14' }}> *</span>}
                  {qq.type === 'multi' && <span style={{ fontSize: 11.5, fontWeight: 500, color: 'var(--muted)', marginLeft: 8 }}>เลือกได้หลายข้อ</span>}
                </div>
                {qq.type === 'text' ? (
                  <textarea rows={3} className="field" placeholder="พิมพ์คำตอบ" style={{ fontSize: 14 }} readOnly />
                ) : (
                  [...qq.options.filter(Boolean), ...(qq.allowOther ? [OTHER] : [])].map((o) => (
                    <div key={o} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--cream)', borderRadius: 14, padding: '12px 14px', fontSize: 14 }}>
                      <span className={`tdb-mark ${qq.type === 'multi' ? 'sq' : ''}`} style={{ width: 18, height: 18 }} />
                      {o === OTHER ? 'อื่น ๆ' : o}
                    </div>
                  ))
                )}
              </div>
            ))}
            <div style={{ background: '#fff8e6', borderRadius: 18, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontWeight: 600, fontSize: 15 }}>
                ให้คะแนนกิจกรรมนี้ <span style={{ color: '#a04a14' }}>*</span>
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} type="button" onClick={() => setPvStars(n)} aria-label={`${n} ดาว`} style={{ border: 0, background: 'transparent', padding: '0 2px', fontSize: 34, lineHeight: 1, cursor: 'pointer', color: n <= pvStars ? '#e0a526' : 'var(--cream-deep)' }}>
                    ★
                  </button>
                ))}
              </div>
              <textarea rows={2} className="field" placeholder="เขียนรีวิวสั้น ๆ (ไม่บังคับ)" style={{ fontSize: 14, background: '#fff' }} readOnly />
            </div>
            <button type="button" className="btn btn-teal" style={{ justifyContent: 'center', padding: '15px 22px' }} onClick={() => setPreviewOpen(false)}>
              ส่งแบบสอบถาม
            </button>
          </section>
        </div>
      )}

      {toast && (
        <div className="toast" style={{ zIndex: 200 }}>
          <span style={{ color: 'var(--accent)' }}>✓</span> {toast}
        </div>
      )}
    </div>
  );
}
