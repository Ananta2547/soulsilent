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
import { useLoadingTracker } from '@/components/design/DataLoading';
import { EMPTY_PROFILE, LIMITS, MAX_TAKEAWAYS, parseTeacherProfile, type TeacherProfile } from '@/lib/teacher-profile';
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
  booked: number;
  private_taken: number;
};

const TH_MONTHS_FULL = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
const EN_MONTHS_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const TH_DOW = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];
const EN_DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const PH_CLASS = ['ph-teal', 'ph-cream', 'ph-teal-100', 'ph-accent'];
const CRAFT_TH: Record<string, string> = { art: 'ศิลปะ', craft: 'งานฝีมือ', cooking: 'ทำอาหาร', music: 'ดนตรี', wellness: 'สุขภาพ', nature: 'ธรรมชาติ', kids: 'เด็ก', other: 'อื่น ๆ' };

const pad2 = (n: number) => String(n).padStart(2, '0');

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

  useEffect(() => {
    track(
      fetch(`/api/teachers/${id}`)
        .then((r) => (r.ok ? (r.json() as Promise<{ teacher: TeacherPublic; rounds: Round[]; can_edit: boolean }>) : null))
        .then((d) => {
          if (d) {
            setTeacher(d.teacher);
            setRounds(d.rounds || []);
            setCanEdit(!!d.can_edit);
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

  if (loading || !cursor) return null;
  if (!teacher) {
    return (
      <section className="section" style={{ padding: '120px 0', textAlign: 'center' }}>
        <p style={{ color: 'var(--muted)', marginBottom: 16 }}>{tr(lang, 'ไม่พบผู้สอนคนนี้', 'Teacher not found')}</p>
        <Btn kind="teal" href="/teachers">{tr(lang, 'ดูผู้สอนทั้งหมด', 'All teachers')}</Btn>
      </section>
    );
  }

  const display = teacher.nickname || teacher.name;
  const profile = draft || teacher.profile;
  const editing = draft !== null;
  const promise = profile.promise || teacher.bio || '';
  const crafts = teacher.crafts.slice(0, 2).map((c) => (th ? CRAFT_TH[c] || c : c)).join(' · ');
  const roleLabel = th ? `ผู้สอน${crafts ? ` — ${crafts}` : ''}` : `Teacher${crafts ? ` — ${crafts}` : ''}`;

  const stats: { num: string; label: string }[] = [];
  if (profile.years && !editing) stats.push({ num: String(profile.years), label: th ? 'ปีที่สอน' : 'years teaching' });
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
  const nudge = (dir: number) => {
    const el = railRef.current;
    if (el) el.scrollBy({ left: dir * Math.max(220, el.clientWidth * 0.8), behavior: 'smooth' });
  };

  // Editor helpers.
  const patch = (p: Partial<TeacherProfile>) => setDraft((d) => ({ ...(d || EMPTY_PROFILE), ...p }));
  const patchTake = (i: number, p: Partial<{ title: string; body: string }>) =>
    setDraft((d) => {
      const cur = d || EMPTY_PROFILE;
      return { ...cur, takeaways: cur.takeaways.map((t, j) => (j === i ? { ...t, ...p } : t)) };
    });
  const removeTake = (i: number) =>
    setDraft((d) => {
      const cur = d || EMPTY_PROFILE;
      return { ...cur, takeaways: cur.takeaways.filter((_, j) => j !== i) };
    });
  const addTake = () =>
    setDraft((d) => {
      const cur = d || EMPTY_PROFILE;
      return cur.takeaways.length >= MAX_TAKEAWAYS ? cur : { ...cur, takeaways: [...cur.takeaways, { title: '', body: '' }] };
    });
  const startEdit = () => {
    setSaveError(null);
    setDraft({ ...teacher.profile, takeaways: teacher.profile.takeaways.map((t) => ({ ...t })) });
  };
  const cancelEdit = () => {
    setDraft(null);
    setSaveError(null);
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
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const showTake = editing || profile.takeaways.length > 0;
  const showBelief = editing || !!profile.belief;

  return (
    <div className="tm tp2" data-lang={lang} data-editing={editing ? '1' : undefined}>
      {/* Hero */}
      <section className="tp2-hero">
        <svg aria-hidden="true" width="230" height="96" viewBox="0 0 230 96" className="tm-hero-doodle" style={{ right: -16, top: 56 }}>
          <path d="M8 66 C 48 20, 74 84, 114 38 S 176 76, 222 28" fill="none" stroke="var(--accent)" strokeWidth="7" strokeLinecap="round" strokeDasharray="400" className="tm-draw" />
        </svg>
        <span aria-hidden="true" className="tm-hero-star" style={{ left: '5%', top: 'auto', bottom: 64 }}>✺</span>

        <div className="tp2-wrap">
          <div className="tp2-topline">
            <Link href="/teachers" className="tp2-back">← {th ? 'ผู้สอนทั้งหมด' : 'All teachers'}</Link>
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
              {editing ? (
                <label className="tp2-field" style={{ marginTop: 22 }}>
                  <span className="tp2-field-label">{th ? 'ประโยคแนะนำตัว (ใต้ชื่อ)' : 'Promise line (under the name)'}</span>
                  <textarea
                    className="tp2-input tp2-input-promise"
                    rows={3}
                    maxLength={LIMITS.promise}
                    value={profile.promise}
                    placeholder={teacher.bio || (th ? 'เช่น ผมไม่ได้สอนให้วาดสวย ผมสอนให้มองนานพอ…' : 'e.g. I don’t teach pretty drawings…')}
                    onChange={(e) => patch({ promise: e.target.value })}
                  />
                  <span className="tp2-field-hint">{th ? 'เว้นว่างได้ — จะใช้ bio จากโปรไฟล์แทน' : 'Leave empty to fall back to your bio'}</span>
                </label>
              ) : (
                promise && <p className="tp2-promise">{promise}</p>
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
            {editing && (
              <label className="tp2-stat tp2-field">
                <input
                  className="tp2-input tp2-input-years"
                  type="number"
                  min={0}
                  max={LIMITS.years}
                  value={profile.years ?? ''}
                  placeholder="0"
                  onChange={(e) => patch({ years: e.target.value === '' ? null : Number(e.target.value) })}
                />
                <span className="tm-meta">{th ? 'ปีที่สอน (เว้นว่างเพื่อซ่อน)' : 'years teaching (blank hides it)'}</span>
              </label>
            )}
            {stats.map((s) => (
              <span key={s.label} className="tp2-stat">
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

      {/* Editor bar — sticks under the site header while editing */}
      {editing && (
        <div className="tp2-editbar">
          <div className="tp2-wrap tp2-editbar-row">
            <span className="tp2-editbar-text">
              {th ? 'กำลังแก้ไข — ข้อความในกล่องแก้ได้ทุกช่อง เว้นว่างเพื่อไม่แสดง' : 'Editing — every box can be changed; leave one empty to hide it'}
            </span>
            {saveError && <span className="tp2-editbar-err">{saveError}</span>}
            <span style={{ flex: 1 }} />
            <button type="button" className="btn btn-paper btn-sm" onClick={cancelEdit} disabled={saving}>{th ? 'ยกเลิก' : 'Cancel'}</button>
            <button type="button" className="btn btn-teal btn-sm" onClick={save} disabled={saving}>{saving ? (th ? 'กำลังบันทึก…' : 'Saving…') : th ? 'บันทึก' : 'Save'}</button>
          </div>
        </div>
      )}

      {/* What you take home */}
      {showTake && (
        <section className="tp2-section">
          <div className="tp2-wrap">
            <span className="tm-eyebrow">{th ? '01 — สิ่งที่คุณจะได้กลับไป' : '01 — What you take home'}</span>
            <h2 className="tp2-h2" style={{ maxWidth: 620 }}>{th ? 'มาด้วยความคาดหวังว่าจะได้เทคนิค กลับไปได้ตัวเอง' : 'Come expecting technique. Leave with yourself.'}</h2>
            <div className="tp2-takes">
              {profile.takeaways.map((k, i) => (
                <div key={i} className="tp2-take">
                  <span className="tp2-take-no">{pad2(i + 1)}</span>
                  {editing ? (
                    <>
                      <label className="tp2-field">
                        <span className="tp2-field-label">{th ? 'หัวข้อ' : 'Title'}</span>
                        <input className="tp2-input tp2-input-title" maxLength={LIMITS.title} value={k.title} placeholder={th ? 'เช่น มือที่ช้าลง' : 'e.g. A slower hand'} onChange={(e) => patchTake(i, { title: e.target.value })} />
                      </label>
                      <label className="tp2-field">
                        <span className="tp2-field-label">{th ? 'รายละเอียด' : 'Detail'}</span>
                        <textarea className="tp2-input" rows={3} maxLength={LIMITS.body} value={k.body} placeholder={th ? 'อธิบายสั้น ๆ ว่าผู้เรียนจะได้อะไร' : 'A sentence or two on what they leave with'} onChange={(e) => patchTake(i, { body: e.target.value })} />
                      </label>
                      <button type="button" className="tp2-remove" onClick={() => removeTake(i)} aria-label={th ? 'ลบข้อนี้' : 'Remove this item'}>
                        ✕ {th ? 'ลบข้อนี้' : 'Remove'}
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="tp2-take-title">{k.title}</span>
                      <span className="tp2-take-body">{k.body}</span>
                    </>
                  )}
                </div>
              ))}
              {editing && profile.takeaways.length === 0 && (
                <div className="tp2-empty-hint">{th ? 'ยังไม่มีข้อ — กด "เพิ่มข้อ" เพื่อเริ่ม (ถ้าไม่มีเลย ส่วนนี้จะไม่แสดง)' : 'No items yet — add one below (with none, this section stays hidden)'}</div>
              )}
              {editing && profile.takeaways.length < MAX_TAKEAWAYS && (
                <button type="button" className="tp2-add" onClick={addTake}>
                  + {th ? `เพิ่มข้อ (${profile.takeaways.length}/${MAX_TAKEAWAYS})` : `Add item (${profile.takeaways.length}/${MAX_TAKEAWAYS})`}
                </button>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Belief */}
      {showBelief && (
        <section className="tp2-band">
          <span aria-hidden="true" className="tm-cta-star" style={{ left: -30, bottom: -40, fontSize: 190 }}>✺</span>
          <div className="tp2-wrap" style={{ position: 'relative' }}>
            {editing ? (
              <label className="tp2-field">
                <span className="tp2-field-label" style={{ color: 'rgba(255,255,255,.7)' }}>{th ? 'ความเชื่อของคุณ (ประโยคเดียว จะแสดงเป็นคำพูดบนแถบนี้ เว้นว่างเพื่อซ่อน)' : 'Your belief — one line, shown as a quote on this band; blank hides it'}</span>
                <textarea className="tp2-input tp2-input-belief" rows={3} maxLength={LIMITS.belief} value={profile.belief} placeholder={th ? 'เช่น คนที่บอกว่าตัวเองวาดไม่เป็น มักมองเห็นอะไรได้ละเอียดที่สุดในห้อง' : 'e.g. The people who say they can’t draw usually see the most in the room.'} onChange={(e) => patch({ belief: e.target.value })} />
              </label>
            ) : (
              <p className="tp2-belief">“{profile.belief}”</p>
            )}
            <div className="tm-meta tp2-sign">{display} · {th ? 'ผู้สอน' : 'teacher'}</div>
          </div>
        </section>
      )}

      {/* Works rail */}
      {teacher.works.length > 0 && (
        <section className="tp2-section">
          <div className="tp2-wrap">
            <div className="tp2-head">
              <div>
                <span className="tm-eyebrow">{th ? '02 — คลาสที่จัด' : '02 — Classes they host'}</span>
                <h2 className="tp2-h2" style={{ fontSize: 'clamp(24px,3vw,32px)', margin: '12px 0 0' }}>{th ? 'งานที่ผ่านมาและที่ยังจัดอยู่' : 'Past and running workshops'}</h2>
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
                    href={`/workshops/${w.id}`}
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
                    <span aria-hidden="true" className="tm-work-star">✺</span>
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
              <span className="tm-eyebrow">{th ? '03 — เลือกวัน' : '03 — Pick a day'}</span>
              <h2 className="tp2-h2" style={{ fontSize: 'clamp(26px,3.4vw,36px)', margin: '12px 0 8px' }}>{th ? 'วันที่เปิดสอน' : 'Days they teach'}</h2>
              <p className="tm-lede" style={{ color: 'var(--ink-soft)' }}>{th ? 'กดวันที่มีสีเพื่อดูรอบของวันนั้น' : 'Tap a tinted day to see the rounds that run on it.'}</p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <span className="tm-meta" style={{ whiteSpace: 'nowrap' }}>
                {monthRounds ? (th ? `${monthRounds} รอบในเดือนนี้` : `${monthRounds} rounds this month`) : th ? 'ไม่มีรอบในเดือนนี้' : 'no rounds this month'}
              </span>
              <div style={{ display: 'flex', gap: 8 }}>
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
                    className={`tp2-cell ${has ? 'has' : ''} ${selected ? 'on' : ''}`}
                    disabled={disabled}
                    aria-pressed={selected}
                    onClick={() => setDay(key)}
                  >
                    <span className="tp2-cell-num">{Number(key.slice(-2))}</span>
                    {has && <span className="tp2-cell-time">{n > 1 ? `${n} ${th ? 'รอบ' : 'rounds'}` : first?.time_start}</span>}
                    {has && <span aria-hidden="true" className="tp2-cell-dot" />}
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
              const full = r.private_taken > 0 || r.booked >= r.max_participants;
              const on = hover === r.id;
              const left = r.max_participants - r.booked;
              return (
                <Link
                  key={r.id}
                  href={`/workshops/${r.id}?date=${r.date}`}
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
                      <span>{full ? (th ? 'เต็ม' : 'full') : th ? `เหลือ ${left} ที่` : `${left} seats left`}</span>
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
      <section className="tm-cta">
        <span aria-hidden="true" className="tm-cta-star" style={{ left: 'auto', right: -20, top: -40, bottom: 'auto', fontSize: 200 }}>✺</span>
        <div className="tp2-wrap tm-cta-row" style={{ position: 'relative' }}>
          <div style={{ maxWidth: 560 }}>
            <span className="tm-eyebrow" style={{ color: '#fff' }}>{th ? '04 — คุยกันก่อนก็ได้' : '04 — Talk first'}</span>
            <h2 className="tp2-h2" style={{ fontSize: 'clamp(24px,3.2vw,34px)', color: '#fff', margin: '14px 0 12px' }}>{th ? 'ยังไม่แน่ใจว่าคลาสไหนเหมาะกับคุณ' : 'Not sure which class fits you?'}</h2>
            <p style={{ fontSize: 15, lineHeight: 1.65, color: '#fff', margin: 0 }}>
              {th ? `เล่าให้เราฟังว่าคุณอยากได้อะไรจากวันนั้น เราจะช่วยเลือกรอบให้ หรือส่งต่อให้${display}ตอบคุณเอง` : `Tell us what you want from the day. We’ll help you pick a round — or pass it on to ${display}.`}
            </p>
          </div>
          <Btn kind="paper" href="/help">{th ? `ส่งคำถามถึง${display}` : `Ask ${display}`} <span className="mono">→</span></Btn>
        </div>
      </section>
    </div>
  );
}
