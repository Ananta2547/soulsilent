/** The self-written part of a teacher's public page (users.teacher_profile_json,
 *  migration 057). Every field is optional; the page hides what is empty.
 *  No server imports — the page and the API both read this. */

export type Takeaway = { title: string; body: string };

export type TeacherProfile = {
  /** Years teaching, shown as a headline number. */
  years: number | null;
  /** One-line promise under the name. Falls back to the bio when empty. */
  promise: string;
  /** "What you take home" — up to MAX_TAKEAWAYS numbered items. */
  takeaways: Takeaway[];
  /** The belief quoted on the dark band, in the teacher's own words. */
  belief: string;
};

export const MAX_TAKEAWAYS = 5;
export const LIMITS = { promise: 300, title: 80, body: 300, belief: 300, years: 80 } as const;

export const EMPTY_PROFILE: TeacherProfile = { years: null, promise: '', takeaways: [], belief: '' };

const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** Read a stored blob (or a PUT body) into a clean profile. Never throws;
 *  anything malformed collapses to the empty shape. */
export function parseTeacherProfile(input: unknown): TeacherProfile {
  let raw: unknown = input;
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      raw = null;
    }
  }
  if (!raw || typeof raw !== 'object') return { ...EMPTY_PROFILE };
  const o = raw as Record<string, unknown>;
  const yearsNum = Number(o.years);
  const years = Number.isFinite(yearsNum) && yearsNum > 0 ? Math.min(Math.round(yearsNum), LIMITS.years) : null;
  const takeaways = (Array.isArray(o.takeaways) ? o.takeaways : [])
    .map((t): Takeaway => {
      const x = (t && typeof t === 'object' ? t : {}) as Record<string, unknown>;
      return { title: str(x.title, LIMITS.title), body: str(x.body, LIMITS.body) };
    })
    .filter((t) => t.title || t.body)
    .slice(0, MAX_TAKEAWAYS);
  return { years, promise: str(o.promise, LIMITS.promise), takeaways, belief: str(o.belief, LIMITS.belief) };
}

export function isEmptyProfile(p: TeacherProfile): boolean {
  return p.years == null && !p.promise && p.takeaways.length === 0 && !p.belief;
}
