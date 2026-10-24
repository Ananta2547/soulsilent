'use client';

/* The application form of a round activity, as the host (or admin) writes it:
 * the questions asked before booking — short / long text, one choice from a
 * list, one or many choices — each optionally required, in order; and the PDPA
 * switch that adds the photo / audio / video consent to the form. Profile
 * details (name, age, phone, Line, health) are always asked by the booking
 * popup itself, so they are not questions here. Controlled: the parent saves. */

import type { ApplicationQuestion } from '@/lib/types';
import { hasOptions } from '@/lib/application-form';
import './application-editor.css';

const TYPES: { value: ApplicationQuestion['type']; label: string; add: string }[] = [
  { value: 'text', label: 'ข้อความสั้น', add: '+ ข้อความสั้น' },
  { value: 'textarea', label: 'ข้อความยาว', add: '+ ข้อความยาว' },
  { value: 'radio', label: 'เลือกข้อเดียว', add: '+ เลือกข้อเดียว' },
  { value: 'checkbox', label: 'เลือกหลายข้อ', add: '+ เลือกหลายข้อ' },
  { value: 'select', label: 'รายการ (dropdown)', add: '+ dropdown' },
];

const uid = () => 'q_' + Math.random().toString(36).slice(2, 9);

export function ApplicationEditor({
  questions,
  onQuestions,
  consent,
  onConsent,
  disabled,
}: {
  questions: ApplicationQuestion[];
  onQuestions: (q: ApplicationQuestion[]) => void;
  consent: boolean;
  onConsent: (on: boolean) => void;
  disabled?: boolean;
}) {
  const update = (i: number, patch: Partial<ApplicationQuestion>) => onQuestions(questions.map((q, j) => (j === i ? { ...q, ...patch } : q)));
  const move = (i: number, by: -1 | 1) => {
    const j = i + by;
    if (j < 0 || j >= questions.length) return;
    const next = [...questions];
    [next[i], next[j]] = [next[j], next[i]];
    onQuestions(next);
  };
  const add = (type: ApplicationQuestion['type']) =>
    onQuestions([...questions, { id: uid(), label: '', type, required: false, ...(hasOptions(type) ? { options: ['', ''] } : {}) }]);
  const setType = (i: number, type: ApplicationQuestion['type']) => {
    const q = questions[i];
    update(i, { type, options: hasOptions(type) ? (q.options && q.options.length ? q.options : ['', '']) : undefined });
  };
  const setOption = (i: number, k: number, v: string) => update(i, { options: (questions[i].options || []).map((o, n) => (n === k ? v : o)) });

  return (
    <div className="ape">
      <p className="ape-note">ชื่อ อายุ เพศ เบอร์โทร Line และข้อมูลสุขภาพ ระบบถามผู้จองให้อยู่แล้ว — เพิ่มเฉพาะคำถามของกิจกรรมนี้</p>

      {questions.length === 0 && <div className="ape-empty">ยังไม่มีคำถามเพิ่มเติม — ผู้จองกรอกแค่ข้อมูลส่วนตัว</div>}

      {questions.map((q, i) => (
        <div key={q.id} className="ape-q">
          <div className="ape-q-head">
            <span className="ape-n">{i + 1}</span>
            <div className="ape-types" role="radiogroup" aria-label={`ชนิดคำถามข้อ ${i + 1}`}>
              {TYPES.map((t) => (
                <button key={t.value} type="button" role="radio" aria-checked={q.type === t.value} className={q.type === t.value ? 'on' : ''} disabled={disabled} onClick={() => setType(i, t.value)}>
                  {t.label}
                </button>
              ))}
            </div>
            <label className="ape-req">
              <input type="checkbox" checked={q.required} disabled={disabled} onChange={(e) => update(i, { required: e.target.checked })} />
              <i aria-hidden />
              บังคับตอบ
            </label>
            <span className="ape-tools">
              <button type="button" onClick={() => move(i, -1)} disabled={disabled || i === 0} aria-label="เลื่อนขึ้น">
                ↑
              </button>
              <button type="button" onClick={() => move(i, 1)} disabled={disabled || i === questions.length - 1} aria-label="เลื่อนลง">
                ↓
              </button>
              <button type="button" className="del" onClick={() => onQuestions(questions.filter((_, j) => j !== i))} disabled={disabled} aria-label="ลบคำถาม">
                ×
              </button>
            </span>
          </div>
          <input className="ape-label" value={q.label} disabled={disabled} placeholder="พิมพ์คำถาม เช่น อยากได้อะไรจากกิจกรรมนี้" onChange={(e) => update(i, { label: e.target.value })} aria-label={`คำถามข้อ ${i + 1}`} />
          {hasOptions(q.type) ? (
            <div className="ape-opts">
              {(q.options || []).map((o, k) => (
                <div key={k} className="ape-opt">
                  <span className={`ape-mark ${q.type}`} aria-hidden />
                  <input value={o} disabled={disabled} placeholder={`ตัวเลือก ${k + 1}`} onChange={(e) => setOption(i, k, e.target.value)} aria-label={`ตัวเลือก ${k + 1} ของคำถามข้อ ${i + 1}`} />
                  {(q.options || []).length > 2 && (
                    <button type="button" disabled={disabled} onClick={() => update(i, { options: (q.options || []).filter((_, n) => n !== k) })} aria-label="ลบตัวเลือก">
                      ×
                    </button>
                  )}
                </div>
              ))}
              <button type="button" className="ape-addopt" disabled={disabled} onClick={() => update(i, { options: [...(q.options || []), ''] })}>
                + เพิ่มตัวเลือก
              </button>
            </div>
          ) : (
            <div className="ape-hint">{q.type === 'textarea' ? 'ผู้จองพิมพ์คำตอบยาว ๆ ได้' : 'ผู้จองพิมพ์คำตอบสั้น ๆ'}</div>
          )}
        </div>
      ))}

      <div className="ape-add">
        <span>เพิ่มคำถาม</span>
        {TYPES.map((t) => (
          <button key={t.value} type="button" disabled={disabled} onClick={() => add(t.value)}>
            {t.add}
          </button>
        ))}
      </div>

      <label className={`ape-pdpa ${consent ? 'on' : ''}`}>
        <input type="checkbox" checked={consent} disabled={disabled} onChange={(e) => onConsent(e.target.checked)} />
        <i aria-hidden />
        <span>
          <b>ขอความยินยอม PDPA · บันทึกภาพ เสียง และวิดีโอ</b>
          <small>
            {consent
              ? 'ผู้จองต้องเลือก “ยินยอม” หรือ “ไม่ยินยอม” ให้บันทึกและเผยแพร่ภาพ เสียง วิดีโอระหว่างกิจกรรม — ดูผลได้ในหน้าเช็คชื่อ'
              : 'ปิดอยู่ — เปิดเมื่อกิจกรรมนี้จะถ่ายภาพหรือวิดีโอไปใช้ประชาสัมพันธ์'}
          </small>
        </span>
      </label>
    </div>
  );
}
