'use client';

/* The AAR survey builder — title, intro, questions (text / one choice / many
 * choices) and the stars-and-review ending every survey has. Used for one
 * round (the roster's AAR tab) and for a round activity as a whole. */

import { newQuestionId, type SurveyQuestion, type SurveyQuestionType } from '@/lib/survey';

/** The four classic after-action review questions — where a new survey starts. */
export const starterQuestions = (): SurveyQuestion[] => [
  { id: newQuestionId(), type: 'text', label: 'ก่อนเริ่มกิจกรรม คุณคาดหวังอะไรไว้บ้าง', options: [], allowOther: false, required: true },
  { id: newQuestionId(), type: 'text', label: 'สิ่งที่เกิดขึ้นจริงเป็นอย่างไร', options: [], allowOther: false, required: true },
  { id: newQuestionId(), type: 'text', label: 'ทำไมจึงต่างหรือเหมือนกับที่คาดไว้', options: [], allowOther: false, required: false },
  { id: newQuestionId(), type: 'text', label: 'ครั้งหน้าอยากให้ปรับหรือเพิ่มอะไร', options: [], allowOther: false, required: false },
];
const blankQ = (type: SurveyQuestionType): SurveyQuestion => ({ id: newQuestionId(), type, label: '', options: type === 'text' ? [] : ['', ''], allowOther: false, required: true });
const QTYPES: [SurveyQuestionType, string][] = [
  ['text', 'ข้อความ'],
  ['single', 'เลือกข้อเดียว'],
  ['multi', 'เลือกหลายข้อ'],
];

export function SurveyEditor({
  title,
  intro,
  questions,
  onTitle,
  onIntro,
  onQuestions,
}: {
  title: string;
  intro: string;
  questions: SurveyQuestion[];
  onTitle: (v: string) => void;
  onIntro: (v: string) => void;
  /** Called with an updater, like a state setter. */
  onQuestions: (fn: (qs: SurveyQuestion[]) => SurveyQuestion[]) => void;
}) {
  const edit = onQuestions;
  const patchQ = (i: number, p: Partial<SurveyQuestion>) => edit((qs) => qs.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const moveQ = (i: number, d: -1 | 1) =>
    edit((qs) => {
      const j = i + d;
      if (j < 0 || j >= qs.length) return qs;
      const n = [...qs];
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });

  return (
    <>
      <div className="tdb-panel" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span className="tdb-mono-label">ชื่อแบบสอบถาม</span>
          <input
            type="text"
            value={title}
            maxLength={200}
            onChange={(e) => onTitle(e.target.value)}
            className="field"
            style={{ fontFamily: "'Mitr', sans-serif", fontSize: 18, fontWeight: 500 }}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span className="tdb-mono-label">คำอธิบาย · ไม่บังคับ</span>
          <textarea
            rows={2}
            value={intro}
            maxLength={2000}
            onChange={(e) => onIntro(e.target.value)}
            className="field"
            style={{ fontSize: 14, resize: 'vertical' }}
            placeholder="เช่น ขอบคุณที่มาร่วมกัน ใช้เวลาประมาณ 3 นาที"
          />
        </label>
      </div>

      {questions.map((qq, i) => (
        <div key={qq.id} className="tdb-q">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span className="tdb-q-n">{i + 1}</span>
            <div className="tdb-qtypes">
              {QTYPES.map(([t, label]) => (
                <button
                  key={t}
                  type="button"
                  className={qq.type === t ? 'on' : ''}
                  onClick={() => patchQ(i, { type: t, options: t === 'text' ? [] : qq.options.length ? qq.options : ['', ''], allowOther: t === 'text' ? false : qq.allowOther })}
                >
                  {label}
                </button>
              ))}
            </div>
            <button type="button" className={`tdb-toggle ${qq.required ? 'on' : ''}`} onClick={() => patchQ(i, { required: !qq.required })} aria-pressed={qq.required}>
              <i />
              บังคับตอบ
            </button>
            <span style={{ display: 'inline-flex', gap: 2 }}>
              <button type="button" className="tdb-icon-btn" disabled={i === 0} onClick={() => moveQ(i, -1)} aria-label="เลื่อนขึ้น">↑</button>
              <button type="button" className="tdb-icon-btn" disabled={i === questions.length - 1} onClick={() => moveQ(i, 1)} aria-label="เลื่อนลง">↓</button>
              <button type="button" className="tdb-icon-btn danger" onClick={() => edit((qs) => qs.filter((_, j) => j !== i))} aria-label="ลบคำถาม">×</button>
            </span>
          </div>
          <input type="text" value={qq.label} maxLength={300} onChange={(e) => patchQ(i, { label: e.target.value })} placeholder="พิมพ์คำถาม" className="field" style={{ fontSize: 15, fontWeight: 500 }} />
          {qq.type === 'text' ? (
            <div style={{ borderRadius: 14, border: '1.5px dashed var(--cream-deep)', padding: '12px 14px', fontSize: 13, color: '#9aaba8' }}>ผู้ตอบพิมพ์คำตอบเอง</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {qq.options.map((o, oi) => (
                <div key={oi} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span className={`tdb-mark ${qq.type === 'multi' ? 'sq' : ''}`} />
                  <input
                    type="text"
                    value={o}
                    maxLength={200}
                    onChange={(e) => patchQ(i, { options: qq.options.map((x, k) => (k === oi ? e.target.value : x)) })}
                    placeholder={`ตัวเลือกที่ ${oi + 1}`}
                    className="field"
                    style={{ padding: '9px 12px', fontSize: 14 }}
                  />
                  <button type="button" className="tdb-icon-btn" onClick={() => patchQ(i, { options: qq.options.filter((_, k) => k !== oi) })} aria-label="ลบตัวเลือก">×</button>
                </div>
              ))}
              {qq.allowOther && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13.5, color: 'var(--muted)', padding: '4px 0' }}>
                  <span className={`tdb-mark ${qq.type === 'multi' ? 'sq' : ''}`} />
                  <span style={{ flex: 1 }}>อื่น ๆ (ผู้ตอบพิมพ์เอง)</span>
                  <button type="button" className="tdb-icon-btn" onClick={() => patchQ(i, { allowOther: false })} aria-label="เอาอื่น ๆ ออก">×</button>
                </div>
              )}
              <div style={{ display: 'flex', gap: 16, paddingTop: 2 }}>
                <button type="button" className="tdb-textlink" style={{ padding: 0 }} onClick={() => patchQ(i, { options: [...qq.options, ''] })}>
                  + เพิ่มตัวเลือก
                </button>
                {!qq.allowOther && (
                  <button type="button" className="tdb-textlink" style={{ padding: 0 }} onClick={() => patchQ(i, { allowOther: true })}>
                    + เพิ่ม “อื่น ๆ”
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      ))}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '6px 2px' }}>
        <span style={{ fontSize: 13, color: 'var(--muted)' }}>เพิ่มคำถาม</span>
        {QTYPES.map(([t, label]) => (
          <button key={t} type="button" className="btn btn-paper btn-sm" onClick={() => edit((qs) => [...qs, blankQ(t)])}>
            + {label}
          </button>
        ))}
      </div>

      <div style={{ borderRadius: 22, border: '1.5px dashed var(--cream-deep)', padding: '18px 20px', display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 26, color: 'var(--accent)', letterSpacing: 2 }}>★★★★★</span>
        <span style={{ flex: 1, minWidth: 220 }}>
          <span style={{ display: 'block', fontWeight: 600, fontSize: 14 }}>ส่วนท้ายเสมอ · ให้ดาวและรีวิว</span>
          <span style={{ display: 'block', fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.55, marginTop: 2 }}>ผู้ตอบให้ดาว 1–5 (บังคับ) และเขียนรีวิวสั้น ๆ ได้ — นับเป็นรีวิวของกิจกรรมนี้</span>
        </span>
      </div>
    </>
  );
}
