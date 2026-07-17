'use client';

import { useEffect, useState } from 'react';
import { ImageUploader } from '@/components/admin/image/ImageUploader';
import { ASPECTS } from '@/lib/image-aspects';
import { parseImageMeta } from '@/lib/image-meta';
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
}: {
  initial?: WorkshopMaster | null;
  editingId?: string;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(initial?.title || '');
  const [organizer, setOrganizer] = useState(initial?.organizer || '');
  const [description, setDescription] = useState(initial?.description || '');
  const [coverUrl, setCoverUrl] = useState(initial?.cover_image_url || '');
  const [coverMeta, setCoverMeta] = useState<ImageMeta | null>(parseImageMeta(initial?.cover_image_meta ?? null));
  const [target, setTarget] = useState<string[]>(toArr(initial?.target_json));
  const [takeaways, setTakeaways] = useState<string[]>(toArr(initial?.takeaways_json));
  const [teachers, setTeachers] = useState<{ id: string; name: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/users?role=teacher,admin')
      .then((r) => r.json() as Promise<{ users: { id: string; name: string }[] }>)
      .then((d) => setTeachers(d.users || []))
      .catch(() => {});
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!title.trim()) {
      setErr('กรุณากรอกชื่อกิจกรรม');
      return;
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
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setErr(data.error || 'บันทึกไม่สำเร็จ');
        return;
      }
      onSuccess();
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      {err && <div className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{err}</div>}

      <ImageUploader
        label="รูปตัวอย่างกิจกรรม (Cover · 16:9)"
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
    </form>
  );
}
