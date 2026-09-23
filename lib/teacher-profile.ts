/** The self-written part of a teacher's public page (users.teacher_profile_json,
 *  migration 057). Every field is optional; the page hides what is empty.
 *  No server imports — the page and the API both read this. */

export type Takeaway = { title: string; body: string };

/** One step on the teacher's journey, shown as a timeline ordered by year. */
export type JourneyStep = { year: string; title: string; body: string };

export const SOCIAL_KINDS = ['facebook', 'instagram', 'line', 'tiktok', 'youtube', 'x', 'website'] as const;
export type SocialKind = (typeof SOCIAL_KINDS)[number];
export type SocialLink = { kind: SocialKind; url: string };
export const SOCIAL_LABEL: Record<SocialKind, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  line: 'LINE',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  x: 'X',
  website: 'Website',
};

export type TeacherProfile = {
  /** Years teaching, shown as a headline number. */
  years: number | null;
  /** One-line promise under the name. Falls back to the bio when empty. */
  promise: string;
  /** "What you take home" — up to MAX_TAKEAWAYS numbered items. */
  takeaways: Takeaway[];
  /** The belief quoted on the dark band, in the teacher's own words. */
  belief: string;
  /** Their path so far, one step per year (or span), oldest first on the page. */
  journey: JourneyStep[];
  /** Where people can reach them, shown as links in the contact band. */
  socials: SocialLink[];
};

export const MAX_TAKEAWAYS = 5;
export const MAX_JOURNEY = 12;
export const MAX_SOCIALS = 7;
export const LIMITS = { promise: 300, title: 80, body: 300, belief: 300, years: 80, year: 12, url: 300, journeyBody: 500 } as const;

export const EMPTY_PROFILE: TeacherProfile = { years: null, promise: '', takeaways: [], belief: '', journey: [], socials: [] };

/** A link a visitor can safely open: http(s) only, "https://" added when the
 *  teacher typed a bare domain. Anything else is dropped. */
export function cleanUrl(v: unknown): string {
  const s = typeof v === 'string' ? v.trim().slice(0, LIMITS.url) : '';
  if (!s) return '';
  const withScheme = /^https?:\/\//i.test(s) ? s : `https://${s.replace(/^\/+/, '')}`;
  try {
    const u = new URL(withScheme);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : '';
  } catch {
    return '';
  }
}

/** Steps sorted by the first number in their year ("2017", "2018–2020"),
 *  steps without one kept last in the order written. */
export function sortedJourney(steps: JourneyStep[]): JourneyStep[] {
  const key = (y: string) => {
    const m = y.match(/\d{4}/);
    return m ? Number(m[0]) : Infinity;
  };
  return steps.map((s, i) => ({ s, i })).sort((a, b) => key(a.s.year) - key(b.s.year) || a.i - b.i).map((x) => x.s);
}

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
  const journey = (Array.isArray(o.journey) ? o.journey : [])
    .map((t): JourneyStep => {
      const x = (t && typeof t === 'object' ? t : {}) as Record<string, unknown>;
      return { year: str(x.year, LIMITS.year), title: str(x.title, LIMITS.title), body: str(x.body, LIMITS.journeyBody) };
    })
    .filter((t) => t.year || t.title || t.body)
    .slice(0, MAX_JOURNEY);
  const socials = (Array.isArray(o.socials) ? o.socials : [])
    .map((t): SocialLink | null => {
      const x = (t && typeof t === 'object' ? t : {}) as Record<string, unknown>;
      const kind = SOCIAL_KINDS.includes(x.kind as SocialKind) ? (x.kind as SocialKind) : null;
      const url = cleanUrl(x.url);
      return kind && url ? { kind, url } : null;
    })
    .filter((t): t is SocialLink => !!t)
    .slice(0, MAX_SOCIALS);
  return { years, promise: str(o.promise, LIMITS.promise), takeaways, belief: str(o.belief, LIMITS.belief), journey, socials };
}

export function isEmptyProfile(p: TeacherProfile): boolean {
  return p.years == null && !p.promise && p.takeaways.length === 0 && !p.belief && p.journey.length === 0 && p.socials.length === 0;
}
