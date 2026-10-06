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

import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useLang, tr } from '@/lib/i18n';
import { Btn } from '@/components/design/RippleButton';
import { Icon } from '@/components/design/Icon';
import { SocialIcon } from '@/components/design/SocialIcon';
import { useLoadingTracker } from '@/components/design/DataLoading';
import { ImageUploader } from '@/components/admin/image/ImageUploader';
import { ASPECTS } from '@/lib/image-aspects';
import {
  EMPTY_PROFILE,
  LIMITS,
  MAX_GALLERY,
  MAX_JOURNEY,
  MAX_REVIEWS,
  MAX_SECTIONS,
  MAX_SOCIALS,
  MAX_TAKEAWAYS,
  SOCIAL_KINDS,
  SOCIAL_LABEL,
  newSection,
  parseTeacherProfile,
  sortedJourney,
  type GalleryImage,
  type JourneyStep,
  type ProfileSection,
  type SectionKind,
  type SocialLink,
  type Takeaway,
  type TeacherProfile,
} from '@/lib/teacher-profile';
import type { ReviewPublic, TeacherPublic } from '@/app/api/teachers/[id]/route';

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
/** Drag id of the "add a section" box, which moves through the list like a section. */
const ADD_ID = '__add';

/** Section kinds with a numbered eyebrow and a heading. */
type HeadKind = 'takeaways' | 'journey' | 'reviews' | 'gallery';

/** Photos one at a time: swipe or use the arrows; arrows and dots appear only
 *  when there is more than one photo. */
function GallerySlider({ images, th }: { images: GalleryImage[]; th: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState(0);
  const go = (i: number) => {
    const el = ref.current;
    if (!el) return;
    const n = Math.max(0, Math.min(images.length - 1, i));
    el.scrollTo({ left: n * el.clientWidth, behavior: 'smooth' });
  };
  const many = images.length > 1;
  return (
    <div className="tp2-gal">
      <div
        ref={ref}
        className="tp2-gal-track"
        onScroll={(e) => {
          const el = e.currentTarget;
          setAt(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
        }}
      >
        {images.map((g, i) => (
          <figure key={i} className="tp2-gal-slide">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={g.url} alt={g.caption || ''} loading="lazy" />
            {g.caption && <figcaption>{g.caption}</figcaption>}
          </figure>
        ))}
      </div>
      {many && (
        <div className="tp2-gal-nav">
          <button type="button" className="tm-round-btn" style={{ background: 'var(--cream)' }} disabled={at === 0} onClick={() => go(at - 1)} aria-label={th ? 'รูปก่อนหน้า' : 'Previous photo'}>‹</button>
          <div className="tp2-gal-dots">
            {images.map((_, i) => (
              <button key={i} type="button" className={i === at ? 'on' : ''} onClick={() => go(i)} aria-label={`${i + 1} / ${images.length}`} />
            ))}
          </div>
          <span className="tp2-gal-count">{at + 1} / {images.length}</span>
          <button type="button" className="tm-round-btn" style={{ background: 'var(--cream)' }} disabled={at === images.length - 1} onClick={() => go(at + 1)} aria-label={th ? 'รูปถัดไป' : 'Next photo'}>›</button>
        </div>
      )}
    </div>
  );
}

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
  // Written reviews on this host's rounds: all of them for the host, only the
  // picked ones for visitors (the API decides).
  const [reviews, setReviews] = useState<ReviewPublic[]>([]);
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
  // Section reordering by drag: a section only becomes draggable while its
  // handle is held, so selecting text inside its inputs still works.
  const [armed, setArmed] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);
  // The "add a section" box sits in the list too and can be dragged like a
  // section; new sections go in where it sits. It is anchored to the section
  // just above it (null = top of the list, undefined = bottom).
  const [addAfter, setAddAfter] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    track(
      fetch(`/api/teachers/${id}`)
        .then((r) => (r.ok ? (r.json() as Promise<{ teacher: TeacherPublic; rounds: Round[]; can_edit: boolean; reviews?: ReviewPublic[] }>) : null))
        .then((d) => {
          if (d) {
            setTeacher(d.teacher);
            setRounds(d.rounds || []);
            setReviews(d.reviews || []);
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

  const stats: { num: string; label: string }[] = [];
  if (profile.years && !editing) stats.push({ num: String(profile.years), label: th ? 'ปีที่จัดกิจกรรม' : 'years teaching' });
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

  // Editor helpers.
  const patch = (p: Partial<TeacherProfile>) => setDraft((d) => ({ ...(d || EMPTY_PROFILE), ...p }));
  // Sections: every list edit goes through updateSection by id.
  const updateSection = (sid: string, fn: (s: ProfileSection) => ProfileSection) =>
    setDraft((d) => {
      const cur = d || EMPTY_PROFILE;
      return { ...cur, sections: cur.sections.map((s) => (s.id === sid ? fn(s) : s)) };
    });
  /** Where the add box sits, as an index into the section list (0…length). */
  const addIndexOf = (list: ProfileSection[]) => {
    if (addAfter === undefined) return list.length;
    if (addAfter === null) return 0;
    const i = list.findIndex((x) => x.id === addAfter);
    return i < 0 ? list.length : i + 1;
  };
  /** Park the add box before position `to` of the current list. */
  const moveAddBox = (to: number) => {
    const list = draft?.sections || [];
    const t = Math.max(0, Math.min(list.length, to));
    setAddAfter(t >= list.length ? undefined : t === 0 ? null : list[t - 1].id);
  };
  const addSection = (kind: SectionKind) => {
    if (!draft || draft.sections.length >= MAX_SECTIONS) return;
    const s = newSection(kind);
    // A new list starts with one blank item, ready to type into.
    if (s.kind === 'takeaways') s.items = [{ title: '', body: '' }];
    if (s.kind === 'journey') s.items = [{ year: '', title: '', body: '' }];
    if (s.kind === 'gallery') s.images = [{ url: '', meta: null, caption: '' }];
    const at = addIndexOf(draft.sections);
    const list = [...draft.sections];
    list.splice(at, 0, s);
    setDraft({ ...draft, sections: list });
    // The box stays just below what was added, so the next one follows it.
    if (addAfter !== undefined) setAddAfter(s.id);
  };
  const removeSection = (sid: string) => {
    const s = draft?.sections.find((x) => x.id === sid);
    const filled =
      !!s &&
      (s.kind === 'belief'
        ? !!s.text.trim()
        : s.kind === 'text'
          ? !!(s.title.trim() || s.body.trim())
          : s.kind === 'reviews'
            ? s.ids.length > 0
            : s.kind === 'gallery'
              ? s.images.some((g) => g.url)
              : s.items.some((t) => Object.values(t).some((v) => v.trim())));
    if (filled && !window.confirm(th ? 'ลบส่วนนี้ทั้งส่วน?' : 'Remove this whole section?')) return;
    if (addAfter === sid && draft) {
      const i = draft.sections.findIndex((x) => x.id === sid);
      setAddAfter(i > 0 ? draft.sections[i - 1].id : null);
    }
    setDraft((d) => (d ? { ...d, sections: d.sections.filter((x) => x.id !== sid) } : d));
  };
  /** Move the section `sid` so it lands before position `to` (0…length). */
  const moveSection = (sid: string, to: number) =>
    setDraft((d) => {
      if (!d) return d;
      const from = d.sections.findIndex((x) => x.id === sid);
      if (from < 0) return d;
      const list = [...d.sections];
      const [it] = list.splice(from, 1);
      list.splice(to > from ? to - 1 : to, 0, it);
      return { ...d, sections: list };
    });
  const patchTake = (sid: string, i: number, p: Partial<Takeaway>) =>
    updateSection(sid, (s) => (s.kind === 'takeaways' ? { ...s, items: s.items.map((t, j) => (j === i ? { ...t, ...p } : t)) } : s));
  const removeTake = (sid: string, i: number) =>
    updateSection(sid, (s) => (s.kind === 'takeaways' ? { ...s, items: s.items.filter((_, j) => j !== i) } : s));
  const addTake = (sid: string) =>
    updateSection(sid, (s) => (s.kind === 'takeaways' && s.items.length < MAX_TAKEAWAYS ? { ...s, items: [...s.items, { title: '', body: '' }] } : s));
  const patchStep = (sid: string, i: number, p: Partial<JourneyStep>) =>
    updateSection(sid, (s) => (s.kind === 'journey' ? { ...s, items: s.items.map((t, j) => (j === i ? { ...t, ...p } : t)) } : s));
  const removeStep = (sid: string, i: number) =>
    updateSection(sid, (s) => (s.kind === 'journey' ? { ...s, items: s.items.filter((_, j) => j !== i) } : s));
  const addStep = (sid: string) =>
    updateSection(sid, (s) => (s.kind === 'journey' && s.items.length < MAX_JOURNEY ? { ...s, items: [...s.items, { year: '', title: '', body: '' }] } : s));
  const patchHead = (sid: string, p: { eyebrow?: string; title?: string }) =>
    updateSection(sid, (s) => (s.kind === 'belief' || s.kind === 'text' ? s : { ...s, ...p }));
  const patchText = (sid: string, p: { title?: string; body?: string }) => updateSection(sid, (s) => (s.kind === 'text' ? { ...s, ...p } : s));
  /** Pick or drop a review; picks keep the order they were made in. */
  const toggleReview = (sid: string, rid: string) =>
    updateSection(sid, (s) => {
      if (s.kind !== 'reviews') return s;
      if (s.ids.includes(rid)) return { ...s, ids: s.ids.filter((x) => x !== rid) };
      return s.ids.length >= MAX_REVIEWS ? s : { ...s, ids: [...s.ids, rid] };
    });
  const patchImage = (sid: string, i: number, p: Partial<GalleryImage>) =>
    updateSection(sid, (s) => (s.kind === 'gallery' ? { ...s, images: s.images.map((g, j) => (j === i ? { ...g, ...p } : g)) } : s));
  const removeImage = (sid: string, i: number) => updateSection(sid, (s) => (s.kind === 'gallery' ? { ...s, images: s.images.filter((_, j) => j !== i) } : s));
  const moveImage = (sid: string, i: number, d: number) =>
    updateSection(sid, (s) => {
      if (s.kind !== 'gallery' || i + d < 0 || i + d >= s.images.length) return s;
      const images = [...s.images];
      [images[i], images[i + d]] = [images[i + d], images[i]];
      return { ...s, images };
    });
  const addImage = (sid: string) =>
    updateSection(sid, (s) => (s.kind === 'gallery' && s.images.length < MAX_GALLERY ? { ...s, images: [...s.images, { url: '', meta: null, caption: '' }] } : s));
  const patchSocial = (i: number, p: Partial<SocialLink>) =>
    setDraft((d) => {
      const cur = d || EMPTY_PROFILE;
      return { ...cur, socials: cur.socials.map((t, j) => (j === i ? { ...t, ...p } : t)) };
    });
  const removeSocial = (i: number) =>
    setDraft((d) => {
      const cur = d || EMPTY_PROFILE;
      return { ...cur, socials: cur.socials.filter((_, j) => j !== i) };
    });
  const addSocial = () =>
    setDraft((d) => {
      const cur = d || EMPTY_PROFILE;
      const unused = SOCIAL_KINDS.find((k) => !cur.socials.some((s) => s.kind === k)) || 'website';
      return cur.socials.length >= MAX_SOCIALS ? cur : { ...cur, socials: [...cur.socials, { kind: unused, url: '' }] };
    });
  const startEdit = () => {
    setSaveError(null);
    setDraft(cloneProfile(teacher.profile));
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

  // Headings are numbered down the page in the order the host arranged them;
  // the belief band has no heading, so it takes no number.
  const showContact = editing || profile.socials.length > 0;
  let counter = 0;
  const sectionNo: Record<string, string> = {};
  profile.sections.forEach((s) => {
    if (s.kind !== 'belief' && s.kind !== 'text') sectionNo[s.id] = pad2(++counter);
  });
  const worksNo = teacher.works.length > 0 ? pad2(++counter) : '';
  const calendarNo = pad2(++counter);
  const contactNo = showContact ? pad2(++counter) : '';
  const DEFAULT_HEAD: Record<HeadKind, { eyebrow: string; title: string }> = {
    reviews: th ? { eyebrow: 'เสียงจากผู้เข้าร่วม', title: 'คนที่เคยมาเล่าว่าอย่างไร' } : { eyebrow: 'From people who came', title: 'What they said' },
    gallery: th ? { eyebrow: 'ภาพบรรยากาศ', title: 'บางช่วงจากกิจกรรมที่ผ่านมา' } : { eyebrow: 'Moments', title: 'From past rounds' },
    takeaways: th
      ? { eyebrow: 'สิ่งที่คุณจะได้กลับไป', title: 'สิ่งที่เราเชื่อมั่นและให้ความสำคัญ' }
      : { eyebrow: 'What you take home', title: 'What we believe in and care about' },
    journey: th ? { eyebrow: `เส้นทางของ${display}`, title: 'เส้นทางที่ค่อย ๆ เดินมา' } : { eyebrow: `${display} — the path`, title: 'The road so far' },
  };
  const KIND_LABEL: Record<SectionKind, string> = th
    ? { takeaways: 'สิ่งที่คุณจะได้กลับไป', journey: 'เส้นทาง (ไทม์ไลน์)', belief: 'คำพูด (แถบสีเข้ม)', text: 'หัวข้อ + ย่อหน้า', reviews: 'รีวิวจากผู้เข้าร่วม', gallery: 'รูปภาพ' }
    : { takeaways: 'What you take home', journey: 'Path (timeline)', belief: 'Quote (dark band)', text: 'Heading + paragraph', reviews: 'Reviews', gallery: 'Photos' };
  const KIND_HINT: Record<SectionKind, string> = th
    ? {
        takeaways: 'รายการข้อ 01 02 03 บอกว่าผู้เข้าร่วมจะได้อะไร',
        journey: 'ไทม์ไลน์ตามปี เล่าเส้นทางที่ผ่านมา',
        belief: 'ประโยคเดียวบนแถบสีเข้ม เต็มความกว้างหน้า',
        text: 'เขียนอิสระ ใส่แค่หัวข้อหรือแค่ย่อหน้าก็ได้',
        reviews: `เลือกรีวิวที่ผู้เข้าร่วมเคยเขียนถึงคุณ สูงสุด ${MAX_REVIEWS} รีวิว`,
        gallery: `สูงสุด ${MAX_GALLERY} รูป มีคำบรรยายใต้รูป เลื่อนดูได้`,
      }
    : {
        takeaways: 'Numbered points on what people leave with',
        journey: 'A timeline by year of your path so far',
        belief: 'One line on a full-width dark band',
        text: 'Free writing — a heading, a paragraph, or both',
        reviews: `Pick up to ${MAX_REVIEWS} reviews people wrote about you`,
        gallery: `Up to ${MAX_GALLERY} photos with captions, swipeable`,
      };

  /** Move / delete controls on top of a section while editing. */
  const sectionTools = (s: ProfileSection, i: number, dark = false) => (
    <div className={`tp2-sectools ${dark ? 'dark' : ''}`}>
      <span
        className="tp2-grip"
        onPointerDown={() => setArmed(s.id)}
        onPointerUp={() => setArmed(null)}
        title={th ? 'กดค้างแล้วลากเพื่อย้าย' : 'Hold and drag to move'}
        aria-hidden="true"
      >
        ⠿
      </span>
      <span className="tp2-sectools-kind">{KIND_LABEL[s.kind]}</span>
      <span style={{ flex: 1 }} />
      <button type="button" className="tp2-secbtn" disabled={i === 0} onClick={() => moveSection(s.id, i - 1)} aria-label={th ? 'ย้ายขึ้น' : 'Move up'}>↑</button>
      <button type="button" className="tp2-secbtn" disabled={i === profile.sections.length - 1} onClick={() => moveSection(s.id, i + 2)} aria-label={th ? 'ย้ายลง' : 'Move down'}>↓</button>
      <button type="button" className="tp2-secbtn tp2-secbtn-del" onClick={() => removeSection(s.id)}>✕ {th ? 'ลบส่วนนี้' : 'Remove section'}</button>
    </div>
  );

  /** Eyebrow + heading: inputs while editing (blank keeps the default wording). */
  const sectionHead = (s: Extract<ProfileSection, { kind: HeadKind }>) => {
    const def = DEFAULT_HEAD[s.kind];
    if (!editing) {
      return (
        <>
          <span className="tm-eyebrow">{sectionNo[s.id]} — {s.eyebrow || def.eyebrow}</span>
          <h2 className="tp2-h2" style={{ maxWidth: 620 }}>{s.title || def.title}</h2>
        </>
      );
    }
    return (
      <div className="tp2-headedit">
        <label className="tp2-field">
          <span className="tp2-field-label">{th ? `หัวข้อเล็ก (หน้าเว็บจะใส่ ${sectionNo[s.id]} — ให้เอง)` : `Small heading (shown after ${sectionNo[s.id]} —)`}</span>
          <input className="tp2-input" maxLength={LIMITS.eyebrow} value={s.eyebrow} placeholder={def.eyebrow} onChange={(e) => patchHead(s.id, { eyebrow: e.target.value })} />
        </label>
        <label className="tp2-field">
          <span className="tp2-field-label">{th ? 'หัวข้อใหญ่ (เว้นว่างเพื่อใช้ข้อความตัวอย่าง)' : 'Main heading (blank uses the sample wording)'}</span>
          <input className="tp2-input tp2-input-title" maxLength={LIMITS.title} value={s.title} placeholder={def.title} onChange={(e) => patchHead(s.id, { title: e.target.value })} />
        </label>
      </div>
    );
  };

  const renderTakeaways = (s: Extract<ProfileSection, { kind: 'takeaways' }>) => (
    <div className="tp2-takes">
      {s.items.map((k, i) => (
        <div key={i} className="tp2-take">
          <span className="tp2-take-no">{pad2(i + 1)}</span>
          {editing ? (
            <>
              <label className="tp2-field">
                <span className="tp2-field-label">{th ? 'หัวข้อ' : 'Title'}</span>
                <input className="tp2-input tp2-input-title" maxLength={LIMITS.title} value={k.title} placeholder={th ? 'เช่น สร้างพื้นที่ปลอดภัย' : 'e.g. A safe space'} onChange={(e) => patchTake(s.id, i, { title: e.target.value })} />
              </label>
              <label className="tp2-field">
                <span className="tp2-field-label">{th ? 'รายละเอียด' : 'Detail'}</span>
                <textarea className="tp2-input" rows={3} maxLength={LIMITS.body} value={k.body} placeholder={th ? 'อธิบายสั้น ๆ ว่าผู้เข้าร่วมจะได้อะไร' : 'A sentence or two on what they leave with'} onChange={(e) => patchTake(s.id, i, { body: e.target.value })} />
              </label>
              <button type="button" className="tp2-remove" onClick={() => removeTake(s.id, i)} aria-label={th ? 'ลบข้อนี้' : 'Remove this item'}>
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
      {editing && s.items.length === 0 && (
        <div className="tp2-empty-hint">{th ? 'ยังไม่มีข้อ — กด "เพิ่มข้อ" เพื่อเริ่ม (ถ้าไม่มีเลย ส่วนนี้จะไม่แสดง)' : 'No items yet — add one below (with none, this section stays hidden)'}</div>
      )}
      {editing && s.items.length < MAX_TAKEAWAYS && (
        <button type="button" className="tp2-add" onClick={() => addTake(s.id)}>
          + {th ? `เพิ่มข้อ (${s.items.length}/${MAX_TAKEAWAYS})` : `Add item (${s.items.length}/${MAX_TAKEAWAYS})`}
        </button>
      )}
    </div>
  );

  const renderJourney = (s: Extract<ProfileSection, { kind: 'journey' }>) =>
    editing ? (
      <div className="tp2-journey">
        {s.items.map((k, i) => (
          <div key={i} className="tp2-jstep">
            <span className="tp2-jdot" aria-hidden="true" />
            <div className="tp2-jedit">
              <label className="tp2-field" style={{ maxWidth: 160 }}>
                <span className="tp2-field-label">{th ? 'ปี' : 'Year'}</span>
                <input className="tp2-input" maxLength={LIMITS.year} value={k.year} placeholder={th ? 'เช่น 2026' : 'e.g. 2026'} onChange={(e) => patchStep(s.id, i, { year: e.target.value })} />
              </label>
              <label className="tp2-field">
                <span className="tp2-field-label">{th ? 'หัวข้อ' : 'Title'}</span>
                <input className="tp2-input tp2-input-title" maxLength={LIMITS.title} value={k.title} placeholder={th ? 'เช่น เริ่มจัดกิจกรรมครั้งแรก' : 'e.g. First class taught'} onChange={(e) => patchStep(s.id, i, { title: e.target.value })} />
              </label>
              <label className="tp2-field">
                <span className="tp2-field-label">{th ? 'เล่าสั้น ๆ' : 'Story'}</span>
                <textarea className="tp2-input" rows={3} maxLength={LIMITS.journeyBody} value={k.body} placeholder={th ? 'อธิบายช่วงเวลานั้นให้เราฟังหน่อย' : 'Tell us about that time'} onChange={(e) => patchStep(s.id, i, { body: e.target.value })} />
              </label>
              <button type="button" className="tp2-remove" style={{ gridColumn: 'auto' }} onClick={() => removeStep(s.id, i)}>✕ {th ? 'ลบปีนี้' : 'Remove'}</button>
            </div>
          </div>
        ))}
        {s.items.length === 0 && (
          <div className="tp2-empty-hint">{th ? 'ยังไม่มีเส้นทาง — เพิ่มทีละปี (ถ้าไม่มีเลย ส่วนนี้จะไม่แสดง) หน้าเว็บจะเรียงตามปีให้เอง' : 'No steps yet — add one per year (none hides this section); the page sorts them by year'}</div>
        )}
        {s.items.length < MAX_JOURNEY && (
          <button type="button" className="tp2-add" onClick={() => addStep(s.id)}>
            + {th ? `เพิ่มปี (${s.items.length}/${MAX_JOURNEY})` : `Add a year (${s.items.length}/${MAX_JOURNEY})`}
          </button>
        )}
      </div>
    ) : (
      <ol className="tp2-journey">
        {sortedJourney(s.items).map((k, i) => (
          <li key={i} className="tp2-jstep">
            <span className="tp2-jdot" aria-hidden="true" />
            {k.year && <div className="tp2-jyear">{k.year}</div>}
            {k.title && <div className="tp2-jtitle">{k.title}</div>}
            {k.body && <p className="tp2-jbody">{k.body}</p>}
          </li>
        ))}
      </ol>
    );

  const renderText = (s: Extract<ProfileSection, { kind: 'text' }>) =>
    editing ? (
      <div className="tp2-headedit" style={{ maxWidth: 720 }}>
        <label className="tp2-field">
          <span className="tp2-field-label">{th ? 'หัวข้อ (เว้นว่างได้)' : 'Heading (optional)'}</span>
          <input className="tp2-input tp2-input-title" maxLength={LIMITS.title} value={s.title} placeholder={th ? 'เช่น ทำไมถึงเริ่มสอน' : 'e.g. Why I started teaching'} onChange={(e) => patchText(s.id, { title: e.target.value })} />
        </label>
        <label className="tp2-field">
          <span className="tp2-field-label">{th ? `ย่อหน้า (เว้นว่างได้) · ${s.body.length}/${LIMITS.textBody}` : `Paragraph (optional) · ${s.body.length}/${LIMITS.textBody}`}</span>
          <textarea className="tp2-input" rows={5} maxLength={LIMITS.textBody} value={s.body} placeholder={th ? 'เล่าเรื่องอะไรก็ได้ที่อยากให้คนรู้จักคุณ' : 'Anything you want people to know'} onChange={(e) => patchText(s.id, { body: e.target.value })} />
        </label>
        {!s.title.trim() && !s.body.trim() && <div className="tp2-empty-hint">{th ? 'ใส่อย่างน้อยหัวข้อหรือย่อหน้า ไม่งั้นส่วนนี้จะไม่แสดง' : 'Fill in a heading or a paragraph, or this section stays hidden'}</div>}
      </div>
    ) : (
      <div className="tp2-text">
        {s.title && <h2 className="tp2-h2" style={{ maxWidth: 720, margin: s.body ? '0 0 18px' : 0 }}>{s.title}</h2>}
        {s.body && <p className="tp2-text-body">{s.body}</p>}
      </div>
    );

  const reviewCard = (r: ReviewPublic) => (
    <>
      <span className="tp2-review-stars" aria-label={`${r.rating}/5`}>{'★'.repeat(Math.max(0, Math.min(5, r.rating)))}<i>{'★'.repeat(5 - Math.max(0, Math.min(5, r.rating)))}</i></span>
      <span className="tp2-review-text">“{r.comment}”</span>
      <span className="tp2-review-meta">{[r.reviewer, r.workshop_title].filter(Boolean).join(' · ')}</span>
    </>
  );

  const renderReviews = (s: Extract<ProfileSection, { kind: 'reviews' }>) => {
    const byId = new Map(reviews.map((r) => [r.id, r]));
    if (!editing) {
      const picked = s.ids.map((rid) => byId.get(rid)).filter((r): r is ReviewPublic => !!r);
      return (
        <div className="tp2-reviews">
          {picked.map((r) => (
            <div key={r.id} className="tp2-review">{reviewCard(r)}</div>
          ))}
        </div>
      );
    }
    return (
      <>
        <div className="tp2-field-label" style={{ marginBottom: 12 }}>
          {th ? `เลือกรีวิวที่จะแสดง (${s.ids.length}/${MAX_REVIEWS}) — แสดงตามลำดับที่เลือก` : `Pick reviews to show (${s.ids.length}/${MAX_REVIEWS}) — shown in the order picked`}
        </div>
        {reviews.length === 0 ? (
          <div className="tp2-empty-hint">{th ? 'ยังไม่มีรีวิวที่มีข้อความจากผู้เข้าร่วม — เมื่อมีคนรีวิวกิจกรรมของคุณ จะมาให้เลือกตรงนี้' : 'No written reviews yet — they will show up here to pick from'}</div>
        ) : (
          <div className="tp2-reviews pick">
            {reviews.map((r) => {
              const n = s.ids.indexOf(r.id);
              const full = n < 0 && s.ids.length >= MAX_REVIEWS;
              return (
                <button key={r.id} type="button" className={`tp2-review ${n >= 0 ? 'on' : ''}`} disabled={full} onClick={() => toggleReview(s.id, r.id)} aria-pressed={n >= 0}>
                  <span className="tp2-review-pick">{n >= 0 ? n + 1 : '+'}</span>
                  {reviewCard(r)}
                </button>
              );
            })}
          </div>
        )}
      </>
    );
  };

  const renderGallery = (s: Extract<ProfileSection, { kind: 'gallery' }>) => {
    const shown = s.images.filter((g) => g.url);
    if (!editing) return <GallerySlider images={shown} th={th} />;
    return (
      <div className="tp2-gal-edit">
        {s.images.map((g, i) => (
          <div key={i} className="tp2-gal-item">
            <div className="tp2-gal-item-top">
              <span className="tp2-field-label">{th ? `รูปที่ ${i + 1}` : `Photo ${i + 1}`}</span>
              <span style={{ flex: 1 }} />
              <button type="button" className="tp2-secbtn" disabled={i === 0} onClick={() => moveImage(s.id, i, -1)} aria-label={th ? 'เลื่อนขึ้น' : 'Move up'}>↑</button>
              <button type="button" className="tp2-secbtn" disabled={i === s.images.length - 1} onClick={() => moveImage(s.id, i, 1)} aria-label={th ? 'เลื่อนลง' : 'Move down'}>↓</button>
              <button type="button" className="tp2-secbtn tp2-secbtn-del" onClick={() => removeImage(s.id, i)}>✕ {th ? 'ลบรูป' : 'Remove'}</button>
            </div>
            <ImageUploader
              value={g.url}
              meta={g.meta}
              onChange={({ url, meta }) => patchImage(s.id, i, { url, meta })}
              folder="portfolio"
              primary={ASPECTS.HOST_GALLERY}
              label={th ? 'อัปโหลดรูป' : 'Upload a photo'}
            />
            <label className="tp2-field">
              <span className="tp2-field-label">{th ? `คำบรรยายใต้รูป (1 บรรทัด) · ${g.caption.length}/${LIMITS.caption}` : `Caption (one line) · ${g.caption.length}/${LIMITS.caption}`}</span>
              <input className="tp2-input" maxLength={LIMITS.caption} value={g.caption} placeholder={th ? 'เช่น จุดเริ่มต้นของกิจกรรม' : 'e.g. Where it all started'} onChange={(e) => patchImage(s.id, i, { caption: e.target.value.replace(/\n/g, ' ') })} />
            </label>
          </div>
        ))}
        {s.images.length < MAX_GALLERY && (
          <button type="button" className="tp2-add" onClick={() => addImage(s.id)}>
            + {th ? `เพิ่มรูป (${s.images.length}/${MAX_GALLERY})` : `Add a photo (${s.images.length}/${MAX_GALLERY})`}
          </button>
        )}
        {shown.length > 0 && (
          <div style={{ marginTop: 24 }}>
            <div className="tp2-field-label" style={{ marginBottom: 10 }}>{th ? 'ตัวอย่างที่ผู้เข้าชมจะเห็น' : 'What visitors will see'}</div>
            <GallerySlider images={shown} th={th} />
          </div>
        )}
      </div>
    );
  };

  const renderSection = (s: ProfileSection, i: number) => {
    if (s.kind === 'belief') {
      return (
        <section className="tp2-band">
          <span aria-hidden="true" className="tm-cta-star" style={{ left: -30, bottom: -40, fontSize: 190 }}>✺</span>
          <div className="tp2-wrap" style={{ position: 'relative' }}>
            {editing && sectionTools(s, i, true)}
            {editing ? (
              <label className="tp2-field">
                <span className="tp2-field-label" style={{ color: 'rgba(255,255,255,.7)' }}>{th ? 'ความเชื่อของคุณ (ประโยคเดียว จะแสดงเป็นคำพูดบนแถบนี้ เว้นว่างเพื่อซ่อน)' : 'Your belief — one line, shown as a quote on this band; blank hides it'}</span>
                <textarea className="tp2-input tp2-input-belief" rows={3} maxLength={LIMITS.belief} value={s.text} placeholder={th ? 'บอกเราหน่อยว่าประโยคเด็ดของคุณคืออะไร' : 'Tell us your signature line'} onChange={(e) => updateSection(s.id, (x) => (x.kind === 'belief' ? { ...x, text: e.target.value } : x))} />
              </label>
            ) : (
              <p className="tp2-belief">“{s.text}”</p>
            )}
            <div className="tm-meta tp2-sign">— {display} · {th ? 'ผู้จัด' : 'host'} —</div>
          </div>
        </section>
      );
    }
    return (
      <section className="tp2-section">
        <div className="tp2-wrap">
          {editing && sectionTools(s, i)}
          {s.kind === 'text' ? (
            renderText(s)
          ) : (
            <>
              {sectionHead(s)}
              {s.kind === 'takeaways'
                ? renderTakeaways(s)
                : s.kind === 'journey'
                  ? renderJourney(s)
                  : s.kind === 'reviews'
                    ? renderReviews(s)
                    : renderGallery(s)}
            </>
          )}
        </div>
      </section>
    );
  };

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
              {editing ? (
                <label className="tp2-field" style={{ marginTop: 22 }}>
                  <span className="tp2-field-label">{th ? 'ประโยคแนะนำตัว (ใต้ชื่อ)' : 'Promise line (under the name)'}</span>
                  <textarea
                    className="tp2-input tp2-input-promise"
                    rows={3}
                    maxLength={PROMISE_MAX}
                    value={profile.promise}
                    placeholder={teacher.bio || (th ? 'เช่น เปลี่ยนเรื่องยาก ให้เป็นเรื่องง่ายเพื่อเทคนิคที่สนุกและทำได้จริง' : 'e.g. Turning the hard parts into easy, fun techniques you can really use')}
                    onChange={(e) => patch({ promise: e.target.value.replace(/\n{2,}/g, '\n') })}
                  />
                  <span className="tp2-field-hint">
                    {th ? `แสดงได้ไม่เกิน 3 บรรทัด · ${profile.promise.length}/${PROMISE_MAX} ตัวอักษร · เว้นว่างได้ จะใช้ bio จากโปรไฟล์แทน` : `Shows at most 3 lines · ${profile.promise.length}/${PROMISE_MAX} · leave empty to fall back to your bio`}
                  </span>
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
                <span className="tm-meta">{th ? 'ปีที่จัดกิจกรรม (เว้นว่างเพื่อซ่อน)' : 'years teaching (blank hides it)'}</span>
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

      {/* Editor bar — pinned to the bottom of the screen while editing, so
          save is always one reach away wherever the teacher has scrolled */}
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

      {/* The host's own sections, in the order they arranged them. While
          editing, the add box rides in the same list and can be dragged too. */}
      {(() => {
        const addAt = addIndexOf(profile.sections);
        const full = profile.sections.length >= MAX_SECTIONS;
        const items: { key: string; i: number; box: boolean }[] = profile.sections.map((s, i) => ({ key: s.id, i, box: false }));
        if (editing) items.splice(addAt, 0, { key: ADD_ID, i: addAt, box: true });
        const dragProps = (key: string, i: number) => ({
          draggable: editing && armed === key,
          onDragStart: (e: DragEvent) => {
            setDragId(key);
            e.dataTransfer.effectAllowed = 'move';
          },
          onDragOver: (e: DragEvent) => {
            if (!dragId) return;
            e.preventDefault();
            const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
            setDropAt(e.clientY < r.top + r.height / 2 ? i : i + 1);
          },
          onDrop: (e: DragEvent) => {
            e.preventDefault();
            if (dragId === ADD_ID && dropAt !== null) moveAddBox(dropAt);
            else if (dragId && dropAt !== null) moveSection(dragId, dropAt);
          },
          onDragEnd: () => {
            setDragId(null);
            setDropAt(null);
            setArmed(null);
          },
        });
        return items.map(({ key, i, box }) => {
          if (box) {
            return (
              <div key={key} className={`tp2-sec ${dragId === ADD_ID ? 'dragging' : ''}`} {...dragProps(ADD_ID, i)} onDragOver={undefined} onDrop={undefined}>
                <section className="tp2-section">
                  <div className="tp2-wrap">
                    <div className="tp2-addsec">
                      <div className="tp2-addsec-head">
                        <span
                          className="tp2-grip"
                          onPointerDown={() => setArmed(ADD_ID)}
                          onPointerUp={() => setArmed(null)}
                          title={th ? 'กดค้างแล้วลากเพื่อย้ายกล่องนี้' : 'Hold and drag to move this box'}
                          aria-hidden="true"
                        >
                          ⠿
                        </span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="tp2-addsec-title">{th ? 'เพิ่มส่วนใหม่ตรงนี้' : 'Add a section here'}</div>
                          <div className="tp2-addsec-sub">
                            {th ? 'ส่วนที่เพิ่มจะแทรกตรงตำแหน่งกล่องนี้ — ลาก ⠿ หรือกด ↑ ↓ เพื่อย้ายกล่องไปที่อื่น' : 'New sections land where this box sits — drag ⠿ or use ↑ ↓ to move it'}
                          </div>
                        </div>
                        <span className="tp2-addsec-count">{profile.sections.length}/{MAX_SECTIONS}</span>
                        <button type="button" className="tp2-secbtn" disabled={addAt === 0} onClick={() => moveAddBox(addAt - 1)} aria-label={th ? 'ย้ายกล่องขึ้น' : 'Move box up'}>↑</button>
                        <button type="button" className="tp2-secbtn" disabled={addAt >= profile.sections.length} onClick={() => moveAddBox(addAt + 1)} aria-label={th ? 'ย้ายกล่องลง' : 'Move box down'}>↓</button>
                      </div>
                      <div className="tp2-addsec-grid">
                        {(['takeaways', 'journey', 'belief', 'text', 'reviews', 'gallery'] as SectionKind[]).map((k) => (
                          <button key={k} type="button" className="tp2-addcard" disabled={full} onClick={() => addSection(k)}>
                            <span className={`tp2-addcard-art art-${k}`} aria-hidden="true">
                              {k === 'takeaways' && (
                                <>
                                  <i><b>01</b><em style={{ width: '70%' }} /></i>
                                  <i><b>02</b><em style={{ width: '52%' }} /></i>
                                  <i><b>03</b><em style={{ width: '62%' }} /></i>
                                </>
                              )}
                              {k === 'journey' && (
                                <>
                                  <i><b /><em style={{ width: '58%' }} /></i>
                                  <i><b /><em style={{ width: '72%' }} /></i>
                                  <i><b /><em style={{ width: '48%' }} /></i>
                                </>
                              )}
                              {k === 'belief' && <span className="tp2-addcard-quote">“ ”</span>}
                              {k === 'text' && (
                                <>
                                  <i><em style={{ width: '46%', height: 9, background: 'rgba(13,30,29,.45)' }} /></i>
                                  <i><em style={{ width: '88%' }} /></i>
                                  <i><em style={{ width: '74%' }} /></i>
                                </>
                              )}
                              {k === 'reviews' && (
                                <>
                                  <i><b className="star">★★★★★</b></i>
                                  <i><em style={{ width: '80%' }} /></i>
                                  <i><em style={{ width: '40%' }} /></i>
                                </>
                              )}
                              {k === 'gallery' && <span className="tp2-addcard-photo"><span>‹</span><i /><span>›</span></span>}
                            </span>
                            <span className="tp2-addcard-name">{KIND_LABEL[k]}</span>
                            <span className="tp2-addcard-desc">{KIND_HINT[k]}</span>
                            <span className="tp2-addcard-plus">+ {th ? 'เพิ่ม' : 'Add'}</span>
                          </button>
                        ))}
                      </div>
                      {full && <div className="tp2-addsec-sub" style={{ marginTop: 12 }}>{th ? `ครบ ${MAX_SECTIONS} ส่วนแล้ว — ลบส่วนที่ไม่ใช้ก่อนเพื่อเพิ่มใหม่` : `All ${MAX_SECTIONS} sections used — remove one to add another`}</div>}
                    </div>
                  </div>
                </section>
              </div>
            );
          }
          const s = profile.sections[i];
          return (
            <div
              key={key}
              className={`tp2-sec ${dragId === key ? 'dragging' : ''} ${dropAt === i && dragId && dragId !== key ? 'drop-before' : ''} ${dropAt === i + 1 && dragId && dragId !== key ? 'drop-after' : ''}`}
              {...dragProps(key, i)}
            >
              {renderSection(s, i)}
            </div>
          );
        });
      })()}

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
        {(editing || profile.socials.length > 0) && (
          <div className="tp2-wrap" style={{ position: 'relative', marginTop: 30 }}>
            <span className="tm-eyebrow" style={{ color: 'rgba(255,255,255,.7)' }}>{th ? 'ช่องทางติดต่อ' : 'Find them on'}</span>
            {editing ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12, maxWidth: 640 }}>
                {profile.socials.map((s, i) => (
                  <div key={i} className="tp2-social-edit">
                    <select className="tp2-input tp2-social-kind" value={s.kind} onChange={(e) => patchSocial(i, { kind: e.target.value as SocialLink['kind'] })}>
                      {SOCIAL_KINDS.map((k) => (
                        <option key={k} value={k}>{SOCIAL_LABEL[k]}</option>
                      ))}
                    </select>
                    <input className="tp2-input tp2-social-url" maxLength={LIMITS.url} value={s.url} placeholder={s.kind === 'line' ? 'https://line.me/ti/p/…' : 'https://…'} onChange={(e) => patchSocial(i, { url: e.target.value })} />
                    <button type="button" className="tp2-remove" style={{ color: 'var(--accent)' }} onClick={() => removeSocial(i)} aria-label={th ? 'ลบช่องทางนี้' : 'Remove this link'}>✕</button>
                  </div>
                ))}
                {profile.socials.length < MAX_SOCIALS && (
                  <button type="button" className="tp2-add" style={{ color: '#fff', borderColor: 'rgba(255,255,255,.5)' }} onClick={addSocial}>
                    + {th ? 'เพิ่มช่องทาง' : 'Add a link'}
                  </button>
                )}
              </div>
            ) : (
              <div className="tp2-socials">
                {profile.socials.map((s, i) => (
                  <a key={i} href={s.url} target="_blank" rel="noopener noreferrer" className="tp2-social" aria-label={SOCIAL_LABEL[s.kind]} title={SOCIAL_LABEL[s.kind]}>
                    <SocialIcon kind={s.kind} size={20} />
                  </a>
                ))}
              </div>
            )}
          </div>
        )}
      </section>
      )}
    </div>
  );
}
