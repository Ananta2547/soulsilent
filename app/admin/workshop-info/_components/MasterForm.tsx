'use client';

import { useEffect, useMemo, useState } from 'react';
import { MultiSelect } from '@/components/admin/MultiSelect';
import { parseTiers, type PriceTier } from '@/lib/pricing';
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
  // Prices every round of this master opens with (migration 051). Private is
  // optional — leave it blank and the booking popup offers group only.
  const [priceGroup, setPriceGroup] = useState(initial?.price_group != null ? String(initial.price_group) : '');
  const [priceGroupBooking, setPriceGroupBooking] = useState(initial?.price_group_booking != null ? String(initial.price_group_booking) : '');
  // Extra tiers, each named by the admin and sold per seat or per round.
  const [tiers, setTiers] = useState<PriceTier[]>(parseTiers(initial?.price_tiers_json));
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
        tiers: parseTiers(initial?.price_tiers_json),
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
        <label className="block text-sm font-medium text-dark mb-1">ผู้จัดกิจกรรม (Organizer · ผู้สอน)</label>
        <select value={organizer} onChange={(e) => setOrganizer(e.target.value)} className="input-field">
          <option value="">— เลือกผู้สอน —</option>
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
          <label className="block text-xs text-gray mb-1">ที่นั่งต่อรอบ (ค่าเริ่มต้นตอนผู้สอนเปิดรอบ)</label>
          <input type="number" min={1} step="1" value={defaultSeats} onChange={(e) => setDefaultSeats(e.target.value)} className="input-field" />
        </div>
      </fieldset>
      )}

      {(initial?.kind || kind) === 'round' && (
      <fieldset className="border border-gray-lighter rounded-lg p-3">
        <legend className="text-sm font-medium text-dark px-1">ราคา (ใช้กับทุกรอบที่ผู้สอนเปิด)</legend>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-1">
          <div>
            <label className="block text-xs text-gray mb-1">ราคา/คน (บาท/ที่นั่ง)</label>
            <input type="number" min={0} step="1" value={priceGroup} onChange={(e) => setPriceGroup(e.target.value)} className="input-field" placeholder="เช่น 1200" />
          </div>
          <div>
            <label className="block text-xs text-gray mb-1">กลุ่ม (บาท) <span className="text-gray">· เก็บไว้ก่อน ยังไม่เปิดขาย</span></label>
            <input type="number" min={0} step="1" value={priceGroupBooking} onChange={(e) => setPriceGroupBooking(e.target.value)} className="input-field" placeholder="เช่น 4000" />
          </div>
        </div>

        {/* Tiers the admin adds: a name, a price, and whether one purchase
            buys a seat or the whole round. */}
        {tiers.length > 0 && (
          <div className="mt-3 flex flex-col gap-2">
            {tiers.map((t, i) => (
              <div key={t.id} className="grid grid-cols-1 sm:grid-cols-[1fr_140px_150px_32px] gap-2 items-end">
                <div>
                  <label className="block text-xs text-gray mb-1">ชื่อราคา</label>
                  <input value={t.label} onChange={(e) => setTiers((x) => x.map((y, j) => (j === i ? { ...y, label: e.target.value } : y)))} className="input-field" placeholder="เช่น นักเรียน / องค์กร" />
                </div>
                <div>
                  <label className="block text-xs text-gray mb-1">บาท</label>
                  <input type="number" min={0} step="1" value={t.price} onChange={(e) => setTiers((x) => x.map((y, j) => (j === i ? { ...y, price: Number(e.target.value) } : y)))} className="input-field" />
                </div>
                <div>
                  <label className="block text-xs text-gray mb-1">คิดต่อ</label>
                  <select value={t.mode} onChange={(e) => setTiers((x) => x.map((y, j) => (j === i ? { ...y, mode: e.target.value as PriceTier['mode'] } : y)))} className="input-field">
                    <option value="seat">ต่อคน (1 ที่นั่ง)</option>
                    <option value="round">เหมาทั้งรอบ</option>
                  </select>
                </div>
                <button type="button" onClick={() => setTiers((x) => x.filter((_, j) => j !== i))} className="h-10 text-red-500 text-sm" aria-label="ลบราคานี้">✕</button>
              </div>
            ))}
          </div>
        )}
        <button
          type="button"
          onClick={() => setTiers((x) => [...x, { id: `t-${Date.now().toString(36)}`, label: '', price: 0, mode: 'seat' }])}
          className="mt-3 text-sm text-primary hover:underline"
        >
          + เพิ่มราคาอีกแบบ (ตั้งชื่อเอง)
        </button>
      </fieldset>
      )}

      {(initial?.kind || kind) === 'round' && (
        <fieldset className="border border-gray-lighter rounded-lg p-3">
          <legend className="text-sm font-medium text-dark px-1">สถานที่ที่เปิดรอบได้ (ผู้สอนเลือกอีกครั้งตอนเปิดรอบ)</legend>
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
          <p className="text-xs text-gray mt-2">ไม่เลือกเลย = ให้ผู้สอนเลือกได้ทุกสถานที่</p>
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
