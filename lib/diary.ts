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
export const MAX_PAGES = 6;
/** Characters per page: the first page shares space with the day heading. */
export const CAP_FIRST = 220;
export const CAP_REST = 520;
export const capOf = (sub: number) => (sub === 0 ? CAP_FIRST : CAP_REST);

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
  const out = list.slice(0, MAX_PAGES).map((v, i) => (typeof v === 'string' ? v.slice(0, capOf(i)) : ''));
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

export const hasContent = (e: Pick<DiaryEntry, 'moods' | 'notes'>) => e.moods.length > 0 || e.notes.some((t) => t.trim());

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
