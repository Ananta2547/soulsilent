'use client';

import { useState } from 'react';
import type { ApplicationQuestion } from '@/lib/types';

const TYPES: { value: ApplicationQuestion['type']; label: string }[] = [
  { value: 'text', label: 'ข้อความสั้น' },
  { value: 'textarea', label: 'ข้อความยาว' },
  { value: 'select', label: 'ตัวเลือก (dropdown)' },
  { value: 'radio', label: 'เลือกได้ข้อเดียว' },
  { value: 'checkbox', label: 'เลือกได้หลายข้อ' },
];

/** Types that need an admin-typed option list. */
const HAS_OPTIONS = (t: ApplicationQuestion['type']) => t === 'select' || t === 'radio' || t === 'checkbox';

const uid = () => 'q_' + Math.random().toString(36).slice(2, 9);

export function ApplicationFormBuilder({
  workshopId,
  initial,
  onSuccess,
  onCancel,
}: {
  workshopId: string;
  initial: ApplicationQuestion[];
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const [questions, setQuestions] = useState<ApplicationQuestion[]>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const add = () =>
    setQuestions((q) => [...q, { id: uid(), label: '', type: 'text', required: false }]);
  const update = (i: number, patch: Partial<ApplicationQuestion>) =>
    setQuestions((q) => q.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  const remove = (i: number) => setQuestions((q) => q.filter((_, idx) => idx !== i));
  const move = (i: number, dir: -1 | 1) =>
    setQuestions((q) => {
      const j = i + dir;
      if (j < 0 || j >= q.length) return q;
      const a = [...q];
      [a[i], a[j]] = [a[j], a[i]];
      return a;
    });

  async function save() {
    setSaving(true);
    setError(null);
    const clean: ApplicationQuestion[] = questions
      .map((q) => ({
        ...q,
        label: q.label.trim(),
        options: HAS_OPTIONS(q.type) ? (q.options || []).map((s) => s.trim()).filter(Boolean) : undefined,
      }))
      .filter((q) => q.label.length > 0);
    try {
      const res = await fetch(`/api/workshops/${workshopId}/application`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questions: clean }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error || 'บันทึกไม่สำเร็จ');
        return;
      }
      onSuccess();
    } catch {
      setError('เชื่อมต่อไม่ได้');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <p className="text-sm text-gray">
        ตั้งคำถามเพิ่มเติมสำหรับผู้สมัครกิจกรรมนี้ — ผู้เข้าร่วมจะตอบในขั้นตอนก่อนชำระเงิน
      </p>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">{error}</div>
      )}

      {questions.length === 0 && (
        <p className="text-xs text-gray text-center py-4 border border-dashed border-gray-lighter rounded-xl">
          ยังไม่มีคำถาม — กด “+ เพิ่มคำถาม” ด้านล่าง
        </p>
      )}

      <div className="space-y-3">
        {questions.map((q, i) => (
          <div key={q.id} className="rounded-xl border border-gray-lighter p-4 bg-surface/40 space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-primary">คำถาม {i + 1}</span>
              <div className="ml-auto flex items-center gap-1">
                <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="px-2 py-1 text-xs rounded hover:bg-cream disabled:opacity-40" title="ขึ้น">↑</button>
                <button type="button" onClick={() => move(i, 1)} disabled={i === questions.length - 1} className="px-2 py-1 text-xs rounded hover:bg-cream disabled:opacity-40" title="ลง">↓</button>
                <button type="button" onClick={() => remove(i)} className="px-2 py-1 text-xs text-red-500 rounded hover:bg-red-50" title="ลบ">ลบ</button>
              </div>
            </div>

            <input
              value={q.label}
              onChange={(e) => update(i, { label: e.target.value })}
              className="input-field"
              placeholder="หัวข้อคำถาม เช่น มีประสบการณ์มาก่อนไหม?"
            />

            <div className="flex flex-wrap items-center gap-3">
              <select
                value={q.type}
                onChange={(e) => update(i, { type: e.target.value as ApplicationQuestion['type'] })}
                className="input-field !w-auto"
              >
                {TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
              <label className="flex items-center gap-2 text-sm text-dark cursor-pointer">
                <input type="checkbox" checked={q.required} onChange={(e) => update(i, { required: e.target.checked })} />
                จำเป็นต้องตอบ
              </label>
            </div>

            {HAS_OPTIONS(q.type) && (
              <div>
                <label className="block text-xs font-medium text-dark mb-1">ตัวเลือก (บรรทัดละ 1 รายการ)</label>
                <textarea
                  value={(q.options || []).join('\n')}
                  onChange={(e) => update(i, { options: e.target.value.split('\n') })}
                  className="input-field"
                  rows={3}
                  placeholder={'ตัวเลือก 1\nตัวเลือก 2'}
                />
              </div>
            )}
          </div>
        ))}
      </div>

      <button type="button" onClick={add} className="text-primary text-sm font-medium hover:underline">
        + เพิ่มคำถาม
      </button>

      <div className="flex items-center gap-3 pt-4 border-t border-gray-lighter">
        <button type="button" onClick={save} disabled={saving} className="btn-primary">
          {saving ? 'กำลังบันทึก...' : 'บันทึกฟอร์มสมัคร'}
        </button>
        <button type="button" onClick={onCancel} className="btn-ghost">
          ยกเลิก
        </button>
      </div>
    </div>
  );
}
