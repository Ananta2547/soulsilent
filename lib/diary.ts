/* Personal diary — design "AllSoulLearn Journey + Diary v2" (migration 060).
 *
 * A day holds up to 3 moods and up to 6 pages. A mood is a family (สุข, รัก,
 * สงบ, เฉย ๆ, กลัว, โกรธ, เศร้า) with an optional nuance from that family's
 * ring. The first page is shorter than the rest because the day's heading and
 * workshop sit on top of it. Shared by the diary API and the diary screens. */

export type MoodKey = 'suk' | 'love' | 'calm' | 'wow' | 'fear' | 'angry' | 'sad';
export type Tone = 'pos' | 'neu' | 'neg';
export type Mood = { f: MoodKey; n: string };
export type Family = { key: MoodKey; label: string; tone: Tone; c: string; ink: boolean; ring: string[] };

export const FAMILIES: Family[] = [
  { key: 'suk', label: 'สุข', tone: 'pos', c: '#f5c243', ink: true, ring: ['สนุกสนาน', 'พอใจ', 'ภูมิใจ', 'มีพลัง', 'ตื่นเต้น', 'สมหวัง'] },
  { key: 'love', label: 'รัก', tone: 'pos', c: '#d98fa2', ink: true, ring: ['อบอุ่น', 'ขอบคุณ', 'เชื่อใจ', 'ถูกยอมรับ', 'ผูกพัน', 'เอ็นดู'] },
  { key: 'calm', label: 'สงบ', tone: 'pos', c: '#0d8a7e', ink: false, ring: ['ผ่อนคลาย', 'ปลอดภัย', 'นิ่ง', 'โปร่งเบา', 'มีสมาธิ', 'สบายใจ'] },
  { key: 'wow', label: 'เฉย ๆ', tone: 'neu', c: '#b9a6d4', ink: true, ring: ['ธรรมดา', 'เรื่อย ๆ', 'ไม่แน่ใจ', 'สับสน', 'ประหลาดใจ', 'ตกใจ'] },
  { key: 'fear', label: 'กลัว', tone: 'neg', c: '#e79a4f', ink: true, ring: ['กังวล', 'ประหม่า', 'เครียด', 'กดดัน', 'ไม่มั่นคง', 'ถูกคุกคาม'] },
  { key: 'angry', label: 'โกรธ', tone: 'neg', c: '#c9503f', ink: false, ring: ['หงุดหงิด', 'ข้องใจ', 'ขมขื่น', 'ไม่ยอมรับ', 'เมินเฉย', 'เดือดดาล'] },
  { key: 'sad', label: 'เศร้า', tone: 'neg', c: '#7f95b8', ink: true, ring: ['เหงา', 'น้อยใจ', 'เหนื่อยล้า', 'ว่างเปล่า', 'สิ้นหวัง', 'ละอาย'] },
];
export const FAM: Record<MoodKey, Family> = Object.fromEntries(FAMILIES.map((f) => [f.key, f])) as Record<MoodKey, Family>;
export const TONE_LABEL: Record<Tone, string> = { pos: 'ทางบวก', neu: 'กลาง', neg: 'ทางลบ' };

export const MAX_MOODS = 3;
export const MAX_PAGES = 10;
/** A page holds what fits its lines on screen (see reflowPages); these are
 *  only the safe first split for text written elsewhere (calendar, journey
 *  notes) — small enough to fit any page, which the book then fills up. */
export const CAP_FIRST = 150;
export const CAP_REST = 400;
export const capOf = (sub: number) => (sub === 0 ? CAP_FIRST : CAP_REST);
/** Server-side ceiling per stored page — well above what a page can show. */
export const PAGE_CHARS_MAX = 1000;

export type DiaryEntry = { day: string; moods: Mood[]; notes: string[]; updated_at?: string | null };

export const TH_MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
export const TH_MON = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
export const TH_WEEKDAY = ['วันอาทิตย์', 'วันจันทร์', 'วันอังคาร', 'วันพุธ', 'วันพฤหัสบดี', 'วันศุกร์', 'วันเสาร์'];
export const TH_DOW = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];

const pad = (n: number) => String(n).padStart(2, '0');
export const isoOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const dateOf = (iso: string) => new Date(iso + 'T00:00:00');
export const addDays = (iso: string, n: number) => {
  const d = dateOf(iso);
  d.setDate(d.getDate() + n);
  return isoOf(d);
};
/** Today on the reader's own clock (the browser). */
export const todayIso = () => isoOf(new Date());
/** Today in Thailand — what the server allows as the latest writable day. */
export function todayBangkok(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
export const isDay = (v: unknown): v is string => typeof v === 'string' && DAY_RE.test(v);

/** Moods as stored: known family, nuance from its ring (or none), no repeats, 3 max. */
export function cleanMoods(raw: unknown): Mood[] {
  if (!Array.isArray(raw)) return [];
  const out: Mood[] = [];
  for (const m of raw as { f?: unknown; n?: unknown }[]) {
    if (!m || typeof m !== 'object') continue;
    const fam = FAM[m.f as MoodKey];
    if (!fam) continue;
    const n = typeof m.n === 'string' && fam.ring.includes(m.n) ? m.n : '';
    if (out.some((x) => x.f === fam.key && x.n === n)) continue;
    out.push({ f: fam.key, n });
    if (out.length >= MAX_MOODS) break;
  }
  return out;
}

/** Pages as stored: strings, capped per page, at most 6, always at least one. */
export function cleanNotes(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw : [];
  const out = list.slice(0, MAX_PAGES).map((v) => (typeof v === 'string' ? v.slice(0, PAGE_CHARS_MAX) : ''));
  while (out.length > 1 && !out[out.length - 1].trim()) out.pop();
  return out.length ? out : [''];
}

/** Splits free text into pages the size the book holds. */
export function paginate(text: string): string[] {
  const pages: string[] = [];
  let rest = text;
  while (rest && pages.length < MAX_PAGES) {
    const cap = capOf(pages.length);
    pages.push(rest.slice(0, cap));
    rest = rest.slice(cap);
  }
  return pages.length ? pages : [''];
}

/** A cut may not land before a Thai vowel/tone mark or inside an emoji. */
function joinsBack(c: number): boolean {
  return c === 0x0e31 || (c >= 0x0e34 && c <= 0x0e3a) || (c >= 0x0e47 && c <= 0x0e4e) || (c >= 0xdc00 && c <= 0xdfff) || c === 0x200d || c === 0xfe0f;
}

/** The longest `extra` prefix (in chars) that still fits after `base`. */
export function fitPrefix(base: string, extra: string, fits: (t: string) => boolean): number {
  let lo = 0;
  let hi = extra.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (fits(base + extra.slice(0, mid))) lo = mid;
    else hi = mid - 1;
  }
  while (lo > 0 && lo < extra.length && joinsBack(extra.charCodeAt(lo))) lo--;
  return lo;
}

/**
 * Re-flows one day's pages so each holds exactly what fits its lines: from
 * page `from` on, a page that overflows pushes its tail to the front of the
 * next page, and a page with room pulls the next page's head back. `fitsAt`
 * gives the measure for page j, or null when that page cannot be measured
 * yet (it is reflowed later, once shown). Empty pages after `keep` are
 * dropped. Text is never lost: the page count may pass MAX_PAGES here.
 */
export function reflowPages(notes: string[], from: number, fitsAt: (j: number) => ((t: string) => boolean) | null, keep: number): string[] {
  const out = notes.slice();
  for (let j = Math.max(0, from); j < out.length; j++) {
    const fits = fitsAt(j);
    if (!fits) break;
    const t = out[j];
    if (!fits(t)) {
      const k = Math.max(1, fitPrefix('', t, fits));
      out[j] = t.slice(0, k);
      if (j + 1 < out.length) out[j + 1] = t.slice(k) + out[j + 1];
      else out.push(t.slice(k));
    } else if (j + 1 < out.length && out[j + 1]) {
      const next = out[j + 1];
      const m = fitPrefix(t, next, fits);
      if (m > 0) {
        out[j] = t + next.slice(0, m);
        out[j + 1] = next.slice(m);
      }
    }
  }
  while (out.length > Math.max(1, keep + 1) && !out[out.length - 1]) out.pop();
  return out;
}

export const hasContent =(e: Pick<DiaryEntry, 'moods' | 'notes'>) => e.moods.length > 0 || e.notes.some((t) => t.trim());

export function parseEntry(row: { day: string; moods_json: string | null; notes_json: string | null; updated_at?: string | null }): DiaryEntry {
  let moods: unknown = [];
  let notes: unknown = [''];
  try {
    moods = JSON.parse(row.moods_json || '[]');
  } catch {}
  try {
    notes = JSON.parse(row.notes_json || '[""]');
  } catch {}
  return { day: row.day, moods: cleanMoods(moods), notes: cleanNotes(notes), updated_at: row.updated_at ?? null };
}

/* ---------- colour helpers the screens share ---------- */

/** A swatch for a day: one colour, or split diagonally between up to three. */
export function blend(list: Mood[]): string {
  const cs = list.map((x) => FAM[x.f].c);
  if (!cs.length) return 'var(--gray-lighter, #e8edec)';
  if (cs.length === 1) return cs[0];
  if (cs.length === 2) return `linear-gradient(135deg,${cs[0]} 0 50%,${cs[1]} 50% 100%)`;
  return `linear-gradient(135deg,${cs[0]} 0 33%,${cs[1]} 33% 66%,${cs[2]} 66% 100%)`;
}
export function conic(list: Mood[]): string {
  if (!list.length) return 'transparent';
  return `conic-gradient(${list.map((x, i) => `${FAM[x.f].c} ${Math.round((i * 360) / list.length)}deg ${Math.round(((i + 1) * 360) / list.length)}deg`).join(',')})`;
}
export const moodLabel = (m: Mood) => m.n || FAM[m.f].label;
export const moodFullLabel = (m: Mood) => (m.n ? `${FAM[m.f].label} · ${m.n}` : FAM[m.f].label);

/** Turns a design "a:b;c:d" style string into a React style object, so the
 *  design's inline styles can be carried over as written. */
export function css(s: string): Record<string, string> {
  const o: Record<string, string> = {};
  for (const part of s.split(';')) {
    const i = part.indexOf(':');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (!k) continue;
    const key = k.startsWith('--') ? k : k.replace(/^-(webkit|moz|ms)-/, (_m, p: string) => p.charAt(0).toUpperCase() + p.slice(1) + '-').replace(/-([a-z])/g, (_m, c: string) => c.toUpperCase());
    o[key] = v;
  }
  return o;
}
