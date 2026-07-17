'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useState } from 'react';
import type { Course, ImageMeta } from '@/lib/types';
import { ImageUploader } from '@/components/admin/image/ImageUploader';
import { ASPECTS } from '@/lib/image-aspects';

export type CourseFormValues = {
  title: string;
  description: string;
  short_description: string;
  price: number;
  thumbnail_url: string;
  thumbnail_meta: ImageMeta | null;
  category: string;
  level: Course['level'];
  status: Course['status'];
};

export const emptyCourseForm: CourseFormValues = {
  title: '',
  description: '',
  short_description: '',
  price: 0,
  thumbnail_url: '',
  thumbnail_meta: null,
  category: '',
  level: 'beginner',
  status: 'draft',
};

type Props = {
  /** Pre-filled values for edit mode; omit for create mode. */
  initial?: CourseFormValues;
  /** Edit-only — used to PUT to the right URL + show "Delete". */
  editingId?: string;
  /**
   * Called after a successful save or delete. When provided, the form skips
   * router.push so the host (modal/inline panel) can close itself + refresh.
   */
  onSuccess?: () => void;
  /** Called when the user clicks the secondary "ยกเลิก" button. */
  onCancel?: () => void;
};

export function CourseForm({ initial, editingId, onSuccess, onCancel }: Props) {
  const router = useRouter();
  const [form, setForm] = useState<CourseFormValues>(initial ?? emptyCourseForm);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const url = editingId ? `/api/courses/${editingId}` : '/api/courses';
      const method = editingId ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error || 'บันทึกไม่สำเร็จ');
        return;
      }
      if (onSuccess) {
        onSuccess();
      } else {
        router.push('/admin/courses');
        router.refresh();
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!editingId) return;
    if (!confirm('ต้องการลบคอร์สนี้?')) return;
    setDeleting(true);
    try {
      await fetch(`/api/courses/${editingId}`, { method: 'DELETE' });
      if (onSuccess) {
        onSuccess();
      } else {
        router.push('/admin/courses');
        router.refresh();
      }
    } finally {
      setDeleting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 max-w-3xl">
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">
          {error}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-dark mb-1">ชื่อคอร์ส</label>
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

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-dark mb-1">ราคา (บาท)</label>
          <input
            type="number"
            value={form.price}
            onChange={(e) => setForm({ ...form, price: +e.target.value })}
            className="input-field"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-dark mb-1">หมวดหมู่</label>
          <input
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
            className="input-field"
            placeholder="เช่น Design, Marketing"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-dark mb-1">ระดับ</label>
          <select
            value={form.level}
            onChange={(e) => setForm({ ...form, level: e.target.value as CourseFormValues['level'] })}
            className="input-field"
          >
            <option value="beginner">เริ่มต้น</option>
            <option value="intermediate">กลาง</option>
            <option value="advanced">ขั้นสูง</option>
          </select>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-dark mb-2">รูป Thumbnail</label>
        <ImageUploader
          folder="course"
          primary={ASPECTS.COURSE_THUMB}
          value={form.thumbnail_url}
          meta={form.thumbnail_meta}
          onChange={({ url, meta }) =>
            setForm({ ...form, thumbnail_url: url, thumbnail_meta: meta })
          }
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-dark mb-1">สถานะ</label>
        <select
          value={form.status}
          onChange={(e) => setForm({ ...form, status: e.target.value as CourseFormValues['status'] })}
          className="input-field"
        >
          <option value="draft">แบบร่าง</option>
          <option value="published">เผยแพร่</option>
          <option value="archived">เก็บถาวร</option>
        </select>
      </div>

      <div className="flex items-center gap-3 pt-4 border-t border-gray-lighter">
        <button type="submit" disabled={saving} className="btn-primary">
          {saving ? 'กำลังบันทึก...' : editingId ? 'บันทึกการแก้ไข' : 'สร้างคอร์ส'}
        </button>
        {onCancel ? (
          <button type="button" onClick={onCancel} className="btn-ghost">
            ยกเลิก
          </button>
        ) : (
          <Link href="/admin/courses" className="btn-ghost">
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
            {deleting ? 'กำลังลบ...' : 'ลบคอร์สนี้'}
          </button>
        )}
      </div>
    </form>
  );
}
