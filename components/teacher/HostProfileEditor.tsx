'use client';

/**
 * The editor for a host's public page (/hosts/[id]). It sits in a panel beside
 * the live page, which keeps rendering the draft as visitors will see it.
 *
 * Every field reports a "spot" key when focused (see `onSpot`). The page tags
 * the matching element with `data-ek="<key>"`, scrolls to it and highlights
 * it, so the host always sees where what they type will appear.
 *
 * Spot keys: `promise`, `years`, `socials`, `sec:<id>`, `sec:<id>:eyebrow`,
 * `sec:<id>:title`, `sec:<id>:text`, `sec:<id>:item:<n>`.
 */
import { useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import {
  LIMITS,
  MAX_JOURNEY,
  MAX_SECTIONS,
  MAX_SOCIALS,
  MAX_TAKEAWAYS,
  SOCIAL_KINDS,
  SOCIAL_LABEL,
  newSection,
  type JourneyStep,
  type ProfileSection,
  type SectionKind,
  type SocialLink,
  type Takeaway,
  type TeacherProfile,
} from '@/lib/teacher-profile';

/** Which accordion group is open: 'hero', 'contact' or a section id. */
export type EditorGroup = string;
type Heads = Record<'takeaways' | 'journey', { eyebrow: string; title: string }>;

type Props = {
  draft: TeacherProfile;
  setDraft: Dispatch<SetStateAction<TeacherProfile | null>>;
  th: boolean;
  /** Shown under the name when the intro is left empty. */
  bioFallback: string;
  promiseMax: number;
  /** Default eyebrow/title per section kind, in the visitor's language. */
  heads: Heads;
  /** "01", "02" … per section id, as numbered on the page. */
  sectionNo: Record<string, string>;
  open: EditorGroup | null;
  setOpen: (g: EditorGroup | null) => void;
  onSpot: (key: string | null) => void;
  saving: boolean;
  saveError: string | null;
  onSave: () => void;
  onCancel: () => void;
  /** Below the wide breakpoint the panel and the page take turns on screen. */
  mobileView: 'edit' | 'preview';
  setMobileView: (v: 'edit' | 'preview') => void;
};

/** One labelled field: a readable label, a line saying where it shows, then the input.
 *  Declared outside the editor so its inputs keep focus across re-renders. */
function Field({ label, where, children, count }: { label: string; where: string; children: ReactNode; count?: string }) {
  return (
    <label className="hpe-field">
      <span className="hpe-label">
        {label}
        {count && <span className="hpe-count">{count}</span>}
      </span>
      <span className="hpe-where">{where}</span>
      {children}
    </label>
  );
}

/** A tiny picture of what a section kind looks like on the page. */
function KindArt({ kind }: { kind: SectionKind }) {
  return (
    <span className={`hpe-kind-art art-${kind}`} aria-hidden="true">
      {kind === 'belief' ? (
        <span className="hpe-kind-quote">“ ”</span>
      ) : (
        <>
          <i><b>{kind === 'takeaways' ? '01' : ''}</b><em style={{ width: '70%' }} /></i>
          <i><b>{kind === 'takeaways' ? '02' : ''}</b><em style={{ width: '50%' }} /></i>
          <i><b>{kind === 'takeaways' ? '03' : ''}</b><em style={{ width: '62%' }} /></i>
        </>
      )}
    </span>
  );
}

export function HostProfileEditor({
  draft,
  setDraft,
  th,
  bioFallback,
  promiseMax,
  heads,
  sectionNo,
  open,
  setOpen,
  onSpot,
  saving,
  saveError,
  onSave,
  onCancel,
  mobileView,
  setMobileView,
}: Props) {
  const [picking, setPicking] = useState(false);
  // Reordering by drag: a row is draggable only while its handle is held.
  const [armed, setArmed] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);

  const KIND_LABEL: Record<SectionKind, string> = th
    ? { takeaways: 'สิ่งที่คุณจะได้กลับไป', journey: 'เส้นทาง (ไทม์ไลน์)', belief: 'คำพูด (แถบสีเข้ม)' }
    : { takeaways: 'What you take home', journey: 'Path (timeline)', belief: 'Quote (dark band)' };
  const KIND_HINT: Record<SectionKind, string> = th
    ? { takeaways: 'รายการข้อ 01 02 03 บอกว่าผู้เข้าร่วมจะได้อะไร', journey: 'ไทม์ไลน์ตามปี เล่าเส้นทางที่ผ่านมา', belief: 'ประโยคเดียวบนแถบสีเข้ม เต็มความกว้างหน้า' }
    : { takeaways: 'Numbered points on what people leave with', journey: 'A timeline by year of your path so far', belief: 'One line on a full-width dark band' };

  // ---- draft updates ----
  const patch = (p: Partial<TeacherProfile>) => setDraft((d) => (d ? { ...d, ...p } : d));
  const updateSection = (sid: string, fn: (s: ProfileSection) => ProfileSection) =>
    setDraft((d) => (d ? { ...d, sections: d.sections.map((s) => (s.id === sid ? fn(s) : s)) } : d));
  const patchHead = (sid: string, p: { eyebrow?: string; title?: string }) => updateSection(sid, (s) => (s.kind === 'belief' ? s : { ...s, ...p }));
  const patchTake = (sid: string, i: number, p: Partial<Takeaway>) =>
    updateSection(sid, (s) => (s.kind === 'takeaways' ? { ...s, items: s.items.map((t, j) => (j === i ? { ...t, ...p } : t)) } : s));
  const patchStep = (sid: string, i: number, p: Partial<JourneyStep>) =>
    updateSection(sid, (s) => (s.kind === 'journey' ? { ...s, items: s.items.map((t, j) => (j === i ? { ...t, ...p } : t)) } : s));
  const removeItem = (sid: string, i: number) =>
    updateSection(sid, (s) => {
      if (s.kind === 'takeaways') return { ...s, items: s.items.filter((_, j) => j !== i) };
      if (s.kind === 'journey') return { ...s, items: s.items.filter((_, j) => j !== i) };
      return s;
    });
  const addItem = (sid: string) =>
    updateSection(sid, (s) => {
      if (s.kind === 'takeaways' && s.items.length < MAX_TAKEAWAYS) return { ...s, items: [...s.items, { title: '', body: '' }] };
      if (s.kind === 'journey' && s.items.length < MAX_JOURNEY) return { ...s, items: [...s.items, { year: '', title: '', body: '' }] };
      return s;
    });
  /** Move section `sid` so it lands before position `to` (0…length). */
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
  const removeSection = (sid: string) => {
    const s = draft.sections.find((x) => x.id === sid);
    const filled = s && (s.kind === 'belief' ? !!s.text.trim() : s.items.some((t) => Object.values(t).some((v) => v.trim())));
    if (filled && !window.confirm(th ? 'ลบส่วนนี้ทั้งส่วน?' : 'Remove this whole section?')) return;
    setDraft((d) => (d ? { ...d, sections: d.sections.filter((x) => x.id !== sid) } : d));
    if (open === sid) setOpen(null);
  };
  /** New sections go right after the one that is open, else at the end. */
  const addSection = (kind: SectionKind) => {
    if (draft.sections.length >= MAX_SECTIONS) return;
    const s = newSection(kind);
    if (s.kind === 'takeaways') s.items = [{ title: '', body: '' }];
    if (s.kind === 'journey') s.items = [{ year: '', title: '', body: '' }];
    const openAt = draft.sections.findIndex((x) => x.id === open);
    const at = openAt >= 0 ? openAt + 1 : draft.sections.length;
    const list = [...draft.sections];
    list.splice(at, 0, s);
    setDraft({ ...draft, sections: list });
    setPicking(false);
    setOpen(s.id);
    onSpot(`sec:${s.id}`);
  };
  const patchSocial = (i: number, p: Partial<SocialLink>) => patch({ socials: draft.socials.map((t, j) => (j === i ? { ...t, ...p } : t)) });
  const removeSocial = (i: number) => patch({ socials: draft.socials.filter((_, j) => j !== i) });
  const addSocial = () => {
    if (draft.socials.length >= MAX_SOCIALS) return;
    const unused = SOCIAL_KINDS.find((k) => !draft.socials.some((s) => s.kind === k)) || 'website';
    patch({ socials: [...draft.socials, { kind: unused, url: '' }] });
  };

  const toggle = (g: EditorGroup, spotKey: string) => {
    const next = open === g ? null : g;
    setOpen(next);
    onSpot(next ? spotKey : null);
  };
  const spot = (key: string) => ({ onFocus: () => onSpot(key) });

  const sectionTitle = (s: ProfileSection) => {
    if (s.kind === 'belief') return s.text.trim() ? `“${s.text.trim()}”` : th ? 'ยังไม่ได้เขียนคำพูด' : 'No quote yet';
    return s.eyebrow || heads[s.kind].eyebrow;
  };
  const sectionMeta = (s: ProfileSection) => {
    if (s.kind === 'takeaways') return th ? `${s.items.length} ข้อ` : `${s.items.length} items`;
    if (s.kind === 'journey') return th ? `${s.items.length} ปี` : `${s.items.length} steps`;
    return '';
  };

  const renderSectionBody = (s: ProfileSection, i: number) => (
    <div className="hpe-group-body">
      {s.kind === 'belief' ? (
        <Field
          label={th ? 'คำพูดของคุณ' : 'Your words'}
          where={th ? 'แสดงตัวใหญ่บนแถบสีเข้ม และมีชื่อคุณที่มุมขวาล่าง' : 'Large type on the dark band, signed with your name'}
          count={`${s.text.length}/${LIMITS.belief}`}
        >
          <textarea
            className="hpe-input"
            rows={3}
            maxLength={LIMITS.belief}
            value={s.text}
            placeholder={th ? 'เช่น คนที่บอกว่าตัวเองวาดไม่เป็น มักมองเห็นอะไรได้ละเอียดที่สุดในห้อง' : 'e.g. The people who say they can’t draw usually see the most in the room.'}
            onChange={(e) => updateSection(s.id, (x) => (x.kind === 'belief' ? { ...x, text: e.target.value } : x))}
            {...spot(`sec:${s.id}:text`)}
          />
        </Field>
      ) : (
        <>
          <Field
            label={th ? 'หัวข้อเล็ก' : 'Small heading'}
            where={th ? `ตัวเล็กสีเขียวเหนือหัวข้อใหญ่ ระบบใส่ "${sectionNo[s.id]} —" ข้างหน้าให้เอง` : `Small green line above the heading, after "${sectionNo[s.id]} —"`}
          >
            <input className="hpe-input" maxLength={LIMITS.eyebrow} value={s.eyebrow} placeholder={heads[s.kind].eyebrow} onChange={(e) => patchHead(s.id, { eyebrow: e.target.value })} {...spot(`sec:${s.id}:eyebrow`)} />
          </Field>
          <Field label={th ? 'หัวข้อใหญ่' : 'Heading'} where={th ? 'ตัวใหญ่ของส่วนนี้ เว้นว่างจะใช้ข้อความตัวอย่างสีเทา' : 'The big line of this section; blank uses the grey sample'}>
            <input className="hpe-input hpe-input-big" maxLength={LIMITS.title} value={s.title} placeholder={heads[s.kind].title} onChange={(e) => patchHead(s.id, { title: e.target.value })} {...spot(`sec:${s.id}:title`)} />
          </Field>

          <div className="hpe-items-head">
            <span className="hpe-label">{s.kind === 'takeaways' ? (th ? 'รายการข้อ' : 'Items') : th ? 'แต่ละปี' : 'Steps'}</span>
            <span className="hpe-where">
              {s.kind === 'takeaways' ? (th ? 'ขึ้นเป็นข้อ 01 02 03 ตามลำดับนี้' : 'Shown as 01, 02, 03 in this order') : th ? 'หน้าเว็บเรียงตามปีให้เอง' : 'The page sorts them by year'}
            </span>
          </div>
          {s.items.map((k, j) => (
            <div key={j} className="hpe-item">
              <div className="hpe-item-top">
                <span className="hpe-item-no">{s.kind === 'takeaways' ? `${th ? 'ข้อ' : 'Item'} ${String(j + 1).padStart(2, '0')}` : `${th ? 'ปีที่' : 'Step'} ${j + 1}`}</span>
                <button type="button" className="hpe-x" onClick={() => removeItem(s.id, j)} aria-label={th ? 'ลบข้อนี้' : 'Remove'}>
                  ✕ {th ? 'ลบ' : 'Remove'}
                </button>
              </div>
              {s.kind === 'journey' && (
                <input
                  className="hpe-input hpe-input-year"
                  maxLength={LIMITS.year}
                  value={(k as JourneyStep).year}
                  placeholder={th ? 'ปี เช่น 2017' : 'Year, e.g. 2017'}
                  onChange={(e) => patchStep(s.id, j, { year: e.target.value })}
                  {...spot(`sec:${s.id}:item:${j}`)}
                />
              )}
              <input
                className="hpe-input hpe-input-big"
                maxLength={LIMITS.title}
                value={k.title}
                placeholder={s.kind === 'takeaways' ? (th ? 'หัวข้อ เช่น มือที่ช้าลง' : 'Title, e.g. A slower hand') : th ? 'หัวข้อ เช่น เริ่มจัดกิจกรรมครั้งแรก' : 'Title, e.g. First class taught'}
                onChange={(e) => (s.kind === 'takeaways' ? patchTake(s.id, j, { title: e.target.value }) : patchStep(s.id, j, { title: e.target.value }))}
                {...spot(`sec:${s.id}:item:${j}`)}
              />
              <textarea
                className="hpe-input"
                rows={2}
                maxLength={s.kind === 'takeaways' ? LIMITS.body : LIMITS.journeyBody}
                value={k.body}
                placeholder={s.kind === 'takeaways' ? (th ? 'รายละเอียดสั้น ๆ' : 'A sentence or two') : th ? 'เล่าสั้น ๆ' : 'A short story'}
                onChange={(e) => (s.kind === 'takeaways' ? patchTake(s.id, j, { body: e.target.value }) : patchStep(s.id, j, { body: e.target.value }))}
                {...spot(`sec:${s.id}:item:${j}`)}
              />
            </div>
          ))}
          {s.items.length < (s.kind === 'takeaways' ? MAX_TAKEAWAYS : MAX_JOURNEY) && (
            <button type="button" className="hpe-add" onClick={() => addItem(s.id)}>
              + {s.kind === 'takeaways' ? (th ? 'เพิ่มข้อ' : 'Add item') : th ? 'เพิ่มปี' : 'Add a year'}
              <span className="hpe-add-n">
                {s.items.length}/{s.kind === 'takeaways' ? MAX_TAKEAWAYS : MAX_JOURNEY}
              </span>
            </button>
          )}
        </>
      )}
      <div className="hpe-sec-actions">
        <button type="button" className="hpe-ghost" disabled={i === 0} onClick={() => moveSection(s.id, i - 1)}>↑ {th ? 'ย้ายขึ้น' : 'Up'}</button>
        <button type="button" className="hpe-ghost" disabled={i === draft.sections.length - 1} onClick={() => moveSection(s.id, i + 2)}>↓ {th ? 'ย้ายลง' : 'Down'}</button>
        <span style={{ flex: 1 }} />
        <button type="button" className="hpe-ghost hpe-danger" onClick={() => removeSection(s.id)}>✕ {th ? 'ลบส่วนนี้' : 'Remove section'}</button>
      </div>
    </div>
  );

  const openIsSection = !!open && draft.sections.some((x) => x.id === open);

  return (
    <aside className="hpe" data-view={mobileView} aria-label={th ? 'แก้ไขหน้าโปรไฟล์' : 'Edit profile page'}>
      <header className="hpe-head">
        <div style={{ minWidth: 0 }}>
          <div className="hpe-title">{th ? 'แก้ไขหน้าโปรไฟล์' : 'Edit your page'}</div>
          <div className="hpe-sub">{th ? 'กดช่องไหน หน้าตัวอย่างจะชี้ให้ดูว่าแสดงตรงไหน' : 'Click any box and the preview shows where it appears'}</div>
        </div>
        <div className="hpe-tabs">
          <button type="button" className={mobileView === 'edit' ? 'on' : ''} onClick={() => setMobileView('edit')}>{th ? 'แก้ไข' : 'Edit'}</button>
          <button type="button" className={mobileView === 'preview' ? 'on' : ''} onClick={() => setMobileView('preview')}>{th ? 'ดูตัวอย่าง' : 'Preview'}</button>
        </div>
      </header>

      <div className="hpe-body">
        {/* Hero */}
        <section className={`hpe-group ${open === 'hero' ? 'open' : ''}`}>
          <div className="hpe-group-head-row">
            <button type="button" className="hpe-group-head" onClick={() => toggle('hero', 'promise')} aria-expanded={open === 'hero'}>
              <span className="hpe-badge">◎</span>
              <span className="hpe-group-text">
                <span className="hpe-group-title">{th ? 'ส่วนหัว' : 'Top of the page'}</span>
                <span className="hpe-group-sum">{th ? 'คำแนะนำตัวใต้ชื่อ · จำนวนปีที่จัด' : 'Intro under your name · years hosting'}</span>
              </span>
              <span className="hpe-chev" aria-hidden="true">›</span>
            </button>
          </div>
          {open === 'hero' && (
            <div className="hpe-group-body">
              <Field
                label={th ? 'คำแนะนำตัว' : 'Your intro'}
                where={th ? 'อยู่ใต้ชื่อ แสดงได้ไม่เกิน 3 บรรทัด เว้นว่างจะใช้ bio จากโปรไฟล์' : 'Under your name, at most 3 lines; blank uses your profile bio'}
                count={`${draft.promise.length}/${promiseMax}`}
              >
                <textarea
                  className="hpe-input"
                  rows={3}
                  maxLength={promiseMax}
                  value={draft.promise}
                  placeholder={bioFallback || (th ? 'เช่น ผมไม่ได้สอนให้วาดสวย ผมสอนให้มองนานพอ…' : 'e.g. I don’t teach pretty drawings…')}
                  onChange={(e) => patch({ promise: e.target.value.replace(/\n{2,}/g, '\n') })}
                  {...spot('promise')}
                />
              </Field>
              <Field label={th ? 'จัดกิจกรรมมากี่ปี' : 'Years hosting'} where={th ? 'ตัวเลขใหญ่ในแถวสถิติ เว้นว่างเพื่อซ่อน' : 'A big number in the stats row; blank hides it'}>
                <input
                  className="hpe-input hpe-input-num"
                  type="number"
                  min={0}
                  max={LIMITS.years}
                  value={draft.years ?? ''}
                  placeholder="—"
                  onChange={(e) => patch({ years: e.target.value === '' ? null : Number(e.target.value) })}
                  {...spot('years')}
                />
              </Field>
            </div>
          )}
        </section>

        {/* Sections */}
        <div className="hpe-divider">
          <span>{th ? 'ส่วนเนื้อหา' : 'Sections'}</span>
          <span className="hpe-divider-hint">{th ? 'ลาก ⠿ เพื่อสลับลำดับ' : 'Drag ⠿ to reorder'}</span>
        </div>
        {draft.sections.length === 0 && <div className="hpe-empty">{th ? 'ยังไม่มีส่วนเนื้อหา กด "เพิ่มส่วน" ด้านล่างเพื่อเริ่ม' : 'No sections yet — add one below'}</div>}
        {draft.sections.map((s, i) => (
          <section
            key={s.id}
            className={`hpe-group ${open === s.id ? 'open' : ''} ${dragId === s.id ? 'dragging' : ''} ${dragId && dragId !== s.id && dropAt === i ? 'drop-before' : ''} ${dragId && dragId !== s.id && dropAt === i + 1 ? 'drop-after' : ''}`}
            draggable={armed === s.id}
            onDragStart={(e) => {
              setDragId(s.id);
              e.dataTransfer.effectAllowed = 'move';
            }}
            onDragOver={(e) => {
              if (!dragId) return;
              e.preventDefault();
              const r = e.currentTarget.getBoundingClientRect();
              setDropAt(e.clientY < r.top + r.height / 2 ? i : i + 1);
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (dragId && dropAt !== null) moveSection(dragId, dropAt);
            }}
            onDragEnd={() => {
              setDragId(null);
              setDropAt(null);
              setArmed(null);
            }}
          >
            <div className="hpe-group-head-row">
              <span className="hpe-grip" onPointerDown={() => setArmed(s.id)} onPointerUp={() => setArmed(null)} title={th ? 'กดค้างแล้วลากเพื่อย้าย' : 'Hold and drag to move'} aria-hidden="true">
                ⠿
              </span>
              <button type="button" className="hpe-group-head" onClick={() => toggle(s.id, `sec:${s.id}`)} aria-expanded={open === s.id}>
                <span className={`hpe-badge kind-${s.kind}`}>{s.kind === 'belief' ? '“' : sectionNo[s.id]}</span>
                <span className="hpe-group-text">
                  <span className="hpe-group-title">{sectionTitle(s)}</span>
                  <span className="hpe-group-sum">
                    {s.kind === 'belief' ? KIND_LABEL.belief : `${sectionMeta(s)} · ${s.title || heads[s.kind].title}`}
                  </span>
                </span>
                <span className="hpe-chev" aria-hidden="true">›</span>
              </button>
            </div>
            {open === s.id && renderSectionBody(s, i)}
          </section>
        ))}

        {picking ? (
          <div className="hpe-picker">
            <div className="hpe-picker-head">
              <span className="hpe-label">{th ? 'เลือกชนิดของส่วนใหม่' : 'Pick a kind'}</span>
              <button type="button" className="hpe-x" onClick={() => setPicking(false)}>{th ? 'ปิด' : 'Close'}</button>
            </div>
            <span className="hpe-where">
              {openIsSection
                ? th ? 'จะเพิ่มต่อจากส่วนที่เปิดอยู่ ลากย้ายได้ทีหลัง' : 'Added right after the open section; drag it later'
                : th ? 'จะเพิ่มไว้ท้ายสุด ลากย้ายได้ทีหลัง' : 'Added at the end; drag it anywhere later'}
            </span>
            {(['takeaways', 'journey', 'belief'] as SectionKind[]).map((k) => (
              <button key={k} type="button" className="hpe-kind" onClick={() => addSection(k)}>
                <KindArt kind={k} />
                <span className="hpe-group-text">
                  <span className="hpe-group-title">{KIND_LABEL[k]}</span>
                  <span className="hpe-group-sum">{KIND_HINT[k]}</span>
                </span>
                <span className="hpe-kind-plus">+</span>
              </button>
            ))}
          </div>
        ) : (
          <button type="button" className="hpe-add hpe-add-sec" disabled={draft.sections.length >= MAX_SECTIONS} onClick={() => setPicking(true)}>
            + {th ? 'เพิ่มส่วน' : 'Add a section'}
            <span className="hpe-add-n">{draft.sections.length}/{MAX_SECTIONS}</span>
          </button>
        )}

        {/* Contact */}
        <div className="hpe-divider">
          <span>{th ? 'ท้ายหน้า' : 'Bottom of the page'}</span>
        </div>
        <section className={`hpe-group ${open === 'contact' ? 'open' : ''}`}>
          <div className="hpe-group-head-row">
            <button type="button" className="hpe-group-head" onClick={() => toggle('contact', 'socials')} aria-expanded={open === 'contact'}>
              <span className="hpe-badge">@</span>
              <span className="hpe-group-text">
                <span className="hpe-group-title">{th ? 'ช่องทางติดต่อ' : 'Contact links'}</span>
                <span className="hpe-group-sum">
                  {draft.socials.length ? draft.socials.map((s) => SOCIAL_LABEL[s.kind]).join(' · ') : th ? 'ยังไม่มี — ถ้าไม่ใส่ แถบติดต่อจะไม่แสดง' : 'None — the contact band stays hidden'}
                </span>
              </span>
              <span className="hpe-chev" aria-hidden="true">›</span>
            </button>
          </div>
          {open === 'contact' && (
            <div className="hpe-group-body">
              <span className="hpe-where">{th ? 'แสดงเป็นไอคอนกลมบนแถบสีเข้มท้ายหน้า ใต้หัวข้อ "ติดต่อ … เพื่อสอบถามเพิ่มเติม"' : 'Round icons on the dark band at the bottom'}</span>
              {draft.socials.map((s, i) => (
                <div key={i} className="hpe-social">
                  <select className="hpe-input hpe-social-kind" value={s.kind} onChange={(e) => patchSocial(i, { kind: e.target.value as SocialLink['kind'] })} {...spot('socials')}>
                    {SOCIAL_KINDS.map((k) => (
                      <option key={k} value={k}>{SOCIAL_LABEL[k]}</option>
                    ))}
                  </select>
                  <input className="hpe-input" maxLength={LIMITS.url} value={s.url} placeholder={s.kind === 'line' ? 'https://line.me/ti/p/…' : 'https://…'} onChange={(e) => patchSocial(i, { url: e.target.value })} {...spot('socials')} />
                  <button type="button" className="hpe-x" onClick={() => removeSocial(i)} aria-label={th ? 'ลบช่องทางนี้' : 'Remove this link'}>✕</button>
                </div>
              ))}
              {draft.socials.length < MAX_SOCIALS && (
                <button type="button" className="hpe-add" onClick={addSocial}>
                  + {th ? 'เพิ่มช่องทาง' : 'Add a link'}
                  <span className="hpe-add-n">{draft.socials.length}/{MAX_SOCIALS}</span>
                </button>
              )}
            </div>
          )}
        </section>
        <div className="hpe-note">{th ? 'กิจกรรมที่จัดและปฏิทินรอบ ระบบดึงจากรอบที่เปิดให้เอง' : 'Your journeys and round calendar come from your open rounds automatically.'}</div>
      </div>

      <footer className="hpe-foot">
        {saveError && <div className="hpe-err">{saveError}</div>}
        <div className="hpe-foot-row">
          <button type="button" className="btn btn-paper btn-sm" onClick={onCancel} disabled={saving}>{th ? 'ยกเลิก' : 'Cancel'}</button>
          <button type="button" className="btn btn-teal btn-sm" style={{ flex: 1 }} onClick={onSave} disabled={saving}>
            {saving ? (th ? 'กำลังบันทึก…' : 'Saving…') : th ? 'บันทึกและเผยแพร่' : 'Save and publish'}
          </button>
        </div>
      </footer>
    </aside>
  );
}

export default HostProfileEditor;
