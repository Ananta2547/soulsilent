'use client';

/* Calendar v2 — design "Calendar Redesign" (Claude Design project 05f41176).
 * The site navbar stays; the design's own top bar is not brought over.
 *
 * One screen: the month grid on the left, the selected day on the right
 * (a bottom panel on phones). A day lists its workshops and the user's own
 * events (ลงกิจกรรม, /api/me/events), and its diary page — the same entry the
 * Diary book on My Journey writes (/api/me/diary). */

import './calendar.css';
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import Link from 'next/link';
import type { Workshop } from '@/lib/types';
import { getEffectivePrice, getWorkshopDays, hasWorkshopEnded } from '@/lib/workshop-utils';
import { useLoadingTracker } from '@/components/design/DataLoading';
import { Btn } from '@/components/design/RippleButton';
import { Cloud, DotCluster, Squiggle } from '@/components/design/Doodles';
import { FAM, FAMILIES, MAX_MOODS, TH_MON, TH_MONTHS, css, paginate, type DiaryEntry, type Mood, type MoodKey } from '@/lib/diary';
import { EVENT_KIND, EVENT_KINDS, type UserEvent } from '@/lib/user-events';

type Booking = { workshop_id: string; status: string; payment_status: string; attended: number | null; app_status: string };
type St = 'available' | 'applied' | 'full' | 'past';
type Filter = 'all' | 'ws' | 'mine' | 'diary';
type Mode = null | 'event' | 'diary' | 'ws';
type EvDraft = Omit<UserEvent, 'id'> & { id: string | null; err: string };
type DyDraft = { moods: Mood[]; text: string; open: MoodKey | null };

const TH_DOW = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
const TH_WD = ['วันอาทิตย์', 'วันจันทร์', 'วันอังคาร', 'วันพุธ', 'วันพฤหัสบดี', 'วันศุกร์', 'วันเสาร์'];
const TINT: Record<St, { bg: string; fg: string }> = {
  available: { bg: '#d4ece8', fg: '#075a51' },
  applied: { bg: '#fce4a0', fg: '#5a4300' },
  full: { bg: '#f7d4d1', fg: '#9c2f2b' },
  past: { bg: '#ebe8e0', fg: '#6f6f68' },
};
const STATUS: Record<St, [string, string, string]> = { available: ['#0d8a7e', '#fff', 'เปิดรับ'], applied: ['#f2b705', '#3f3100', 'จองแล้ว'], full: ['#d94b46', '#fff', 'เต็มแล้ว'], past: ['#cbcbc4', '#5f5f59', 'จบแล้ว'] };
const BANNER: Record<St, string> = { available: '#0d1e1d', applied: '#0d8a7e', full: '#d94b46', past: '#6a7a78' };
const FILTERS: [Filter, string][] = [['all', 'ทั้งหมด'], ['ws', 'Workshop'], ['mine', 'ของฉัน'], ['diary', 'Diary']];
/** Longest diary text the book holds (first page + five more). */
const MAX_DIARY = 220 + 5 * 520;

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dOnly = (s: string) => new Date(s + 'T00:00:00');
const addD = (s: string, n: number) => {
  const d = dOnly(s);
  d.setDate(d.getDate() + n);
  return iso(d);
};
const diffDays = (a: string, b: string) => Math.round((dOnly(b).getTime() - dOnly(a).getTime()) / 86400000);
const short = (s: string) => {
  const d = dOnly(s);
  return `${d.getDate()} ${TH_MON[d.getMonth()]}`;
};
const longD = (s: string) => {
  const d = dOnly(s);
  return `${d.getDate()} ${TH_MON[d.getMonth()]} ${d.getFullYear() + 543}`;
};
const monthOf = (s: string) => {
  const d = dOnly(s);
  return new Date(d.getFullYear(), d.getMonth(), 1);
};
const isMultiDay = (w: Workshop) => (w.workshop_type || 'one_day') === 'multi_day' && !!w.end_date && w.end_date > w.date;
const segsOf = (w: Workshop) => (isMultiDay(w) ? [{ s: w.date, e: w.end_date as string }] : getWorkshopDays(w).map((d) => ({ s: d, e: d })));
const onDay = (w: Workshop, day: string) => (isMultiDay(w) ? day >= w.date && day <= (w.end_date as string) : getWorkshopDays(w).includes(day));
const toG = (d: Date) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
const mono = (size: number, extra = ''): CSSProperties => css(`font-family:'JetBrains Mono',monospace;font-size:${size}px;letter-spacing:.14em;text-transform:uppercase;color:#6a7a78;${extra}`);

const Chev = ({ dir, rot }: { dir: 'l' | 'r'; rot?: string }) => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={rot ? { transform: `rotate(${rot})` } : undefined}>
    <path d={dir === 'l' ? 'M11 3 L6 8 L11 13' : 'M5 3 L10 8 L5 13'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const StarIco = ({ c, size = 11 }: { c: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={c} stroke={c} strokeWidth="2" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    <path d="M12 3.6l2.6 5.3 5.8.85-4.2 4.1 1 5.8L12 16.9l-5.2 2.75 1-5.8-4.2-4.1 5.8-.85L12 3.6Z" />
  </svg>
);
const RainIco = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    <path d="M7.2 15.2a4 4 0 0 1-.3-8 5.5 5.5 0 0 1 10.4 1.3 3.4 3.4 0 0 1-.5 6.7H7.2Z" />
    <path d="M8.6 18.4l-.9 2.2M12 18.4l-.9 2.2M15.4 18.4l-.9 2.2" />
  </svg>
);
/** Hand-drawn underline that draws itself in; a new key restarts it. */
const DrawLine = ({ color, w, top }: { color: string; w: number; top: number }) => (
  <svg data-anim="" aria-hidden viewBox="0 0 200 20" preserveAspectRatio="none" style={{ position: 'absolute', left: -4, top, width: 'calc(100% + 10px)', height: 12, pointerEvents: 'none', overflow: 'visible' }}>
    <path d="M4 13 Q 60 5, 120 10 T 196 9" stroke={color} strokeWidth={w} fill="none" strokeLinecap="round" pathLength={1} style={{ strokeDasharray: 1, strokeDashoffset: 1, animation: 'v2Draw 1.1s cubic-bezier(.2,.7,.2,1) .25s forwards' }} />
  </svg>
);
const Twinkle = ({ style, color, dur, delay, size = 16 }: { style: CSSProperties; color: string; dur: number; delay: number; size?: number }) => (
  <span data-anim="" aria-hidden style={{ position: 'absolute', pointerEvents: 'none', fontSize: size, color, lineHeight: 1, animation: `v2Twinkle ${dur}s ease-in-out ${delay}s infinite`, ...style }}>
    ✺
  </span>
);
const Floaty = ({ style, anim, children }: { style: CSSProperties; anim: string; children: ReactNode }) => (
  <div data-anim="" aria-hidden style={{ position: 'absolute', pointerEvents: 'none', animation: anim, ...style }}>
    {children}
  </div>
);

export default function CalendarPage() {
  const track = useLoadingTracker();
  const [workshops, setWorkshops] = useState<Workshop[]>([]);
  const [bookings, setBookings] = useState<Record<string, Booking>>({});
  const [seats, setSeats] = useState<Record<string, number>>({});
  const [events, setEvents] = useState<UserEvent[]>([]);
  const [diary, setDiary] = useState<Record<string, DiaryEntry>>({});
  const [signedIn, setSignedIn] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const [T] = useState(() => iso(new Date()));
  const [month, setMonth] = useState(() => monthOf(iso(new Date())));
  const [sel, setSel] = useState(() => iso(new Date()));
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const [mode, setMode] = useState<Mode>(null);
  const [wsId, setWsId] = useState<string | null>(null);
  const [ev, setEv] = useState<EvDraft | null>(null);
  const [dy, setDy] = useState<DyDraft | null>(null);
  const [toast, setToast] = useState('');
  const [panelOpen, setPanelOpen] = useState(true);
  const [burst, setBurst] = useState(0);
  const [desk, setDesk] = useState(true);
  const [now, setNow] = useState(0);
  const [busy, setBusy] = useState(false);
  const [height, setHeight] = useState<number | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const toastT = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const burstT = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    track(
      Promise.all([
        fetch('/api/calendar').then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.json() as Promise<{ workshops: Workshop[]; bookings: Booking[]; seatCounts?: Record<string, number> }>;
        }),
        fetch('/api/me/events').then((r) => (r.ok ? (r.json() as Promise<{ events: UserEvent[] }>) : null)),
        fetch('/api/me/diary').then((r) => (r.ok ? (r.json() as Promise<{ entries: DiaryEntry[] }>) : null)),
      ])
        .then(([cal, evs, dia]) => {
          setWorkshops(cal.workshops || []);
          setBookings(Object.fromEntries((cal.bookings || []).map((b) => [b.workshop_id, b])));
          setSeats(cal.seatCounts || {});
          setSignedIn(!!evs);
          setEvents(evs?.events || []);
          setDiary(Object.fromEntries((dia?.entries || []).map((e) => [e.day, e])));
        })
        .catch(() => setLoadError(true))
        .finally(() => setLoaded(true)),
    );
  }, [track]);

  // Phone layout under 760px; the page fills the screen under the navbar.
  useEffect(() => {
    const fit = () => {
      const wide = window.innerWidth >= 760;
      setDesk(wide);
      const top = rootRef.current ? rootRef.current.getBoundingClientRect().top + window.scrollY : 72;
      setHeight(Math.max(wide ? 700 : 560, window.innerHeight - top));
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [loaded]);

  // The workshop sheet's countdown ticks once a second while it is open.
  useEffect(() => {
    if (mode !== 'ws') return;
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [mode]);

  useEffect(
    () => () => {
      clearTimeout(toastT.current);
      clearTimeout(burstT.current);
    },
    [],
  );

  const flash = (msg: string) => {
    clearTimeout(toastT.current);
    setToast(msg);
    toastT.current = setTimeout(() => setToast(''), 2600);
  };
  const needLogin = () => {
    window.location.href = '/auth/login?redirect=/calendar';
  };
  const pick = (day: string) => {
    setSel(day);
    setMonth(monthOf(day));
  };

  const statusOf = (w: Workshop): St => {
    const ended = hasWorkshopEnded(w);
    if (bookings[w.id] && !ended) return 'applied';
    if (ended) return 'past';
    return (seats[w.id] || 0) >= w.max_participants ? 'full' : 'available';
  };
  const markOf = (w: Workshop): 'star' | 'rain' | null => {
    const b = bookings[w.id];
    if (!b) return null;
    return hasWorkshopEnded(w) && b.attended === 0 ? 'rain' : 'star';
  };
  const openWs = (w: Workshop, day?: string) => {
    if (day) setSel(day);
    setWsId(w.id);
    setMode('ws');
  };
  const openEvent = (m: UserEvent | null) => {
    if (!signedIn) return needLogin();
    setEv(m ? { ...m, err: '' } : { id: null, title: '', start: sel, end: sel, allDay: false, ts: '10:00', te: '12:00', kind: 'me', note: '', err: '' });
    setMode('event');
  };
  const openDiary = (day?: string, fam?: MoodKey) => {
    if (!signedIn) return needLogin();
    const d = day || sel;
    if (d > T) return flash('Diary เขียนได้เมื่อถึงวันนั้น · ลงกิจกรรมไว้ก่อนได้');
    const ent = diary[d];
    const moods = ent ? ent.moods.map((m) => ({ ...m })) : [];
    if (fam && !moods.some((m) => m.f === fam) && moods.length < MAX_MOODS) moods.push({ f: fam, n: '' });
    pick(d);
    setDy({ moods, text: ent ? ent.notes.join('') : '', open: fam || moods[0]?.f || null });
    setMode('diary');
  };

  // Keyboard: arrows move the day, N new event, D diary, ] toggles the panel.
  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  useEffect(() => {
    keyRef.current = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return setMode(null);
      const tg = (e.target as HTMLElement | null)?.tagName;
      if (tg === 'INPUT' || tg === 'TEXTAREA' || tg === 'SELECT' || mode || e.metaKey || e.ctrlKey || e.altKey) return;
      const mv = ({ ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 } as Record<string, number>)[e.key];
      if (mv) {
        e.preventDefault();
        return pick(addD(sel, mv));
      }
      const k = e.key.toLowerCase();
      if (k === 'n') {
        e.preventDefault();
        openEvent(null);
      } else if (k === 'd') {
        e.preventDefault();
        openDiary();
      } else if (k === ']') setPanelOpen((o) => !o);
    };
  });
  useEffect(() => {
    const on = (e: KeyboardEvent) => keyRef.current(e);
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, []);

  // What the filter and search leave on the grid.
  const visible = useMemo(() => {
    const qq = q.trim().toLowerCase();
    const match = (s: (string | null | undefined)[]) => !qq || s.some((x) => (x || '').toLowerCase().includes(qq));
    let ws = workshops.filter((w) => match([w.title, w.location, w.category]));
    let mine = events.filter((m) => match([m.title, m.note]));
    if (filter === 'ws') mine = [];
    if (filter === 'mine') ws = ws.filter((w) => bookings[w.id]);
    if (filter === 'diary') {
      ws = [];
      mine = [];
    }
    return { ws, mine };
  }, [workshops, events, filter, q, bookings]);

  if (!loaded) return <div ref={rootRef} style={{ minHeight: '70vh' }} />;
  if (loadError) {
    return (
      <div ref={rootRef} style={css('padding:80px 20px;text-align:center;color:#6a7a78')}>
        โหลดปฏิทินไม่สำเร็จ —{' '}
        <button type="button" onClick={() => window.location.reload()} style={css('border:0;background:none;color:#0d8a7e;font-weight:600;cursor:pointer')}>
          ลองใหม่
        </button>
      </div>
    );
  }

  /* ---------- month grid ---------- */
  const y = month.getFullYear();
  const mo = month.getMonth();
  const first = new Date(y, mo, 1).getDay();
  type Bar = { key: string; title: string; tip: string; gc: string; gr: number; margin: string; radius: string; bg: string; fg: string; accent: string; cl: boolean; cr: boolean; star: boolean; rain: boolean; time: string; tag: string; full: boolean; onClick: () => void };
  type Raw = { title: string; tip: string; bg: string; fg: string; accent: string; star: boolean; rain: boolean; time: string; full: boolean; span: number; onClick: () => void; sc: number; ec: number; cl: boolean; cr: boolean };
  const weeks: { days: string[]; bars: Bar[]; hidden: number[] }[] = [];
  const colInfo: Record<string, { dots: string[]; mini: { t: string; bg: string; fg: string }[] }> = {};
  for (let wi = 0; wi < 6; wi++) {
    const days = Array.from({ length: 7 }, (_, i) => iso(new Date(y, mo, 1 - first + wi * 7 + i)));
    const s0 = days[0];
    const s6 = days[6];
    const raw: Raw[] = [];
    const push = (s: string, e: string, bar: Omit<Raw, 'sc' | 'ec' | 'cl' | 'cr'>) => {
      if (e < s0 || s > s6) return;
      const st = s < s0 ? s0 : s;
      const en = e > s6 ? s6 : e;
      raw.push({ ...bar, sc: diffDays(s0, st), ec: diffDays(s0, en), cl: s < s0, cr: e > s6 });
    };
    visible.ws.forEach((w) => {
      const st = statusOf(w);
      const mk = markOf(w);
      const md = isMultiDay(w);
      segsOf(w).forEach((sg) =>
        push(sg.s, sg.e, {
          title: w.title,
          tip: `${w.title} · ${STATUS[st][2]}${md ? '' : ' · ' + w.time_start}`,
          bg: TINT[st].bg,
          fg: TINT[st].fg,
          accent: mk === 'star' ? '#f2b705' : STATUS[st][0],
          star: mk === 'star',
          rain: mk === 'rain',
          time: md ? '' : w.time_start,
          full: st === 'full',
          span: md ? diffDays(sg.s, sg.e) + 1 : 0,
          onClick: () => openWs(w, sg.s < s0 ? s0 : sg.s),
        }),
      );
    });
    visible.mine.forEach((m) => {
      const k = EVENT_KIND[m.kind];
      push(m.start, m.end, {
        title: m.title,
        tip: `${m.title} · ${k.label}${m.allDay ? '' : ' · ' + m.ts}`,
        bg: k.bg,
        fg: k.fg,
        accent: k.c,
        star: false,
        rain: false,
        time: m.allDay ? '' : m.ts,
        full: false,
        span: m.start !== m.end ? diffDays(m.start, m.end) + 1 : 0,
        onClick: () => openEvent(m),
      });
    });
    raw.sort((a, b) => a.sc - b.sc || b.ec - b.sc - (a.ec - a.sc));
    const laneEnd: number[] = [];
    const hidden = [0, 0, 0, 0, 0, 0, 0];
    const bars: Bar[] = [];
    days.forEach((d) => (colInfo[d] = { dots: [], mini: [] }));
    raw.forEach((r, ri) => {
      let lane = 0;
      while (lane < laneEnd.length && laneEnd[lane] >= r.sc) lane++;
      laneEnd[lane] = r.ec;
      for (let c = r.sc; c <= r.ec; c++) {
        if (lane >= 3) hidden[c]++;
        const ci = colInfo[days[c]];
        if (ci.dots.length < 3) ci.dots.push(r.accent);
        ci.mini.push({ t: r.title, bg: r.bg, fg: r.fg });
      }
      if (lane >= 3) return;
      const multi = r.ec > r.sc || r.cl || r.cr;
      const L = r.cl ? 0 : 6;
      const R = r.cr ? 0 : 6;
      bars.push({
        key: `${wi}-${ri}`,
        title: r.title,
        tip: r.tip,
        bg: r.bg,
        fg: r.fg,
        accent: r.accent,
        cl: r.cl,
        cr: r.cr,
        star: r.star,
        rain: r.rain,
        full: r.full,
        onClick: r.onClick,
        gc: `${r.sc + 1} / ${r.ec + 2}`,
        gr: lane + 1,
        margin: `0 ${r.cr ? 0 : 5}px 0 ${r.cl ? 0 : 5}px`,
        radius: `${L}px ${R}px ${R}px ${L}px`,
        time: multi ? '' : r.time,
        tag: r.full ? 'เต็ม' : multi && r.span > 1 && !r.cl ? `${r.span} วัน` : '',
      });
    });
    weeks.push({ days, bars, hidden });
  }

  /* ---------- selected day ---------- */
  const sd0 = dOnly(sel);
  const diff = diffDays(T, sel);
  const rel = diff === 1 ? 'พรุ่งนี้' : diff === -1 ? 'เมื่อวาน' : diff > 1 ? `อีก ${diff} วัน` : diff < -1 ? `${-diff} วันก่อน` : '';
  const future = sel > T;
  const ent = diary[sel];
  type Item = { key: string; sort: string; t1: string; t2: string; title: string; sub: string; dot: string; tag: string; tagBg: string; tagFg: string; onClick: () => void };
  const items: Item[] = [];
  workshops.forEach((w) => {
    if (!onDay(w, sel)) return;
    const st = statusOf(w);
    items.push({
      key: 'w' + w.id,
      sort: w.time_start,
      t1: w.time_start,
      t2: w.time_end,
      title: w.title,
      sub: w.is_online ? 'ออนไลน์' : w.location || '',
      dot: STATUS[st][0],
      tag: STATUS[st][2],
      tagBg: st === 'applied' ? '#fce4a0' : st === 'past' ? '#ede5cf' : st === 'full' ? '#fde7d3' : '#eaf6f4',
      tagFg: st === 'applied' ? '#3f3100' : st === 'past' ? '#5f5f59' : st === 'full' ? '#a04a14' : '#075a51',
      onClick: () => openWs(w),
    });
  });
  events.forEach((m) => {
    if (m.start > sel || m.end < sel) return;
    const k = EVENT_KIND[m.kind];
    items.push({ key: 'e' + m.id, sort: m.allDay ? '00:00' : m.ts, t1: m.allDay ? 'ทั้งวัน' : m.ts, t2: m.allDay ? '' : m.te, title: m.title, sub: m.note || k.label, dot: k.c, tag: 'ของฉัน', tagBg: k.bg, tagFg: k.fg, onClick: () => openEvent(m) });
  });
  items.sort((a, b) => a.sort.localeCompare(b.sort));
  const upcoming = workshops
    .filter((w) => w.date > T && statusOf(w) === 'available')
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 3);
  const nextUp = [
    ...workshops.filter((w) => bookings[w.id] && w.date > sel).map((w) => ({ day: w.date, title: w.title, dot: STATUS.applied[0], go: () => openWs(w, w.date) })),
    ...events.filter((m) => m.start > sel).map((m) => ({ day: m.start, title: m.title, dot: EVENT_KIND[m.kind].c, go: () => pick(m.start) })),
  ]
    .sort((a, b) => a.day.localeCompare(b.day))
    .slice(0, 3);
  let streak = 0;
  for (let d = diary[T] ? T : addD(T, -1); diary[d]; d = addD(d, -1)) streak++;
  const mKey = `${y}-${pad(mo + 1)}`;
  const moodCount: Partial<Record<MoodKey, number>> = {};
  Object.values(diary).forEach((e) => {
    if (e.day.startsWith(mKey)) e.moods.forEach((m) => (moodCount[m.f] = (moodCount[m.f] || 0) + 1));
  });
  const moodsOf = (day: string) => (diary[day] ? diary[day].moods.map((m) => FAM[m.f].c) : []);
  const bookedToday = workshops.find((w) => bookings[w.id] && onDay(w, sel));

  /* ---------- saves ---------- */
  async function saveEvent() {
    if (!ev) return;
    if (!ev.title.trim()) return setEv({ ...ev, err: 'ใส่ชื่อกิจกรรมก่อนนะ' });
    if (ev.end < ev.start) return setEv({ ...ev, err: 'วันสิ้นสุดต้องไม่ก่อนวันเริ่ม' });
    setBusy(true);
    try {
      const res = await fetch(ev.id ? `/api/me/events?id=${ev.id}` : '/api/me/events', {
        method: ev.id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ev),
      });
      const d = (await res.json()) as { event?: UserEvent; error?: string };
      if (!res.ok || !d.event) return setEv({ ...ev, err: d.error || 'บันทึกไม่สำเร็จ' });
      const saved = d.event;
      setEvents((l) => [...l.filter((m) => m.id !== saved.id), saved]);
      setMode(null);
      pick(saved.start);
      flash('ลงกิจกรรมแล้ว · ' + short(saved.start));
    } catch {
      setEv({ ...ev, err: 'บันทึกไม่สำเร็จ ลองอีกครั้ง' });
    } finally {
      setBusy(false);
    }
  }
  async function deleteEvent() {
    if (!ev?.id || !confirm('ลบกิจกรรมนี้?')) return;
    const id = ev.id;
    setBusy(true);
    try {
      const res = await fetch(`/api/me/events?id=${id}`, { method: 'DELETE' });
      if (!res.ok) return setEv({ ...ev, err: 'ลบไม่สำเร็จ' });
      setEvents((l) => l.filter((m) => m.id !== id));
      setMode(null);
      flash('ลบกิจกรรมแล้ว');
    } finally {
      setBusy(false);
    }
  }
  async function saveDiary() {
    if (!dy) return;
    setBusy(true);
    const text = dy.text.trim();
    const notes = paginate(text);
    try {
      const res = await fetch('/api/me/diary', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ day: sel, notes, moods: dy.moods }) });
      const d = (await res.json()) as { entry?: DiaryEntry; error?: string };
      if (!res.ok) return flash(d.error || 'บันทึกไม่สำเร็จ');
      setDiary((m) => {
        const next = { ...m };
        if (!dy.moods.length && !text) delete next[sel];
        else next[sel] = d.entry || { day: sel, moods: dy.moods, notes };
        return next;
      });
      setMode(null);
      if (dy.moods.length || text) {
        setBurst(Date.now());
        clearTimeout(burstT.current);
        burstT.current = setTimeout(() => setBurst(0), 1500);
      }
      flash('บันทึกลง Diary แล้ว · ซิงก์กับสมุดของคุณ');
    } catch {
      flash('บันทึกไม่สำเร็จ ลองอีกครั้ง');
    } finally {
      setBusy(false);
    }
  }
  const toggleFam = (f: MoodKey) => {
    if (!dy) return;
    const has = dy.moods.some((m) => m.f === f);
    if (has && dy.open === f) return setDy({ ...dy, moods: dy.moods.filter((m) => m.f !== f), open: null });
    if (has) return setDy({ ...dy, open: f });
    if (dy.moods.length >= MAX_MOODS) return flash('เลือกได้สูงสุด 3 ความรู้สึก');
    setDy({ ...dy, moods: [...dy.moods, { f, n: '' }], open: f });
  };
  const pickRing = (f: MoodKey, n: string) => {
    if (dy) setDy({ ...dy, moods: dy.moods.map((m) => (m.f === f ? { f, n: m.n === n ? '' : n } : m)) });
  };

  /* ---------- layout values ---------- */
  const open = panelOpen;
  const ui = desk
    ? { cols: open ? 'minmax(0,1fr) 400px' : 'minmax(0,1fr) 0px', rows: 'minmax(0,1fr)', gap: open ? '18px' : '0px', pad: '16px 28px 22px', calR: '22px', calRing: 'inset 0 0 0 1px #e7e3d9', panelR: '22px', panelPad: '22px 22px 8px', actPad: '10px 22px 20px', bigNum: '64px' }
    : { cols: 'minmax(0,1fr)', rows: open ? 'auto minmax(0,1fr)' : 'minmax(0,1fr) auto', gap: '0', pad: '0', calR: '0', calRing: 'none', panelR: '26px 26px 0 0', panelPad: '18px 18px 6px', actPad: '10px 16px 18px', bigNum: '46px' };
  const btnFull: CSSProperties = { justifyContent: 'center', width: '100%', boxSizing: 'border-box' };
  const ws = mode === 'ws' ? workshops.find((w) => w.id === wsId) : undefined;
  const openFam = dy?.open ? FAM[dy.open] : null;
  const openCur = openFam && dy ? dy.moods.find((m) => m.f === openFam.key) : undefined;

  return (
    <div ref={rootRef} className="c2" style={{ height: height ?? '80vh', display: 'flex', flexDirection: 'column', background: '#fff', overflow: 'hidden', position: 'relative' }}>
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'grid',
          gridTemplateColumns: ui.cols,
          gridTemplateRows: ui.rows,
          gap: ui.gap,
          padding: ui.pad,
          transition: 'grid-template-columns .45s cubic-bezier(.2,.7,.2,1), grid-template-rows .45s cubic-bezier(.2,.7,.2,1), gap .45s ease',
        }}
      >
        {/* ================= calendar ================= */}
        <div style={{ minHeight: 0, minWidth: 0, display: 'flex', flexDirection: 'column', background: '#fff', borderRadius: ui.calR, boxShadow: ui.calRing, overflow: 'hidden' }}>
          {desk ? (
            <div style={css('display:flex;align-items:center;gap:14px;padding:16px 18px 14px 22px;flex-wrap:wrap')}>
              <div style={css('display:flex;flex-direction:column;gap:4px;margin-right:auto')}>
                <span style={css("font-family:'JetBrains Mono',monospace;font-size:10.5px;letter-spacing:.2em;text-transform:uppercase;color:#0d8a7e;font-weight:500;display:inline-flex;align-items:center;gap:10px")}>
                  <span style={css('width:22px;height:1.5px;background:#0d8a7e;border-radius:2px')} />
                  workshop · diary calendar
                </span>
                <div style={css('display:flex;align-items:baseline;gap:10px')}>
                  <span style={css("font-family:'Mitr',sans-serif;font-weight:500;font-size:30px;line-height:1.05")}>{TH_MONTHS[mo]}</span>
                  <span style={css("position:relative;font-family:'Mitr',sans-serif;font-weight:400;font-size:30px;line-height:1.05;color:#0d8a7e")}>
                    {y + 543}
                    <DrawLine key={`ml-${mKey}`} color="#f5c243" w={6} top={28} />
                  </span>
                </div>
              </div>
              <div style={css('display:inline-flex;background:#f6f1e6;border-radius:999px;padding:3px')}>
                {FILTERS.map(([k, l]) => (
                  <button key={k} type="button" onClick={() => setFilter(k)} style={{ ...css('border:0;cursor:pointer;padding:7px 14px;border-radius:999px;white-space:nowrap;font-size:13px;font-weight:600;transition:background .2s ease,color .2s ease'), background: filter === k ? '#0d8a7e' : 'transparent', color: filter === k ? '#fff' : '#6a7a78' }}>
                    {l}
                  </button>
                ))}
              </div>
              <div style={css('display:flex;align-items:center;width:210px;background:#fff;border-radius:999px;box-shadow:inset 0 0 0 1px #e7e3d9')}>
                <svg width="15" height="15" viewBox="0 0 16 16" fill="none" style={css('margin-left:13px;color:#6a7a78;flex-shrink:0')}>
                  <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.8" />
                  <path d="M11 11 L14 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหา workshop, สถานที่" style={css('flex:1;min-width:0;border:0;background:transparent;padding:9px 12px 9px 8px;font-family:inherit;font-size:13.5px;color:#0d1e1d;outline:none')} />
              </div>
              <div style={css('display:flex;align-items:center;gap:2px')}>
                <button type="button" className="c2-ghost" onClick={() => setMonth(new Date(y, mo - 1, 1))} aria-label="เดือนก่อน" style={css('width:36px;height:36px;border-radius:50%;border:0;background:transparent;color:#0d1e1d;cursor:pointer;display:inline-flex;align-items:center;justify-content:center')}>
                  <Chev dir="l" />
                </button>
                <button
                  type="button"
                  className="c2-soft"
                  onClick={() => {
                    pick(T);
                    setMode(null);
                  }}
                  style={css('white-space:nowrap;padding:8px 14px;border-radius:999px;border:0;background:#fff;color:#0d1e1d;font-size:13px;font-weight:600;cursor:pointer;box-shadow:inset 0 0 0 1px #e7e3d9')}
                >
                  วันนี้
                </button>
                <button type="button" className="c2-ghost" onClick={() => setMonth(new Date(y, mo + 1, 1))} aria-label="เดือนถัดไป" style={css('width:36px;height:36px;border-radius:50%;border:0;background:transparent;color:#0d1e1d;cursor:pointer;display:inline-flex;align-items:center;justify-content:center')}>
                  <Chev dir="r" />
                </button>
              </div>
              {!open && (
                <button type="button" className="c2-dark" onClick={() => setPanelOpen(true)} title="เปิดแผงวัน ( ] )" style={css('white-space:nowrap;display:inline-flex;align-items:center;gap:8px;padding:8px 14px 8px 10px;border-radius:999px;border:0;background:#0d1e1d;color:#fff;font-size:13px;font-weight:600;cursor:pointer;animation:v2Fade .3s ease')}>
                  <Chev dir="l" />
                  {sd0.getDate()} {TH_MON[sd0.getMonth()]} · {items.length} กิจกรรม
                </button>
              )}
            </div>
          ) : (
            <>
              <div style={css('display:flex;align-items:center;gap:6px;padding:10px 12px 8px 18px')}>
                <span style={css("font-family:'Mitr',sans-serif;font-weight:500;font-size:22px")}>{TH_MONTHS[mo]}</span>
                <span style={css("font-family:'Mitr',sans-serif;font-size:22px;color:#0d8a7e;margin-right:auto")}>{y + 543}</span>
                <button type="button" onClick={() => setMonth(new Date(y, mo - 1, 1))} aria-label="เดือนก่อน" style={css('width:36px;height:36px;border-radius:50%;border:0;background:transparent;color:#0d1e1d;display:inline-flex;align-items:center;justify-content:center')}>
                  <Chev dir="l" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    pick(T);
                    setMode(null);
                  }}
                  style={css('white-space:nowrap;padding:7px 12px;border-radius:999px;border:0;background:#fff;color:#0d1e1d;font-size:12.5px;font-weight:600;box-shadow:inset 0 0 0 1px #e7e3d9')}
                >
                  วันนี้
                </button>
                <button type="button" onClick={() => setMonth(new Date(y, mo + 1, 1))} aria-label="เดือนถัดไป" style={css('width:36px;height:36px;border-radius:50%;border:0;background:transparent;color:#0d1e1d;display:inline-flex;align-items:center;justify-content:center')}>
                  <Chev dir="r" />
                </button>
              </div>
              <div style={css('display:flex;gap:6px;padding:0 14px 8px')}>
                {FILTERS.map(([k, l]) => (
                  <button key={k} type="button" onClick={() => setFilter(k)} style={{ ...css('flex:1;border:0;padding:7px 0;border-radius:999px;font-size:12.5px;font-weight:600'), background: filter === k ? '#0d8a7e' : '#f6f1e6', color: filter === k ? '#fff' : '#6a7a78' }}>
                    {l}
                  </button>
                ))}
              </div>
            </>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '1px solid #e7e3d9', borderTop: desk ? '1px solid #e7e3d9' : '0' }}>
            {TH_DOW.map((d) => (
              <div key={d} style={{ ...mono(10.5, 'letter-spacing:.12em'), padding: desk ? '9px 10px' : '6px 0', textAlign: desk ? 'left' : 'center' }}>
                {d}
              </div>
            ))}
          </div>

          {desk ? (
            <>
              <div style={css('flex:1;min-height:0;display:flex;flex-direction:column')}>
                {weeks.map((wk, wi) => (
                  <div key={wi} style={{ position: 'relative', flex: 1, minHeight: 0, borderBottom: wi === 5 ? '0' : '1px solid #e7e3d9' }}>
                    <div style={css('position:absolute;inset:0;display:grid;grid-template-columns:repeat(7,1fr)')}>
                      {wk.days.map((day, ci) => {
                        const other = dOnly(day).getMonth() !== mo;
                        const isSel = day === sel;
                        const tint = filter === 'diary' && diary[day] ? moodsOf(day)[0] + '33' : null;
                        return (
                          <div
                            key={day}
                            onClick={() => {
                              pick(day);
                              setMode(null);
                              setPanelOpen(true);
                            }}
                            style={{ borderRight: ci === 6 ? '0' : '1px solid #e7e3d9', background: isSel ? '#eaf6f4' : tint || (other ? '#f9f7ef' : 'transparent'), boxShadow: isSel ? 'inset 0 0 0 2px #0d8a7e' : 'none', cursor: 'pointer', transition: 'background .18s ease' }}
                          />
                        );
                      })}
                    </div>
                    <div style={css('position:relative;z-index:1;display:grid;grid-template-columns:repeat(7,1fr);pointer-events:none')}>
                      {wk.days.map((day) => {
                        const d = dOnly(day);
                        const other = d.getMonth() !== mo;
                        const isSel = day === sel;
                        return (
                          <div key={day} style={css('padding:7px 9px 3px;display:flex;align-items:center;gap:6px;min-height:30px;min-width:0')}>
                            {day === T ? (
                              <>
                                <span style={css("font-family:'Caveat',cursive;font-size:24px;color:#0d8a7e;font-weight:700;line-height:1")}>Today</span>
                                <span data-anim="" style={css('color:#f5c243;font-size:13px;display:inline-block;animation:v2Spin 9s linear infinite')}>
                                  ✺
                                </span>
                              </>
                            ) : (
                              <span style={{ fontSize: 14, fontWeight: isSel ? 700 : 500, color: other ? '#b6b29f' : isSel ? '#0d8a7e' : '#0d1e1d' }}>{d.getDate()}</span>
                            )}
                            {d.getDate() === 1 && day !== T && <span style={css("font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.06em;color:#0d8a7e")}>{TH_MON[d.getMonth()]}</span>}
                            <span style={css('display:inline-flex;gap:3px;margin-left:auto')}>
                              {moodsOf(day).map((c, i) => (
                                <span key={i} style={{ width: 9, height: 9, borderRadius: '50%', background: c, boxShadow: '0 0 0 1.5px #fff' }} />
                              ))}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    <div style={css('position:relative;z-index:1;display:grid;grid-template-columns:repeat(7,minmax(0,1fr));grid-template-rows:repeat(3,21px);row-gap:2px;pointer-events:none')}>
                      {wk.bars.map((b) => (
                        <button
                          key={b.key}
                          type="button"
                          className="c2-bar"
                          onClick={b.onClick}
                          title={b.tip}
                          style={{ pointerEvents: 'auto', gridColumn: b.gc, gridRow: b.gr, minWidth: 0, height: 21, margin: b.margin, padding: '0 7px', display: 'flex', alignItems: 'center', gap: 6, border: 0, borderRadius: b.radius, background: b.bg, color: b.fg, lineHeight: 1, cursor: 'pointer', overflow: 'hidden', whiteSpace: 'nowrap', textAlign: 'left', transition: 'filter .15s ease' }}
                        >
                          {b.cl && <span style={css('font-weight:700;opacity:.55')}>‹</span>}
                          {b.star ? <StarIco c={b.accent} /> : b.rain ? <RainIco /> : <span style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: b.accent }} />}
                          {b.time && <span style={css("font-family:'JetBrains Mono',monospace;font-size:10px;font-weight:500;opacity:.7;flex-shrink:0")}>{b.time}</span>}
                          <span style={css('flex:1;min-width:0;font-size:12px;font-weight:600;overflow:hidden;text-overflow:ellipsis')}>{b.title}</span>
                          {b.tag && <span style={{ ...css("flex-shrink:0;font-family:'JetBrains Mono',monospace;font-size:9.5px;font-weight:600;letter-spacing:.04em;padding:2px 6px;border-radius:999px"), background: b.full ? '#fbe6e4' : '#fff', color: b.full ? '#9c2f2b' : b.fg }}>{b.tag}</span>}
                          {b.cr && <span style={css('font-weight:700;opacity:.55')}>›</span>}
                        </button>
                      ))}
                    </div>
                    <div style={css('position:absolute;left:0;right:0;bottom:5px;z-index:1;display:grid;grid-template-columns:repeat(7,1fr);pointer-events:none')}>
                      {wk.days.map((day, ci) => (
                        <div key={day} style={css('padding:0 10px;display:flex')}>
                          {wk.hidden[ci] > 0 && <span style={css('font-size:11px;font-weight:600;color:#0d8a7e;padding:2px 8px;border-radius:999px;background:#eaf6f4')}>+{wk.hidden[ci]} อีก</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <div style={css('display:flex;flex-wrap:wrap;align-items:center;gap:16px;padding:10px 22px;border-top:1px solid #e7e3d9;font-size:12px;color:#6a7a78')}>
                {[
                  { c: STATUS.available[0], label: 'เปิดรับ' },
                  { c: STATUS.applied[0], label: 'จองแล้ว' },
                  { c: STATUS.full[0], label: 'เต็ม' },
                  { c: STATUS.past[0], label: 'จบแล้ว' },
                  { c: '#b9a67a', label: 'กิจกรรมของฉัน' },
                ].map((lg) => (
                  <span key={lg.label} style={css('display:inline-flex;align-items:center;gap:7px')}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: lg.c }} />
                    {lg.label}
                  </span>
                ))}
                <span style={css('margin-left:auto;display:inline-flex;align-items:center;gap:8px')}>
                  อารมณ์เดือนนี้
                  <span style={css('display:flex;width:120px;height:10px;border-radius:999px;overflow:hidden;background:#ede5cf')}>
                    {FAMILIES.filter((f) => moodCount[f.key]).map((f) => (
                      <span key={f.key} title={`${f.label} · ${moodCount[f.key]}`} style={{ flex: moodCount[f.key], background: f.c, transition: 'flex .5s cubic-bezier(.2,.7,.2,1)' }} />
                    ))}
                  </span>
                </span>
                <span style={css("font-family:'JetBrains Mono',monospace;font-size:10.5px;color:#9aa8a6;letter-spacing:.04em")}>← → ↑ ↓ เลือกวัน · N กิจกรรม · D diary · ] แผง</span>
              </div>
            </>
          ) : (
            <div style={{ flex: open ? '0 0 auto' : '1 1 0', minHeight: 0, display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0,1fr))', gridAutoRows: open ? '43px' : 'minmax(0,1fr)', rowGap: open ? 0 : 3, padding: '2px 6px 8px' }}>
              {weeks.flatMap((wk) =>
                wk.days.map((day) => {
                  const d = dOnly(day);
                  const other = d.getMonth() !== mo;
                  const isSel = day === sel;
                  const isToday = day === T;
                  const moods = moodsOf(day);
                  const info = colInfo[day] || { dots: [], mini: [] };
                  const dots = [...(moods.length ? [{ c: moods[0], w: 12 }] : []), ...info.dots.slice(0, moods.length ? 2 : 3).map((c) => ({ c, w: 5 }))];
                  const mini = open ? [] : [...info.mini.slice(0, 2), ...(info.mini.length > 2 ? [{ t: '+' + (info.mini.length - 2), bg: 'transparent', fg: '#6a7a78' }] : [])];
                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() => {
                        pick(day);
                        setMode(null);
                      }}
                      style={{ height: open ? 43 : '100%', minWidth: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: open ? 'center' : 'flex-start', gap: 2, background: filter === 'diary' && moods.length ? moods[0] + '33' : 'transparent', border: 0, borderRadius: 10, padding: open ? 0 : '3px 2px', cursor: 'pointer', transition: 'background .2s ease' }}
                    >
                      <span style={{ width: 29, height: 29, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13.5, fontWeight: isSel || isToday ? 700 : 500, background: isSel ? '#0d8a7e' : 'transparent', color: isSel ? '#fff' : isToday ? '#0d8a7e' : other ? '#b6b29f' : '#0d1e1d', boxShadow: isToday && !isSel ? 'inset 0 0 0 1.5px #0d8a7e' : 'none' }}>{d.getDate()}</span>
                      <span style={css('display:flex;gap:2px;height:5px')}>
                        {(open ? dots : dots.filter((x) => x.w === 12)).map((dt, i) => (
                          <span key={i} style={{ width: dt.w, height: 5, borderRadius: 3, background: dt.c }} />
                        ))}
                      </span>
                      {mini.map((mi, i) => (
                        <span key={i} style={{ alignSelf: 'stretch', minWidth: 0, padding: '2px 3px', borderRadius: 4, fontSize: 8.5, lineHeight: 1.2, fontWeight: 600, textAlign: 'left', background: mi.bg, color: mi.fg, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', animation: 'v2Fade .35s ease' }}>
                          {mi.t}
                        </span>
                      ))}
                    </button>
                  );
                }),
              )}
            </div>
          )}
        </div>

        {/* ================= day panel ================= */}
        <div style={{ minHeight: 0, minWidth: 0, position: desk ? 'relative' : 'static', background: '#f6f1e6', borderRadius: ui.panelR, display: 'flex', flexDirection: 'column', overflow: 'hidden', opacity: desk && !open ? 0 : 1, pointerEvents: desk && !open ? 'none' : 'auto', transition: 'opacity .3s ease' }}>
          {!desk && !open && (
            <button type="button" onClick={() => setPanelOpen(true)} aria-label="ขยายแผงวัน" style={css('display:flex;flex-direction:column;align-items:stretch;gap:8px;padding:8px 18px 6px;border:0;background:transparent;color:#0d1e1d;cursor:pointer;text-align:left')}>
              <span style={css('width:40px;height:4px;border-radius:4px;background:#cdc5b1;align-self:center')} />
              <span style={css('display:flex;align-items:center;gap:10px')}>
                <span style={css("font-family:'Archivo Black',sans-serif;font-size:28px;line-height:.9;letter-spacing:-.04em;color:#0d8a7e")}>{sd0.getDate()}</span>
                <span style={css('display:flex;flex-direction:column;gap:2px;min-width:0;flex:1')}>
                  <span style={css("font-family:'Mitr',sans-serif;font-weight:500;font-size:15px;line-height:1.1")}>{TH_WD[sd0.getDay()]}</span>
                  <span style={css('font-size:12px;color:#6a7a78;overflow:hidden;text-overflow:ellipsis;white-space:nowrap')}>{[items.length ? items.length + ' กิจกรรม' : 'ว่าง', ent ? 'เขียน diary แล้ว' : future ? '' : 'ยังไม่ได้เขียน diary'].filter(Boolean).join(' · ')}</span>
                </span>
                <span style={css('display:inline-flex;gap:3px')}>
                  {moodsOf(sel).map((c, i) => (
                    <span key={i} style={{ width: 10, height: 10, borderRadius: '50%', background: c }} />
                  ))}
                </span>
                <span style={css('width:32px;height:32px;border-radius:50%;background:#fff;display:inline-flex;align-items:center;justify-content:center')}>
                  <Chev dir="r" rot="-90deg" />
                </span>
              </span>
            </button>
          )}

          <div style={{ flex: 1, minHeight: 0, minWidth: desk ? 400 : 0, overflowY: 'auto', overflowX: 'hidden', padding: ui.panelPad, display: desk || open ? 'flex' : 'none', flexDirection: 'column', gap: 18, position: 'relative', zIndex: 0 }}>
            <div aria-hidden style={css('position:absolute;inset:0;z-index:-1;pointer-events:none;overflow:hidden')}>
              <Floaty style={{ top: 18, right: -22, width: 130, height: 76 }} anim="v2Float 7s ease-in-out infinite">
                <Cloud color="#d4ece8" stroke={3} animate={false} style={{ width: '100%', height: '100%' }} />
              </Floaty>
              <Twinkle style={{ top: 104, right: 34 }} color="#f5c243" dur={2.8} delay={0} />
              <Twinkle style={{ top: 30, right: 150 }} color="#a5d9d1" dur={3.6} delay={1.2} size={11} />
              <Twinkle style={{ bottom: 150, left: 14 }} color="#f5c243" dur={4.2} delay={0.6} size={12} />
              <Floaty style={{ bottom: 70, right: 16, width: 54, opacity: 0.8 }} anim="v2Float 9s ease-in-out 1s infinite">
                <DotCluster color="#e2d8bf" rows={4} cols={5} style={{ width: '100%' }} />
              </Floaty>
              <Floaty style={{ bottom: 24, left: -30, width: 170, height: 18, transform: 'rotate(-6deg)' }} anim="none">
                <Squiggle color="#d4ece8" stroke={3} animate={false} style={{ width: '100%', height: '100%' }} />
              </Floaty>
            </div>

            <div style={css('display:flex;align-items:flex-end;gap:14px')}>
              <div style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: ui.bigNum, lineHeight: 0.82, letterSpacing: '-.045em', color: '#0d8a7e' }}>{sd0.getDate()}</div>
              <div style={css('display:flex;flex-direction:column;gap:4px;padding-bottom:2px')}>
                <span style={css("font-family:'Mitr',sans-serif;font-weight:500;font-size:19px;line-height:1.1")}>{TH_WD[sd0.getDay()]}</span>
                <span style={mono(10.5)}>
                  {TH_MONTHS[sd0.getMonth()]} {sd0.getFullYear() + 543}
                </span>
              </div>
              <span style={{ flex: 1 }} />
              {diff === 0 && <span style={css("padding:5px 12px;border-radius:999px;font-size:11px;font-weight:500;font-family:'JetBrains Mono',monospace;letter-spacing:.06em;text-transform:uppercase;background:#f5c243;color:#0d1e1d")}>วันนี้</span>}
              {rel && <span style={css("font-family:'Caveat',cursive;font-weight:700;font-size:22px;color:#6a7a78;line-height:1")}>{rel}</span>}
              <button type="button" className="c2-round" onClick={() => setPanelOpen(false)} aria-label="ย่อแผงวัน" title="ย่อแผง ( ] )" style={css('align-self:flex-start;width:34px;height:34px;border-radius:50%;border:0;background:#fff;color:#0d1e1d;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;transition:transform .15s ease')}>
                <Chev dir="r" rot={desk ? '0deg' : '90deg'} />
              </button>
            </div>

            {/* Activities */}
            <div style={css('display:flex;flex-direction:column;gap:8px')}>
              <div style={css('display:flex;align-items:center;gap:8px')}>
                <span style={mono(10.5, 'letter-spacing:.16em')}>กิจกรรม · {items.length}</span>
                <span style={css('flex:1;height:1px;border-top:1px dashed #d4ece8')} />
                <button type="button" onClick={() => openEvent(null)} style={css('border:0;background:transparent;color:#0d8a7e;font-size:13px;font-weight:600;cursor:pointer;padding:2px 0')}>
                  + เพิ่ม
                </button>
              </div>
              {items.map((it) => (
                <button key={it.key} type="button" className="c2-lift" onClick={it.onClick} style={css('display:grid;grid-template-columns:46px minmax(0,1fr) auto;align-items:center;gap:12px;padding:11px 14px 11px 12px;border:0;border-radius:14px;background:#fff;text-align:left;color:#0d1e1d;cursor:pointer')}>
                  <span style={css("display:flex;flex-direction:column;gap:2px;font-family:'JetBrains Mono',monospace;font-size:11px;line-height:1.2;color:#0d1e1d")}>
                    <span>{it.t1}</span>
                    <span style={{ color: '#9aa8a6' }}>{it.t2}</span>
                  </span>
                  <span style={css('display:flex;flex-direction:column;gap:3px;min-width:0')}>
                    <span style={css('display:flex;align-items:center;gap:7px;font-size:14px;font-weight:600;line-height:1.3')}>
                      <span style={{ width: 9, height: 9, borderRadius: '50%', flexShrink: 0, background: it.dot }} />
                      <span style={css('overflow:hidden;text-overflow:ellipsis;white-space:nowrap')}>{it.title}</span>
                    </span>
                    <span style={css('font-size:12px;color:#6a7a78;overflow:hidden;text-overflow:ellipsis;white-space:nowrap')}>{it.sub}</span>
                  </span>
                  <span style={{ ...css("padding:4px 9px;border-radius:999px;font-size:10px;font-weight:500;font-family:'JetBrains Mono',monospace;letter-spacing:.05em;text-transform:uppercase;white-space:nowrap"), background: it.tagBg, color: it.tagFg }}>{it.tag}</span>
                </button>
              ))}
              {items.length === 0 && (
                <div style={css('background:#fff;border-radius:16px;padding:14px 16px;display:flex;flex-direction:column;gap:8px')}>
                  <span style={css("font-family:'Caveat',cursive;font-weight:700;font-size:22px;color:#0d8a7e;line-height:1.1")}>วันนี้ยังว่างอยู่ — it can be fun! ✺</span>
                  {upcoming.length > 0 && <span style={mono(10)}>workshop ที่เปิดรับอยู่</span>}
                  {upcoming.map((w) => {
                    const p = getEffectivePrice(w).price;
                    return (
                      <button key={w.id} type="button" className="c2-link" onClick={() => openWs(w)} style={css('display:flex;align-items:center;gap:10px;padding:7px 0;border:0;border-top:1px dashed #e7e3d9;background:transparent;color:#0d1e1d;text-align:left;cursor:pointer')}>
                        <span style={css("font-family:'JetBrains Mono',monospace;font-size:11px;color:#0d8a7e;width:48px;flex-shrink:0")}>{short(w.date)}</span>
                        <span style={css('flex:1;min-width:0;font-size:13.5px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap')}>{w.title}</span>
                        <span style={css('font-size:12.5px;color:#6a7a78')}>{p ? `฿${p.toLocaleString()}` : 'ฟรี'}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Diary */}
            <div style={css('display:flex;flex-direction:column;gap:8px')}>
              <div style={css('display:flex;align-items:center;gap:8px')}>
                <span style={mono(10.5, 'letter-spacing:.16em')}>diary</span>
                {streak > 1 && (
                  <span style={css('display:inline-flex;align-items:center;gap:5px;padding:3px 10px 3px 8px;border-radius:999px;background:#0d1e1d;color:#fff;font-size:11.5px;font-weight:600')}>
                    <span data-anim="" style={css('color:#f5c243;display:inline-block;animation:v2Spin 6s linear infinite')}>
                      ✺
                    </span>
                    เขียนต่อเนื่อง <b style={css("font-family:'Archivo Black',sans-serif;font-weight:400;color:#f5c243")}>{streak}</b> วัน
                  </span>
                )}
                <span style={css('flex:1;height:1px;border-top:1px dashed #d4ece8')} />
                <Link href="/me/journey?view=diary" style={css('font-size:12.5px;font-weight:600;text-decoration:none;color:#0d8a7e')}>
                  เปิดสมุด Diary ↗
                </Link>
              </div>
              {ent ? (
                <button type="button" className="c2-lift" onClick={() => openDiary()} style={css('display:flex;flex-direction:column;gap:10px;padding:16px;border:0;border-radius:18px;background:#fff;text-align:left;color:#0d1e1d;cursor:pointer')}>
                  <span style={css('display:flex;flex-wrap:wrap;gap:6px')}>
                    {ent.moods.map((m, i) => (
                      <span key={i} style={{ ...css('display:inline-flex;align-items:center;border-radius:999px;padding:4px 11px;font-size:12.5px;font-weight:600;line-height:1.3'), background: FAM[m.f].c, color: FAM[m.f].ink ? '#0d1e1d' : '#fff' }}>
                        {m.n || FAM[m.f].label}
                      </span>
                    ))}
                  </span>
                  <span style={css('font-size:14px;line-height:1.65;color:#1a2e2c;display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden;white-space:pre-wrap')}>{ent.notes.join('').trim() || '— ยังไม่ได้เขียนเรื่องราว —'}</span>
                  <span style={css('display:flex;align-items:center;gap:6px;font-size:12.5px;font-weight:600;color:#0d8a7e')}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4 20l1-4.2L15.6 5.2a2 2 0 0 1 2.8 0l.4.4a2 2 0 0 1 0 2.8L8.2 19 4 20z" />
                      <path d="M13.5 7.3l3.2 3.2" />
                    </svg>
                    แก้ไขหน้านี้
                  </span>
                </button>
              ) : future ? (
                <div style={css('padding:14px 16px;border-radius:16px;background:#ede5cf;font-size:13px;line-height:1.55;color:#1a2e2c')}>Diary ของวันนี้จะเปิดให้เขียนเมื่อถึงวันนั้น · ลงกิจกรรมไว้ก่อนได้เลย</div>
              ) : (
                <div style={css('position:relative;overflow:hidden;padding:14px 16px 16px;border-radius:18px;background:#fff;display:flex;flex-direction:column;gap:14px')}>
                  <Twinkle style={{ top: 12, right: 18 }} color="#f5c243" dur={2.6} delay={0.3} />
                  <Floaty style={{ top: 8, right: 44, width: 56, height: 34, opacity: 0.9 }} anim="v2Float 6s ease-in-out infinite">
                    <Cloud color="#eaf6f4" stroke={3} animate={false} style={{ width: '100%', height: '100%' }} />
                  </Floaty>
                  <span style={css("position:relative;align-self:flex-start;font-family:'Caveat',cursive;font-weight:700;font-size:24px;line-height:1;color:#0d1e1d")}>
                    {diff === 0 ? 'วันนี้เป็นยังไงบ้าง?' : 'วันนั้นเป็นยังไงบ้าง?'}
                    <DrawLine key={`pl-${sel}`} color="#f5c243" w={6} top={21} />
                  </span>
                  <div style={css('display:grid;grid-template-columns:repeat(7,1fr);gap:4px')}>
                    {FAMILIES.map((f, i) => (
                      <button key={f.key} type="button" className="c2-qm" onClick={() => openDiary(sel, f.key)} style={css('display:flex;flex-direction:column;align-items:center;gap:5px;border:0;background:transparent;padding:0;cursor:pointer')}>
                        <span data-anim="" style={{ display: 'block', animation: `v2Bob 3.2s ease-in-out ${(i * 0.18).toFixed(2)}s infinite` }}>
                          <span className="c2-dot" style={{ display: 'block', width: 32, height: 32, borderRadius: '50%', background: f.c }} />
                        </span>
                        <span style={css('font-size:11px;color:#6a7a78;white-space:nowrap')}>{f.label}</span>
                      </button>
                    ))}
                  </div>
                  {!signedIn && <span style={css('font-size:12px;color:#6a7a78')}>เข้าสู่ระบบเพื่อเขียน Diary และลงกิจกรรมของคุณ</span>}
                </div>
              )}
            </div>

            {nextUp.length > 0 && (
              <div style={css('display:flex;flex-direction:column;gap:6px')}>
                <div style={css('display:flex;align-items:center;gap:8px')}>
                  <span style={mono(10.5, 'letter-spacing:.16em')}>ถัดไปของคุณ</span>
                  <span style={css('flex:1;height:1px;border-top:1px dashed #d4ece8')} />
                </div>
                {nextUp.map((nx, i) => {
                  const d = dOnly(nx.day);
                  const n = diffDays(sel, nx.day);
                  return (
                    <button key={i} type="button" className="c2-link" onClick={nx.go} style={css('display:flex;align-items:center;gap:12px;padding:8px 4px;border:0;background:transparent;color:#0d1e1d;text-align:left;cursor:pointer')}>
                      <span style={css('width:44px;flex-shrink:0;display:flex;flex-direction:column;align-items:center;line-height:1')}>
                        <span style={css("font-family:'Archivo Black',sans-serif;font-size:20px;letter-spacing:-.03em")}>{d.getDate()}</span>
                        <span style={css("font-family:'JetBrains Mono',monospace;font-size:9.5px;color:#6a7a78;margin-top:3px")}>{TH_MON[d.getMonth()]}</span>
                      </span>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: nx.dot }} />
                      <span style={css('flex:1;min-width:0;font-size:13.5px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap')}>{nx.title}</span>
                      <span style={css("font-family:'Caveat',cursive;font-weight:700;font-size:18px;color:#6a7a78;white-space:nowrap")}>{n === 1 ? 'พรุ่งนี้' : `อีก ${n} วัน`}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div style={{ flexShrink: 0, minWidth: desk ? 400 : 0, boxSizing: 'border-box', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, padding: ui.actPad, background: '#f6f1e6' }}>
            <Btn kind="teal" onClick={() => openEvent(null)} style={btnFull}>
              + ลงกิจกรรม
            </Btn>
            <Btn kind="ink" onClick={() => openDiary()} style={{ ...btnFull, opacity: future ? 0.45 : 1 }}>
              ✎ เขียน Diary
            </Btn>
          </div>
        </div>
      </div>

      {/* ================= composer ================= */}
      {mode && !desk && <div onClick={() => setMode(null)} style={css('position:absolute;inset:0;background:rgba(13,30,29,.45);z-index:55;animation:v2Fade .2s ease')} />}
      {mode && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'absolute',
            top: desk ? 16 : 56,
            right: desk ? 28 : 0,
            bottom: desk ? 22 : 0,
            left: desk ? 'auto' : 0,
            width: desk ? 400 : 'auto',
            zIndex: 60,
            background: '#f6f1e6',
            borderRadius: desk ? 22 : '26px 26px 0 0',
            boxShadow: '0 30px 60px -20px rgba(13,30,29,.45)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            animation: 'v2Up .3s cubic-bezier(.2,.7,.2,1)',
          }}
        >
          {!desk && <div style={css('width:40px;height:4px;border-radius:4px;background:#cdc5b1;margin:10px auto 0')} />}
          <div style={css('display:flex;align-items:center;gap:12px;padding:16px 20px 12px')}>
            <button type="button" className="c2-link" onClick={() => setMode(null)} aria-label="กลับ" style={css('width:38px;height:38px;border-radius:50%;border:0;background:#fff;color:#0d1e1d;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0')}>
              <Chev dir="l" />
            </button>
            <div style={css('display:flex;flex-direction:column;gap:3px;min-width:0;flex:1')}>
              <span style={css("font-family:'Mitr',sans-serif;font-weight:500;font-size:20px;line-height:1.1;white-space:nowrap")}>{mode === 'event' ? (ev?.id ? 'แก้กิจกรรม' : 'ลงกิจกรรม') : mode === 'diary' ? 'Diary' : 'รายละเอียด workshop'}</span>
              <span style={mono(10.5)}>{mode === 'event' && ev ? (ev.start === ev.end ? longD(ev.start) : `${short(ev.start)} – ${longD(ev.end)}`) : mode === 'diary' ? `${TH_WD[sd0.getDay()]} · ${longD(sel)}` : ws ? STATUS[statusOf(ws)][2] : ''}</span>
            </div>
          </div>

          {mode === 'event' && ev && (
            <>
              <div style={css('flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;padding:4px 20px 16px;display:flex;flex-direction:column;gap:16px')}>
                <label style={css('display:flex;flex-direction:column;gap:7px')}>
                  <span style={mono(10.5)}>ชื่อกิจกรรม</span>
                  <input className="c2-field" value={ev.title} maxLength={120} onChange={(e) => setEv({ ...ev, title: e.target.value, err: '' })} placeholder="เช่น นัดเพื่อนไปวาดรูปที่สวน" style={css('border:0;border-radius:14px;background:#fff;padding:13px 14px;font-family:inherit;font-size:15px;color:#0d1e1d;outline:none')} />
                </label>
                <div style={css('display:flex;flex-direction:column;gap:7px')}>
                  <span style={mono(10.5)}>ประเภท</span>
                  <div style={css('display:flex;flex-wrap:wrap;gap:6px')}>
                    {EVENT_KINDS.map((t) => (
                      <button key={t.key} type="button" onClick={() => setEv({ ...ev, kind: t.key })} style={{ ...css('display:inline-flex;align-items:center;gap:7px;border:0;border-radius:999px;padding:8px 14px;font-size:13px;font-weight:600;white-space:nowrap;cursor:pointer;color:#0d1e1d'), background: ev.kind === t.key ? '#fff' : 'rgba(255,255,255,.5)', boxShadow: ev.kind === t.key ? 'inset 0 0 0 2px #0d8a7e' : 'none' }}>
                        <span style={{ width: 10, height: 10, borderRadius: '50%', background: t.c }} />
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div style={css('display:grid;grid-template-columns:1fr 1fr;gap:10px')}>
                  <label style={css('display:flex;flex-direction:column;gap:7px')}>
                    <span style={mono(10.5)}>เริ่ม</span>
                    <input type="date" value={ev.start} onChange={(e) => setEv({ ...ev, start: e.target.value, end: ev.end < e.target.value ? e.target.value : ev.end })} style={css('border:0;border-radius:14px;background:#fff;padding:12px;font-family:inherit;font-size:14px;color:#0d1e1d;outline:none;min-width:0')} />
                  </label>
                  <label style={css('display:flex;flex-direction:column;gap:7px')}>
                    <span style={mono(10.5)}>ถึง</span>
                    <input type="date" value={ev.end} min={ev.start} onChange={(e) => setEv({ ...ev, end: e.target.value })} style={css('border:0;border-radius:14px;background:#fff;padding:12px;font-family:inherit;font-size:14px;color:#0d1e1d;outline:none;min-width:0')} />
                  </label>
                </div>
                <button type="button" onClick={() => setEv({ ...ev, allDay: !ev.allDay })} style={css('display:flex;align-items:center;gap:12px;border:0;background:#fff;border-radius:14px;padding:12px 14px;font-size:14px;color:#0d1e1d;cursor:pointer;text-align:left')}>
                  <span style={{ flex: 1 }}>ทั้งวัน</span>
                  <span style={{ width: 40, height: 24, borderRadius: 999, background: ev.allDay ? '#0d8a7e' : '#cdc5b1', position: 'relative', transition: 'background .2s ease' }}>
                    <span style={{ position: 'absolute', top: 3, left: ev.allDay ? 19 : 3, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left .25s cubic-bezier(.2,.7,.2,1)' }} />
                  </span>
                </button>
                {!ev.allDay && (
                  <div style={css('display:grid;grid-template-columns:1fr 1fr;gap:10px')}>
                    <input type="time" aria-label="เวลาเริ่ม" value={ev.ts} onChange={(e) => setEv({ ...ev, ts: e.target.value })} style={css('border:0;border-radius:14px;background:#fff;padding:12px;font-family:inherit;font-size:14px;color:#0d1e1d;outline:none;min-width:0')} />
                    <input type="time" aria-label="เวลาจบ" value={ev.te} onChange={(e) => setEv({ ...ev, te: e.target.value })} style={css('border:0;border-radius:14px;background:#fff;padding:12px;font-family:inherit;font-size:14px;color:#0d1e1d;outline:none;min-width:0')} />
                  </div>
                )}
                <label style={css('display:flex;flex-direction:column;gap:7px')}>
                  <span style={mono(10.5)}>สถานที่ / โน้ต</span>
                  <textarea className="c2-field" value={ev.note} maxLength={500} onChange={(e) => setEv({ ...ev, note: e.target.value })} rows={3} placeholder="ไม่ใส่ก็ได้" style={css('border:0;border-radius:14px;background:#fff;padding:12px 14px;font-family:inherit;font-size:14px;line-height:1.55;color:#0d1e1d;outline:none;resize:none')} />
                </label>
                {ev.err && <span style={css('font-size:13px;color:#c9503f')}>{ev.err}</span>}
                {ev.id && (
                  <button type="button" onClick={deleteEvent} disabled={busy} style={css('align-self:flex-start;border:0;background:transparent;color:#c9503f;font-size:13px;font-weight:600;cursor:pointer;padding:0')}>
                    ลบกิจกรรมนี้
                  </button>
                )}
              </div>
              <div style={css('flex-shrink:0;display:flex;gap:10px;padding:12px 20px 20px')}>
                <Btn kind="teal" onClick={saveEvent} disabled={busy} style={{ ...btnFull, flex: 1 }}>
                  {busy ? 'กำลังบันทึก…' : 'บันทึกกิจกรรม'}
                </Btn>
                <Btn kind="paper" onClick={() => setMode(null)}>
                  ยกเลิก
                </Btn>
              </div>
            </>
          )}

          {mode === 'diary' && dy && (
            <>
              <div style={css('flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;padding:4px 20px 16px;display:flex;flex-direction:column;gap:14px')}>
                {bookedToday && (
                  <div style={css('display:flex;align-items:center;gap:10px;background:#0d1e1d;color:#fff;border-radius:14px;padding:11px 14px')}>
                    <StarIco c="#f5c243" size={15} />
                    <span style={css('font-size:13px;line-height:1.4;min-width:0')}>
                      หน้านี้จะแนบ workshop <b>{bookedToday.title}</b> ไว้ด้านบน
                    </span>
                  </div>
                )}
                <div style={css('display:flex;flex-direction:column;gap:8px')}>
                  <div style={css('display:flex;align-items:baseline;justify-content:space-between')}>
                    <span style={mono(10.5)}>วันนี้รู้สึกยังไง</span>
                    <span style={css("font-family:'JetBrains Mono',monospace;font-size:10.5px;color:#6a7a78")}>
                      {dy.moods.length}/{MAX_MOODS}
                    </span>
                  </div>
                  <div style={css('display:flex;flex-wrap:wrap;gap:6px')}>
                    {FAMILIES.map((f) => {
                      const on = dy.moods.some((m) => m.f === f.key);
                      return (
                        <button key={f.key} type="button" onClick={() => toggleFam(f.key)} style={{ ...css('display:inline-flex;align-items:center;gap:7px;border:0;border-radius:999px;padding:7px 13px 7px 8px;font-size:13px;font-weight:600;cursor:pointer;transition:background .2s ease'), background: on ? f.c : '#fff', color: on && !f.ink ? '#fff' : '#0d1e1d' }}>
                          <span style={{ width: 16, height: 16, borderRadius: '50%', background: f.c, boxShadow: '0 0 0 2px rgba(255,255,255,.7)' }} />
                          {f.label}
                        </button>
                      );
                    })}
                  </div>
                  {openFam && openCur && (
                    <div style={css('display:flex;flex-direction:column;gap:7px;background:#fff;border-radius:14px;padding:10px 12px 12px')}>
                      <span style={css("font-family:'Caveat',cursive;font-weight:700;font-size:18px;color:#6a7a78;line-height:1")}>ละเอียดขึ้นอีกนิด · {openFam.label}</span>
                      <div style={css('display:flex;flex-wrap:wrap;gap:5px')}>
                        {openFam.ring.map((n) => {
                          const on = openCur.n === n;
                          return (
                            <button key={n} type="button" onClick={() => pickRing(openFam.key, n)} style={{ ...css('border:0;border-radius:999px;padding:5px 11px;font-size:12.5px;font-weight:500;cursor:pointer'), background: on ? openFam.c : '#f6f1e6', color: on && !openFam.ink ? '#fff' : '#0d1e1d' }}>
                              {n}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
                <div style={css('position:relative;overflow:hidden;flex:1;min-height:190px;display:flex;flex-direction:column;background:#fff;border-radius:18px;padding:14px 16px 8px;box-shadow:0 16px 30px -24px rgba(13,30,29,.35)')}>
                  <Floaty style={{ top: 10, right: 14, width: 70, height: 42, opacity: 0.9 }} anim="v2Float 7s ease-in-out infinite">
                    <Cloud color="#d4ece8" stroke={3} animate={false} style={{ width: '100%', height: '100%' }} />
                  </Floaty>
                  <Twinkle style={{ top: 50, right: 20 }} color="#f5c243" dur={2.8} delay={0} />
                  <Twinkle style={{ bottom: 18, right: 26 }} color="#a5d9d1" dur={3.4} delay={1} size={12} />
                  <span style={css("position:relative;align-self:flex-start;font-family:'Caveat',cursive;font-weight:700;font-size:20px;color:#0d8a7e;line-height:1")}>
                    dear diary,
                    <DrawLine key={`pp-${sel}`} color="#fce4a0" w={6} top={12} />
                  </span>
                  <textarea
                    value={dy.text}
                    maxLength={MAX_DIARY}
                    onChange={(e) => setDy({ ...dy, text: e.target.value })}
                    placeholder="เล่าเรื่องของวันนี้… เจออะไร ได้เรียนรู้อะไร กลับมาพร้อมอะไร"
                    style={css('position:relative;flex:1;min-height:150px;border:0;outline:none;resize:none;padding:4px 0 0;font-family:inherit;font-size:15px;line-height:32px;color:#0d1e1d;background:repeating-linear-gradient(#fff 0 31px,#efe9db 31px 32px);background-attachment:local')}
                  />
                </div>
                <span style={css("font-family:'JetBrains Mono',monospace;font-size:10.5px;letter-spacing:.08em;color:#6a7a78")}>↻ ซิงก์กับสมุด Diary ของคุณ · แก้ต่อได้ที่ My Journey</span>
              </div>
              <div style={css('flex-shrink:0;display:flex;gap:10px;padding:12px 20px 20px')}>
                <Btn kind="teal" onClick={saveDiary} disabled={busy} style={{ ...btnFull, flex: 1 }}>
                  {busy ? 'กำลังบันทึก…' : 'บันทึกลง Diary'}
                </Btn>
                <Btn kind="paper" onClick={() => setMode(null)}>
                  ยกเลิก
                </Btn>
              </div>
            </>
          )}

          {mode === 'ws' && ws && <WsSheet w={ws} st={statusOf(ws)} booked={!!bookings[ws.id]} seatsTaken={seats[ws.id] || 0} today={T} now={now} onMemo={() => openDiary(ws.date)} btnFull={btnFull} />}
        </div>
      )}

      {burst > 0 && (
        <div key={burst} data-anim="" aria-hidden style={{ position: 'absolute', left: desk ? 'calc(100% - 228px)' : '50%', top: desk ? '62%' : '58%', width: 0, height: 0, zIndex: 90, pointerEvents: 'none' }}>
          {Array.from({ length: 16 }, (_, i) => {
            const a = (i / 16) * Math.PI * 2;
            const r = 70 + (i % 3) * 26;
            const cols = ['#f5c243', '#0d8a7e', '#d98fa2', '#a5d9d1', '#e79a4f'];
            const st = { position: 'absolute', left: 0, top: 0, fontSize: 12 + (i % 3) * 5, color: cols[i % 5], '--dx': Math.cos(a) * r + 'px', '--dy': Math.sin(a) * r + 'px', animation: `v2Burst 1.1s cubic-bezier(.2,.7,.2,1) ${(i % 4) * 0.04}s forwards` } as CSSProperties;
            return (
              <span key={i} style={st}>
                {i % 2 ? '✺' : '●'}
              </span>
            );
          })}
          <span style={css('position:absolute;left:0;top:0;white-space:nowrap;font-family:Caveat,cursive;font-weight:700;font-size:30px;color:#0d8a7e;animation:v2Pop 1.4s cubic-bezier(.2,.7,.2,1) forwards')}>saved ✺</span>
        </div>
      )}
      {toast && (
        <div role="status" style={{ ...css('position:absolute;left:50%;transform:translateX(-50%);z-index:80;background:#0d1e1d;color:#fff;border-radius:999px;padding:11px 20px;font-size:13.5px;font-weight:500;white-space:nowrap;box-shadow:0 20px 40px -16px rgba(13,30,29,.5);animation:v2Up .3s cubic-bezier(.2,.7,.2,1)'), bottom: desk ? 32 : 96 }}>
          {toast}
        </div>
      )}
    </div>
  );
}

/** The workshop sheet: banner, countdown, details, and the ways out. */
function WsSheet({ w, st, booked, seatsTaken, today, now, onMemo, btnFull }: { w: Workshop; st: St; booked: boolean; seatsTaken: number; today: string; now: number; onMemo: () => void; btnFull: CSSProperties }) {
  const ds = getWorkshopDays(w);
  const md = isMultiDay(w);
  const start = new Date(`${w.date}T${w.time_start}:00`);
  const end = new Date(`${w.date}T${w.time_end}:00`);
  const left = now ? Math.max(0, start.getTime() - now) : 0;
  const price = getEffectivePrice(w).price;
  const last = md ? (w.end_date as string) : ds[ds.length - 1];
  const dateLine = ds.length > 1 || md ? `${longD(w.date)} – ${longD(last)} · ${md ? diffDays(w.date, last) + 1 : ds.length} วัน` : `${longD(w.date)} · ${w.time_start} – ${w.time_end}`;
  const gcal = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(w.title)}&dates=${toG(start)}/${toG(end)}&location=${encodeURIComponent(w.map_url || w.location || '')}&ctz=Asia/Bangkok`;
  const label = css("font-family:'JetBrains Mono',monospace;font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;color:#6a7a78;padding-top:3px");
  return (
    <>
      <div style={css('flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;padding:4px 20px 16px;display:flex;flex-direction:column;gap:14px')}>
        <div style={{ borderRadius: 18, padding: 20, color: '#fff', background: BANNER[st] }}>
          <div style={css('display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px')}>
            {w.category && <span style={css("padding:5px 12px;border-radius:999px;font-size:11px;font-weight:500;font-family:'JetBrains Mono',monospace;letter-spacing:.06em;text-transform:uppercase;background:rgba(255,255,255,.18);color:#fff")}>{w.category}</span>}
            <span style={css("padding:5px 12px;border-radius:999px;font-size:11px;font-weight:500;font-family:'JetBrains Mono',monospace;letter-spacing:.06em;text-transform:uppercase;background:#f5c243;color:#0d1e1d")}>{STATUS[st][2]}</span>
          </div>
          <div style={css("font-family:'Mitr',sans-serif;font-weight:500;font-size:23px;line-height:1.2;margin-bottom:6px")}>{w.title}</div>
          <div style={css("font-family:'JetBrains Mono',monospace;font-size:12.5px;color:rgba(255,255,255,.85)")}>{dateLine}</div>
        </div>
        {left > 0 && (
          <div style={css("background:#1f1f1f;color:#f5d033;border-radius:12px;padding:11px 16px;font-family:'Archivo Black',monospace;font-size:21px;letter-spacing:.04em;text-shadow:0 0 12px rgba(245,208,51,.45);text-align:center;position:relative;overflow:hidden")}>
            <span style={css("font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:#f5d03390;display:block;margin-bottom:4px;text-shadow:none")}>▸ นับถอยหลัง</span>
            {`${Math.floor(left / 86400000)}d ${Math.floor((left % 86400000) / 3600000)}h ${Math.floor((left % 3600000) / 60000)}min ${pad(Math.floor((left % 60000) / 1000))}sec`}
            <div style={css('position:absolute;inset:0;background:repeating-linear-gradient(0deg,rgba(0,0,0,.22) 0 1px,transparent 1px 3px);pointer-events:none')} />
          </div>
        )}
        <div style={css('background:#fff;border-radius:16px;padding:4px 16px')}>
          <div style={css('display:grid;grid-template-columns:84px 1fr;gap:12px;padding:11px 0;font-size:14px')}>
            <span style={label}>สถานที่</span>
            <span>{w.is_online ? 'ออนไลน์' : w.location || '—'}</span>
          </div>
          {w.short_description && (
            <div style={css('display:grid;grid-template-columns:84px 1fr;gap:12px;padding:11px 0;font-size:14px;border-top:1px dashed #e7e3d9')}>
              <span style={label}>รายละเอียด</span>
              <span style={css('color:#6a7a78;line-height:1.55')}>{w.short_description}</span>
            </div>
          )}
          <div style={css('display:grid;grid-template-columns:84px 1fr;gap:12px;padding:11px 0;font-size:14px;border-top:1px dashed #e7e3d9')}>
            <span style={label}>ราคา · ที่นั่ง</span>
            <span>
              <b style={{ color: '#0d8a7e' }}>{price ? `฿${price.toLocaleString()}` : 'ฟรี'}</b> · {Math.max(0, w.max_participants - seatsTaken)}/{w.max_participants} ที่นั่งว่าง
            </span>
          </div>
        </div>
      </div>
      <div style={css('flex-shrink:0;display:flex;flex-direction:column;gap:8px;padding:12px 20px 20px')}>
        {booked && w.date <= today && (
          <Btn kind="ink" onClick={onMemo} style={btnFull}>
            ✎ เขียนความทรงจำลง Diary
          </Btn>
        )}
        <a href={gcal} target="_blank" rel="noopener noreferrer" className="c2-link" style={css('display:inline-flex;align-items:center;justify-content:center;gap:10px;padding:13px 18px;border-radius:999px;background:#fff;color:#0d1e1d;text-decoration:none;font-weight:600;font-size:14px')}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <rect x="3" y="3" width="10" height="10" rx="1" stroke="currentColor" strokeWidth="1.4" />
            <path d="M5 1 V3 M11 1 V3 M3 6 H13" stroke="currentColor" strokeWidth="1.4" />
          </svg>
          เพิ่มลง Google Calendar
        </a>
        <Btn kind="teal" href={`/workshops/${w.id}`} style={btnFull}>
          ดูรายละเอียดเต็ม <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>→</span>
        </Btn>
      </div>
    </>
  );
}
