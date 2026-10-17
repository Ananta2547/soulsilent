'use client';

import { useState } from 'react';
import type { ApplicationQuestion } from '@/lib/types';
import { AdmSelect } from '@/components/admin/pickers';
import { SheetSection } from '@/components/admin/AdminShell';

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
    <div>
      {error && (
        <div className="adm-notice is-bad" style={{ marginTop: 16 }}>
          {error}
        </div>
      )}

      <SheetSection n={1} title="คำถามเพิ่มเติม">
        <p className="adm-hint" style={{ marginTop: -10 }}>
          ผู้เข้าร่วมจะตอบในขั้นตอนก่อนชำระเงิน
        </p>
        {questions.length === 0 && <p className="adm-soft-empty">ยังไม่มีคำถาม — กด “+ เพิ่มคำถาม”</p>}

        {questions.map((q, i) => (
          <div key={q.id} className="adm-soft-card">
            <div className="adm-soft-card-head">
              <span className="adm-soft-card-n">คำถาม {i + 1}</span>
              <div style={{ flex: 1 }} />
              <button type="button" className="adm-icon-btn" onClick={() => move(i, -1)} disabled={i === 0} aria-label="ขึ้น" style={{ opacity: i === 0 ? 0.35 : 1 }}>
                ↑
              </button>
              <button type="button" className="adm-icon-btn" onClick={() => move(i, 1)} disabled={i === questions.length - 1} aria-label="ลง" style={{ opacity: i === questions.length - 1 ? 0.35 : 1 }}>
                ↓
              </button>
              <button type="button" className="adm-btn sm danger" onClick={() => remove(i)}>
                ลบ
              </button>
            </div>

            <input
              value={q.label}
              onChange={(e) => update(i, { label: e.target.value })}
              className="is-white"
              placeholder="หัวข้อคำถาม เช่น มีประสบการณ์มาก่อนไหม?"
              aria-label={`หัวข้อคำถาม ${i + 1}`}
            />

            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
              <div style={{ flex: '1 1 200px', minWidth: 0 }} className="is-white">
                <AdmSelect value={q.type} onChange={(e) => update(i, { type: e.target.value as ApplicationQuestion['type'] })} aria-label="ประเภทคำถาม">
                  {TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </AdmSelect>
              </div>
              <label className="adm-inline-check">
                <input type="checkbox" checked={q.required} onChange={(e) => update(i, { required: e.target.checked })} />
                จำเป็นต้องตอบ
              </label>
            </div>

            {HAS_OPTIONS(q.type) && (
              <div className="adm-field">
                <label>ตัวเลือก (บรรทัดละ 1 รายการ)</label>
                <textarea
                  value={(q.options || []).join('\n')}
                  onChange={(e) => update(i, { options: e.target.value.split('\n') })}
                  className="is-white"
                  rows={3}
                  placeholder={'ตัวเลือก 1\nตัวเลือก 2'}
                />
              </div>
            )}
          </div>
        ))}

        <div>
          <button type="button" onClick={add} className="adm-link-btn">
            + เพิ่มคำถาม
          </button>
        </div>
      </SheetSection>

      <div className="adm-sticky-foot">
        <button type="button" onClick={onCancel} className="adm-btn">
          ยกเลิก
        </button>
        <button type="button" onClick={save} disabled={saving} className="adm-btn teal">
          {saving ? 'กำลังบันทึก…' : 'บันทึกฟอร์มสมัคร'}
        </button>
      </div>
    </div>
  );
}
