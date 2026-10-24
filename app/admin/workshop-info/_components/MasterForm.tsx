'use client';

import { useEffect, useMemo, useState } from 'react';
import { parseTiers, isGroupTier, type PriceTier } from '@/lib/pricing';
import { ImageUploader } from '@/components/admin/image/ImageUploader';
import { ASPECTS } from '@/lib/image-aspects';
import { parseImageMeta } from '@/lib/image-meta';
import { useUnsavedGuard } from '@/lib/use-unsaved-guard';
import type { ImageMeta, WorkshopMaster } from '@/lib/types';
import { AdmSelect } from '@/components/admin/pickers';
import { SheetSection } from '@/components/admin/AdminShell';
import { UnsavedDialog } from '@/components/admin/UnsavedDialog';
import { ONLINE_VENUE, venueRules } from '@/lib/online-platform';
import { ApplicationEditor } from '@/components/workshops/ApplicationEditor';
import type { ApplicationQuestion } from '@/lib/types';

const toQuestions = (json: string | null | undefined): ApplicationQuestion[] => {
  try {
    const v = json ? (JSON.parse(json) as unknown) : [];
    return Array.isArray(v) ? (v as ApplicationQuestion[]) : [];
  } catch {
    return [];
  }
};

/** What the host may pick, in words, from the ticked venues. */
function venueHint(ids: string[]): string {
  const r = venueRules(ids);
  if (r.anyPhysical) return 'ไม่เลือกเลย = ให้ผู้จัดเลือกได้ทุกสถานที่ (ยกเว้นออนไลน์)';
  const n = r.physicalIds.length;
  if (r.online && n === 0) return 'จัดออนไลน์เท่านั้น';
  if (r.online) return `เลือกแล้ว ${n} สถานที่ + ออนไลน์`;
  return `เลือกแล้ว ${n} สถานที่`;
}

function toArr(json: string | null | undefined): string[] {
  try {
    const arr = JSON.parse(json || '[]');
    return Array.isArray(arr) ? (arr as string[]) : [];
  } catch {
    return [];
  }
}

/** Add/remove list editor (matches the session form's list fields). */
function ListField({
  legend,
  items,
  onChange,
  placeholder,
}: {
  legend: string;
  items: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}) {
  return (
    <div className="adm-field">
      <span className="adm-field-label">{legend}</span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.length === 0 && (
          <p className="adm-soft-empty" style={{ padding: 12 }}>
            ยังไม่มีหัวข้อ
          </p>
        )}
        {items.map((item, idx) => (
          <div key={idx} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ width: 20, textAlign: 'center', color: 'var(--teal)', flexShrink: 0 }}>•</span>
            <input
              type="text"
              value={item}
              onChange={(e) => onChange(items.map((v, i) => (i === idx ? e.target.value : v)))}
              style={{ flex: 1, minWidth: 0 }}
              placeholder={placeholder}
              aria-label={`${legend} ${idx + 1}`}
            />
            <button type="button" onClick={() => onChange(items.filter((_, i) => i !== idx))} className="adm-icon-btn adm-minus" aria-label="ลบ">
              −
            </button>
          </div>
        ))}
        <div>
          <button type="button" onClick={() => onChange([...items, ''])} className="adm-link-btn">
            + เพิ่ม
          </button>
        </div>
      </div>
    </div>
  );
}


/** The tier rows the form opens with. A master saved before every price was
 *  a tier has only price_group — that becomes its first "ราคา/คน" row. */
function loadTiers(initial: WorkshopMaster | null | undefined): PriceTier[] {
  const tiers = parseTiers(initial?.price_tiers_json);
  if (initial?.price_group != null && !tiers.some((t) => t.mode === 'seat')) {
    return [{ id: 'base-seat', label: 'ราคา/คน', price: initial.price_group, mode: 'seat' }, ...tiers];
  }
  return tiers;
}

export function MasterForm({
  initial,
  editingId,
  onSuccess,
  onCancel,
  onDirtyChange,
  pendingClose,
  onStay, kind = 'round',}: {
  initial?: WorkshopMaster | null;
  editingId?: string;
  onSuccess: () => void;
  onCancel: () => void;
  /** Report unsaved-changes state up to the modal so it can guard close. */
  onDirtyChange?: (dirty: boolean) => void;
  /** Parent asked to close while there are unsaved edits → show the prompt. */
  pendingClose?: boolean;
  /** User chose to keep editing. */
  onStay?: () => void;
  /** 'round' (teacher opens rounds) or 'single' (admin links workshops). */
  kind?: 'round' | 'single';}) {
  const [title, setTitle] = useState(initial?.title || '');
  const [organizer, setOrganizer] = useState(initial?.organizer || '');
  const [description, setDescription] = useState(initial?.description || '');
  const [coverUrl, setCoverUrl] = useState(initial?.cover_image_url || '');
  const [coverMeta, setCoverMeta] = useState<ImageMeta | null>(parseImageMeta(initial?.cover_image_meta ?? null));
  const [target, setTarget] = useState<string[]>(toArr(initial?.target_json));
  const [takeaways, setTakeaways] = useState<string[]>(toArr(initial?.takeaways_json));
  // price_group is derived from the tiers on save (lib/pricing cardPrice);
  // it is only sent as-is for a single master, which has no tier rows.
  const [priceGroup] = useState(initial?.price_group != null ? String(initial.price_group) : '');
  // Kept as stored (migration 055) — group prices are tier rows now, so this
  // no longer has a field of its own.
  const [priceGroupBooking] = useState(initial?.price_group_booking != null ? String(initial.price_group_booking) : '');
  // Every price is a tier row, each named by the admin and sold per seat,
  // per group, or per round. A master saved when the seat price was still a
  // field of its own gets that price as its first row.
  const [tiers, setTiers] = useState<PriceTier[]>(() => loadTiers(initial));
  const [defaultSeats, setDefaultSeats] = useState(String(initial?.default_max_participants ?? 20));
  const [teachers, setTeachers] = useState<{ id: string; name: string }[]>([]);
  // Venues a round master may run at — the teacher picks one of these when
  // opening a round. None ticked = any venue.
  const [locations, setLocations] = useState<{ id: string; name: string; province: string }[]>([]);
  const [locationIds, setLocationIds] = useState<string[]>(toArr(initial?.location_ids_json));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Round activities: the application form + PDPA switch (migration 069).
  const [questions, setQuestions] = useState<ApplicationQuestion[]>(() => toQuestions(initial?.application_form));
  const [consent, setConsent] = useState(!!initial?.require_consent);

  // Unsaved-changes tracking: snapshot the loaded baseline once, then compare
  // the live fields against it so the modal can warn before discarding edits.
  const baseline = useMemo(
    () =>
      JSON.stringify({
        title: initial?.title || '',
        organizer: initial?.organizer || '',
        description: initial?.description || '',
        coverUrl: initial?.cover_image_url || '',
        coverMeta: parseImageMeta(initial?.cover_image_meta ?? null),
        target: toArr(initial?.target_json),
        takeaways: toArr(initial?.takeaways_json),
        priceGroup: initial?.price_group != null ? String(initial.price_group) : '',
        priceGroupBooking: initial?.price_group_booking != null ? String(initial.price_group_booking) : '',
        tiers: loadTiers(initial),
        defaultSeats: String(initial?.default_max_participants ?? 20),
        locationIds: toArr(initial?.location_ids_json),
        questions: toQuestions(initial?.application_form),
        consent: !!initial?.require_consent,
      }),
    [initial],
  );
  const dirty =
    JSON.stringify({ title, organizer, description, coverUrl, coverMeta, target, takeaways, priceGroup, priceGroupBooking, tiers, defaultSeats, locationIds, questions, consent }) !== baseline;
  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);
  useUnsavedGuard(dirty, 'คุณมีข้อมูลที่ยังไม่ได้บันทึก แน่ใจว่าต้องการออกจากหน้านี้?');

  useEffect(() => {
    fetch('/api/users?role=teacher,admin')
      .then((r) => r.json() as Promise<{ users: { id: string; name: string }[] }>)
      .then((d) => setTeachers(d.users || []))
      .catch(() => {});
    fetch('/api/locations')
      .then((r) => r.json() as Promise<{ locations: { id: string; name: string; province: string }[] }>)
      .then((d) => setLocations(d.locations || []))
      .catch(() => {});
  }, []);

  async function doSave(): Promise<boolean> {
    setErr(null);
    if (!title.trim()) {
      setErr('กรุณากรอกชื่อกิจกรรม');
      return false;
    }
    setSaving(true);
    try {
      const url = editingId ? `/api/workshop-masters/${editingId}` : '/api/workshop-masters';
      const res = await fetch(url, {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          organizer,
          description,
          cover_image_url: coverUrl || null,
          cover_image_meta: coverMeta,
          target: target.map((s) => s.trim()).filter(Boolean),
          takeaways: takeaways.map((s) => s.trim()).filter(Boolean),
          price_group: priceGroup.trim() === '' ? null : Number(priceGroup),
          price_private: null,
          price_group_booking: priceGroupBooking.trim() === '' ? null : Number(priceGroupBooking),
          price_tiers: tiers,
          default_max_participants: Number(defaultSeats) || 20,
          kind: initial?.kind || kind,
          location_ids: locationIds,
        }),
      });
      const data = (await res.json()) as { error?: string; id?: string };
      if (!res.ok) {
        setErr(data.error || 'บันทึกไม่สำเร็จ');
        return false;
      }
      // The form + PDPA go through the same route the host uses, so they
      // reach the activity's upcoming rounds the same way.
      const masterId = editingId || data.id;
      if ((initial?.kind || kind) === 'round' && masterId) {
        const r = await fetch(`/api/teacher/masters/${masterId}/application`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ questions, require_consent: consent }),
        });
        const a = (await r.json()) as { error?: string };
        if (!r.ok) {
          setErr(`บันทึกข้อมูลกิจกรรมแล้ว แต่ใบสมัครยังไม่บันทึก: ${a.error || 'เกิดข้อผิดพลาด'}`);
          return false;
        }
      }
      return true;
    } catch {
      setErr('บันทึกไม่สำเร็จ');
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (await doSave()) onSuccess();
  }

  // "Save & close" from the unsaved-changes prompt.
  async function saveAndClose() {
    if (await doSave()) onSuccess();
    // On failure the prompt stays open and the error banner explains why.
  }

  const isRound = (initial?.kind || kind) === 'round';
  const modeLabel: Record<PriceTier['mode'], string> = {
    seat: 'ต่อคน (1 ที่นั่ง)',
    round: 'เหมาทั้งรอบ',
    pack: 'แพ็กคงที่ (N คน)',
    range: 'กลุ่มระบุจำนวน (min–max)',
  };

  return (
    <form onSubmit={submit}>
      {err && (
        <div className="adm-notice is-bad" style={{ marginTop: 16 }}>
          {err}
        </div>
      )}

      <SheetSection n={1} title="ข้อมูลกิจกรรม">
        <ImageUploader
          label="โปสเตอร์กิจกรรม (Cover · A3 แนวตั้ง)"
          folder="workshop"
          primary={ASPECTS.WORKSHOP_MASTER}
          value={coverUrl}
          meta={coverMeta}
          onChange={({ url, meta }) => {
            setCoverUrl(url);
            setCoverMeta(meta);
          }}
        />
        <div className="adm-field">
          <label htmlFor="mf-title">ชื่อกิจกรรม</label>
          <input id="mf-title" value={title} onChange={(e) => setTitle(e.target.value)} required />
        </div>
        <div className="adm-field">
          <label>ผู้จัดกิจกรรม (Host)</label>
          <AdmSelect value={organizer} onChange={(e) => setOrganizer(e.target.value)} aria-label="ผู้จัดกิจกรรม">
            <option value="">— เลือกผู้จัด —</option>
            {teachers.map((tc) => (
              <option key={tc.id} value={tc.id}>
                {tc.name}
              </option>
            ))}
          </AdmSelect>
        </div>
        <div className="adm-field">
          <label htmlFor="mf-desc">รายละเอียดกิจกรรม</label>
          <textarea id="mf-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={5} />
        </div>
      </SheetSection>

      {isRound && (
        <SheetSection n={2} title="ที่นั่ง & ราคา">
          <p className="adm-hint" style={{ marginTop: -10 }}>
            ราคาใช้กับทุกรอบที่ผู้จัดเปิด · ราคากลุ่มคิดต่อคน × จำนวน · ผู้จองนับเป็น 1 คน แล้วส่งลิงก์เชิญเพื่อนที่เหลือ · การ์ดโชว์ราคาต่อคนแถวแรก
          </p>
          <div className="adm-field">
            <label htmlFor="mf-seats">ที่นั่งต่อรอบ</label>
            <input id="mf-seats" type="number" min={1} step="1" value={defaultSeats} onChange={(e) => setDefaultSeats(e.target.value)} style={{ maxWidth: 200 }} />
            <p className="adm-hint">ค่าเริ่มต้นตอนผู้จัดเปิดรอบ</p>
          </div>
          {tiers.length === 0 && (
            <p className="adm-notice is-warn" style={{ margin: 0 }}>
              ⚠ ยังไม่มีราคา — ผู้จัดเปิดรอบไม่ได้จนกว่าจะเพิ่มอย่างน้อย 1 แถว
            </p>
          )}

          {/* Tiers the admin adds: a name, a price, and whether one purchase
              buys a seat, a group, or the whole round. */}
          {tiers.map((tr, i) => {
            const set = (patch: Partial<PriceTier>) => setTiers((x) => x.map((y, j) => (j === i ? { ...y, ...patch } : y)));
            return (
              <div key={tr.id} className="adm-soft-card">
                <div className="adm-soft-card-head" style={{ gap: 8 }}>
                  <span className="adm-soft-card-n">ราคา {i + 1}</span>
                  <div style={{ flex: 1 }} />
                  <button type="button" onClick={() => setTiers((x) => x.filter((_, j) => j !== i))} className="adm-btn sm danger" aria-label="ลบราคานี้">
                    ลบ
                  </button>
                </div>
                <div className="adm-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
                  <div className="adm-field">
                    <label>ชื่อราคา</label>
                    <input value={tr.label} onChange={(e) => set({ label: e.target.value })} className="is-white" placeholder="เช่น นักเรียน / แพ็ก 3 คน" />
                  </div>
                  <div className="adm-field">
                    <label>{tr.mode === 'round' ? 'บาท (ทั้งรอบ)' : 'บาท/คน'}</label>
                    <input type="number" min={0} step="1" value={tr.price} onChange={(e) => set({ price: Number(e.target.value) })} className="is-white" />
                  </div>
                  <div className="adm-field is-white">
                    <label>ประเภท</label>
                    <AdmSelect
                      value={tr.mode}
                      aria-label="ประเภทราคา"
                      onChange={(e) => {
                        const mode = e.target.value as PriceTier['mode'];
                        set(
                          mode === 'pack'
                            ? { mode, size: tr.size || 3, lock: !!tr.lock }
                            : mode === 'range'
                              ? { mode, min: tr.min || 2, max: tr.max || 5, lock: !!tr.lock }
                              : mode === 'seat'
                                ? { mode, lock: !!tr.lock }
                                : { mode, lock: true },
                        );
                      }}
                    >
                      {(Object.keys(modeLabel) as PriceTier['mode'][]).map((m) => (
                        <option key={m} value={m}>
                          {modeLabel[m]}
                        </option>
                      ))}
                    </AdmSelect>
                  </div>
                </div>
                {tr.mode === 'pack' && (
                  <div className="adm-field">
                    <label>จำนวนคนต่อแพ็ก (รวมผู้จอง)</label>
                    <input type="number" min={2} step="1" value={tr.size ?? 3} onChange={(e) => set({ size: Number(e.target.value) })} className="is-white" style={{ maxWidth: 160 }} />
                  </div>
                )}
                {tr.mode === 'range' && (
                  <div className="adm-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))' }}>
                    <div className="adm-field">
                      <label>ต่ำสุด (คน)</label>
                      <input type="number" min={2} step="1" value={tr.min ?? 2} onChange={(e) => set({ min: Number(e.target.value) })} className="is-white" />
                    </div>
                    <div className="adm-field">
                      <label>สูงสุด (คน)</label>
                      <input type="number" min={2} step="1" value={tr.max ?? 5} onChange={(e) => set({ max: Number(e.target.value) })} className="is-white" />
                    </div>
                  </div>
                )}
                <label className="adm-inline-check">
                  <input type="checkbox" checked={tr.mode === 'round' ? true : !!tr.lock} disabled={tr.mode === 'round'} onChange={(e) => set({ lock: e.target.checked })} />
                  <span>
                    ล็อกรอบเป็นส่วนตัว (Private)
                    <span className="adm-meta" style={{ display: 'block', fontSize: 12, marginTop: 2 }}>
                      {tr.mode === 'round'
                        ? `เหมารอบย่อมปิดรับคนอื่นเสมอ · ที่นั่ง ${Number(defaultSeats) || 20} คน`
                        : tr.lock
                          ? 'Private: จองแล้วรอบนั้นไม่รับคนอื่น · จองได้เฉพาะรอบว่าง'
                          : isGroupTier(tr)
                            ? 'Public: รับได้หลายกลุ่มจนกว่าที่นั่งจะเต็ม'
                            : 'Public: นั่งร่วมกับคนอื่นจนกว่าที่นั่งจะเต็ม'}
                    </span>
                  </span>
                </label>
              </div>
            );
          })}
          <div>
            <button
              type="button"
              onClick={() => setTiers((x) => [...x, { id: `t-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, label: '', price: 0, mode: 'seat' }])}
              className="adm-link-btn"
            >
              + เพิ่มราคาอีกแบบ (ตั้งชื่อเอง)
            </button>
          </div>
        </SheetSection>
      )}

      {isRound && (
        <SheetSection n={3} title="สถานที่ที่เปิดรอบได้">
          <p className="adm-hint" style={{ marginTop: -10 }}>
            ผู้จัดเลือกอีกครั้งตอนเปิดรอบ
          </p>
          <div className="adm-checklist">
            {/* Online is picked like a venue; the host adds the room link per round. */}
            <label>
              <input
                type="checkbox"
                checked={locationIds.includes(ONLINE_VENUE)}
                onChange={(e) => setLocationIds((ids) => (e.target.checked ? [...ids, ONLINE_VENUE] : ids.filter((x) => x !== ONLINE_VENUE)))}
              />
              <span style={{ flex: 1, fontSize: 14 }}>ออนไลน์</span>
              <span className="adm-meta">Zoom · Meet · Teams · อื่น ๆ</span>
            </label>
          </div>
          {locations.length === 0 ? (
            <p className="adm-soft-empty">ยังไม่มีสถานที่ในระบบ — เพิ่มได้ที่เมนู สถานที่</p>
          ) : (
            <div className="adm-checklist">
              {locations.map((l) => (
                <label key={l.id}>
                  <input
                    type="checkbox"
                    checked={locationIds.includes(l.id)}
                    onChange={(e) => setLocationIds((ids) => (e.target.checked ? [...ids, l.id] : ids.filter((x) => x !== l.id)))}
                  />
                  <span style={{ flex: 1, fontSize: 14 }}>{l.name}</span>
                  <span className="adm-meta">{l.province}</span>
                </label>
              ))}
            </div>
          )}
          <p className="adm-hint" style={{ margin: 0 }}>
            {venueHint(locationIds)}
          </p>
        </SheetSection>
      )}

      <SheetSection n={isRound ? 4 : 2} title="เนื้อหา">
        <ListField legend="เหมาะกับใคร (Target Audience)" items={target} onChange={setTarget} placeholder="เช่น คนที่อยากพักใจ..." />
        <ListField legend="ได้อะไรจากกิจกรรม" items={takeaways} onChange={setTakeaways} placeholder="เช่น เทคนิคการหายใจ..." />
      </SheetSection>

      {isRound && (
        <SheetSection n={5} title="ใบสมัคร & PDPA">
          <p className="adm-hint" style={{ marginTop: -10 }}>
            ผู้จัดแก้ได้เองในหน้าจัดรอบ · บันทึกแล้วใช้กับทุกรอบที่ยังไม่เริ่ม และรอบที่เปิดใหม่
          </p>
          <ApplicationEditor questions={questions} onQuestions={setQuestions} consent={consent} onConsent={setConsent} disabled={saving} />
        </SheetSection>
      )}

      <div className="adm-sticky-foot">
        <button type="button" onClick={onCancel} className="adm-btn">
          ยกเลิก
        </button>
        <button type="submit" disabled={saving} className="adm-btn teal">
          {saving ? 'กำลังบันทึก…' : editingId ? 'บันทึกการแก้ไข' : 'เพิ่มข้อมูล'}
        </button>
      </div>

      {/* Unsaved-changes prompt — warn before discarding edits on close. */}
      {pendingClose && <UnsavedDialog saving={saving} err={err} onSave={saveAndClose} onDiscard={onCancel} onStay={() => onStay?.()} />}
    </form>
  );
}
