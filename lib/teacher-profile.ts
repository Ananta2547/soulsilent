/** The self-written part of a teacher's public page (users.teacher_profile_json,
 *  migration 057). Every field is optional; the page hides what is empty.
 *  No server imports — the page and the API both read this. */

import type { ImageMeta } from '@/lib/types';

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
  /** The self-written blocks between the hero and the works rail, in the order
   *  the teacher arranged them. Each kind may appear any number of times. */
  sections: ProfileSection[];
  /** Where people can reach them, shown as links in the contact band. */
  socials: SocialLink[];
};

/** A block the teacher adds to their page:
 *  - takeaways — "What you take home", up to MAX_TAKEAWAYS numbered items
 *  - journey   — their path, one step per year (or span), sorted by year on the page
 *  - belief    — one line quoted on the dark band
 *  - text      — a free heading and paragraph, either of which may be left out
 *  - reviews   — reviews people left on this host's rounds, picked by id
 *  - gallery   — up to MAX_GALLERY photos, each with a one-line caption
 *  An empty eyebrow or title means the page's default wording, so it still
 *  follows the visitor's language. */
export type ProfileSection =
  | { id: string; kind: 'takeaways'; eyebrow: string; title: string; items: Takeaway[] }
  | { id: string; kind: 'journey'; eyebrow: string; title: string; items: JourneyStep[] }
  | { id: string; kind: 'belief'; text: string }
  | { id: string; kind: 'text'; title: string; body: string }
  | { id: string; kind: 'reviews'; eyebrow: string; title: string; ids: string[] }
  | { id: string; kind: 'gallery'; eyebrow: string; title: string; images: GalleryImage[] };

/** A gallery photo: the cropped `url` plus `meta` (original + crop) so it can
 *  be re-cropped, as every image field does (see AGENTS.md). */
export type GalleryImage = { url: string; meta: ImageMeta | null; caption: string };
export type SectionKind = ProfileSection['kind'];

export const MAX_SECTIONS = 12;
export const MAX_TAKEAWAYS = 5;
export const MAX_JOURNEY = 12;
export const MAX_REVIEWS = 6;
export const MAX_GALLERY = 5;
export const MAX_SOCIALS = 7;
export const LIMITS = { promise: 300, eyebrow: 60, title: 80, body: 300, belief: 300, years: 80, year: 12, url: 300, journeyBody: 500, textBody: 1500, caption: 100 } as const;

export const EMPTY_PROFILE: TeacherProfile = { years: null, promise: '', sections: [], socials: [] };

/** A fresh empty block of the given kind, with an id unique enough for one page. */
export function newSection(kind: SectionKind): ProfileSection {
  const id = `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  switch (kind) {
    case 'belief':
      return { id, kind, text: '' };
    case 'text':
      return { id, kind, title: '', body: '' };
    case 'reviews':
      return { id, kind, eyebrow: '', title: '', ids: [] };
    case 'gallery':
      return { id, kind, eyebrow: '', title: '', images: [] };
    default:
      return { id, kind, eyebrow: '', title: '', items: [] };
  }
}

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

/** Our own uploads (/api/media/…) or an https image; anything else is dropped. */
function imageUrl(v: unknown): string {
  const s = typeof v === 'string' ? v.trim().slice(0, LIMITS.url) : '';
  return s.startsWith('/api/media/') || /^https:\/\//i.test(s) ? s : '';
}

/** Crop metadata from the uploader, kept only when it has the expected shape. */
function imageMeta(v: unknown): ImageMeta | null {
  if (!v || typeof v !== 'object') return null;
  const m = v as Record<string, unknown>;
  const c = (m.crop && typeof m.crop === 'object' ? m.crop : null) as Record<string, unknown> | null;
  const original = imageUrl(m.original_url);
  if (!original || !c) return null;
  const n = (k: string) => (Number.isFinite(Number(c[k])) ? Number(c[k]) : 0);
  const aspect = Number(m.aspect);
  return {
    original_url: original,
    crop: { unit: c.unit === 'px' ? 'px' : '%', x: n('x'), y: n('y'), width: n('width'), height: n('height') } as ImageMeta['crop'],
    ...(Number.isFinite(aspect) && aspect > 0 ? { aspect } : {}),
  };
}

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
  const takes = (v: unknown): Takeaway[] =>
    (Array.isArray(v) ? v : [])
      .map((t): Takeaway => {
        const x = (t && typeof t === 'object' ? t : {}) as Record<string, unknown>;
        return { title: str(x.title, LIMITS.title), body: str(x.body, LIMITS.body) };
      })
      .filter((t) => t.title || t.body)
      .slice(0, MAX_TAKEAWAYS);
  const steps = (v: unknown): JourneyStep[] =>
    (Array.isArray(v) ? v : [])
      .map((t): JourneyStep => {
        const x = (t && typeof t === 'object' ? t : {}) as Record<string, unknown>;
        return { year: str(x.year, LIMITS.year), title: str(x.title, LIMITS.title), body: str(x.body, LIMITS.journeyBody) };
      })
      .filter((t) => t.year || t.title || t.body)
      .slice(0, MAX_JOURNEY);

  // Profiles saved before sections existed hold one of each block in fixed
  // order (takeaways, journey, belief); read them as three sections.
  const rawSections: unknown[] = Array.isArray(o.sections)
    ? o.sections
    : [
        { kind: 'takeaways', items: o.takeaways },
        { kind: 'journey', items: o.journey },
        { kind: 'belief', text: o.belief },
      ];
  const seen = new Set<string>();
  const sections = rawSections
    .map((t, i): ProfileSection | null => {
      const x = (t && typeof t === 'object' ? t : {}) as Record<string, unknown>;
      let id = str(x.id, 40).replace(/[^\w-]/g, '') || `s${i}`;
      if (seen.has(id)) id = `${id}-${i}`;
      seen.add(id);
      if (x.kind === 'belief') {
        const text = str(x.text, LIMITS.belief);
        return text ? { id, kind: 'belief', text } : null;
      }
      const eyebrow = str(x.eyebrow, LIMITS.eyebrow);
      const title = str(x.title, LIMITS.title);
      if (x.kind === 'text') {
        const body = str(x.body, LIMITS.textBody);
        return title || body ? { id, kind: 'text', title, body } : null;
      }
      if (x.kind === 'gallery') {
        const images = (Array.isArray(x.images) ? x.images : [])
          .map((g): GalleryImage | null => {
            const y = (g && typeof g === 'object' ? g : {}) as Record<string, unknown>;
            const url = imageUrl(y.url);
            if (!url) return null;
            // One line only: newlines in a caption collapse to spaces.
            return { url, meta: imageMeta(y.meta), caption: str(y.caption, LIMITS.caption).replace(/\s*\n\s*/g, ' ') };
          })
          .filter((g): g is GalleryImage => !!g)
          .slice(0, MAX_GALLERY);
        return images.length ? { id, kind: 'gallery', eyebrow, title, images } : null;
      }
      if (x.kind === 'reviews') {
        const ids = [...new Set((Array.isArray(x.ids) ? x.ids : []).map((v) => str(v, 64).replace(/[^\w-]/g, '')).filter(Boolean))].slice(0, MAX_REVIEWS);
        return ids.length ? { id, kind: 'reviews', eyebrow, title, ids } : null;
      }
      if (x.kind === 'takeaways') {
        const items = takes(x.items);
        return items.length ? { id, kind: 'takeaways', eyebrow, title, items } : null;
      }
      if (x.kind === 'journey') {
        const items = steps(x.items);
        return items.length ? { id, kind: 'journey', eyebrow, title, items } : null;
      }
      return null;
    })
    .filter((t): t is ProfileSection => !!t)
    .slice(0, MAX_SECTIONS);
  const socials = (Array.isArray(o.socials) ? o.socials : [])
    .map((t): SocialLink | null => {
      const x = (t && typeof t === 'object' ? t : {}) as Record<string, unknown>;
      const kind = SOCIAL_KINDS.includes(x.kind as SocialKind) ? (x.kind as SocialKind) : null;
      const url = cleanUrl(x.url);
      return kind && url ? { kind, url } : null;
    })
    .filter((t): t is SocialLink => !!t)
    .slice(0, MAX_SOCIALS);
  return { years, promise: str(o.promise, LIMITS.promise), sections, socials };
}

export function isEmptyProfile(p: TeacherProfile): boolean {
  return p.years == null && !p.promise && p.sections.length === 0 && p.socials.length === 0;
}
