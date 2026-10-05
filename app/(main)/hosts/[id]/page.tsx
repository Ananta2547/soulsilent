'use client';

/* A teacher's public page, built from the "Teacher Profile v2" design: a
 * cream hero with their promise and headline numbers, what you take home,
 * a belief on a dark band, the workshops they run on a rail, then a month
 * grid of the days they teach — tap a day and that day's rounds list under
 * it, tap a round and you land on the activity page with the day chosen.
 *
 * The teacher (or an admin) sees an "edit" button: every self-written text
 * becomes a box in place, items can be added or removed, and one save
 * writes the lot. Site header and footer come from the layout. */

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useLang, tr } from '@/lib/i18n';
import { Btn } from '@/components/design/RippleButton';
import { Icon } from '@/components/design/Icon';
import { SocialIcon } from '@/components/design/SocialIcon';
import { useLoadingTracker } from '@/components/design/DataLoading';
import {
  SOCIAL_LABEL,
  parseTeacherProfile,
  sortedJourney,
  type JourneyStep,
  type ProfileSection,
  type TeacherProfile,
} from '@/lib/teacher-profile';
import { HostProfileEditor } from '@/components/teacher/HostProfileEditor';
import type { TeacherPublic } from '@/app/api/teachers/[id]/route';

type Round = {
  id: string;
  title: string;
  date: string;
  time_start: string;
  time_end: string;
  image_url: string | null;
  price: number;
  max_participants: number;
  is_online: number;
  loc_name: string | null;
  /** Capacity reached (or taken privately) — the count itself is not sent. */
  full: boolean;
};

const TH_MONTHS_FULL = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
const EN_MONTHS_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const TH_DOW = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];
const EN_DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const PH_CLASS = ['ph-teal', 'ph-cream', 'ph-teal-100', 'ph-accent'];
const CRAFT_TH: Record<string, string> = { art: 'ศิลปะ', craft: 'งานฝีมือ', cooking: 'ทำอาหาร', music: 'ดนตรี', wellness: 'สุขภาพ', nature: 'ธรรมชาติ', kids: 'เด็ก', other: 'อื่น ๆ' };

const pad2 = (n: number) => String(n).padStart(2, '0');
/** A deep copy for the editor, so typing never touches the saved profile. */
const cloneProfile = (p: TeacherProfile): TeacherProfile => JSON.parse(JSON.stringify(p));
/** The intro under the name is held to three lines (the user's rule): the form
 *  caps what can be typed, and .tp2-promise clamps older or fallback text. */
const PROMISE_MAX = 120;

/** First syllable of a Thai display name (or first two letters) for the avatar. */
function initialOf(display: string): string {
  const bare = display.replace(/^(ครู|อาจารย์|คุณ|พี่)/, '') || display;
  const m = bare.match(/^[ก-ฮ][ะ-๎]*[ก-ฮ]?[ะ-๎]*/);
  return m ? m[0] : bare.slice(0, 2);
}

function longDate(ymd: string, th: boolean): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return th ? `${d} ${TH_MONTHS_FULL[m - 1]} ${y + 543}` : `${d} ${EN_MONTHS_FULL[m - 1]} ${y}`;
}

/** Today in Thailand as YYYY-MM-DD — the calendar never lets a past day be picked. */
function todayTH(): string {
  return new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
}

export default function TeacherProfilePage() {
  const { id } = useParams<{ id: string }>();
  const { lang } = useLang();
  const th = lang === 'th';
  const [teacher, setTeacher] = useState<TeacherPublic | null>(null);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [fromDash, setFromDash] = useState(false);
  const [loading, setLoading] = useState(true);
  const [day, setDay] = useState<string | null>(null);
  const [cursor, setCursor] = useState<{ y: number; m: number } | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [poster, setPoster] = useState<number | null>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const track = useLoadingTracker();

  // In-place editor: `draft` is non-null while editing.
  const [draft, setDraft] = useState<TeacherProfile | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // Editor panel: which group is open, which spot on the page is lit, and on
  // narrow screens whether the panel or the page preview is showing.
  const [open, setOpen] = useState<string | null>(null);
  const [spot, setSpot] = useState<string | null>(null);
  const [mobileView, setMobileView] = useState<'edit' | 'preview'>('edit');

  useEffect(() => {
    track(
      fetch(`/api/teachers/${id}`)
        .then((r) => (r.ok ? (r.json() as Promise<{ teacher: TeacherPublic; rounds: Round[]; can_edit: boolean }>) : null))
        .then((d) => {
          if (d) {
            setTeacher(d.teacher);
            setRounds(d.rounds || []);
            setCanEdit(!!d.can_edit);
            // The teacher dashboard's "หน้าโปรไฟล์ของฉัน" lands here with
            // ?edit=1 and opens straight into the editor.
            if (d.can_edit && new URLSearchParams(window.location.search).get('edit') === '1') {
              setFromDash(true);
              setDraft(cloneProfile(d.teacher.profile));
            }
            // Open on the first day they teach, so the page never starts blank.
            const first = d.rounds?.[0]?.date || todayTH();
            setDay(d.rounds?.length ? first : null);
            const [y, m] = first.split('-').map(Number);
            setCursor({ y, m: m - 1 });
          }
        })
        .catch(() => {})
        .finally(() => setLoading(false)),
    );
  }, [id, track]);

  const marks = useMemo(() => {
    const m: Record<string, number> = {};
    rounds.forEach((r) => {
      m[r.date] = (m[r.date] || 0) + 1;
    });
    return m;
  }, [rounds]);
  const onDay = useMemo(() => (day ? rounds.filter((r) => r.date === day) : []), [rounds, day]);

  // The spot a focused editor field fills in: highlight it and bring it into
  // view. A section's own spot stands in when a finer one is not on the page.
  const sectionCount = draft?.sections.length ?? 0;
  useEffect(() => {
    document.querySelectorAll('.tp2-ek-on').forEach((el) => el.classList.remove('tp2-ek-on'));
    if (!spot) return;
    const find = (k: string) => document.querySelector(`[data-ek="${CSS.escape(k)}"]`);
    const el = find(spot) || (spot.startsWith('sec:') ? find(spot.split(':').slice(0, 2).join(':')) : null);
    if (!el) return;
    el.classList.add('tp2-ek-on');
    // Scroll the window only: scrollIntoView would also scroll the editor
    // panel, and the two smooth scrolls cancel each other out.
    const r = el.getBoundingClientRect();
    if (r.top < 80 || r.bottom > window.innerHeight - 40) {
      window.scrollTo({ top: Math.max(0, window.scrollY + r.top - Math.max(100, (window.innerHeight - r.height) / 2)), behavior: 'smooth' });
    }
  }, [spot, sectionCount]);

  if (loading || !cursor) return null;
  if (!teacher) {
    return (
      <section className="section" style={{ padding: '120px 0', textAlign: 'center' }}>
        <p style={{ color: 'var(--muted)', marginBottom: 16 }}>{tr(lang, 'ไม่พบผู้จัดคนนี้', 'Host not found')}</p>
        <Btn kind="teal" href="/hosts">{tr(lang, 'ดูผู้จัดทั้งหมด', 'All hosts')}</Btn>
      </section>
    );
  }

  const display = teacher.nickname || teacher.name;
  const profile = draft || teacher.profile;
  const editing = draft !== null;
  const promise = profile.promise || teacher.bio || '';
  const crafts = teacher.crafts.slice(0, 2).map((c) => (th ? CRAFT_TH[c] || c : c)).join(' · ');
  const roleLabel = th ? `ผู้จัด${crafts ? ` — ${crafts}` : ''}` : `Host${crafts ? ` — ${crafts}` : ''}`;

  const stats: { num: string; label: string; years?: boolean }[] = [];
  if (profile.years) stats.push({ num: String(profile.years), label: th ? 'ปีที่จัดกิจกรรม' : 'years teaching', years: true });
  stats.push({ num: String(teacher.hosted), label: th ? 'รอบที่จัดมาแล้ว' : 'rounds hosted' });
  stats.push({ num: teacher.joined.toLocaleString(), label: th ? 'คนที่เคยมาเรียน' : 'people who joined' });

  // Month grid.
  const { y: cy, m: cm } = cursor;
  const today = todayTH();
  const monthKey = `${cy}-${pad2(cm + 1)}`;
  const monthRounds = rounds.filter((r) => r.date.startsWith(monthKey)).length;
  const cells: (string | null)[] = [];
  for (let i = 0, start = new Date(cy, cm, 1).getDay(); i < start; i++) cells.push(null);
  for (let d = 1, n = new Date(cy, cm + 1, 0).getDate(); d <= n; d++) cells.push(`${monthKey}-${pad2(d)}`);
  while (cells.length % 7) cells.push(null);
  const step = (delta: number) => {
    const d = new Date(cy, cm + delta, 1);
    setCursor({ y: d.getFullYear(), m: d.getMonth() });
  };
  // Back to this month; today is picked too when a round runs on it.
  const goToday = () => {
    const [ty, tm] = today.split('-').map(Number);
    setCursor({ y: ty, m: tm - 1 });
    if ((marks[today] || 0) > 0) setDay(today);
  };
  const nudge = (dir: number) => {
    const el = railRef.current;
    if (el) el.scrollBy({ left: dir * Math.max(220, el.clientWidth * 0.8), behavior: 'smooth' });
  };

  const startEdit = () => {
    setSaveError(null);
    setOpen('hero');
    setSpot(null);
    setMobileView('edit');
    setDraft(cloneProfile(teacher.profile));
  };
  const cancelEdit = () => {
    setDraft(null);
    setSaveError(null);
    setSpot(null);
  };
  /** Tapping a part of the preview opens its group in the panel. */
  const editHere = (group: string, key: string) => {
    if (!editing) return;
    setOpen(group);
    setSpot(key);
    setMobileView('edit');
  };
  const save = async () => {
    if (!draft) return;
    setSaving(true);
    setSaveError(null);
    try {
      const r = await fetch(`/api/teachers/${id}/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parseTeacherProfile(draft)),
      });
      const d = (await r.json().catch(() => ({}))) as { profile?: TeacherProfile; error?: string };
      if (!r.ok || !d.profile) throw new Error(d.error || tr(lang, 'บันทึกไม่สำเร็จ', 'Could not save'));
      setTeacher({ ...teacher, profile: d.profile });
      setDraft(null);
      setSpot(null);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  // Headings are numbered down the page in the order the host arranged them;
  // the belief band has no heading, so it takes no number.
  const showContact = editing || profile.socials.length > 0;
  let counter = 0;
  const sectionNo: Record<string, string> = {};
  profile.sections.forEach((s) => {
    if (s.kind !== 'belief') sectionNo[s.id] = pad2(++counter);
  });
  const worksNo = teacher.works.length > 0 ? pad2(++counter) : '';
  const calendarNo = pad2(++counter);
  const contactNo = showContact ? pad2(++counter) : '';
  const DEFAULT_HEAD: Record<'takeaways' | 'journey', { eyebrow: string; title: string }> = {
    takeaways: th
      ? { eyebrow: 'สิ่งที่คุณจะได้กลับไป', title: 'มาด้วยความคาดหวังว่าจะได้เทคนิค กลับไปได้ตัวเอง' }
      : { eyebrow: 'What you take home', title: 'Come expecting technique. Leave with yourself.' },
    journey: th ? { eyebrow: `เส้นทางของ${display}`, title: 'เส้นทางที่ค่อย ๆ เดินมา' } : { eyebrow: `${display} — the path`, title: 'The road so far' },
  };
  // Placeholder text the preview shows for parts not filled in yet.
  const ph = (t: string) => <span className="tp2-ph">{t}</span>;

  const sectionHead = (s: Extract<ProfileSection, { kind: 'takeaways' | 'journey' }>) => {
    const def = DEFAULT_HEAD[s.kind];
    return (
      <>
        <span className="tm-eyebrow" data-ek={`sec:${s.id}:eyebrow`}>{sectionNo[s.id]} — {s.eyebrow || def.eyebrow}</span>
        <h2 className="tp2-h2" style={{ maxWidth: 620 }} data-ek={`sec:${s.id}:title`}>{s.title || def.title}</h2>
      </>
    );
  };

  const renderTakeaways = (s: Extract<ProfileSection, { kind: 'takeaways' }>) => (
    <div className="tp2-takes">
      {s.items.map((k, i) => (
        <div key={i} className="tp2-take" data-ek={`sec:${s.id}:item:${i}`}>
          <span className="tp2-take-no">{pad2(i + 1)}</span>
          <span className="tp2-take-title">{k.title || (editing && ph(th ? 'หัวข้อยังว่าง' : 'No title yet'))}</span>
          <span className="tp2-take-body">{k.body || (editing && ph(th ? 'รายละเอียดยังว่าง' : 'No detail yet'))}</span>
        </div>
      ))}
      {editing && s.items.length === 0 && <div className="tp2-empty-hint">{th ? 'ยังไม่มีข้อ — ส่วนนี้จะไม่แสดงจนกว่าจะเพิ่มข้อ' : 'No items — hidden until you add one'}</div>}
    </div>
  );

  const renderJourney = (s: Extract<ProfileSection, { kind: 'journey' }>) => {
    // Sorted by year for display; each step keeps its index for the editor spot.
    const steps = sortedJourney(s.items.map((k, j) => ({ ...k, j }))) as (JourneyStep & { j: number })[];
    return (
      <ol className="tp2-journey">
        {steps.map((k) => (
          <li key={k.j} className="tp2-jstep" data-ek={`sec:${s.id}:item:${k.j}`}>
            <span className="tp2-jdot" aria-hidden="true" />
            {k.year ? <div className="tp2-jyear">{k.year}</div> : editing && <div className="tp2-jyear">{ph(th ? 'ปี' : 'Year')}</div>}
            {k.title ? <div className="tp2-jtitle">{k.title}</div> : editing && <div className="tp2-jtitle">{ph(th ? 'หัวข้อยังว่าง' : 'No title yet')}</div>}
            {k.body && <p className="tp2-jbody">{k.body}</p>}
          </li>
        ))}
        {editing && s.items.length === 0 && <li className="tp2-empty-hint">{th ? 'ยังไม่มีปี — ส่วนนี้จะไม่แสดงจนกว่าจะเพิ่ม' : 'No steps — hidden until you add one'}</li>}
      </ol>
    );
  };

  const renderSection = (s: ProfileSection) => {
    if (s.kind === 'belief') {
      return (
        <section className="tp2-band">
          <span aria-hidden="true" className="tm-cta-star" style={{ left: -30, bottom: -40, fontSize: 190 }}>✺</span>
          <div className="tp2-wrap" style={{ position: 'relative' }}>
            <p className="tp2-belief" data-ek={`sec:${s.id}:text`}>{s.text ? `“${s.text}”` : ph(th ? '“คำพูดของคุณจะอยู่ตรงนี้”' : '“Your words go here”')}</p>
            <div className="tm-meta tp2-sign">— {display} · {th ? 'ผู้จัด' : 'host'}</div>
          </div>
        </section>
      );
    }
    return (
      <section className="tp2-section">
        <div className="tp2-wrap">
          {sectionHead(s)}
          {s.kind === 'takeaways' ? renderTakeaways(s) : renderJourney(s)}
        </div>
      </section>
    );
  };

  return (
    <div className="tm tp2" data-lang={lang} data-editing={editing ? '1' : undefined} data-mview={editing ? mobileView : undefined}>
      {editing && draft && (
        <HostProfileEditor
          draft={draft}
          setDraft={setDraft}
          th={th}
          bioFallback={teacher.bio || ''}
          promiseMax={PROMISE_MAX}
          heads={DEFAULT_HEAD}
          sectionNo={sectionNo}
          open={open}
          setOpen={setOpen}
          onSpot={setSpot}
          saving={saving}
          saveError={saveError}
          onSave={save}
          onCancel={cancelEdit}
          mobileView={mobileView}
          setMobileView={setMobileView}
        />
      )}
      {/* Hero */}
      <section className="tp2-hero">
        <svg aria-hidden="true" width="230" height="96" viewBox="0 0 230 96" className="tm-hero-doodle" style={{ right: -16, top: 56 }}>
          <path d="M8 66 C 48 20, 74 84, 114 38 S 176 76, 222 28" fill="none" stroke="var(--accent)" strokeWidth="7" strokeLinecap="round" strokeDasharray="400" className="tm-draw" />
        </svg>
        <span aria-hidden="true" className="tm-hero-star" style={{ left: '5%', top: 'auto', bottom: 64 }}>✺</span>

        <div className="tp2-wrap">
          <div className="tp2-topline">
            {fromDash ? (
              <Link href="/host/journeys" className="tp2-back">← Host Dashboard</Link>
            ) : (
              <Link href="/hosts" className="tp2-back">← {th ? 'ผู้จัดทั้งหมด' : 'All hosts'}</Link>
            )}
            {canEdit && !editing && (
              <button type="button" className="tp2-edit-btn" onClick={startEdit}>
                ✎ {th ? 'แก้ไขหน้านี้' : 'Edit this page'}
              </button>
            )}
          </div>

          <div className="tp2-hero-row">
            <div className="tp2-hero-text">
              <span className="tm-eyebrow">{roleLabel}</span>
              <h1 className="tp2-name">{display}</h1>
              {teacher.nickname && teacher.name !== teacher.nickname && <div className="tp2-realname">{teacher.name}</div>}
              {promise ? (
                <p className="tp2-promise tp2-editable" data-ek="promise" onClick={() => editHere('hero', 'promise')}>{promise}</p>
              ) : (
                editing && <p className="tp2-promise tp2-editable" data-ek="promise" onClick={() => editHere('hero', 'promise')}>{ph(th ? 'คำแนะนำตัวของคุณจะอยู่ตรงนี้' : 'Your intro goes here')}</p>
              )}
            </div>
            <span className="tm-avatar tp2-avatar">
              {teacher.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={teacher.avatar_url} alt={display} />
              ) : (
                initialOf(display)
              )}
            </span>
          </div>

          <div className="tp2-stats">
            {editing && !profile.years && (
              <span className="tp2-stat tp2-editable" data-ek="years" onClick={() => editHere('hero', 'years')}>
                <span className="tp2-stat-n">{ph('—')}</span>
                <span className="tm-meta">{th ? 'ปีที่จัดกิจกรรม (ซ่อนอยู่)' : 'years teaching (hidden)'}</span>
              </span>
            )}
            {stats.map((s) => (
              <span key={s.label} className="tp2-stat" data-ek={s.years ? 'years' : undefined}>
                <span className="tp2-stat-n">{s.num}</span>
                <span className="tm-meta">{s.label}</span>
              </span>
            ))}
            <span style={{ flex: 1 }} />
            {rounds.length > 0 && !editing && (
              <Btn kind="ink" href="#calendar">{th ? 'เลือกวันที่ว่าง' : 'Find a day'} <span className="mono">↓</span></Btn>
            )}
          </div>
        </div>
      </section>

      {/* The host's own sections, in the order they arranged them. While
          editing, a click on one opens it in the editor panel. */}
      {profile.sections.map((s) => (
        <div key={s.id} className={`tp2-sec ${editing ? 'tp2-editable' : ''}`} data-ek={`sec:${s.id}`} onClick={() => editHere(s.id, `sec:${s.id}`)}>
          {renderSection(s)}
        </div>
      ))}

      {/* Works rail */}
      {teacher.works.length > 0 && (
        <section className="tp2-section">
          <div className="tp2-wrap">
            <div className="tp2-head">
              <div>
                <span className="tm-eyebrow">{worksNo} — {th ? 'คลาสที่จัด' : 'Classes they host'}</span>
                <h2 className="tp2-h2" style={{ fontSize: 'clamp(24px,3vw,32px)', margin: '12px 0 0' }}>{th ? `กิจกรรมของ ${display}` : `${display}’s journeys`}</h2>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="tm-round-btn" style={{ width: 38, height: 38, fontSize: 15, background: 'var(--cream)' }} onClick={() => nudge(-1)} aria-label="Scroll left">‹</button>
                <button type="button" className="tm-round-btn" style={{ width: 38, height: 38, fontSize: 15, background: 'var(--cream)' }} onClick={() => nudge(1)} aria-label="Scroll right">›</button>
              </div>
            </div>
            <div ref={railRef} className="tm-rail tp2-rail">
              {teacher.works.map((w, i) => {
                const on = poster === i;
                return (
                  <Link
                    key={w.id}
                    href={`/journeys/${w.id}`}
                    className={`tm-work ${w.image_url ? '' : `ph ${PH_CLASS[i % PH_CLASS.length]}`}`}
                    style={{ transform: on ? 'scale(1.03)' : 'none' }}
                    onMouseEnter={() => setPoster(i)}
                    onMouseLeave={() => setPoster(null)}
                    onFocus={() => setPoster(i)}
                    onBlur={() => setPoster(null)}
                    onTouchStart={() => setPoster(i)}
                  >
                    {w.image_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={w.image_url} alt="" />
                    )}
                    <span aria-hidden="true" className="tm-work-no">{pad2(i + 1)}</span>
                    <span className={`tp2-work-status ${w.open ? 'open' : ''}`}>{w.open ? (th ? 'เปิดรับ' : 'Open') : th ? 'ปิดรับ' : 'Closed'}</span>
                    <span className="tm-work-name" style={{ transform: `translateY(${on ? '0%' : '101%'})` }}>{w.title}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* Calendar */}
      <section id="calendar" className="tp2-section tp2-cal">
        <div className="tp2-wrap">
          <div className="tp2-head" style={{ gap: '18px 32px', marginBottom: 26 }}>
            <div style={{ maxWidth: 520 }}>
              <span className="tm-eyebrow">{calendarNo} — {th ? 'เลือกวัน' : 'Pick a day'}</span>
              <h2 className="tp2-h2" style={{ fontSize: 'clamp(26px,3.4vw,36px)', margin: '12px 0 8px' }}>{th ? 'วันที่เปิดรอบ' : 'Days they teach'}</h2>
              <p className="tm-lede" style={{ color: 'var(--ink-soft)' }}>{th ? 'กดวันที่มีสีเพื่อดูรอบของวันนั้น' : 'Tap a tinted day to see the rounds that run on it.'}</p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <span className="tm-meta" style={{ whiteSpace: 'nowrap' }}>
                {monthRounds ? (th ? `${monthRounds} รอบในเดือนนี้` : `${monthRounds} rounds this month`) : th ? 'ไม่มีรอบในเดือนนี้' : 'no rounds this month'}
              </span>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button type="button" className="tm-today-btn" onClick={goToday}>{th ? 'วันนี้' : 'Today'}</button>
                <button type="button" className="tm-round-btn" style={{ background: 'var(--cream)' }} onClick={() => step(-1)} aria-label="Previous month">‹</button>
                <button type="button" className="tm-round-btn" style={{ background: 'var(--cream)' }} onClick={() => step(1)} aria-label="Next month">›</button>
              </div>
            </div>
          </div>

          <div className="tp2-month">
            <span className="tp2-month-en">{EN_MONTHS_FULL[cm].toUpperCase()}</span>
            <span className="tp2-month-th">{th ? `${TH_MONTHS_FULL[cm]} ${cy + 543}` : String(cy)}</span>
          </div>

          <div className="tp2-grid-scroll">
            <div className="tp2-grid">
              {(th ? TH_DOW : EN_DOW).map((d) => (
                <span key={d} className="tp2-dow">{d}</span>
              ))}
              {cells.map((key, i) => {
                if (!key) return <span key={`b${i}`} className="tp2-cell tp2-cell-blank" />;
                const n = marks[key] || 0;
                const has = n > 0;
                const disabled = key < today || !has;
                const selected = day === key;
                const first = has ? rounds.filter((r) => r.date === key).sort((a, b) => a.time_start.localeCompare(b.time_start))[0] : null;
                return (
                  <button
                    key={key}
                    type="button"
                    className={`tp2-cell ${has ? 'has' : ''} ${selected ? 'on' : ''} ${key === today ? 'today' : ''}`}
                    disabled={disabled}
                    aria-pressed={selected}
                    onClick={() => setDay(key)}
                  >
                    {key === today ? (
                      <span className="tp2-cell-today">
                        Today <span aria-hidden="true" className="tp2-cell-sun">✺</span>
                        <span className="sr-only"> {Number(key.slice(-2))}</span>
                      </span>
                    ) : (
                      <span className="tp2-cell-num">{Number(key.slice(-2))}</span>
                    )}
                    {has && <span className="tp2-cell-time">{n > 1 ? `${n} ${th ? 'รอบ' : 'rounds'}` : first?.time_start}</span>}
                    {has && (
                      <span aria-hidden="true" className="tp2-cell-event">
                        <Icon name="event" size={14} align="baseline" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="tp2-daylabel">
            <span className="tp2-daylabel-date">{day ? longDate(day, th) : th ? 'เลือกวันจากปฏิทิน' : 'Choose a day'}</span>
            {day && <span className="tp2-daylabel-n">{onDay.length} {th ? 'รอบ' : onDay.length === 1 ? 'round' : 'rounds'}</span>}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {onDay.map((r, i) => {
              const full = r.full;
              const on = hover === r.id;
              return (
                <Link
                  key={r.id}
                  href={`/journeys/${r.id}?date=${r.date}`}
                  className={`tp2-round ${on ? 'on' : ''}`}
                  onMouseEnter={() => setHover(r.id)}
                  onMouseLeave={() => setHover(null)}
                >
                  {r.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.image_url} alt="" className="tp2-round-img" style={{ transform: on ? 'scale(1.05)' : 'none' }} />
                  ) : (
                    <span className={`tp2-round-img ph ${PH_CLASS[i % PH_CLASS.length]}`} style={{ transform: on ? 'scale(1.05)' : 'none' }} />
                  )}
                  <span style={{ flex: 1, minWidth: 'min(100%, 180px)' }}>
                    <span className="tp2-round-title">{r.title}</span>
                    <span className="tp2-round-meta">
                      <span>{r.time_start}–{r.time_end}</span>
                      <span>{r.is_online ? 'ONLINE' : r.loc_name || '—'}</span>
                      <span>{full ? (th ? 'เต็ม' : 'full') : th ? `รับ ${r.max_participants} ที่` : `${r.max_participants} seats`}</span>
                    </span>
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <b className="tp2-round-price">฿{Math.round(r.price).toLocaleString()}</b>
                    {full && <span className="tag tm-tag-off" style={{ fontSize: 10.5 }}>{th ? 'เต็มแล้ว' : 'Full'}</span>}
                    <span aria-hidden="true" className="mono tm-card-arrow" style={{ transform: on ? 'translateX(6px)' : 'none' }}>→</span>
                  </span>
                </Link>
              );
            })}
            {onDay.length === 0 && (
              <div className="tm-none">{rounds.length === 0 ? (th ? 'ยังไม่มีรอบที่เปิดรับสมัครในขณะนี้' : 'No open rounds right now.') : th ? 'ยังไม่มีรอบในวันนี้' : 'No rounds on this day.'}</div>
            )}
          </div>
        </div>
      </section>

      {/* Ask */}
      {/* The heading asks people to get in touch, so the band only shows once there is a channel to use. */}
      {showContact && (
      <section className="tm-cta">
        <span aria-hidden="true" className="tm-cta-star" style={{ left: 'auto', right: -20, top: -40, bottom: 'auto', fontSize: 200 }}>✺</span>
        <div className="tp2-wrap tm-cta-row" style={{ position: 'relative' }}>
          <div style={{ maxWidth: 560 }}>
            <span className="tm-eyebrow" style={{ color: '#fff' }}>{contactNo} — {th ? 'คุยกันก่อนก็ได้' : 'Talk first'}</span>
            <h2 className="tp2-h2" style={{ fontSize: 'clamp(24px,3.2vw,34px)', color: '#fff', margin: '14px 0 0' }}>{th ? `ติดต่อ ${display} เพื่อสอบถามเพิ่มเติม` : `Contact ${display} to ask more`}</h2>
          </div>
        </div>
        <div className={`tp2-wrap ${editing ? 'tp2-editable' : ''}`} style={{ position: 'relative', marginTop: 30 }} data-ek="socials" onClick={() => editHere('contact', 'socials')}>
          <span className="tm-eyebrow" style={{ color: 'rgba(255,255,255,.7)' }}>{th ? 'ช่องทางติดต่อ' : 'Find them on'}</span>
          <div className="tp2-socials">
            {profile.socials.map((s, i) => (
              <a key={i} href={s.url || undefined} target="_blank" rel="noopener noreferrer" className="tp2-social" aria-label={SOCIAL_LABEL[s.kind]} title={SOCIAL_LABEL[s.kind]}>
                <SocialIcon kind={s.kind} size={20} />
              </a>
            ))}
            {editing && profile.socials.length === 0 && <span className="tp2-ph" style={{ color: 'rgba(255,255,255,.6)' }}>{th ? 'ยังไม่มีช่องทาง — แถบนี้จะซ่อนจนกว่าจะเพิ่ม' : 'No links — this band stays hidden until you add one'}</span>}
          </div>
        </div>
      </section>
      )}
    </div>
  );
}
