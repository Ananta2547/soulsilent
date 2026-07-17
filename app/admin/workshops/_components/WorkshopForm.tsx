'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { DayTime, ImageMeta, Location, ScheduleDay, ScheduleItem, User, Workshop, WorkshopMaster } from '@/lib/types';
import { ImageUploader } from '@/components/admin/image/ImageUploader';
import { TimeField24 } from '@/components/admin/TimeField24';
import { DateField24 } from '@/components/admin/DateField24';
import { DateTimeField24 } from '@/components/admin/DateTimeField24';
import { ASPECTS } from '@/lib/image-aspects';
import { parseImageMeta } from '@/lib/image-meta';
import { safeParseArray } from '@/lib/workshop-utils';
import { useUnsavedGuard } from '@/lib/use-unsaved-guard';

export type WorkshopType = 'one_day' | 'multi_day' | 'multi_part';

export type WorkshopFormValues = {
  title: string;
  description: string;
  short_description: string;
  workshop_type: WorkshopType;
  date: string;
  /** End date for multi-day ranges. */
  end_date: string;
  /** Specific days for multi-part workshops. */
  dates: string[];
  /** Scratch input for adding a multi-part date. */
  date_input: string;
  time_start: string;
  time_end: string;
  /** Per-day operating hours for multi_day / multi_part (keyed by date). */
  dayTimes: DayTime[];
  location: string;
  location_id: string;
  instructor_id: string;
  /** Per-day timelines. One_day workshops use a single day. */
  scheduleDays: ScheduleDay[];
  learn_items: string[];
  target_items: string[];
  category: string;
  tags: string[];
  tag_input: string;
  promo_price: string;
  promo_start: string;
  promo_end: string;
  theme_color: string;
  max_participants: number;
  price: number;
  image_url: string;
  image_meta: ImageMeta | null;
  status: Workshop['status'];
  // Admission + payment + selection rounds
  admission_type: 'direct' | 'selection';
  payment_type: 'free' | 'deposit' | 'paid';
  deposit_amount: number;
  announce_at: string;
  confirm_main_by: string;
  confirm_waitlist_by: string;
  require_consent: boolean;
  /** Google Drive link to event photos — only when require_consent is on. */
  photos_drive_url: string;
  master_id: string;
};

export const emptyWorkshopForm: WorkshopFormValues = {
  title: '',
  description: '',
  short_description: '',
  workshop_type: 'one_day',
  date: '',
  end_date: '',
  dates: [],
  date_input: '',
  time_start: '09:00',
  time_end: '17:00',
  dayTimes: [],
  location: '',
  location_id: '',
  instructor_id: '',
  scheduleDays: [{ label: '', items: [] }],
  learn_items: [],
  target_items: [],
  category: '',
  tags: [],
  tag_input: '',
  promo_price: '',
  promo_start: '',
  promo_end: '',
  theme_color: '',
  max_participants: 20,
  price: 0,
  image_url: '',
  image_meta: null,
  status: 'active',
  admission_type: 'direct',
  payment_type: 'paid',
  deposit_amount: 0,
  announce_at: '',
  confirm_main_by: '',
  confirm_waitlist_by: '',
  require_consent: false,
  photos_drive_url: '',
  master_id: '',
};

const CATEGORY_SUGGESTIONS = ['Workshop', 'Camp', 'Talk', 'Retreat', 'Field Trip'];
const COLOR_SWATCHES = [
  '#0d8a7e', '#f5c243', '#ee7c2a', '#3478ff',
  '#8b5cf6', '#ec4899', '#16a34a', '#475569',
];

type Props = {
  initial?: WorkshopFormValues;
  editingId?: string;
  /**
   * Called after a successful save or delete. When provided, the form skips
   * router.push so the host (modal/inline panel) can close itself + refresh.
   */
  onSuccess?: () => void;
  /** Called when the user clicks the secondary "ยกเลิก" button (discard + close). */
  onCancel?: () => void;
  /** Report dirty state to the host so it can guard the modal close. */
  onDirtyChange?: (dirty: boolean) => void;
  /** Host requests a close; when true the form shows the save-draft prompt. */
  pendingClose?: boolean;
  /** Attempt to close via the host guard (used by the form's own Cancel button). */
  onAttemptClose?: () => void;
  /** Dismiss the save-draft prompt and stay on the form. */
  onStay?: () => void;
};

export function WorkshopForm({ initial, editingId, onSuccess, onCancel, onDirtyChange, pendingClose, onAttemptClose, onStay }: Props) {
  const router = useRouter();
  const baseline = initial ?? emptyWorkshopForm;
  const [form, setForm] = useState<WorkshopFormValues>(baseline);
  const [locations, setLocations] = useState<Location[]>([]);
  const [teachers, setTeachers] = useState<User[]>([]);
  const [masters, setMasters] = useState<WorkshopMaster[]>([]);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  // Scroll the alert into view whenever a validation error appears (the form is
  // long, so an error at the top is easy to miss when scrolled down).
  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [error]);

  // Unsaved-changes tracking (deep compare against the loaded baseline).
  const dirty = JSON.stringify(form) !== JSON.stringify(baseline);
  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);
  useUnsavedGuard(dirty, 'คุณมีข้อมูลที่ยังไม่ได้บันทึก แน่ใจว่าต้องการออกจากหน้านี้?');

  useEffect(() => {
    Promise.all([
      fetch('/api/locations').then((r) => r.json() as Promise<{ locations: Location[] }>),
      fetch('/api/users?role=teacher,admin').then((r) => r.json() as Promise<{ users: User[] }>),
      fetch('/api/workshop-masters').then((r) => r.json() as Promise<{ masters: WorkshopMaster[] }>),
    ])
      .then(([loc, t, m]) => {
        setLocations(loc.locations || []);
        setTeachers(t.users || []);
        setMasters(m.masters || []);
      })
      .catch(() => {});
  }, []);

  // —— per-day operating hours (multi_day / multi_part) ————————————————
  const DEFAULT_START = '09:00';
  const DEFAULT_END = '17:00';
  const pad2 = (n: number) => String(n).padStart(2, '0');
  const toYmd = (dt: Date) => `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;

  /** Concrete list of day-dates the chosen scheme resolves to (sorted, unique). */
  const expandDates = (): string[] => {
    if (form.workshop_type === 'multi_day') {
      const s = form.date;
      const e = form.end_date;
      // Requirement: end must be strictly AFTER start (different day).
      if (!s || !e || e <= s) return [];
      const out: string[] = [];
      const cur = new Date(s + 'T00:00:00');
      const end = new Date(e + 'T00:00:00');
      let guard = 0;
      while (cur <= end && guard < 366) {
        out.push(toYmd(cur));
        cur.setDate(cur.getDate() + 1);
        guard++;
      }
      return out;
    }
    if (form.workshop_type === 'multi_part') {
      return [...new Set(form.dates)].sort();
    }
    return [];
  };

  const dayTimeMap = new Map(form.dayTimes.map((dt) => [dt.date, dt]));
  const getDayTime = (date: string): DayTime =>
    dayTimeMap.get(date) || { date, time_start: DEFAULT_START, time_end: DEFAULT_END };
  const setDayTime = (date: string, patch: Partial<Pick<DayTime, 'time_start' | 'time_end'>>) => {
    const next = { ...getDayTime(date), ...patch };
    setForm({ ...form, dayTimes: [...form.dayTimes.filter((dt) => dt.date !== date), next] });
  };
  /** Resolve the day-times to persist: one entry per expanded date, in order. */
  const resolveDayTimes = (): DayTime[] =>
    form.workshop_type === 'one_day' ? [] : expandDates().map((d) => getDayTime(d));

  /** Build the request body for a given resolved date scheme + status. */
  const makePayload = (canonicalDate: string, endDate: string | null, dates: string[], status: WorkshopFormValues['status']) => {
    const dayTimes = resolveDayTimes();
    // Canonical single time = day-1 hours for multi types (keeps cards/lists working).
    const timeStart = dayTimes[0]?.time_start ?? form.time_start;
    const timeEnd = dayTimes[0]?.time_end ?? form.time_end;
    return {
      ...form,
      status,
      workshop_type: form.workshop_type,
      date: canonicalDate,
      end_date: endDate,
      dates,
      time_start: timeStart,
      time_end: timeEnd,
      day_times: dayTimes,
      // Only persist the Drive link when PDPA consent is enabled.
      photos_drive_url: form.require_consent ? form.photos_drive_url.trim() : '',
      learn_items: form.learn_items.filter((s) => s.trim().length > 0),
      schedule: form.scheduleDays
        .map((d) => ({ label: d.label.trim(), items: d.items.filter((s) => s.time.trim() || s.detail.trim()) }))
        .filter((d) => d.items.length > 0 || d.label.length > 0),
      tags: form.tags.filter((t) => t.trim().length > 0),
      target_items: form.target_items.filter((s) => s.trim().length > 0),
      promo_price: form.promo_price.trim() === '' ? null : Number(form.promo_price),
      promo_start: form.promo_start || null,
      promo_end: form.promo_end || null,
    };
  };

  async function send(payload: ReturnType<typeof makePayload>): Promise<boolean> {
    setSaving(true);
    try {
      const url = editingId ? `/api/workshops/${editingId}` : '/api/workshops';
      const res = await fetch(url, {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error || 'บันทึกไม่สำเร็จ');
        return false;
      }
      return true;
    } finally {
      setSaving(false);
    }
  }

  /** Save the current form as a Draft (no strict validation) then let the host close. */
  async function saveDraft() {
    const dates = form.workshop_type === 'multi_part' ? [...new Set(form.dates)].sort() : [];
    const canonicalDate = form.workshop_type === 'multi_part' ? dates[0] || form.date : form.date;
    const endDate = form.workshop_type === 'multi_day' ? form.end_date || null : null;
    const ok = await send(makePayload(canonicalDate, endDate, dates, 'draft'));
    if (ok) onSuccess?.();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // Resolve the date scheme into a canonical `date` (+ end_date / dates).
    let canonicalDate = form.date;
    let endDate: string | null = null;
    let dates: string[] = [];

    if (form.workshop_type === 'one_day') {
      if (!form.date) {
        setError('กรุณาเลือกวันที่จัดกิจกรรม');
        return;
      }
    } else if (form.workshop_type === 'multi_day') {
      if (!form.date || !form.end_date) {
        setError('กรุณาเลือกวันเริ่มต้นและวันสิ้นสุด');
        return;
      }
      // Requirement: continuous events span at least two different days.
      if (form.end_date <= form.date) {
        setError('วันสิ้นสุดต้องมากกว่าวันเริ่มต้น (ต้องเป็นคนละวัน)');
        return;
      }
      canonicalDate = form.date;
      endDate = form.end_date;
    } else {
      // multi_part — at least one specific day, sorted; first day is canonical.
      const sorted = [...new Set(form.dates)].sort();
      if (sorted.length === 0) {
        setError('กรุณาเพิ่มวันที่อย่างน้อย 1 วัน');
        return;
      }
      dates = sorted;
      canonicalDate = sorted[0];
    }

    // Time order — start must be before end (HH:MM 24h compares lexicographically).
    if (form.workshop_type === 'one_day') {
      if (form.time_start && form.time_end && form.time_start >= form.time_end) {
        setError('เวลาเริ่มต้องอยู่ก่อนเวลาจบ');
        return;
      }
    } else {
      // Continuous / multi-part: validate every day's own hours.
      const bad = resolveDayTimes().find((dt) => dt.time_start >= dt.time_end);
      if (bad) {
        setError(`เวลาของวันที่ ${fmtDate(bad.date)} ไม่ถูกต้อง — เวลาเริ่มต้องอยู่ก่อนเวลาจบ`);
        return;
      }
    }

    const ok = await send(makePayload(canonicalDate, endDate, dates, form.status));
    if (ok) {
      if (onSuccess) {
        onSuccess();
      } else {
        router.push('/admin/workshops');
        router.refresh();
      }
    }
  }

  async function handleDelete() {
    if (!editingId) return;
    if (!confirm('ต้องการลบ Workshop นี้?')) return;
    setDeleting(true);
    try {
      await fetch(`/api/workshops/${editingId}`, { method: 'DELETE' });
      if (onSuccess) {
        onSuccess();
      } else {
        router.push('/admin/workshops');
        router.refresh();
      }
    } finally {
      setDeleting(false);
    }
  }

  // —— helpers (schedule days / learn items / tags) ————————————————————
  const isMultiDay = form.workshop_type !== 'one_day';

  const updateDays = (days: ScheduleDay[]) => setForm({ ...form, scheduleDays: days });

  const addDay = () =>
    updateDays([
      ...form.scheduleDays,
      { label: `วันที่ ${form.scheduleDays.length + 1}`, items: [] },
    ]);
  const removeDay = (di: number) =>
    updateDays(form.scheduleDays.filter((_, idx) => idx !== di));
  const updateDayLabel = (di: number, label: string) => {
    const next = [...form.scheduleDays];
    next[di] = { ...next[di], label };
    updateDays(next);
  };

  const addScheduleItem = (di: number) => {
    const next = [...form.scheduleDays];
    next[di] = { ...next[di], items: [...next[di].items, { time: '', detail: '' }] };
    updateDays(next);
  };
  const updateScheduleItem = (di: number, i: number, k: keyof ScheduleItem, v: string) => {
    const next = [...form.scheduleDays];
    const items = [...next[di].items];
    items[i] = { ...items[i], [k]: v };
    next[di] = { ...next[di], items };
    updateDays(next);
  };
  const removeScheduleItem = (di: number, i: number) => {
    const next = [...form.scheduleDays];
    next[di] = { ...next[di], items: next[di].items.filter((_, idx) => idx !== i) };
    updateDays(next);
  };

  const addLearnItem = () => setForm({ ...form, learn_items: [...form.learn_items, ''] });
  const updateLearnItem = (i: number, v: string) => {
    const next = [...form.learn_items];
    next[i] = v;
    setForm({ ...form, learn_items: next });
  };
  const removeLearnItem = (i: number) =>
    setForm({ ...form, learn_items: form.learn_items.filter((_, idx) => idx !== i) });

  const addTargetItem = () => setForm({ ...form, target_items: [...form.target_items, ''] });
  const updateTargetItem = (i: number, v: string) => {
    const next = [...form.target_items];
    next[i] = v;
    setForm({ ...form, target_items: next });
  };
  const removeTargetItem = (i: number) =>
    setForm({ ...form, target_items: form.target_items.filter((_, idx) => idx !== i) });

  /** Selecting a master pulls its overview into this session as a starting point. */
  const selectMaster = (mid: string) => {
    const m = masters.find((x) => x.id === mid);
    if (!mid || !m) {
      setForm({ ...form, master_id: mid });
      return;
    }
    // If the form already has content, confirm before overwriting it.
    const hasData =
      form.title.trim() !== '' ||
      (form.description || '').trim() !== '' ||
      form.learn_items.some((s) => s.trim()) ||
      form.target_items.some((s) => s.trim()) ||
      form.image_url !== '';
    if (hasData && !window.confirm('ต้องการแทนที่ข้อมูลในแบบฟอร์มปัจจุบันด้วยข้อมูลจากแม่แบบหรือไม่?')) {
      // Keep the admin's typed data — only link the master.
      setForm({ ...form, master_id: mid });
      return;
    }
    setForm({
      ...form,
      master_id: mid,
      title: m.title || form.title,
      description: m.description || form.description,
      instructor_id: m.organizer || form.instructor_id, // organizer = teacher user id
      learn_items: safeParseArray<string>(m.takeaways_json, form.learn_items),
      target_items: safeParseArray<string>(m.target_json, form.target_items),
      image_url: m.cover_image_url || form.image_url,
      image_meta: m.cover_image_url ? parseImageMeta(m.cover_image_meta) : form.image_meta,
    });
  };

  const addTag = () => {
    const v = form.tag_input.trim();
    if (!v) return;
    if (form.tags.includes(v)) {
      setForm({ ...form, tag_input: '' });
      return;
    }
    setForm({ ...form, tags: [...form.tags, v], tag_input: '' });
  };
  const removeTag = (t: string) =>
    setForm({ ...form, tags: form.tags.filter((x) => x !== t) });

  // —— multi-part date chips ————————————————————————————————————————
  const addPartDate = () => {
    const v = form.date_input;
    if (!v || form.dates.includes(v)) {
      setForm({ ...form, date_input: '' });
      return;
    }
    setForm({ ...form, dates: [...form.dates, v].sort(), date_input: '' });
  };
  const removePartDate = (d: string) =>
    setForm({ ...form, dates: form.dates.filter((x) => x !== d) });

  // DD/MM/YYYY (Gregorian, numeric) — locale-independent.
  const fmtDate = (d: string) => {
    const [y, m, day] = (d || '').split('-');
    return y && m && day ? `${day}/${m}/${y}` : d;
  };

  const TYPE_OPTIONS: { value: WorkshopType; label: string; hint: string }[] = [
    { value: 'one_day', label: 'กิจกรรมวันเดียว', hint: 'จัดวันเดียวจบ' },
    { value: 'multi_day', label: 'กิจกรรมต่อเนื่อง', hint: 'หลายวันติดกัน' },
    { value: 'multi_part', label: 'กิจกรรมแบ่งพาร์ท', hint: 'เลือกหลายวันไม่ติดกัน' },
  ];

  return (
    <form onSubmit={handleSubmit} className="space-y-5 max-w-3xl">
      {error && (
        <div
          ref={errorRef}
          key={error}
          role="alert"
          className="flex items-center gap-3 p-4 bg-red-50 border-2 border-red-400 text-red-700 rounded-xl font-medium shadow-sm"
          style={{ animation: 'ssShake .4s ease' }}
        >
          <span className="flex-shrink-0 w-7 h-7 rounded-full bg-red-500 text-white flex items-center justify-center text-base">!</span>
          <span>{error}</span>
        </div>
      )}
      <style jsx>{`
        @keyframes ssShake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-6px); }
          40% { transform: translateX(6px); }
          60% { transform: translateX(-4px); }
          80% { transform: translateX(4px); }
        }
      `}</style>

      <div>
        <label className="block text-sm font-medium text-dark mb-1">
          ข้อมูล Workshop (Master) <span className="text-gray font-normal">— ผูกรอบนี้กับภาพรวมกิจกรรม</span>
        </label>
        <select
          value={form.master_id}
          onChange={(e) => selectMaster(e.target.value)}
          className="input-field"
        >
          <option value="">— ไม่ผูก (รอบเดี่ยว) —</option>
          {masters.map((m) => (
            <option key={m.id} value={m.id}>{m.title}</option>
          ))}
        </select>
        {form.master_id && (
          <p className="text-xs text-gray mt-1">เลือกแล้วระบบจะดึงข้อมูลภาพรวมมาเติมให้อัตโนมัติ — แก้ไขเฉพาะรอบนี้ต่อได้เลย</p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-dark mb-1">ชื่อ Workshop</label>
        <input
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          className="input-field"
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-dark mb-1">คำอธิบายสั้น</label>
        <input
          value={form.short_description}
          onChange={(e) => setForm({ ...form, short_description: e.target.value })}
          className="input-field"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-dark mb-1">รายละเอียด</label>
        <textarea
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          className="input-field"
          rows={5}
        />
      </div>

      {/* Workshop type + date scheme */}
      <fieldset className="border border-gray-lighter rounded-xl p-4 bg-surface/40 space-y-4">
        <legend className="text-sm font-medium text-dark px-2">ประเภทรูปแบบกิจกรรม</legend>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {TYPE_OPTIONS.map((opt) => {
            const selected = form.workshop_type === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setForm({ ...form, workshop_type: opt.value })}
                className={`text-left rounded-xl border p-3 transition ${
                  selected
                    ? 'border-primary bg-primary/10 ring-1 ring-primary'
                    : 'border-gray-lighter hover:border-primary/40'
                }`}
              >
                <div className="text-sm font-medium text-dark">{opt.label}</div>
                <div className="text-xs text-gray mt-0.5">{opt.hint}</div>
              </button>
            );
          })}
        </div>

        {/* Date inputs — depend on the chosen type. All show DD/MM/YYYY. */}
        {form.workshop_type === 'one_day' && (
          <div>
            <label className="block text-sm font-medium text-dark mb-1">วันที่จัดกิจกรรม</label>
            <DateField24
              value={form.date}
              onChange={(v) => setForm({ ...form, date: v })}
            />
          </div>
        )}

        {form.workshop_type === 'multi_day' && (
          <div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-dark mb-1">วันเริ่มต้น</label>
                <DateField24
                  value={form.date}
                  onChange={(v) => setForm({ ...form, date: v })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-dark mb-1">วันสิ้นสุด</label>
                <DateField24
                  value={form.end_date}
                  onChange={(v) => setForm({ ...form, end_date: v })}
                />
              </div>
            </div>
            {form.date && form.end_date && form.end_date <= form.date && (
              <p className="text-xs text-red-500 mt-2">⚠ วันสิ้นสุดต้องมากกว่าวันเริ่มต้น (ต้องเป็นคนละวัน)</p>
            )}
          </div>
        )}

        {form.workshop_type === 'multi_part' && (
          <div>
            <label className="block text-sm font-medium text-dark mb-1">
              เลือกวันที่ (เพิ่มได้หลายวัน)
            </label>
            <div className="flex gap-2 flex-wrap">
              <DateField24
                value={form.date_input}
                onChange={(v) => setForm({ ...form, date_input: v })}
              />
              <button
                type="button"
                onClick={addPartDate}
                className="px-4 py-2 rounded-xl bg-primary/10 text-primary text-sm font-medium hover:bg-primary/20 whitespace-nowrap"
              >
                + เพิ่มวัน
              </button>
            </div>
            {form.dates.length === 0 ? (
              <p className="text-xs text-gray mt-2">ยังไม่ได้เลือกวัน เช่น จัดทุกวันเสาร์ หรือวันที่ 1, 8, 15</p>
            ) : (
              <div className="flex gap-2 flex-wrap mt-3">
                {form.dates.map((d) => (
                  <span
                    key={d}
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-medium"
                  >
                    {fmtDate(d)}
                    <button
                      type="button"
                      onClick={() => removePartDate(d)}
                      className="text-primary/60 hover:text-red-500"
                      aria-label={`ลบ ${d}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* one_day → a single global time. multi types → per-day times below. */}
        {form.workshop_type === 'one_day' && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-dark mb-1">เวลาเริ่ม (24 ชม.)</label>
                <TimeField24 value={form.time_start} onChange={(v) => setForm({ ...form, time_start: v })} />
              </div>
              <div>
                <label className="block text-sm font-medium text-dark mb-1">เวลาจบ (24 ชม.)</label>
                <TimeField24 value={form.time_end} onChange={(v) => setForm({ ...form, time_end: v })} />
              </div>
            </div>
            {form.time_start && form.time_end && form.time_start >= form.time_end && (
              <p className="text-xs text-red-500 mt-2">⚠ เวลาเริ่มต้องอยู่ก่อนเวลาจบ</p>
            )}
          </>
        )}

        {/* Per-day operating hours — one block per selected date. */}
        {form.workshop_type !== 'one_day' && (() => {
          const days = expandDates();
          if (days.length === 0) {
            return (
              <p className="text-xs text-gray">
                {form.workshop_type === 'multi_day'
                  ? 'เลือกวันเริ่มต้นและวันสิ้นสุด (คนละวัน) เพื่อกำหนดเวลาของแต่ละวัน'
                  : 'เพิ่มวันที่อย่างน้อย 1 วัน เพื่อกำหนดเวลาของแต่ละวัน'}
              </p>
            );
          }
          return (
            <div className="space-y-2">
              <label className="block text-sm font-medium text-dark">เวลาของแต่ละวัน (24 ชม.)</label>
              <div className="space-y-2">
                {days.map((d, i) => {
                  const dt = getDayTime(d);
                  const invalid = dt.time_start >= dt.time_end;
                  return (
                    <div key={d} className="rounded-xl border border-gray-lighter bg-white p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold">{i + 1}</span>
                        <span className="text-sm font-medium text-dark">{fmtDate(d)}</span>
                      </div>
                      <div className="flex items-center gap-3 flex-wrap">
                        <div>
                          <label className="block text-[11px] text-gray mb-1">เวลาเริ่ม</label>
                          <TimeField24 value={dt.time_start} onChange={(v) => setDayTime(d, { time_start: v })} />
                        </div>
                        <span className="text-gray mt-5">–</span>
                        <div>
                          <label className="block text-[11px] text-gray mb-1">เวลาจบ</label>
                          <TimeField24 value={dt.time_end} onChange={(v) => setDayTime(d, { time_end: v })} />
                        </div>
                      </div>
                      {invalid && (
                        <p className="text-xs text-red-500 mt-2">⚠ เวลาเริ่มต้องอยู่ก่อนเวลาจบ</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}
      </fieldset>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-dark mb-1">สถานที่</label>
          <select
            value={form.location_id}
            onChange={(e) => {
              const loc = locations.find((l) => l.id === e.target.value);
              setForm({
                ...form,
                location_id: e.target.value,
                location: loc
                  ? `${loc.name}, ${loc.subdistrict}, ${loc.district}, ${loc.province}`
                  : '',
              });
            }}
            className="input-field"
          >
            <option value="">— เลือกสถานที่ —</option>
            {locations.map((loc) => (
              <option key={loc.id} value={loc.id}>
                {loc.name} ({loc.province})
              </option>
            ))}
          </select>
          {locations.length === 0 && (
            <p className="text-xs text-gray mt-1">
              ยังไม่มีสถานที่ —{' '}
              <a href="/admin/locations" className="text-primary hover:underline">
                เพิ่มก่อน
              </a>
            </p>
          )}
        </div>
        <div>
          <label className="block text-sm font-medium text-dark mb-1">ที่นั่งสูงสุด</label>
          <input
            type="number"
            value={form.max_participants}
            onChange={(e) => setForm({ ...form, max_participants: +e.target.value })}
            className="input-field"
          />
        </div>
      </div>

      {/* Theme color */}
      <div>
        <label className="block text-sm font-medium text-dark mb-2">
          สีธีม Calendar <span className="text-gray font-normal ml-1">(ไม่บังคับ)</span>
        </label>
        <div className="flex items-center gap-3 flex-wrap">
          {COLOR_SWATCHES.map((c) => {
            const selected = (form.theme_color || '').toLowerCase() === c.toLowerCase();
            return (
              <button
                key={c}
                type="button"
                onClick={() => setForm({ ...form, theme_color: c })}
                aria-label={c}
                title={c}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  background: c,
                  border: 0,
                  cursor: 'pointer',
                  boxShadow: selected
                    ? `0 0 0 2px white, 0 0 0 4px ${c}`
                    : '0 0 0 1px rgba(0,0,0,.1)',
                }}
              />
            );
          })}
          <div className="flex items-center gap-2 ml-2">
            <input
              type="color"
              value={form.theme_color || '#0d8a7e'}
              onChange={(e) => setForm({ ...form, theme_color: e.target.value })}
              style={{ width: 32, height: 32, border: 0, borderRadius: '50%', cursor: 'pointer' }}
            />
            <input
              value={form.theme_color ?? ''}
              onChange={(e) => setForm({ ...form, theme_color: e.target.value })}
              className="input-field !py-2 !w-28"
              placeholder="#0d8a7e"
            />
          </div>
          {form.theme_color && (
            <button
              type="button"
              onClick={() => setForm({ ...form, theme_color: '' })}
              className="text-xs text-gray hover:text-red-500 ml-2"
            >
              ล้าง
            </button>
          )}
        </div>
      </div>

      {/* Instructor */}
      <div>
        <label className="block text-sm font-medium text-dark mb-1">ผู้สอน / ผู้จัด</label>
        <select
          value={form.instructor_id ?? ''}
          onChange={(e) => setForm({ ...form, instructor_id: e.target.value })}
          className="input-field"
        >
          <option value="">— เลือกผู้สอน —</option>
          {teachers.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} ({t.email})
            </option>
          ))}
        </select>
      </div>

      {/* Category + tags */}
      <fieldset className="border border-gray-lighter rounded-xl p-4 bg-surface/40 space-y-4">
        <legend className="text-sm font-medium text-dark px-2">หมวด + แท็ก</legend>
        <div>
          <label className="block text-sm font-medium text-dark mb-1">หมวดหมู่</label>
          <input
            list="ws-category-suggestions"
            value={form.category ?? ''}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
            className="input-field"
            placeholder="เช่น Workshop, Camp, Talk"
          />
          <datalist id="ws-category-suggestions">
            {CATEGORY_SUGGESTIONS.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>
        <div>
          <label className="block text-sm font-medium text-dark mb-1">แท็ก</label>
          <div className="flex gap-2">
            <input
              value={form.tag_input ?? ''}
              onChange={(e) => setForm({ ...form, tag_input: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ',') {
                  e.preventDefault();
                  addTag();
                }
              }}
              className="input-field flex-1"
              placeholder="พิมพ์แล้วกด Enter"
            />
            <button
              type="button"
              onClick={addTag}
              className="px-4 py-2 rounded-xl bg-primary/10 text-primary text-sm font-medium hover:bg-primary/20"
            >
              เพิ่ม
            </button>
          </div>
          {form.tags.length > 0 && (
            <div className="flex gap-2 flex-wrap mt-2">
              {form.tags.map((t) => (
                <span
                  key={t}
                  className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium"
                >
                  {t}
                  <button
                    type="button"
                    onClick={() => removeTag(t)}
                    className="text-primary/60 hover:text-red-500 ml-1"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      </fieldset>

      {/* Admission & payment */}
      <fieldset className="border border-gray-lighter rounded-xl p-4 bg-surface/40 space-y-4">
        <legend className="text-sm font-medium text-dark px-2">การรับสมัคร & การชำระเงิน</legend>

        <div>
          <label className="block text-sm font-medium text-dark mb-1">รูปแบบการรับสมัคร</label>
          <div className="flex flex-wrap gap-2">
            {([
              { v: 'direct', label: 'จองตรง', hint: 'สมัคร → จ่ายเลย' },
              { v: 'selection', label: 'คัดเลือก', hint: 'สมัคร → ประกาศผล → ยืนยัน' },
            ] as const).map((o) => (
              <button
                key={o.v}
                type="button"
                onClick={() => setForm({ ...form, admission_type: o.v })}
                className={`text-left rounded-xl border p-3 flex-1 min-w-[150px] transition ${form.admission_type === o.v ? 'border-primary bg-primary/10 ring-1 ring-primary' : 'border-gray-lighter hover:border-primary/40'}`}
              >
                <div className="text-sm font-medium text-dark">{o.label}</div>
                <div className="text-xs text-gray mt-0.5">{o.hint}</div>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-dark mb-1">รูปแบบการชำระเงิน</label>
          <div className="flex flex-wrap gap-2">
            {([
              { v: 'free', label: 'ฟรี' },
              { v: 'deposit', label: 'มัดจำ' },
              { v: 'paid', label: 'เต็มจำนวน' },
            ] as const).map((o) => (
              <button
                key={o.v}
                type="button"
                onClick={() => setForm({ ...form, payment_type: o.v, ...(o.v === 'free' ? { price: 0, promo_price: '' } : {}) })}
                className={`px-4 py-2 rounded-xl border text-sm transition ${form.payment_type === o.v ? 'border-primary bg-primary/10 ring-1 ring-primary text-dark' : 'border-gray-lighter hover:border-primary/40 text-gray'}`}
              >
                {o.label}
              </button>
            ))}
          </div>
          {form.payment_type === 'deposit' && (
            <div className="mt-3 max-w-xs">
              <label className="block text-xs font-medium text-dark mb-1">เงินมัดจำ (บาท) · คืนได้วันงาน (โอนเท่านั้น)</label>
              <input
                type="number"
                min="0"
                value={form.deposit_amount}
                onChange={(e) => setForm({ ...form, deposit_amount: +e.target.value })}
                className="input-field"
              />
            </div>
          )}
        </div>

        {form.admission_type === 'selection' && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
            <div>
              <label className="block text-xs font-medium text-dark mb-1">ประกาศผลคัดเลือก</label>
              <DateTimeField24 value={form.announce_at} onChange={(v) => setForm({ ...form, announce_at: v })} />
            </div>
            <div>
              <label className="block text-xs font-medium text-dark mb-1">ยืนยันตัวจริง ภายใน</label>
              <DateTimeField24 value={form.confirm_main_by} onChange={(v) => setForm({ ...form, confirm_main_by: v })} />
            </div>
            <div>
              <label className="block text-xs font-medium text-dark mb-1">ยืนยันตัวสำรอง ภายใน</label>
              <DateTimeField24 value={form.confirm_waitlist_by} onChange={(v) => setForm({ ...form, confirm_waitlist_by: v })} />
            </div>
          </div>
        )}

        <label className="flex items-start gap-2 pt-2 cursor-pointer">
          <input
            type="checkbox"
            checked={form.require_consent}
            onChange={(e) => setForm({ ...form, require_consent: e.target.checked })}
            className="mt-0.5"
          />
          <span className="text-sm text-dark">
            ขอความยินยอมบันทึกเสียง ภาพและวิดีโอ (PDPA)
            <span className="block text-xs text-gray mt-0.5">
              เปิดไว้เพื่อให้แบบฟอร์มใบสมัครมีส่วนขอความยินยอมการบันทึกภาพ/วิดีโอ (บังคับเลือก)
            </span>
          </span>
        </label>

        {/* Google Drive photo link — only relevant when PDPA consent is on */}
        {form.require_consent && (
          <div className="pl-6">
            <label className="block text-xs font-medium text-dark mb-1">
              Link Google Drive (รูปกิจกรรม)
            </label>
            <input
              type="url"
              value={form.photos_drive_url}
              onChange={(e) => setForm({ ...form, photos_drive_url: e.target.value })}
              className="input-field"
              placeholder="https://drive.google.com/..."
            />
            <p className="text-xs text-gray mt-1">
              ลิงก์นี้จะแสดงใน My Journey ให้เฉพาะผู้ที่เข้าร่วมและถูกเช็คชื่อแล้วเท่านั้น
            </p>
          </div>
        )}
      </fieldset>

      {/* Promotion */}
      <fieldset className="border border-accent/30 rounded-xl p-4 bg-accent/5 space-y-3">
        <legend className="text-sm font-medium text-dark px-2">โปรโมชัน (ไม่บังคับ)</legend>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-dark mb-1">ราคาโปร</label>
            <input
              type="number"
              min="0"
              value={form.promo_price ?? ''}
              onChange={(e) => setForm({ ...form, promo_price: e.target.value })}
              className="input-field"
              placeholder="ปล่อยว่าง = ไม่มีโปร"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-dark mb-1">เริ่ม</label>
            <DateField24
              value={form.promo_start ?? ''}
              onChange={(v) => setForm({ ...form, promo_start: v })}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-dark mb-1">สิ้นสุด</label>
            <DateField24
              value={form.promo_end ?? ''}
              onChange={(v) => setForm({ ...form, promo_end: v })}
            />
          </div>
        </div>
        {form.promo_price && form.price > 0 && Number(form.promo_price) < form.price && (
          <div className="text-xs text-gray flex items-center gap-2">
            <span className="line-through">฿{form.price.toLocaleString()}</span>
            <span className="text-primary font-semibold">
              ฿{Number(form.promo_price).toLocaleString()}
            </span>
            <span className="text-accent-dark font-medium">
              ลด {Math.round((1 - Number(form.promo_price) / form.price) * 100)}%
            </span>
          </div>
        )}
      </fieldset>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-dark mb-1">ราคา (บาท)</label>
          {form.payment_type === 'free' ? (
            <input
              type="text"
              value="ฟรี — ไม่สามารถระบุจำนวนได้"
              disabled
              className="input-field"
              style={{ background: 'var(--cream-deep)', color: 'var(--muted)', cursor: 'not-allowed' }}
            />
          ) : (
            <input
              type="number"
              value={form.price}
              onChange={(e) => setForm({ ...form, price: +e.target.value })}
              className="input-field"
              required
            />
          )}
        </div>
        <ImageUploader
          label="รูปปก Workshop (โปสเตอร์ A3 · 29.7×42)"
          folder="workshop"
          primary={ASPECTS.WORKSHOP_HERO}
          value={form.image_url}
          meta={form.image_meta}
          onChange={({ url, meta }) =>
            setForm({ ...form, image_url: url, image_meta: meta })
          }
        />
      </div>

      {/* Schedule — per-day timelines */}
      <fieldset className="border border-gray-lighter rounded-xl p-4 bg-surface/40">
        <div className="flex items-center justify-between mb-3">
          <legend className="text-sm font-medium text-dark px-2">
            ตารางกิจกรรม (Timeline)
          </legend>
          {isMultiDay && (
            <button
              type="button"
              onClick={addDay}
              className="text-primary text-sm font-medium hover:underline"
            >
              + เพิ่มวัน
            </button>
          )}
        </div>

        {isMultiDay && (
          <p className="text-xs text-gray mb-3 px-2">
            กิจกรรมหลายวัน — เพิ่มตารางแยกแต่ละวันได้ ผู้ใช้จะเลือกดูแต่ละวันจาก dropdown
          </p>
        )}

        <div className="space-y-4">
          {form.scheduleDays.map((day, di) => (
            <div
              key={di}
              className={isMultiDay ? 'rounded-xl border border-gray-lighter bg-white/60 p-3' : ''}
            >
              {isMultiDay && (
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-semibold text-primary whitespace-nowrap">
                    วันที่ {di + 1}
                  </span>
                  <input
                    type="text"
                    value={day.label}
                    onChange={(e) => updateDayLabel(di, e.target.value)}
                    className="input-field !py-1.5 flex-1"
                    placeholder="ชื่อวัน เช่น วันเสาร์ที่ 6 มิ.ย. หรือ Day 1"
                  />
                  {form.scheduleDays.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeDay(di)}
                      className="px-2 py-1 text-red-500 hover:bg-red-50 rounded-lg text-xs whitespace-nowrap"
                    >
                      ลบวัน
                    </button>
                  )}
                </div>
              )}

              {day.items.length === 0 && (
                <p className="text-xs text-gray text-center py-2">ยังไม่มีกิจกรรม</p>
              )}
              <div className="space-y-2">
                {day.items.map((item, idx) => (
                  <div key={idx} className="flex gap-2 items-start">
                    <TimeField24
                      value={item.time || '09:00'}
                      onChange={(v) => updateScheduleItem(di, idx, 'time', v)}
                    />
                    <input
                      type="text"
                      value={item.detail}
                      onChange={(e) => updateScheduleItem(di, idx, 'detail', e.target.value)}
                      className="input-field flex-1"
                      placeholder="ลงทะเบียน + welcome drink"
                    />
                    <button
                      type="button"
                      onClick={() => removeScheduleItem(di, idx)}
                      className="px-3 py-2 text-red-500 hover:bg-red-50 rounded-lg text-sm"
                    >
                      −
                    </button>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={() => addScheduleItem(di)}
                className="text-primary text-sm font-medium hover:underline mt-2"
              >
                + เพิ่มกิจกรรม
              </button>
            </div>
          ))}
        </div>
      </fieldset>

      {/* Learn items */}
      <fieldset className="border border-gray-lighter rounded-xl p-4 bg-surface/40">
        <div className="flex items-center justify-between mb-3">
          <legend className="text-sm font-medium text-dark px-2">สิ่งที่จะได้เรียนรู้</legend>
          <button
            type="button"
            onClick={addLearnItem}
            className="text-primary text-sm font-medium hover:underline"
          >
            + เพิ่ม
          </button>
        </div>
        {form.learn_items.length === 0 && (
          <p className="text-xs text-gray text-center py-3">ยังไม่มีหัวข้อ</p>
        )}
        <div className="space-y-2">
          {form.learn_items.map((item, idx) => (
            <div key={idx} className="flex gap-2 items-start">
              <span className="px-2 py-2 text-primary text-sm">•</span>
              <input
                type="text"
                value={item}
                onChange={(e) => updateLearnItem(idx, e.target.value)}
                className="input-field flex-1"
                placeholder="เทคนิคพื้นฐาน..."
              />
              <button
                type="button"
                onClick={() => removeLearnItem(idx)}
                className="px-3 py-2 text-red-500 hover:bg-red-50 rounded-lg text-sm"
              >
                −
              </button>
            </div>
          ))}
        </div>
      </fieldset>

      <fieldset className="border border-gray-lighter rounded-xl p-4 bg-surface/40">
        <div className="flex items-center justify-between mb-3">
          <legend className="text-sm font-medium text-dark px-2">เหมาะกับใคร (Target Audience)</legend>
          <button type="button" onClick={addTargetItem} className="text-primary text-sm font-medium hover:underline">
            + เพิ่ม
          </button>
        </div>
        {form.target_items.length === 0 && <p className="text-xs text-gray text-center py-3">ยังไม่มีหัวข้อ</p>}
        <div className="space-y-2">
          {form.target_items.map((item, idx) => (
            <div key={idx} className="flex gap-2 items-start">
              <span className="px-2 py-2 text-primary text-sm">•</span>
              <input
                type="text"
                value={item}
                onChange={(e) => updateTargetItem(idx, e.target.value)}
                className="input-field flex-1"
                placeholder="เช่น คนที่อยากพักใจ..."
              />
              <button
                type="button"
                onClick={() => removeTargetItem(idx)}
                className="px-3 py-2 text-red-500 hover:bg-red-50 rounded-lg text-sm"
              >
                −
              </button>
            </div>
          ))}
        </div>
      </fieldset>

      <div>
        <label className="block text-sm font-medium text-dark mb-1">สถานะ</label>
        <select
          value={form.status}
          onChange={(e) =>
            setForm({ ...form, status: e.target.value as WorkshopFormValues['status'] })
          }
          className="input-field"
        >
          <option value="active">เปิดรับ</option>
          <option value="cancelled">ยกเลิก</option>
          <option value="completed">เสร็จสิ้น</option>
          <option value="draft">ฉบับร่าง (Draft)</option>
        </select>
      </div>

      <div className="flex items-center gap-3 pt-4 border-t border-gray-lighter">
        <button type="submit" disabled={saving} className="btn-primary">
          {saving ? 'กำลังบันทึก...' : editingId ? 'บันทึกการแก้ไข' : 'สร้าง Workshop'}
        </button>
        {onCancel || onAttemptClose ? (
          <button type="button" onClick={() => (onAttemptClose ? onAttemptClose() : onCancel?.())} className="btn-ghost">
            ยกเลิก
          </button>
        ) : (
          <Link href="/admin/workshops" className="btn-ghost">
            ยกเลิก
          </Link>
        )}
        {editingId && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="ml-auto text-red-500 text-sm font-medium hover:underline disabled:opacity-50"
          >
            {deleting ? 'กำลังลบ...' : 'ลบ Workshop นี้'}
          </button>
        )}
      </div>

      {/* Unsaved-changes: offer to save a draft before leaving */}
      {pendingClose && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-dark/55"
          onClick={() => onStay?.()}
        >
          <div className="bg-paper rounded-2xl shadow-2xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-heading text-lg text-dark mb-2">มีข้อมูลที่ยังไม่ได้บันทึก</h3>
            <p className="text-sm text-gray mb-5">คุณมีข้อมูลที่ยังไม่ได้บันทึก ต้องการบันทึกเป็นฉบับร่าง (Draft) ก่อนออกจากหน้านี้หรือไม่?</p>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={saveDraft}
                className="w-full px-4 py-2.5 rounded-lg bg-primary text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
              >
                {saving ? 'กำลังบันทึก...' : 'บันทึกเป็นฉบับร่าง แล้วออก'}
              </button>
              <button
                type="button"
                onClick={() => onCancel?.()}
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
