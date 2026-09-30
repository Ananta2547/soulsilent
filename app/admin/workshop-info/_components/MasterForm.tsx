'use client';

import { useEffect, useMemo, useState } from 'react';
import { MultiSelect } from '@/components/admin/MultiSelect';
import { parseTiers, isGroupTier, type PriceTier } from '@/lib/pricing';
import { ImageUploader } from '@/components/admin/image/ImageUploader';
import { ASPECTS } from '@/lib/image-aspects';
import { parseImageMeta } from '@/lib/image-meta';
import { useUnsavedGuard } from '@/lib/use-unsaved-guard';
import type { ImageMeta, WorkshopMaster } from '@/lib/types';

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
    <fieldset className="border border-gray-lighter rounded-xl p-4 bg-surface/40">
      <div className="flex items-center justify-between mb-3">
        <legend className="text-sm font-medium text-dark px-2">{legend}</legend>
        <button type="button" onClick={() => onChange([...items, ''])} className="text-primary text-sm font-medium hover:underline">
          + เพิ่ม
        </button>
      </div>
      {items.length === 0 && <p className="text-xs text-gray text-center py-3">ยังไม่มีหัวข้อ</p>}
      <div className="space-y-2">
        {items.map((item, idx) => (
          <div key={idx} className="flex gap-2 items-start">
            <span className="px-2 py-2 text-primary text-sm">•</span>
            <input
              type="text"
              value={item}
              onChange={(e) => onChange(items.map((v, i) => (i === idx ? e.target.value : v)))}
              className="input-field flex-1"
              placeholder={placeholder}
            />
            <button
              type="button"
              onClick={() => onChange(items.filter((_, i) => i !== idx))}
              className="px-3 py-2 text-red-500 hover:bg-red-50 rounded-lg text-sm"
            >
              −
            </button>
          </div>
        ))}
      </div>
    </fieldset>
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
      }),
    [initial],
  );
  const dirty =
    JSON.stringify({ title, organizer, description, coverUrl, coverMeta, target, takeaways, priceGroup, priceGroupBooking, tiers, defaultSeats, locationIds }) !== baseline;
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
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setErr(data.error || 'บันทึกไม่สำเร็จ');
        return false;
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

  return (
    <form onSubmit={submit} className="space-y-5">
      {err && <div className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{err}</div>}

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

      <div>
        <label className="block text-sm font-medium text-dark mb-1">ชื่อกิจกรรม</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} className="input-field" required />
      </div>

      <div>
        <label className="block text-sm font-medium text-dark mb-1">ผู้จัดกิจกรรม (Host)</label>
        <select value={organizer} onChange={(e) => setOrganizer(e.target.value)} className="input-field">
          <option value="">— เลือกผู้จัด —</option>
          {teachers.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-dark mb-1">รายละเอียดกิจกรรม</label>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={5} className="input-field" />
      </div>

      {(initial?.kind || kind) === 'round' && (
      <fieldset className="border border-gray-lighter rounded-lg p-3">
        <legend className="text-sm font-medium text-dark px-1">ที่นั่ง</legend>
        <div className="mt-1 max-w-[220px]">
          <label className="block text-xs text-gray mb-1">ที่นั่งต่อรอบ (ค่าเริ่มต้นตอนผู้จัดเปิดรอบ)</label>
          <input type="number" min={1} step="1" value={defaultSeats} onChange={(e) => setDefaultSeats(e.target.value)} className="input-field" />
        </div>
      </fieldset>
      )}

      {(initial?.kind || kind) === 'round' && (
      <fieldset className="border border-gray-lighter rounded-lg p-3">
        <legend className="text-sm font-medium text-dark px-1">ราคา (ใช้กับทุกรอบที่ผู้จัดเปิด)</legend>
        <p className="text-xs text-gray mt-1">
          เพิ่มราคาเป็นแถว — ต่อคน / เหมาทั้งรอบ / แพ็กคงที่ / กลุ่มระบุจำนวน (ราคากลุ่มคิดต่อคน × จำนวน · ผู้จองนับเป็น 1 คน แล้วส่งลิงก์เชิญเพื่อนที่เหลือ) · การ์ดโชว์ราคาต่อคนแถวแรก ถ้าไม่มีก็โชว์ราคาเหมารอบ
        </p>
        {tiers.length === 0 && <p className="text-xs mt-2" style={{ color: '#a04a14' }}>⚠ ยังไม่มีราคา — ผู้จัดเปิดรอบไม่ได้จนกว่าจะเพิ่มอย่างน้อย 1 แถว</p>}

        {/* Tiers the admin adds: a name, a price, and whether one purchase
            buys a seat or the whole round. */}
        {tiers.length > 0 && (
          <div className="mt-3 flex flex-col gap-2">
            {tiers.map((t, i) => {
              const set = (patch: Partial<PriceTier>) => setTiers((x) => x.map((y, j) => (j === i ? { ...y, ...patch } : y)));
              return (
                <div key={t.id} className="border border-gray-lighter rounded-md p-2">
                  <div className="grid grid-cols-1 sm:grid-cols-[1fr_130px_190px_32px] gap-2 items-end">
                    <div>
                      <label className="block text-xs text-gray mb-1">ชื่อราคา</label>
                      <input value={t.label} onChange={(e) => set({ label: e.target.value })} className="input-field" placeholder="เช่น นักเรียน / แพ็ก 3 คน / องค์กร" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray mb-1">{t.mode === 'round' ? 'บาท (ทั้งรอบ)' : 'บาท/คน'}</label>
                      <input type="number" min={0} step="1" value={t.price} onChange={(e) => set({ price: Number(e.target.value) })} className="input-field" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray mb-1">ประเภท</label>
                      <select
                        value={t.mode}
                        onChange={(e) => {
                          const mode = e.target.value as PriceTier['mode'];
                          set(mode === 'pack' ? { mode, size: t.size || 3, lock: !!t.lock } : mode === 'range' ? { mode, min: t.min || 2, max: t.max || 5, lock: !!t.lock } : mode === 'seat' ? { mode, lock: !!t.lock } : { mode, lock: true });
                        }}
                        className="input-field"
                      >
                        <option value="seat">ต่อคน (1 ที่นั่ง)</option>
                        <option value="round">เหมาทั้งรอบ</option>
                        <option value="pack">แพ็กคงที่ (N คน)</option>
                        <option value="range">กลุ่มระบุจำนวน (min–max)</option>
                      </select>
                    </div>
                    <button type="button" onClick={() => setTiers((x) => x.filter((_, j) => j !== i))} className="h-10 text-red-500 text-sm" aria-label="ลบราคานี้">✕</button>
                  </div>
                  {t.mode === 'seat' && (
                    <div className="flex flex-wrap items-center gap-3 mt-2">
                      <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={!!t.lock} onChange={(e) => set({ lock: e.target.checked })} />
                        ล็อกรอบเป็นส่วนตัว (Private) — จอง 1 คนแล้วรอบนั้นไม่รับคนอื่น
                      </label>
                      <span className="text-xs text-gray">{t.lock ? 'Private: จองได้เฉพาะรอบว่าง · คิดราคาต่อ 1 คน' : 'Public: นั่งร่วมกับคนอื่นจนกว่าที่นั่งจะเต็ม'}</span>
                    </div>
                  )}
                  {t.mode === 'round' && (
                    <div className="flex flex-wrap items-center gap-3 mt-2">
                      <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked readOnly disabled />
                        ล็อกรอบเป็นส่วนตัว (Private) — เหมารอบย่อมปิดรับคนอื่นเสมอ
                      </label>
                      <span className="text-xs text-gray">ที่นั่ง {Number(defaultSeats) || 20} คน (ตามค่าที่นั่งต่อรอบด้านบน)</span>
                    </div>
                  )}
                  {isGroupTier(t) && (
                    <div className="flex flex-wrap items-end gap-3 mt-2">
                      {t.mode === 'pack' ? (
                        <div>
                          <label className="block text-xs text-gray mb-1">จำนวนคนต่อแพ็ก (รวมผู้จอง)</label>
                          <input type="number" min={2} step="1" value={t.size ?? 3} onChange={(e) => set({ size: Number(e.target.value) })} className="input-field w-28" />
                        </div>
                      ) : (
                        <>
                          <div>
                            <label className="block text-xs text-gray mb-1">ต่ำสุด (คน)</label>
                            <input type="number" min={2} step="1" value={t.min ?? 2} onChange={(e) => set({ min: Number(e.target.value) })} className="input-field w-24" />
                          </div>
                          <div>
                            <label className="block text-xs text-gray mb-1">สูงสุด (คน)</label>
                            <input type="number" min={2} step="1" value={t.max ?? 5} onChange={(e) => set({ max: Number(e.target.value) })} className="input-field w-24" />
                          </div>
                        </>
                      )}
                      <label className="flex items-center gap-2 text-sm pb-2">
                        <input type="checkbox" checked={!!t.lock} onChange={(e) => set({ lock: e.target.checked })} />
                        ล็อกรอบเป็นส่วนตัว (Private) — จองแล้วรอบนั้นไม่รับคนอื่น
                      </label>
                      <span className="text-xs text-gray pb-2">
                        {t.lock ? 'Private: จองได้เฉพาะรอบว่าง' : 'Public: รับได้หลายกลุ่มจนกว่าที่นั่งจะเต็ม'}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <button
          type="button"
          onClick={() => setTiers((x) => [...x, { id: `t-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, label: '', price: 0, mode: 'seat' }])}
          className="mt-3 text-sm text-primary hover:underline"
        >
          + เพิ่มราคาอีกแบบ (ตั้งชื่อเอง)
        </button>
      </fieldset>
      )}

      {(initial?.kind || kind) === 'round' && (
        <fieldset className="border border-gray-lighter rounded-lg p-3">
          <legend className="text-sm font-medium text-dark px-1">สถานที่ที่เปิดรอบได้ (ผู้จัดเลือกอีกครั้งตอนเปิดรอบ)</legend>
          {locations.length === 0 ? (
            <p className="text-xs text-gray mt-1">ยังไม่มีสถานที่ในระบบ — เพิ่มได้ที่เมนู สถานที่</p>
          ) : (
            <MultiSelect
              className="mt-1"
              options={locations.map((l) => ({ value: l.id, label: l.name, hint: l.province }))}
              value={locationIds}
              onChange={setLocationIds}
              placeholder="ทุกสถานที่ (ยังไม่ได้เลือก)"
            />
          )}
          {locationIds.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {locations.filter((l) => locationIds.includes(l.id)).map((l) => (
                <span key={l.id} className="badge" style={{ background: '#e6f4f1', color: '#0f766e' }}>{l.name}</span>
              ))}
            </div>
          )}
          <p className="text-xs text-gray mt-2">ไม่เลือกเลย = ให้ผู้จัดเลือกได้ทุกสถานที่</p>
        </fieldset>
      )}

      <ListField legend="เหมาะกับใคร (Target Audience)" items={target} onChange={setTarget} placeholder="เช่น คนที่อยากพักใจ..." />

      <ListField legend="ได้อะไรจากกิจกรรม" items={takeaways} onChange={setTakeaways} placeholder="เช่น เทคนิคการหายใจ..." />

      <div className="flex items-center gap-2 pt-2">
        <button type="button" onClick={onCancel} className="px-4 py-2 rounded-lg border border-gray-lighter text-sm text-gray">
          ยกเลิก
        </button>
        <button type="submit" disabled={saving} className="ml-auto px-5 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:opacity-90 disabled:opacity-50">
          {saving ? 'กำลังบันทึก...' : editingId ? 'บันทึกการแก้ไข' : 'เพิ่มข้อมูล'}
        </button>
      </div>

      {/* Unsaved-changes prompt — warn before discarding edits on close. */}
      {pendingClose && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-dark/55" onClick={() => onStay?.()}>
          <div className="bg-paper rounded-2xl shadow-2xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-heading text-lg text-dark mb-2">ยังไม่ได้บันทึก</h3>
            <p className="text-sm text-gray mb-5">คุณมีข้อมูลที่แก้ไขแต่ยังไม่ได้กดบันทึก ต้องการบันทึกก่อนออกหรือไม่?</p>
            {err && <div className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2 mb-3">{err}</div>}
            <div className="flex flex-col gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={saveAndClose}
                className="w-full px-4 py-2.5 rounded-lg bg-primary text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
              >
                {saving ? 'กำลังบันทึก...' : 'บันทึก แล้วออก'}
              </button>
              <button
                type="button"
                onClick={() => onCancel()}
                className="w-full px-4 py-2.5 rounded-lg border border-gray-lighter text-sm text-dark hover:bg-surface"
              >
                ออกโดยไม่บันทึก
              </button>
              <button type="button" onClick={() => onStay?.()} className="w-full px-4 py-2.5 text-sm text-gray hover:underline">
                อยู่ต่อ
              </button>
            </div>
          </div>
        </div>
      )}
    </form>
  );
}
