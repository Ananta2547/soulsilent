/* After-action review (AAR) surveys — migration 059.
 *
 * A teacher builds one survey per workshop out of three kinds of question:
 *   text   — free answer (no short / long split)
 *   single — pick one option; may offer "อื่นๆ" with a typed answer
 *   multi  — tick any number of options; may offer "อื่นๆ" too
 * Every survey ends with a 1–5 star rating and an optional comment, which is
 * not a question the teacher adds — it is always there, always last.
 *
 * Shared by the teacher builder, the participant form and both APIs so the
 * shape is checked the same way on both sides. */

export type SurveyQuestionType = 'text' | 'single' | 'multi';

export type SurveyQuestion = {
  id: string;
  type: SurveyQuestionType;
  label: string;
  /** Choices for single / multi; empty for text. */
  options: string[];
  /** Adds an "อื่นๆ" choice the participant types into. */
  allowOther: boolean;
  required: boolean;
};

/** One answer. `selected` for choice questions, `other` when "อื่นๆ" was
 *  picked, `text` for a text question. */
export type SurveyAnswer = { selected?: string[]; other?: string; text?: string };
export type SurveyAnswers = Record<string, SurveyAnswer>;

export type Survey = {
  id: string;
  workshop_id: string;
  title: string | null;
  intro: string | null;
  questions: SurveyQuestion[];
  is_open: boolean;
  updated_at?: string | null;
};

export type SurveyResponse = {
  id: string;
  user_id: string;
  booking_id: string | null;
  answers: SurveyAnswers;
  rating: number;
  comment: string | null;
  created_at: string;
};

/** Marker for the "อื่นๆ" choice inside `selected`. */
export const OTHER = '__other__';

export const QUESTION_TYPES: { type: SurveyQuestionType; th: string; en: string }[] = [
  { type: 'text', th: 'ตอบแบบข้อความ', en: 'Text answer' },
  { type: 'single', th: 'ตัวเลือก (ตอบได้ข้อเดียว)', en: 'Choice (one answer)' },
  { type: 'multi', th: 'ตัวเลือก (ตอบได้หลายข้อ)', en: 'Choice (many answers)' },
];

const MAX_QUESTIONS = 40;
const MAX_OPTIONS = 20;
const MAX_TEXT = 2000;

const clip = (v: unknown, n: number) => (typeof v === 'string' ? v.trim().slice(0, n) : '');

export function newQuestionId(): string {
  return 'q' + Math.random().toString(36).slice(2, 10);
}

/** Cleans whatever the builder sent into a list that is safe to store:
 *  known types only, labels required, choice questions need two options. */
export function sanitizeQuestions(raw: unknown): { questions: SurveyQuestion[]; error?: string } {
  if (!Array.isArray(raw)) return { questions: [], error: 'รูปแบบคำถามไม่ถูกต้อง' };
  if (raw.length > MAX_QUESTIONS) return { questions: [], error: `คำถามได้ไม่เกิน ${MAX_QUESTIONS} ข้อ` };
  const seen = new Set<string>();
  const out: SurveyQuestion[] = [];
  for (let i = 0; i < raw.length; i++) {
    const q = raw[i] as Partial<SurveyQuestion> | null;
    if (!q || typeof q !== 'object') continue;
    const type: SurveyQuestionType = q.type === 'single' || q.type === 'multi' ? q.type : 'text';
    const label = clip(q.label, 300);
    if (!label) return { questions: [], error: `ข้อ ${i + 1} ยังไม่มีคำถาม` };
    let id = clip(q.id, 40).replace(/[^a-zA-Z0-9_-]/g, '');
    if (!id || seen.has(id)) id = newQuestionId();
    seen.add(id);
    let options: string[] = [];
    if (type !== 'text') {
      options = [...new Set((Array.isArray(q.options) ? q.options : []).map((o) => clip(o, 200)).filter(Boolean))].slice(0, MAX_OPTIONS);
      const allowOther = !!q.allowOther;
      if (options.length + (allowOther ? 1 : 0) < 2) return { questions: [], error: `ข้อ ${i + 1} ต้องมีตัวเลือกอย่างน้อย 2 ข้อ` };
    }
    out.push({ id, type, label, options, allowOther: type !== 'text' && !!q.allowOther, required: !!q.required });
  }
  return { questions: out };
}

/** Checks a participant's answers against the questions. Returns the cleaned
 *  answers (unknown questions and invalid choices dropped) or the first error. */
export function validateAnswers(questions: SurveyQuestion[], raw: unknown): { answers: SurveyAnswers; error?: string } {
  const src = (raw && typeof raw === 'object' ? raw : {}) as Record<string, SurveyAnswer | undefined>;
  const answers: SurveyAnswers = {};
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const a = src[q.id] || {};
    if (q.type === 'text') {
      const text = clip(a.text, MAX_TEXT);
      if (text) answers[q.id] = { text };
      else if (q.required) return { answers: {}, error: `กรุณาตอบข้อ ${i + 1}` };
      continue;
    }
    const allowed = new Set(q.allowOther ? [...q.options, OTHER] : q.options);
    let selected = [...new Set((Array.isArray(a.selected) ? a.selected : []).filter((s) => typeof s === 'string' && allowed.has(s)))];
    if (q.type === 'single') selected = selected.slice(0, 1);
    const other = selected.includes(OTHER) ? clip(a.other, 300) : '';
    if (selected.includes(OTHER) && !other) return { answers: {}, error: `ข้อ ${i + 1}: กรุณาระบุคำตอบ "อื่นๆ"` };
    if (selected.length === 0) {
      if (q.required) return { answers: {}, error: `กรุณาตอบข้อ ${i + 1}` };
      continue;
    }
    answers[q.id] = other ? { selected, other } : { selected };
  }
  return { answers };
}

/** An answer as one line of text, for the teacher's view. */
export function answerText(q: SurveyQuestion, a: SurveyAnswer | undefined): string {
  if (!a) return '';
  if (q.type === 'text') return a.text || '';
  return (a.selected || []).map((s) => (s === OTHER ? `อื่นๆ: ${a.other || ''}` : s)).join(', ');
}

export function parseQuestions(json: string | null | undefined): SurveyQuestion[] {
  try {
    const v = JSON.parse(json || '[]');
    return Array.isArray(v) ? (v as SurveyQuestion[]) : [];
  } catch {
    return [];
  }
}

export function parseAnswers(json: string | null | undefined): SurveyAnswers {
  try {
    const v = JSON.parse(json || '{}');
    return v && typeof v === 'object' ? (v as SurveyAnswers) : {};
  } catch {
    return {};
  }
}

type SurveyRow = {
  id: string;
  workshop_id: string;
  title: string | null;
  intro: string | null;
  questions_json: string;
  is_open: number;
  updated_at?: string | null;
};

export function surveyFromRow(r: SurveyRow): Survey {
  return {
    id: r.id,
    workshop_id: r.workshop_id,
    title: r.title,
    intro: r.intro,
    questions: parseQuestions(r.questions_json),
    is_open: !!r.is_open,
    updated_at: r.updated_at ?? null,
  };
}
