import type { ApplicationQuestion } from '@/lib/types';

/** The questions a round activity asks before booking, and its PDPA switch
 *  (migration 069). Shared by the host's editor and the admin master form. */

const TYPES: ApplicationQuestion['type'][] = ['text', 'textarea', 'select', 'radio', 'checkbox'];
export const hasOptions = (t: ApplicationQuestion['type']) => t === 'select' || t === 'radio' || t === 'checkbox';
const MAX_QUESTIONS = 30;

/** Keep only well-formed questions: a label, a known type, and at least two
 *  options for the choice types. Returns an error for anything half-written. */
export function cleanQuestions(input: unknown): { questions: ApplicationQuestion[] } | { error: string } {
  const list = Array.isArray(input) ? input : [];
  if (list.length > MAX_QUESTIONS) return { error: `ใบสมัครมีได้สูงสุด ${MAX_QUESTIONS} คำถาม` };
  const out: ApplicationQuestion[] = [];
  for (const [i, raw] of list.entries()) {
    const q = (raw || {}) as Partial<ApplicationQuestion>;
    const label = String(q.label ?? '').trim().slice(0, 300);
    if (!label) return { error: `คำถามข้อ ${i + 1} ยังไม่มีข้อความ` };
    const type = TYPES.includes(q.type as ApplicationQuestion['type']) ? (q.type as ApplicationQuestion['type']) : 'text';
    const item: ApplicationQuestion = {
      id: String(q.id || '').trim().slice(0, 40) || `q_${Math.random().toString(36).slice(2, 9)}`,
      label,
      type,
      required: !!q.required,
    };
    if (hasOptions(type)) {
      const options = (Array.isArray(q.options) ? q.options : []).map((o) => String(o).trim().slice(0, 120)).filter(Boolean);
      if (options.length < 2) return { error: `คำถามข้อ ${i + 1} ต้องมีตัวเลือกอย่างน้อย 2 ข้อ` };
      item.options = [...new Set(options)].slice(0, 20);
    }
    out.push(item);
  }
  return { questions: out };
}

/** Thai calendar day now, to tell rounds that have not started yet. */
export const thaiToday = () => new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);

/** Save a master's form + PDPA switch and push them to its rounds from today on. */
export async function saveMasterApplication(
  db: D1Database,
  masterId: string,
  questions: ApplicationQuestion[],
  requireConsent: boolean,
): Promise<number> {
  const json = JSON.stringify(questions);
  const consent = requireConsent ? 1 : 0;
  const [, rounds] = await db.batch([
    db.prepare("UPDATE workshop_masters SET application_form = ?, require_consent = ?, updated_at = datetime('now') WHERE id = ?").bind(json, consent, masterId),
    db
      .prepare("UPDATE workshops SET application_form = ?, require_consent = ?, updated_at = datetime('now') WHERE master_id = ? AND status != 'cancelled' AND date >= ?")
      .bind(json, consent, masterId, thaiToday()),
  ]);
  return rounds.meta.changes ?? 0;
}
