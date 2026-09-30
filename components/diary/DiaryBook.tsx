'use client';

/* The diary as a paper book — port of "DiaryBook.dc.html" (Journey + Diary v2).
 *
 * Two pages side by side on a wide screen, one page on a phone. Pages turn
 * with a real page curl: drag a corner, swipe, tap an edge, use the arrows or
 * the keyboard. Every written day is a page (plus up to five more pages when
 * it runs long); a day with a workshop shows its poster at the top. The week
 * strip above jumps to any day up to today, and typing on a page saves itself
 * a moment later. The page-curl geometry is the design's, carried over as is. */

import { Component, createElement as h, type CSSProperties, type ReactNode } from 'react';
import { CAP_FIRST, CAP_REST, FAMILIES, FAM, MAX_MOODS, MAX_PAGES, TH_MON, TH_MONTHS, TH_WEEKDAY, TH_DOW, TONE_LABEL, addDays, css, dateOf, type DiaryEntry, type Mood, type MoodKey } from '@/lib/diary';

export type BookWorkshop = { title: string; time: string; poster: string | null; drive: string | null };
/** A personal event (ลงกิจกรรม on /calendar) shown on its day's page. */
export type BookEvent = { title: string; time: string; color: string };
export type MonthSummary = { month: string; top: string; logged: number; workshops: number; pages: number };

type Props = {
  owner: string;
  today: string;
  entries: DiaryEntry[];
  /** Workshops attended, by their first day. */
  workshops: Record<string, BookWorkshop>;
  /** The user's own calendar events, by every day they cover. */
  events?: Record<string, BookEvent[]>;
  /** Kept monthly summaries, drawn as a page after that month's last day. */
  summaries?: MonthSummary[];
  /** Bumped to jump to today and start writing. */
  writeNonce?: number;
  /** Bumped together with `jumpTo` to open a given day. */
  jumpNonce?: number;
  jumpTo?: string | null;
  onSave: (day: string, data: { notes: string[]; moods: Mood[] }) => void;
};

type Resolved = { f: MoodKey; n: string; label: string; c: string; ink: boolean };
type Ent = { iso: string; ws: BookWorkshop | null; notes: string[]; moods: Resolved[] };
type PageT =
  | { kind: 'cover' | 'inside' | 'end' | 'blank' | 'insideBack' | 'backcover'; key: string }
  | { kind: 'day' | 'cont'; key: string; e: Ent; iso: string; sub: number; total: number; tx: string }
  | { kind: 'summary'; key: string; s: MonthSummary };
type Built = { P: PageT[]; endIdx: number; lastIdx: number; K: number };
type Pt = { x: number; y: number };
type Flip = { dir?: number; k?: number; t?: number; targetAt?: number; front?: number; under?: number; rev?: boolean; to?: number; cy: number; P: Pt; dragging?: boolean };
type Raw = { notes: string[]; moods: Mood[] };
type Drag = { sx: number; sy: number; lastX: number; t0: number; dir: number; cy: number; xr: number; moved: boolean; touch: boolean; onText: boolean; rev?: boolean };
type State = {
  cw: number; vh: number; top: number; at: number; flip: Flip | null; ghost: string | null; weekStart: string | null; vm: string | null;
  sdx: number; sAnim: 'prev' | 'next' | 'back' | null; over: Record<string, Raw>; tray: { iso: string; fam: MoodKey | null } | null; toast: string; saved: Record<string, boolean>;
};

const TOPPAD = 16;
const HIDE: CSSProperties = { display: 'none' };
const weekStartOf = (iso: string) => addDays(iso, -dateOf(iso).getDay());
const spreadOf = (i: number) => (i === 0 ? 0 : Math.floor((i + 1) / 2));
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const easeIO = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

function clipHalf(poly: Pt[], M: Pt, n: Pt, positive: boolean): Pt[] {
  const out: Pt[] = [];
  const f = (p: Pt) => (p.x - M.x) * n.x + (p.y - M.y) * n.y;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const fa = f(a), fb = f(b);
    const ina = positive ? fa >= 0 : fa <= 0;
    const inb = positive ? fb >= 0 : fb <= 0;
    if (ina) out.push(a);
    if (ina !== inb) {
      const t = fa / (fa - fb);
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  return out;
}
const polyCss = (pts: Pt[]) => (pts.length < 3 ? 'polygon(0 0,0 0,0 0)' : 'polygon(' + pts.map((p) => p.x.toFixed(1) + 'px ' + p.y.toFixed(1) + 'px').join(',') + ')');
function geom(W: number, H: number, P: Pt, cy: number) {
  const dx = W - P.x, dy = cy - P.y;
  const d = Math.hypot(dx, dy);
  if (d < 0.5) return null;
  const n = { x: dx / d, y: dy / d };
  const M = { x: (P.x + W) / 2, y: (P.y + cy) / 2 };
  const rect = [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: H }, { x: 0, y: H }];
  return { n, M, k: M.x * n.x + M.y * n.y, front: clipHalf(rect, M, n, false), lifted: clipHalf(rect, M, n, true) };
}
function constrain(W: number, H: number, P: Pt, cy: number): Pt {
  let x = Math.min(P.x, W), y = Math.max(0, Math.min(H, P.y));
  let vx = x, vy = y - cy, dd = Math.hypot(vx, vy);
  if (dd > W) { x = (vx * W) / dd; y = cy + (vy * W) / dd; }
  const oy = cy === 0 ? H : 0, D = Math.hypot(W, H);
  vx = x; vy = y - oy; dd = Math.hypot(vx, vy);
  if (dd > D) { x = (vx * D) / dd; y = oy + (vy * D) / dd; }
  return { x, y };
}
const FLAPBG = 'linear-gradient(to bottom,rgba(255,255,255,0) 0%,rgba(255,255,255,.3) 30%,rgba(13,30,29,.2) 50%,rgba(255,255,255,.3) 70%,rgba(255,255,255,0) 100%)';
const UNDERBG = 'linear-gradient(to bottom,rgba(13,30,29,0) 0%,rgba(13,30,29,.34) 50%,rgba(13,30,29,0) 100%)';
const GUT: Record<string, string> = {
  l: 'linear-gradient(to left,rgba(13,30,29,.16) 0,rgba(13,30,29,.05) 5%,rgba(13,30,29,0) 13%),linear-gradient(to right,rgba(13,30,29,.05),rgba(13,30,29,0) 4%)',
  r: 'linear-gradient(to right,rgba(13,30,29,.16) 0,rgba(13,30,29,.05) 5%,rgba(13,30,29,0) 13%),linear-gradient(to left,rgba(13,30,29,.05),rgba(13,30,29,0) 4%)',
  p: 'linear-gradient(to right,rgba(13,30,29,.10) 0,rgba(13,30,29,0) 7%),linear-gradient(to left,rgba(13,30,29,.05),rgba(13,30,29,0) 4%)',
};
const stack = (n: number, sgn: number) => {
  const a: string[] = [];
  for (let i = 1; i <= n; i++) a.push(sgn * i + 'px ' + (i * 0.6).toFixed(1) + 'px 0 0 ' + (i % 2 ? '#e6dcc6' : '#f7f1e4'));
  a.push('0 28px 40px -26px rgba(13,30,29,.55)');
  return a.join(',');
};
const chipCss = (m: Resolved, pad?: string) => 'display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:' + (pad || '4px 11px') + ';font-size:12.5px;font-weight:600;line-height:1.3;background:' + m.c + ';color:' + (m.ink ? 'var(--ink)' : '#fff');
const dotBg = (ms: Resolved[]) => (ms.length === 1 ? ms[0].c : 'linear-gradient(90deg,' + ms.map((m) => m.c).join(',') + ')');
const PEN = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flex: 'none', display: 'block' }}>
    <path d="M4 20l1-4.2L15.6 5.2a2 2 0 0 1 2.8 0l.4.4a2 2 0 0 1 0 2.8L8.2 19 4 20z" />
    <path d="M13.5 7.3l3.2 3.2" />
  </svg>
);

export class DiaryBook extends Component<Props, State> {
  state: State = { cw: 900, vh: 900, top: 200, at: 0, flip: null, ghost: null, weekStart: null, vm: null, sdx: 0, sAnim: null, over: {}, tray: null, toast: '', saved: {} };
  private _root: HTMLDivElement | null = null;
  private _stage: HTMLDivElement | null = null;
  private _strip: HTMLDivElement | null = null;
  private _ro: ResizeObserver | null = null;
  private _iv: ReturnType<typeof setInterval> | undefined;
  private _poll: ReturnType<typeof setInterval> | undefined;
  private _st: ReturnType<typeof setTimeout> | undefined;
  private _tt: ReturnType<typeof setTimeout> | undefined;
  private _svT: ReturnType<typeof setTimeout> | undefined;
  private _pend: Record<string, boolean> = {};
  private _lastNonce = 0;
  private _lastJump = 0;
  private _focusAfter: string | null = null;
  private _stripMoved = false;
  private _sdrag: { sx: number; sy: number; moved: boolean; touch: boolean } | null = null;
  private _drag: Drag | null = null;
  private _bg: ReactNode = null;

  rootRef = (el: HTMLDivElement | null) => {
    if (!el || el === this._root) return;
    this._root = el;
    if (this._ro) this._ro.disconnect();
    if (typeof ResizeObserver !== 'undefined') {
      this._ro = new ResizeObserver(() => this.measure());
      this._ro.observe(el);
    }
    this.measure();
  };
  stageRef = (el: HTMLDivElement | null) => { this._stage = el; };
  stripRef = (el: HTMLDivElement | null) => { this._strip = el; };
  stopPtr = (e: React.PointerEvent) => e.stopPropagation();
  stopMouse = (e: React.PointerEvent) => { if (e.pointerType === 'mouse') e.stopPropagation(); };

  measure = () => {
    if (!this._root) return;
    const cw = this._root.clientWidth;
    if (!cw) return;
    const r = this._root.getBoundingClientRect();
    const top = Math.round(r.top + (window.scrollY || 0));
    const vh = window.innerHeight;
    const s = this.state;
    if (Math.abs(cw - s.cw) > 1 || Math.abs(vh - s.vh) > 1 || Math.abs(top - s.top) > 1) this.setState({ cw, vh, top });
  };

  dims() {
    const { cw, vh, top } = this.state;
    const portrait = cw < 700;
    if (portrait) {
      const W = Math.floor(Math.min(cw - 4, 420));
      return { portrait: true, W, H: Math.round(W * 1.36), REF: 360 };
    }
    const chrome = 60 + 12 + TOPPAD + 22 + 12 + 42 + 14;
    const availH = Math.max(340, vh - Math.min(top, 260) - chrome);
    const W = Math.floor(Math.min((cw - 24) / 2, availH / 1.32, 620));
    return { portrait: false, W, H: Math.round(W * 1.32), REF: 440 };
  }

  resolve(list: Mood[]): Resolved[] {
    return (list || []).filter((x) => FAM[x.f]).map((x) => ({ f: x.f, n: x.n || '', label: x.n || FAM[x.f].label, c: FAM[x.f].c, ink: FAM[x.f].ink }));
  }
  wsFor(iso: string) { return this.props.workshops[iso] || null; }

  rawOf(iso: string): Raw {
    const o = this.state.over[iso];
    if (o) return { notes: o.notes.slice(), moods: o.moods.map((m) => ({ f: m.f, n: m.n })) };
    const pe = this.props.entries.find((e) => e.day === iso);
    if (pe) return { notes: (pe.notes.length ? pe.notes : ['']).slice(), moods: pe.moods.map((m) => ({ f: m.f, n: m.n || '' })) };
    return { notes: [''], moods: [] };
  }

  entries(): Ent[] {
    const map: Record<string, Ent> = {};
    this.props.entries.forEach((e) => {
      map[e.day] = { iso: e.day, ws: this.wsFor(e.day), notes: (e.notes.length ? e.notes : ['']).slice(), moods: this.resolve(e.moods) };
    });
    Object.keys(this.state.over).forEach((iso) => {
      const o = this.state.over[iso];
      map[iso] = { iso, ws: this.wsFor(iso), notes: o.notes.slice(), moods: this.resolve(o.moods) };
    });
    // Workshop and event days show up in the book even before anything is written.
    [...Object.keys(this.props.workshops), ...Object.keys(this.props.events || {})].forEach((iso) => {
      if (!map[iso] && iso <= this.props.today) map[iso] = { iso, ws: this.wsFor(iso), notes: [''], moods: [] };
    });
    return Object.keys(map).sort().map((k) => map[k]);
  }

  build(ghost: string | null): Built {
    const es = this.entries();
    const list = es.slice();
    if (ghost && !es.some((e) => e.iso === ghost)) {
      list.push({ iso: ghost, ws: this.wsFor(ghost), notes: [''], moods: [] });
      list.sort((a, b) => (a.iso < b.iso ? -1 : a.iso > b.iso ? 1 : 0));
    }
    const sums = this.props.summaries || [];
    const P: PageT[] = [{ kind: 'cover', key: 'cover' }, { kind: 'inside', key: 'inside' }];
    list.forEach((e, idx) => {
      e.notes.forEach((tx, i) => P.push({ kind: i === 0 ? 'day' : 'cont', e, iso: e.iso, sub: i, total: e.notes.length, tx: tx || '', key: e.iso + ':' + i }));
      const m = e.iso.slice(0, 7);
      const next = list[idx + 1];
      const s = sums.find((x) => x.month === m);
      if (s && (!next || next.iso.slice(0, 7) !== m)) P.push({ kind: 'summary', key: 'sum:' + m, s });
    });
    P.push({ kind: 'end', key: 'end' });
    const endIdx = P.length - 1;
    if (P.length % 2 === 1) P.push({ kind: 'blank', key: 'blank' });
    P.push({ kind: 'insideBack', key: 'insideBack' });
    P.push({ kind: 'backcover', key: 'backcover' });
    return { P, endIdx, lastIdx: P.length - 1, K: (P.length - 2) / 2 };
  }

  pIdx(at: number, dir: number, B: Built) {
    let i = at + dir;
    while (B.P[i] && B.P[i].kind === 'blank') i += dir;
    return i;
  }

  componentDidMount() {
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('pointercancel', this.onCancel);
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('resize', this.measure);
    this._lastNonce = this.props.writeNonce || 0;
    this._poll = setInterval(this.measure, 400);
    setTimeout(this.measure, 60);
    // Opened on a given day (e.g. from a journey stop).
    this._lastJump = this.props.jumpNonce || 0;
    if (this.props.jumpTo) {
      const iso = this.props.jumpTo;
      setTimeout(() => this.goDate(iso, false), 120);
    }
  }
  componentDidUpdate() {
    this.measure();
    const n = this.props.writeNonce || 0;
    if (n !== this._lastNonce) {
      this._lastNonce = n;
      if (this._root && this._root.offsetParent) this.goDate(this.props.today, true);
    }
    const j = this.props.jumpNonce || 0;
    if (j !== this._lastJump) {
      this._lastJump = j;
      if (this.props.jumpTo) this.goDate(this.props.jumpTo, false);
    }
  }
  componentWillUnmount() {
    window.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerup', this.onUp);
    window.removeEventListener('pointercancel', this.onCancel);
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('resize', this.measure);
    clearInterval(this._iv); clearInterval(this._poll); clearTimeout(this._st); clearTimeout(this._tt);
    this.flush();
    if (this._ro) this._ro.disconnect();
  }

  say(t: string) {
    this.setState({ toast: t });
    clearTimeout(this._tt);
    this._tt = setTimeout(() => this.setState({ toast: '' }), 2000);
  }

  writeRaw(iso: string, raw: Raw) {
    const over = { ...this.state.over, [iso]: raw };
    const saved = { ...this.state.saved, [iso]: false };
    this.setState({ over, saved });
    this._pend[iso] = true;
    clearTimeout(this._svT);
    this._svT = setTimeout(() => this.flush(), 700);
  }
  flush() {
    clearTimeout(this._svT);
    const keys = Object.keys(this._pend);
    this._pend = {};
    if (!keys.length) return;
    const saved = { ...this.state.saved };
    keys.forEach((iso) => {
      const o = this.state.over[iso];
      saved[iso] = true;
      if (o) this.props.onSave(iso, { notes: o.notes.slice(), moods: o.moods.slice() });
    });
    this.setState({ saved });
  }
  writeText(iso: string, sub: number, v: string) {
    const r = this.rawOf(iso);
    r.notes[sub] = v.slice(0, sub === 0 ? CAP_FIRST : CAP_REST);
    this.writeRaw(iso, r);
  }
  focusKey(key: string) {
    setTimeout(() => {
      if (!this._root) return;
      const el = this._root.querySelector<HTMLTextAreaElement>('textarea[data-k="' + key + '"]');
      if (el) {
        try {
          el.focus();
          const n = el.value.length;
          el.setSelectionRange(n, n);
        } catch {}
      }
    }, 80);
  }
  addPage(iso: string) {
    const r = this.rawOf(iso);
    if (r.notes.length >= MAX_PAGES) { this.say('หนึ่งวันเพิ่มได้ไม่เกิน ' + MAX_PAGES + ' หน้า'); return; }
    r.notes.push('');
    this.writeRaw(iso, r);
    const key = iso + ':' + (r.notes.length - 1);
    this._focusAfter = key;
    setTimeout(() => {
      const B = this.build(this.state.ghost);
      const i = B.P.findIndex((p) => p.key === key);
      if (i >= 0) this.flipTo(i, B);
    }, 0);
  }
  removePage(iso: string, sub: number) {
    const r = this.rawOf(iso);
    if (sub === 0 || r.notes.length < 2) return;
    r.notes.splice(sub, 1);
    this.writeRaw(iso, r);
  }
  toggleTray(iso: string) {
    const t = this.state.tray;
    this.setState({ tray: t && t.iso === iso ? null : { iso, fam: null } });
  }
  toggleFam(iso: string, k: MoodKey) {
    const r = this.rawOf(iso);
    const tray = this.state.tray || { iso, fam: null };
    const has = r.moods.some((m) => m.f === k);
    if (!has) {
      if (r.moods.length >= MAX_MOODS) { this.setState({ tray: { iso, fam: k } }); this.say('เลือกได้ไม่เกิน 3 อารมณ์'); return; }
      r.moods.push({ f: k, n: '' });
      this.writeRaw(iso, r);
      this.setState({ tray: { iso, fam: k } });
    } else if (tray.fam === k) {
      r.moods = r.moods.filter((m) => m.f !== k);
      this.writeRaw(iso, r);
      this.setState({ tray: { iso, fam: null } });
    } else this.setState({ tray: { iso, fam: k } });
  }
  toggleNu(iso: string, k: MoodKey, n: string) {
    const r = this.rawOf(iso);
    const at = r.moods.findIndex((m) => m.f === k && m.n === n);
    if (at >= 0) { r.moods.splice(at, 1); this.writeRaw(iso, r); return; }
    r.moods = r.moods.filter((m) => !(m.f === k && !m.n));
    if (r.moods.length >= MAX_MOODS) { this.say('เลือกได้ไม่เกิน 3 อารมณ์'); return; }
    r.moods.push({ f: k, n });
    this.writeRaw(iso, r);
  }
  rmMood(iso: string, j: number) {
    const r = this.rawOf(iso);
    r.moods.splice(j, 1);
    this.writeRaw(iso, r);
  }

  offsetNow() {
    const { portrait, W } = this.dims();
    if (portrait) return -W / 2;
    const B = this.build(this.state.ghost);
    const k = spreadOf(this.state.at);
    return k === 0 ? -W / 2 : k === B.K + 1 ? W / 2 : 0;
  }

  run(from: Pt, to: Pt, dur: number, lift: number, cy: number, done: () => void, ez?: (t: number) => number) {
    clearInterval(this._iv);
    const f0 = ez || easeIO;
    const t0 = Date.now();
    const s = cy === 0 ? 1 : -1;
    const { W, H } = this.dims();
    this._iv = setInterval(() => {
      const k = Math.min(1, (Date.now() - t0) / dur);
      const e = f0(k);
      const P = constrain(W, H, { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e + s * lift * Math.sin(Math.PI * e) }, cy);
      const f = this.state.flip;
      if (!f) { clearInterval(this._iv); return; }
      this.setState({ flip: { ...f, P, dragging: false } });
      if (k >= 1) { clearInterval(this._iv); done(); }
    }, 16);
  }

  afterNav() {
    const key = this._focusAfter;
    if (!key) return;
    this._focusAfter = null;
    this.focusKey(key);
  }

  commit(ok: boolean) {
    const f = this.state.flip;
    if (!f) return;
    if (!ok) { this.setState({ flip: null }); this._focusAfter = null; return; }
    const { portrait } = this.dims();
    const at = portrait ? (f.to as number) : f.targetAt != null ? f.targetAt : f.t === 0 ? 0 : 2 * (f.t as number) - 1;
    this.setState({ flip: null, at, weekStart: null, vm: null });
    this.afterNav();
  }

  flipTo(targetAt: number, B?: Built, patch?: Partial<State>) {
    const st = this.state;
    if (st.flip) return;
    const pt = patch || {};
    const BB = B || this.build(st.ghost);
    const fromAt = pt.at != null ? pt.at : st.at;
    const { portrait, W, H } = this.dims();
    const target = Math.max(0, Math.min(BB.lastIdx, targetAt));
    if (portrait) {
      if (target === fromAt) { this.setState({ ...(pt as State), at: target }); this.afterNav(); return; }
      const fwd = target > fromAt;
      const fl: Flip = fwd ? { front: fromAt, under: target, rev: false, to: target, cy: H, P: { x: W, y: H } } : { front: target, under: fromAt, rev: true, to: target, cy: H, P: { x: -W, y: H } };
      const a = fwd ? { x: W, y: H } : { x: -W, y: H };
      const b = fwd ? { x: -W, y: H } : { x: W, y: H };
      this.setState({ ...(pt as State), flip: fl, tray: null });
      this.run(a, b, 900, H * 0.16, H, () => this.commit(true));
    } else {
      const k = spreadOf(fromAt), t = spreadOf(target);
      if (t === k) { this.setState({ ...(pt as State), at: target }); this.afterNav(); return; }
      const fl: Flip = { dir: t > k ? 1 : -1, k, t, targetAt: target, cy: H, P: { x: W, y: H } };
      this.setState({ ...(pt as State), flip: fl, tray: null });
      this.run({ x: W, y: H }, { x: -W, y: H }, 950, H * 0.16, H, () => this.commit(true));
    }
  }

  blurText() {
    const a = document.activeElement as HTMLElement | null;
    if (a && a.tagName === 'TEXTAREA') a.blur();
  }

  step(dir: number) {
    const st = this.state;
    if (st.flip) return;
    this.flush(); this.blurText();
    const B = this.build(st.ghost);
    const { portrait } = this.dims();
    if (portrait) {
      const n = this.pIdx(st.at, dir, B);
      if (n < 0 || n > B.lastIdx) return;
      this.flipTo(n, B);
      return;
    }
    const k = spreadOf(st.at), t = k + dir;
    if (t < 0 || t > B.K + 1) return;
    this.flipTo(t === 0 ? 0 : 2 * t - 1, B);
  }

  jump(i: number) {
    if (this.state.flip) return;
    this.flush(); this.blurText();
    this.flipTo(i, this.build(this.state.ghost));
  }

  goDate(iso: string, focus?: boolean) {
    const st = this.state;
    if (iso > this.props.today || st.flip) return;
    this.flush();
    const has = this.entries().some((e) => e.iso === iso);
    const oldB = this.build(st.ghost);
    const focusKey = (oldB.P[st.at] || { key: '' }).key;
    const ng = has ? null : iso;
    const B = this.build(ng);
    let at = B.P.findIndex((p) => p.key === focusKey);
    if (at < 0) at = Math.min(st.at, B.endIdx);
    const target = B.P.findIndex((p) => 'iso' in p && p.iso === iso && p.sub === 0);
    if (target < 0) return;
    if (focus || !has) this._focusAfter = iso + ':0';
    this.flipTo(target, B, { ghost: ng, at, weekStart: null, vm: null });
  }

  weekBase() {
    const st = this.state;
    if (st.weekStart) return st.weekStart;
    const vis = this.visibleIsos(this.build(st.ghost));
    return weekStartOf(vis[0] || this.props.today);
  }
  visibleIsos(B: Built) {
    const { portrait } = this.dims();
    const at = Math.min(this.state.at, B.lastIdx);
    const out: string[] = [];
    const idx = portrait ? [at] : [2 * spreadOf(at) - 1, 2 * spreadOf(at)];
    idx.forEach((i) => {
      const pp = B.P[i];
      if (pp && 'iso' in pp && out.indexOf(pp.iso) < 0) out.push(pp.iso);
    });
    return out;
  }
  shiftWeek(dir: number) {
    if (this.state.sAnim) return;
    const base = this.weekBase();
    const nb = addDays(base, 7 * dir);
    clearTimeout(this._st);
    if (dir > 0 && nb > this.props.today) {
      this.setState({ sAnim: 'back', sdx: 0 });
      this._st = setTimeout(() => this.setState({ sAnim: null }), 300);
      return;
    }
    this.setState({ sAnim: dir < 0 ? 'prev' : 'next', sdx: 0 });
    this._st = setTimeout(() => {
      const m = dateOf(addDays(nb, 3));
      this.setState({ weekStart: nb, sAnim: null, vm: m.getFullYear() + '-' + m.getMonth() });
    }, 300);
  }
  pickMonth(y: number, m: number) {
    const first = y + '-' + String(m + 1).padStart(2, '0') + '-01';
    if (first > this.props.today) { this.say('ยังไม่ถึงเดือนนี้'); return; }
    let ws = weekStartOf(first);
    if (dateOf(ws).getMonth() !== m) ws = addDays(ws, 7);
    if (ws > this.props.today) ws = weekStartOf(first);
    this.setState({ weekStart: ws, vm: y + '-' + m });
  }

  onStripDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    this._sdrag = { sx: e.clientX, sy: e.clientY, moved: false, touch: e.pointerType !== 'mouse' };
  };

  onDown = (e: React.PointerEvent) => {
    if (this.state.flip || !this._stage) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const tg = e.target as HTMLElement;
    if (tg && tg.closest && tg.closest('button,a,select,input')) return;
    const r = this._stage.getBoundingClientRect();
    const ax = r.left + r.width / 2 + this.offsetNow(), ay = r.top + TOPPAD;
    const xr = e.clientX - ax, yr = e.clientY - ay;
    const { portrait, W, H } = this.dims();
    if (yr < 0 || yr > H) return;
    const B = this.build(this.state.ghost);
    const at = this.state.at;
    let dir = 0;
    if (portrait) {
      if (xr < 0 || xr > W) return;
      dir = xr > W * 0.42 ? 1 : -1;
      if (dir > 0 && at >= B.lastIdx) dir = 0;
      if (dir < 0 && at <= 0) dir = 0;
    } else {
      const k = spreadOf(at);
      if (xr >= 0 && xr <= W) dir = k < B.K + 1 ? 1 : 0;
      else if (xr < 0 && xr >= -W) dir = k > 0 ? -1 : 0;
    }
    if (!dir) return;
    const onText = !!tg && tg.tagName === 'TEXTAREA';
    this._drag = { sx: e.clientX, sy: e.clientY, lastX: e.clientX, t0: Date.now(), dir, cy: yr < H / 2 ? 0 : H, xr, moved: false, touch: e.pointerType !== 'mouse', onText };
    if (e.pointerType === 'mouse' && !onText) e.preventDefault();
  };

  startDrag(d: Drag) {
    this.flush(); this.blurText();
    const { portrait, W } = this.dims();
    const at = this.state.at;
    let fl: Flip;
    if (portrait) {
      d.rev = d.dir < 0;
      const n = this.pIdx(at, d.dir, this.build(this.state.ghost));
      fl = d.rev ? { front: n, under: at, rev: true, to: n, cy: d.cy, P: { x: -W, y: d.cy } } : { front: at, under: n, rev: false, to: n, cy: d.cy, P: { x: W, y: d.cy } };
    } else {
      const k = spreadOf(at);
      fl = { dir: d.dir, k, t: k + d.dir, cy: d.cy, P: { x: W, y: d.cy } };
    }
    fl.dragging = true;
    this.setState({ flip: fl, tray: null });
  }

  onMove = (e: PointerEvent) => {
    const s = this._sdrag;
    if (s) {
      const dx = e.clientX - s.sx, dy = e.clientY - s.sy;
      if (!s.moved) {
        if (Math.hypot(dx, dy) < 6) return;
        if (s.touch && Math.abs(dy) > Math.abs(dx)) { this._sdrag = null; return; }
        s.moved = true;
      }
      const canNext = addDays(this.weekBase(), 7) <= this.props.today;
      this.setState({ sdx: dx < 0 && !canNext ? dx * 0.3 : dx });
      return;
    }
    const d = this._drag;
    if (!d) return;
    const dx = e.clientX - d.sx, dy = e.clientY - d.sy;
    if (!d.moved) {
      if (Math.hypot(dx, dy) < (d.onText ? 14 : 6)) return;
      if (Math.abs(dy) > Math.abs(dx) * 1.2) {
        if (d.touch || d.onText) { this._drag = null; return; }
      }
      d.moved = true;
      this.startDrag(d);
    }
    const { portrait, W, H } = this.dims();
    let x: number;
    if (portrait) x = d.rev ? -W + dx * 1.1 : W + dx * 1.1;
    else x = d.dir > 0 ? W + dx : W - dx;
    const P = constrain(W, H, { x, y: d.cy + dy * 0.5 }, d.cy);
    d.lastX = e.clientX;
    const f = this.state.flip;
    if (f) this.setState({ flip: { ...f, P, dragging: true } });
  };

  onUp = (e: PointerEvent) => {
    const s = this._sdrag;
    if (s) {
      this._sdrag = null;
      if (!s.moved) return;
      this._stripMoved = true;
      setTimeout(() => { this._stripMoved = false; }, 80);
      const dx = this.state.sdx;
      const w = this._strip ? this._strip.clientWidth : 400;
      const th = Math.min(70, w * 0.15);
      if (dx > th) this.shiftWeek(-1);
      else if (dx < -th) this.shiftWeek(1);
      else {
        clearTimeout(this._st);
        this.setState({ sAnim: 'back', sdx: 0 });
        this._st = setTimeout(() => this.setState({ sAnim: null }), 300);
      }
      return;
    }
    const d = this._drag;
    if (!d) return;
    this._drag = null;
    const { portrait, W } = this.dims();
    if (!d.moved) {
      if (d.onText) return;
      const closed = spreadOf(this.state.at) === 0;
      const edge = portrait ? (d.dir > 0 ? d.xr > W * 0.82 : d.xr < W * 0.18) : Math.abs(d.xr) > W * 0.82;
      if (edge || closed) this.step(d.dir);
      return;
    }
    this.release(e && e.clientX != null ? e.clientX : d.lastX, d);
  };

  onCancel = () => {
    if (this._sdrag) { this._sdrag = null; this.setState({ sdx: 0 }); }
    const d = this._drag;
    this._drag = null;
    if (d && d.moved) this.release(d.lastX, d);
  };

  release(cx: number, d: Drag) {
    const f = this.state.flip;
    if (!f) return;
    const { portrait, W, H } = this.dims();
    const P = f.P;
    const p = clamp01((W - P.x) / (2 * W));
    const vx = (cx - d.sx) / Math.max(1, Date.now() - d.t0);
    let ok: boolean;
    if (portrait && f.rev) ok = p < 0.8 || vx > 0.5;
    else if (portrait) ok = p > 0.2 || vx < -0.5;
    else ok = p > 0.2 || (d.dir > 0 ? vx < -0.5 : vx > 0.5);
    const doneP = portrait && f.rev ? { x: W, y: f.cy } : { x: -W, y: f.cy };
    const backP = portrait && f.rev ? { x: -W, y: f.cy } : { x: W, y: f.cy };
    const target = ok ? doneP : backP;
    const dist = Math.abs(target.x - P.x) / (2 * W);
    this.run(P, target, 240 + 560 * dist, H * 0.05 * dist, f.cy, () => this.commit(ok), easeOut);
  }

  onKey = (e: KeyboardEvent) => {
    const tg = (e.target as HTMLElement | null)?.tagName;
    if (tg === 'INPUT' || tg === 'TEXTAREA' || tg === 'SELECT') return;
    if (!this._root || !this._root.offsetParent) return;
    if (e.key === 'ArrowRight') this.step(1);
    else if (e.key === 'ArrowLeft') this.step(-1);
  };

  /* ---------------- page contents ---------------- */

  pageContent(i: number, B: Built, portrait: boolean): { node: ReactNode; no: string } {
    const p: PageT = i < 0 ? { kind: 'backcover', key: 'back' } : B.P[i] || { kind: 'blank', key: 'blank' };
    const owner = this.props.owner;
    const today = this.props.today;
    if (p.kind === 'cover')
      return {
        no: '',
        node: (
          <div style={css('position:absolute;inset:0')}>
            <div style={css('position:absolute;inset:0;background-color:var(--teal);background-image:repeating-linear-gradient(0deg,rgba(255,255,255,.04) 0 1px,transparent 1px 3px),repeating-linear-gradient(90deg,rgba(0,0,0,.05) 0 1px,transparent 1px 4px)')} />
            <div style={css('position:absolute;top:0;bottom:0;left:0;width:7%;background:linear-gradient(90deg,rgba(0,0,0,.24),rgba(0,0,0,.06))')} />
            <div style={css('position:absolute;top:0;bottom:0;left:7%;width:1px;background:rgba(255,255,255,.2)')} />
            <div style={css('position:absolute;top:0;bottom:0;right:11%;width:14px;background:var(--accent);box-shadow:inset 3px 0 0 rgba(0,0,0,.08),inset -2px 0 0 rgba(255,255,255,.35),2px 0 6px rgba(0,0,0,.2)')} />
            <div style={css('position:absolute;left:17%;right:25%;top:16%;background:var(--cream);border-radius:8px;padding:9% 8%;box-shadow:0 2px 0 rgba(0,0,0,.08)')}>
              <span className="eyebrow" style={{ color: 'var(--teal)' }}>MY DIARY · {today.slice(0, 4)}</span>
              <div style={css("font-family:'Archivo Black','Mitr',sans-serif;font-size:32px;line-height:.9;letter-spacing:-.02em;margin-top:12px;color:var(--ink)")}>
                SOULFUL
                <br />
                NOTES
              </div>
              <div style={css('height:1px;background:rgba(13,30,29,.12);margin:14px 0 10px')} />
              <div style={css('font-family:Mitr,sans-serif;font-weight:500;font-size:14px;color:var(--ink)')}>ของ {owner}</div>
            </div>
            <span style={css("position:absolute;left:17%;bottom:10%;font-family:Caveat,'Mitr',cursive;font-size:26px;color:var(--cream);transform:rotate(-4deg)")}>enjoy the journey ✺</span>
          </div>
        ),
      };
    if (p.kind === 'inside')
      return {
        no: '',
        node: (
          <div style={css('position:absolute;inset:0')}>
            <div style={css('position:absolute;inset:0;background-color:var(--cream);background-image:radial-gradient(#cfe8e4 1.2px,transparent 1.4px);background-size:18px 18px')} />
            <div style={css('position:absolute;left:10%;right:10%;top:12%;background:#fffdf7;border-radius:14px;padding:8%;box-shadow:0 10px 30px -20px rgba(13,30,29,.4)')}>
              <span className="eyebrow" style={{ color: 'var(--muted)' }}>สมุดเล่มนี้เป็นของ</span>
              <div style={css("font-family:Caveat,'Mitr',cursive;font-size:36px;line-height:1.1;margin-top:8px")}>{owner}</div>
              <div style={css('height:1px;background:var(--cream-deep);margin:14px 0')} />
              <span className="eyebrow" style={{ color: 'var(--teal)' }}>วิธีใช้</span>
              <div style={css('display:flex;flex-direction:column;gap:10px;margin-top:10px;font-size:14px;line-height:1.5')}>
                <span>↔ ปัดหรือลากมุมกระดาษเพื่อพลิกหน้า</span>
                <span>▦ เลือกเดือน ปี หรือปัดแถบวันที่ด้านบน</span>
                <span>✎ แตะบนเส้นบรรทัดแล้วพิมพ์ได้เลย บันทึกให้อัตโนมัติ</span>
              </div>
            </div>
          </div>
        ),
      };
    if (p.kind === 'insideBack')
      return {
        no: '',
        node: (
          <div style={css('position:absolute;inset:0')}>
            <div style={css('position:absolute;inset:0;background-color:var(--cream);background-image:radial-gradient(#cfe8e4 1.2px,transparent 1.4px);background-size:18px 18px')} />
            <div style={css('position:absolute;left:12%;right:12%;bottom:14%;display:flex;flex-direction:column;align-items:center;gap:8px;text-align:center')}>
              <span style={css('font-family:Mitr,sans-serif;font-weight:500;font-size:16px')}>เรียนรู้นอกห้องเรียน.</span>
              <span style={css("font-family:Caveat,'Mitr',cursive;font-size:24px;color:var(--teal)")}>it can be fun! ✺</span>
            </div>
          </div>
        ),
      };
    if (p.kind === 'backcover')
      return {
        no: '',
        node: (
          <div style={css('position:absolute;inset:0')}>
            <div style={css('position:absolute;inset:0;background-color:var(--teal);background-image:repeating-linear-gradient(0deg,rgba(255,255,255,.04) 0 1px,transparent 1px 3px),repeating-linear-gradient(90deg,rgba(0,0,0,.05) 0 1px,transparent 1px 4px)')} />
            <div style={css('position:absolute;top:0;bottom:0;right:0;width:7%;background:linear-gradient(270deg,rgba(0,0,0,.24),rgba(0,0,0,.06))')} />
            <div style={css('position:absolute;top:0;bottom:0;left:11%;width:14px;background:var(--accent);box-shadow:inset -3px 0 0 rgba(0,0,0,.08),inset 2px 0 0 rgba(255,255,255,.35),-2px 0 6px rgba(0,0,0,.2)')} />
            <div style={css('position:absolute;left:26%;right:16%;bottom:12%;display:flex;flex-direction:column;gap:10px')}>
              <span style={css("font-family:Caveat,'Mitr',cursive;font-size:26px;line-height:1.1;color:var(--cream)")}>
                มาด้วยความคาดหวัง
                <br />
                กลับไปได้ตัวเอง
              </span>
              <div style={css('display:flex;align-items:center;gap:8px;margin-top:6px')}>
                <span style={css('width:26px;height:26px;border-radius:50%;background:var(--cream);color:var(--teal);display:flex;align-items:center;justify-content:center;font-family:Mitr,sans-serif;font-weight:600;font-size:15px;line-height:1')}>a</span>
                <span style={css('font-family:Mitr,sans-serif;font-weight:500;font-size:15px;color:var(--cream)')}>
                  allsoullearn<span style={{ color: 'var(--accent)' }}>.</span>
                </span>
              </div>
            </div>
          </div>
        ),
      };
    if (p.kind === 'end')
      return {
        no: 'หน้า ' + (i - 1),
        node: (
          <div style={css('position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:0 10%;text-align:center')}>
            <span className="eyebrow" style={{ color: 'var(--muted)' }}>ยังเขียนต่อได้อีก</span>
            <div style={css("font-family:'Archivo Black','Mitr',sans-serif;font-size:28px;line-height:.92;color:var(--teal)")}>
              TO BE
              <br />
              CONTINUED
            </div>
            <span style={css("font-family:Caveat,'Mitr',cursive;font-size:24px")}>see you tomorrow ✺</span>
            <button type="button" onPointerDown={this.stopPtr} onClick={() => this.goDate(today, true)} style={css('border:0;cursor:pointer;border-radius:999px;padding:10px 20px;background:var(--ink);color:#fff;font-family:inherit;font-size:13.5px;font-weight:600;display:inline-flex;align-items:center;gap:8px')}>
              {PEN}เขียนบันทึกวันนี้
            </button>
          </div>
        ),
      };
    if (p.kind === 'summary') {
      const s = p.s;
      const [y, m] = s.month.split('-').map(Number);
      return {
        no: 'หน้า ' + (i - 1),
        node: (
          <div style={css('position:absolute;inset:0;padding:30px 30px 40px;display:flex;flex-direction:column;gap:14px')}>
            <span className="eyebrow" style={{ color: 'var(--teal)' }}>MONTHLY REFLECTION</span>
            <div style={css("font-family:'Archivo Black','Mitr',sans-serif;font-size:34px;line-height:.9;letter-spacing:-.02em")}>
              {TH_MONTHS[m - 1]}
              <br />
              {y}
            </div>
            <span style={css("font-family:Caveat,'Mitr',cursive;font-size:24px;color:var(--teal)")}>มาไกลกว่าที่คิดนะ ✺</span>
            <div style={css('display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:6px')}>
              {[
                [String(s.workshops).padStart(2, '0'), 'workshop ที่เข้าร่วม'],
                [String(s.logged), 'วันที่บันทึกอารมณ์'],
                [String(s.pages), 'หน้าไดอารี่'],
                [s.top || '—', 'อารมณ์ที่พบบ่อย'],
              ].map(([v, l]) => (
                <div key={l} style={css('background:var(--cream);border-radius:12px;padding:12px')}>
                  <div style={css("font-family:'Archivo Black','Mitr',sans-serif;font-size:22px;line-height:1")}>{v}</div>
                  <div style={css('font-size:12px;color:var(--muted);margin-top:4px')}>{l}</div>
                </div>
              ))}
            </div>
          </div>
        ),
      };
    }
    if (p.kind === 'day' || p.kind === 'cont') {
      const d = dateOf(p.iso);
      const iso = p.iso;
      const e = p.e;
      const tray = this.state.tray;
      const open = !!(tray && tray.iso === iso);
      const evs = (this.props.events && this.props.events[iso]) || [];
      const cap = p.sub === 0 ? CAP_FIRST : CAP_REST;
      const len = (p.tx || '').length;
      const status = this.state.saved[iso] === false ? 'กำลังบันทึก…' : this.state.saved[iso] ? '✓ บันทึกแล้ว' : '';
      const F = open && tray?.fam ? FAM[tray.fam] : null;
      return {
        no: 'หน้า ' + (i - 1),
        node: (
          <div style={css('position:absolute;inset:0;padding:' + (portrait ? '24px 22px 36px' : '30px 30px 40px') + ';display:flex;flex-direction:column')}>
            {p.kind === 'day' ? (
              <div style={css('display:block;flex:none')}>
                <div style={css('display:flex;align-items:flex-end;gap:12px')}>
                  <span style={css("font-family:'Archivo Black','Mitr',sans-serif;font-size:40px;line-height:.86;letter-spacing:-.02em")}>{d.getDate()}</span>
                  <div style={css('display:flex;flex-direction:column;gap:5px;min-width:0')}>
                    <span style={css('font-family:Mitr,sans-serif;font-weight:500;font-size:15px;line-height:1')}>{TH_WEEKDAY[d.getDay()]}</span>
                    <span style={css('font-size:12.5px;line-height:1;color:var(--muted)')}>{TH_MONTHS[d.getMonth()] + ' ' + d.getFullYear()}</span>
                  </div>
                </div>
                <div style={css('height:1px;background:var(--cream-deep);margin:12px 0 10px')} />
                <div style={css('display:flex;gap:6px;flex-wrap:wrap;align-items:center;min-height:28px')}>
                  {e.moods.map((mo, j) => (
                    <span key={j} style={css(chipCss(mo, open ? '4px 6px 4px 11px' : '4px 11px'))}>
                      {mo.label}
                      {open && (
                        <button type="button" onPointerDown={this.stopPtr} onClick={() => this.rmMood(iso, j)} style={css('border:0;cursor:pointer;width:18px;height:18px;border-radius:50%;background:rgba(255,255,255,.5);color:inherit;font-size:12px;line-height:1;padding:0')}>
                          ×
                        </button>
                      )}
                    </span>
                  ))}
                  <button type="button" onPointerDown={this.stopPtr} onClick={() => this.toggleTray(iso)} style={css('border:0;cursor:pointer;border-radius:999px;padding:5px 12px;font-family:inherit;font-size:12.5px;font-weight:600;background:' + (open ? 'var(--ink)' : '#e6f4f2') + ';color:' + (open ? '#fff' : 'var(--teal-deep)'))}>
                    {open ? 'เสร็จ' : e.moods.length ? '+ อารมณ์' : '+ อารมณ์วันนี้'}
                  </button>
                </div>
                {open && (
                  <div style={css('display:block;flex:none;margin-top:10px;padding:12px;border-radius:14px;background:var(--cream)')}>
                    <div style={css('display:flex;flex-wrap:wrap;gap:6px')}>
                      {FAMILIES.map((f) => {
                        const sel = e.moods.some((mm) => mm.f === f.key);
                        const browsing = tray?.fam === f.key;
                        return (
                          <button key={f.key} type="button" onPointerDown={this.stopPtr} onClick={() => this.toggleFam(iso, f.key)} style={css('border:0;cursor:pointer;border-radius:999px;padding:6px 12px;font-family:inherit;font-size:12.5px;font-weight:600;transition:.2s;background:' + (sel ? f.c : '#fff') + ';color:' + (sel ? (f.ink ? 'var(--ink)' : '#fff') : 'var(--ink)') + ';box-shadow:' + (browsing ? 'inset 0 0 0 2px ' + f.c : 'none'))}>
                            {f.label}
                          </button>
                        );
                      })}
                    </div>
                    {F && (
                      <div style={css('display:block;margin-top:10px;padding-top:10px;border-top:1px dashed #cfe8e4')}>
                        <span style={css('font-size:11.5px;color:var(--muted)')}>{'ความรู้สึกย่อยของ “' + F.label + '” · ' + TONE_LABEL[F.tone] + ' (ไม่เลือกก็ได้)'}</span>
                        <div style={css('display:flex;flex-wrap:wrap;gap:6px;margin-top:7px')}>
                          {F.ring.map((n) => {
                            const on = e.moods.some((mm) => mm.f === F.key && mm.n === n);
                            return (
                              <button key={n} type="button" onPointerDown={this.stopPtr} onClick={() => this.toggleNu(iso, F.key, n)} style={css('border:0;cursor:pointer;border-radius:999px;padding:5px 11px;font-family:inherit;font-size:12px;transition:.2s;background:' + (on ? F.c : '#fff') + ';color:' + (on ? (F.ink ? 'var(--ink)' : '#fff') : 'var(--muted)') + ';font-weight:' + (on ? 600 : 400))}>
                                {n}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {!open &&
                  (e.ws ? (
                    <div style={css('display:flex;flex:none;gap:14px;margin-top:12px;padding:12px;border-radius:12px;background:rgba(246,241,230,.9)')}>
                      <div style={css('position:relative;width:23%;flex:none')}>
                        <div style={css('position:absolute;left:22%;top:-7px;width:56%;height:13px;background:rgba(245,194,67,.6);transform:rotate(-4deg);z-index:2')} />
                        {e.ws.poster ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={e.ws.poster} alt="" draggable={false} style={css('display:block;width:100%;aspect-ratio:1/1.414;object-fit:cover;border-radius:3px;transform:rotate(-2deg);box-shadow:0 8px 18px -10px rgba(13,30,29,.5)')} />
                        ) : (
                          <div style={css('width:100%;aspect-ratio:1/1.414;border-radius:3px;background:var(--cream-deep);transform:rotate(-2deg)')} />
                        )}
                      </div>
                      <div style={css('flex:1;min-width:0;display:flex;flex-direction:column;gap:7px')}>
                        <span className="eyebrow" style={{ color: 'var(--teal)' }}>WORKSHOP</span>
                        <span style={css('font-family:Mitr,sans-serif;font-weight:500;font-size:15px;line-height:1.3;max-height:2.6em;overflow:hidden')}>{e.ws.title}</span>
                        <span style={css("font-family:var(--font-mono),'IBM Plex Sans Thai',ui-monospace,monospace;font-size:10.5px;letter-spacing:.1em;color:var(--muted)")}>{e.ws.time}</span>
                        {e.ws.drive && (
                          <a href={e.ws.drive} target="_blank" rel="noopener noreferrer" onPointerDown={this.stopPtr} style={css('font-size:12.5px;font-weight:600;color:var(--teal)')}>
                            รูปกิจกรรม (Google Drive) ↗
                          </a>
                        )}
                      </div>
                    </div>
                  ) : evs.length ? null : (
                    <div style={css('display:flex;flex:none;align-items:center;gap:8px;margin-top:12px')}>
                      <span style={css('width:7px;height:7px;border-radius:50%;background:var(--cream-deep)')} />
                      <span style={css('font-size:12.5px;color:var(--muted)')}>ไม่มีกิจกรรมในวันนี้ · เขียนอิสระได้เลย</span>
                    </div>
                  ))}
                {/* The day's own events from the calendar: a short list, or one
                    line when a workshop card already takes the room. */}
                {!open && evs.length > 0 && (
                  e.ws ? (
                    <div style={css('display:flex;flex:none;align-items:center;gap:7px;margin-top:8px;min-width:0;font-size:12px;color:var(--muted)')}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', flex: 'none', background: evs[0].color }} />
                      <span style={css('overflow:hidden;text-overflow:ellipsis;white-space:nowrap')}>{'กิจกรรมของฉัน · ' + evs.map((x) => x.title).join(' · ')}</span>
                    </div>
                  ) : (
                    <div style={css('display:flex;flex:none;flex-direction:column;gap:6px;margin-top:12px;padding:10px 12px;border-radius:12px;background:rgba(246,241,230,.9)')}>
                      <span className="eyebrow" style={{ color: 'var(--teal)' }}>กิจกรรมของฉัน</span>
                      {evs.slice(0, 2).map((x, i) => (
                        <span key={i} style={css('display:flex;align-items:center;gap:8px;min-width:0;font-size:13px')}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', flex: 'none', background: x.color }} />
                          <span style={css("flex:none;font-family:var(--font-mono),ui-monospace,monospace;font-size:10.5px;color:var(--muted)")}>{x.time}</span>
                          <span style={css('font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap')}>{x.title}</span>
                        </span>
                      ))}
                      {evs.length > 2 && <span style={css('font-size:11.5px;color:var(--muted)')}>{'+ อีก ' + (evs.length - 2) + ' กิจกรรม'}</span>}
                    </div>
                  )
                )}
              </div>
            ) : (
              <div style={css('display:flex;flex:none;align-items:center;gap:10px;min-height:34px')}>
                <span style={css("font-family:'Archivo Black','Mitr',sans-serif;font-size:22px;line-height:1")}>{d.getDate()}</span>
                <span style={css('font-size:12.5px;color:var(--muted)')}>{d.getDate() + ' ' + TH_MON[d.getMonth()] + ' ' + d.getFullYear() + ' · หน้า ' + (p.sub + 1) + '/' + p.total}</span>
              </div>
            )}

            <div style={css('display:flex;flex:1;min-height:0;flex-direction:column;margin-top:' + (p.kind === 'day' ? '14px' : '10px'))}>
              <div style={css('display:flex;align-items:baseline;justify-content:space-between;gap:8px')}>
                <span style={css('font-family:Mitr,sans-serif;font-weight:500;font-size:13.5px;color:var(--muted)')}>บันทึกของฉัน</span>
                <span style={css('font-family:var(--font-mono),ui-monospace,monospace;font-size:10.5px;letter-spacing:.08em;color:' + (len >= cap * 0.9 ? '#c9503f' : 'var(--muted)'))}>{len + ' / ' + cap}</span>
              </div>
              <div style={css('flex:1;min-height:0;position:relative;margin-top:6px;overflow:hidden')}>
                <div style={css('position:absolute;inset:0;background:repeating-linear-gradient(180deg,transparent 0 29px,rgba(13,138,126,.18) 29px 30px);pointer-events:none')} />
                <textarea
                  className="db-ta"
                  data-k={p.key}
                  value={p.tx}
                  onChange={(ev) => this.writeText(iso, p.sub, ev.target.value)}
                  onPointerDown={this.stopMouse}
                  maxLength={cap}
                  placeholder={p.sub === 0 ? 'วันนี้เป็นยังไงบ้าง… แตะแล้วพิมพ์ได้เลย' : 'เขียนต่อ…'}
                  spellCheck={false}
                  style={css("position:absolute;inset:0;width:100%;height:100%;box-sizing:border-box;border:0;outline:none;resize:none;background:transparent;font-size:16px;line-height:30px;padding:5px 4px 0;color:var(--ink);font-family:'IBM Plex Sans Thai',system-ui,sans-serif;cursor:text")}
                />
              </div>
              <div style={css('display:flex;align-items:center;gap:8px;min-height:34px;margin-top:6px;flex-wrap:wrap')}>
                {p.sub === p.total - 1 && (
                  <button type="button" onPointerDown={this.stopPtr} onClick={() => this.addPage(iso)} style={css('border:0;cursor:pointer;border-radius:999px;padding:7px 14px;background:#e6f4f2;color:var(--teal-deep);font-family:inherit;font-size:12.5px;font-weight:600')}>
                    + เพิ่มหน้า
                  </button>
                )}
                {p.sub > 0 && !len && (
                  <button type="button" onPointerDown={this.stopPtr} onClick={() => this.removePage(iso, p.sub)} style={css('border:0;cursor:pointer;border-radius:999px;padding:7px 14px;background:rgba(13,30,29,.06);color:var(--muted);font-family:inherit;font-size:12.5px')}>
                    ลบหน้านี้
                  </button>
                )}
                {len >= cap && <span style={css('font-size:12px;color:#c9503f')}>เต็มหน้าแล้ว — เพิ่มหน้าเพื่อเขียนต่อ</span>}
                <div style={{ flex: 1 }} />
                <span style={css('font-size:11px;color:var(--muted)')}>{status}</span>
              </div>
            </div>
          </div>
        ),
      };
    }
    return { no: '', node: null };
  }

  background(): ReactNode {
    if (this._bg) return this._bg;
    const kids: ReactNode[] = [];
    kids.push(h('div', { key: 'dots', style: { position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(rgba(13,138,126,.16) 1.3px,transparent 1.5px)', backgroundSize: '22px 22px', animation: 'dbDots 14s linear infinite', maskImage: 'radial-gradient(ellipse at center,transparent 30%,#000 75%)', WebkitMaskImage: 'radial-gradient(ellipse at center,transparent 30%,#000 75%)' } }));
    [
      { l: '-6%', t: '8%', s: 320, c: '#e6f4f2', d: 18 },
      { l: '78%', t: '-6%', s: 280, c: 'rgba(245,194,67,.22)', d: 22 },
      { l: '84%', t: '62%', s: 340, c: 'var(--cream-deep)', d: 20 },
      { l: '-4%', t: '70%', s: 240, c: 'rgba(245,194,67,.16)', d: 24 },
    ].forEach((b, i) => kids.push(h('div', { key: 'b' + i, style: { position: 'absolute', left: b.l, top: b.t, width: b.s, height: b.s, background: b.c, animation: 'dbBlob ' + b.d + 's ease-in-out ' + -i * 3 + 's infinite' } })));
    kids.push(
      h(
        'svg',
        { key: 'path', viewBox: '0 0 1000 600', preserveAspectRatio: 'none', style: { position: 'absolute', inset: 0, width: '100%', height: '100%' } },
        h('path', { d: 'M-20 470 C 160 380, 260 560, 420 470 S 700 360, 820 450 S 980 520, 1030 420', fill: 'none', stroke: 'var(--teal)', strokeOpacity: 0.28, strokeWidth: 2, strokeDasharray: '2 12', strokeLinecap: 'round', vectorEffect: 'non-scaling-stroke', style: { animation: 'dbDash 6s linear infinite' } }),
        h('path', { d: 'M-20 120 C 140 60, 240 180, 380 110 S 640 40, 760 120 S 960 170, 1030 90', fill: 'none', stroke: 'var(--accent)', strokeOpacity: 0.55, strokeWidth: 2, strokeDasharray: '2 12', strokeLinecap: 'round', vectorEffect: 'non-scaling-stroke', style: { animation: 'dbDash 8s linear infinite reverse' } }),
      ),
    );
    [
      { g: '✺', l: '4%', t: '22%', z: 34, c: 'var(--accent)', d: 9, spin: 1 },
      { g: '✺', l: '92%', t: '30%', z: 26, c: 'var(--teal)', d: 11, spin: 1 },
      { g: '*', l: '9%', t: '58%', z: 40, c: 'var(--teal)', d: 8 },
      { g: '✺', l: '88%', t: '78%', z: 30, c: 'var(--accent)', d: 10, spin: 1 },
      { g: '✺', l: '6%', t: '86%', z: 24, c: '#d98fa2', d: 12, spin: 1 },
      { g: '*', l: '95%', t: '10%', z: 34, c: 'var(--accent)', d: 9 },
    ].forEach((s, i) =>
      kids.push(
        h('span', { key: 's' + i, style: { position: 'absolute', left: s.l, top: s.t, animation: 'dbFloat ' + s.d + 's ease-in-out ' + -i * 1.7 + 's infinite' } }, h('span', { style: { display: 'inline-block', fontFamily: s.g === '*' ? "Caveat,'Mitr',cursive" : 'inherit', fontSize: s.z, lineHeight: 1, color: s.c, opacity: 0.8, animation: s.spin ? 'dbSpin ' + s.d * 3 + 's linear infinite' : 'none' } }, s.g)),
      ),
    );
    ['#f5c243', '#0d8a7e', '#d98fa2', '#b9a6d4', '#7f95b8', '#e79a4f', '#0d8a7e', '#f5c243'].forEach((c, i) =>
      kids.push(h('span', { key: 'r' + i, style: { position: 'absolute', left: (i % 2 ? 90 + (i % 4) * 2.5 : 2 + (i % 4) * 2.5) + '%', bottom: 4 + ((i * 7) % 20) + '%', width: 8 + (i % 3) * 3, height: 8 + (i % 3) * 3, borderRadius: '50%', background: c, opacity: 0, animation: 'dbRise ' + (9 + (i % 4) * 2) + 's ease-in-out ' + -i * 1.6 + 's infinite' } })),
    );
    kids.push(h('span', { key: 'hw1', style: { position: 'absolute', left: '2.5%', top: '40%', fontFamily: "Caveat,'Mitr',cursive", fontSize: 26, color: 'var(--teal)', opacity: 0.55, transform: 'rotate(-8deg)', animation: 'dbFloat 13s ease-in-out infinite' } }, 'little moments ✺'));
    kids.push(h('span', { key: 'hw2', style: { position: 'absolute', right: '2.5%', top: '52%', fontFamily: "Caveat,'Mitr',cursive", fontSize: 26, color: 'var(--teal-deep)', opacity: 0.5, transform: 'rotate(6deg)', animation: 'dbFloat 15s ease-in-out -4s infinite' } }, 'write it down'));
    this._bg = h('div', { className: 'db-bg', 'aria-hidden': true, style: { position: 'absolute', inset: 0, zIndex: -1, overflow: 'hidden', pointerEvents: 'none' } }, kids);
    return this._bg;
  }

  render() {
    const st = this.state;
    const today = this.props.today;
    const { portrait, W, H, REF } = this.dims();
    const sc = W / REF;
    const B = this.build(st.ghost);
    const at = Math.min(st.at, B.lastIdx);

    const strip = (px: number, py: number, dx: number, dy: number, th: number, bg: string, op: number) =>
      'position:absolute;pointer-events:none;left:' + px.toFixed(1) + 'px;top:' + py.toFixed(1) + 'px;width:' + Math.round(3 * (W + H)) + 'px;height:' + th + 'px;transform:translate(-50%,-50%) rotate(' + ((Math.atan2(dy, dx) * 180) / Math.PI).toFixed(2) + 'deg);opacity:' + op.toFixed(3) + ';background:' + bg;
    const innerStyle = css('position:absolute;left:0;top:0;width:' + REF + 'px;height:' + (H / sc).toFixed(1) + 'px;transform:scale(' + sc.toFixed(4) + ');transform-origin:0 0');

    type Opt = { transform?: string; clip?: string | null; strip?: string | null; filter?: string };
    const mk = (i: number, side: 'l' | 'r' | 'p', x: number, z: number, o: Opt = {}) => {
      const pc = this.pageContent(i, B, portrait);
      const kind = i < 0 ? 'backcover' : (B.P[i] || { kind: 'blank' }).kind;
      const radius = side === 'l' ? '6px 0 0 6px' : '0 6px 6px 0';
      return (
        <div key={i + side + z} style={css('position:absolute;left:' + x + 'px;top:0;width:0;height:0;z-index:' + z + ';' + (o.filter ? 'filter:' + o.filter : ''))}>
          <div style={css('position:absolute;left:0;top:0;width:' + W + 'px;height:' + H + 'px;overflow:hidden;border-radius:' + radius + ';background-color:#fffdf7;background-image:radial-gradient(rgba(120,96,50,.07) .7px,transparent .8px);background-size:5px 5px;' + (o.transform ? 'transform-origin:0 0;transform:' + o.transform + ';' : '') + (o.clip ? 'clip-path:' + o.clip + ';' : ''))}>
            <div style={innerStyle}>
              {pc.node}
              {pc.no && <span style={css('position:absolute;bottom:13px;' + (side === 'l' ? 'left:30px' : 'right:30px') + ';font-size:11px;color:var(--muted);pointer-events:none')}>{pc.no}</span>}
            </div>
            {kind !== 'cover' && kind !== 'backcover' && <div style={css('position:absolute;inset:0;pointer-events:none;background:' + GUT[side])} />}
            {o.strip && <div style={css(o.strip)} />}
          </div>
        </div>
      );
    };

    const layers: ReactNode[] = [];
    const fl = st.flip;
    const uTh = 2 * Math.round(Math.min(46, W * 0.11));
    const fTh = 2 * Math.round(Math.min(80, W * 0.2));
    let offset = 0;
    const k = fl && fl.k != null ? fl.k : spreadOf(at);
    const flapParts = (g: NonNullable<ReturnType<typeof geom>>, lam: number, mode: 'b' | 'f'): Opt => {
      const nx = g.n.x, ny = g.n.y, kk = g.k;
      const r11 = 1 - 2 * nx * nx, r12 = -2 * nx * ny, r22 = 1 - 2 * ny * ny;
      const shadow = 'drop-shadow(0 0 ' + (12 * lam).toFixed(1) + 'px rgba(13,30,29,' + (0.3 * lam).toFixed(3) + '))';
      if (mode === 'b')
        return { transform: 'matrix(' + [-r11, r12, -r12, r22, -2 * kk * nx, 2 * kk * ny].map((v) => v.toFixed(5)).join(',') + ')', clip: polyCss(g.lifted), strip: strip(g.M.x, g.M.y, -ny, nx, fTh, FLAPBG, lam), filter: shadow };
      return {
        transform: 'matrix(' + [-r11, -r12, r12, r22, r11 * W + 2 * kk * nx, r12 * W + 2 * kk * ny].map((v) => v.toFixed(5)).join(',') + ')',
        clip: polyCss(g.lifted.map((q) => ({ x: W - q.x, y: q.y }))),
        strip: strip(W - g.M.x, g.M.y, ny, nx, fTh, FLAPBG, lam),
        filter: shadow,
      };
    };

    if (portrait) {
      offset = -W / 2;
      if (!fl) layers.push(mk(at, 'p', 0, 2));
      else {
        const g = geom(W, H, fl.P, fl.cy);
        const p = clamp01((W - fl.P.x) / (2 * W));
        const lam = g ? Math.min(1, 0.3 + Math.sin(Math.PI * p)) : 0;
        layers.push(mk(fl.under as number, 'p', 0, 2, { strip: g ? strip(g.M.x, g.M.y, -g.n.y, g.n.x, uTh, UNDERBG, lam) : null }));
        layers.push(mk(fl.front as number, 'p', 0, 3, { clip: g ? polyCss(g.front) : null }));
        if (g) layers.push(mk(-1, 'l', 0, 5, flapParts(g, lam, 'f')));
      }
    } else if (!fl) {
      if (k >= 1) layers.push(mk(2 * k - 1, 'l', -W, 2));
      if (B.P[2 * k]) layers.push(mk(2 * k, 'r', 0, 2));
      offset = k === 0 ? -W / 2 : k === B.K + 1 ? W / 2 : 0;
    } else {
      const g = geom(W, H, fl.P, fl.cy);
      const p = clamp01((W - fl.P.x) / (2 * W));
      const lam = g ? Math.min(1, 0.3 + Math.sin(Math.PI * p)) : 0;
      const t = fl.t as number;
      if ((fl.dir as number) > 0) {
        if (k >= 1) layers.push(mk(2 * k - 1, 'l', -W, 2));
        if (B.P[2 * t]) layers.push(mk(2 * t, 'r', 0, 2, { strip: g ? strip(g.M.x, g.M.y, -g.n.y, g.n.x, uTh, UNDERBG, lam) : null }));
        layers.push(mk(2 * k, 'r', 0, 3, { clip: g ? polyCss(g.front) : null }));
        if (g) layers.push(mk(2 * t - 1, 'l', 0, 5, flapParts(g, lam, 'f')));
        offset = k === 0 ? (-W / 2) * (1 - p) : t === B.K + 1 ? (W / 2) * p : 0;
      } else {
        if (B.P[2 * k]) layers.push(mk(2 * k, 'r', 0, 2));
        if (t >= 1) layers.push(mk(2 * t - 1, 'l', -W, 2, { strip: g ? strip(W - g.M.x, g.M.y, g.n.y, g.n.x, uTh, UNDERBG, lam) : null }));
        layers.push(mk(2 * k - 1, 'l', -W, 3, { clip: g ? polyCss(g.front.map((q) => ({ x: W - q.x, y: q.y }))) : null }));
        if (g) layers.push(mk(2 * t, 'r', 0, 5, flapParts(g, lam, 'b')));
        offset = t === 0 ? (-W / 2) * p : k === B.K + 1 ? (W / 2) * (1 - p) : 0;
      }
    }

    const tR = Math.max(0, portrait ? Math.min(4, Math.ceil((B.endIdx - at) / 3)) : Math.min(5, Math.ceil((B.K - k) / 1.5)));
    const tL = Math.min(5, Math.ceil(k / 1.5));
    const closing = !!fl && !portrait && (fl.dir as number) < 0 && fl.t === 0;
    const backClosed = !portrait && (k === B.K + 1 || (!!fl && (fl.dir as number) > 0 && fl.t === B.K + 1));
    const baseR = backClosed ? HIDE : css('position:absolute;left:0;top:0;width:' + W + 'px;height:' + H + 'px;border-radius:0 6px 6px 0;background:#efe7d6;z-index:1;box-shadow:' + stack(tR, 1));
    const baseL = portrait || k === 0 || closing ? HIDE : css('position:absolute;left:' + -W + 'px;top:0;width:' + W + 'px;height:' + H + 'px;border-radius:6px 0 0 6px;background:#efe7d6;z-index:1;box-shadow:' + stack(tL, -1));

    const visible = this.visibleIsos(B);
    const base = st.weekStart || weekStartOf(visible[0] || today);
    const emap: Record<string, Ent> = {};
    this.entries().forEach((e) => { emap[e.iso] = e; });
    const mkWeek = (ws: string) => {
      const days: ReactNode[] = [];
      for (let i = 0; i < 7; i++) {
        const iso = addDays(ws, i);
        const d = dateOf(iso);
        const e = emap[iso];
        const future = iso > today;
        const sel = visible.indexOf(iso) >= 0;
        const isToday = iso === today;
        const hasTx = !!e && (e.notes.some((x) => x.trim()) || e.moods.length > 0);
        days.push(
          <button key={iso} type="button" disabled={future} onClick={() => { if (!this._stripMoved) this.goDate(iso); }} style={css('display:flex;flex-direction:column;align-items:center;gap:4px;border:0;border-radius:12px;padding:7px 0 6px;min-width:0;font-family:inherit;transition:background .25s cubic-bezier(.2,.7,.2,1),color .25s;cursor:' + (future ? 'default' : 'pointer') + ';opacity:' + (future ? 0.35 : 1) + ';background:' + (sel ? 'var(--ink)' : 'rgba(13,30,29,.05)') + ';color:' + (sel ? '#fff' : isToday ? 'var(--teal)' : 'var(--ink)'))}>
            <span style={css('font-size:10.5px;line-height:1;color:' + (sel ? 'rgba(255,255,255,.7)' : 'var(--muted)'))}>{TH_DOW[d.getDay()]}</span>
            <span style={css("font-family:'Archivo Black','Mitr',sans-serif;font-size:15px;line-height:1")}>{d.getDate()}</span>
            <span style={css('width:6px;height:6px;border-radius:50%;background:' + (hasTx && e ? (e.moods.length ? dotBg(e.moods) : 'var(--teal)') : 'transparent'))} />
          </button>,
        );
      }
      return days;
    };
    const weeks3 = [addDays(base, -7), base, addDays(base, 7)];
    const canNext = addDays(base, 7) <= today;
    const txv = st.sAnim === 'prev' ? '0%' : st.sAnim === 'next' ? '-66.6667%' : 'calc(-33.3333% + ' + st.sdx.toFixed(0) + 'px)';
    let vmY: number, vmM: number;
    if (st.vm) {
      const parts = st.vm.split('-');
      vmY = +parts[0];
      vmM = +parts[1];
    } else {
      const md = dateOf(visible[0] || addDays(base, 3));
      vmY = md.getFullYear();
      vmM = md.getMonth();
    }
    const firstYear = Math.min(+today.slice(0, 4), ...this.props.entries.map((e) => +e.day.slice(0, 4)), ...Object.keys(this.props.workshops).map((d) => +d.slice(0, 4)));
    const years: number[] = [];
    for (let y = firstYear; y <= +today.slice(0, 4); y++) years.push(y);

    let posLabel: string;
    if (portrait) {
      const pp = B.P[at] || { kind: 'blank' };
      posLabel = at === 0 ? 'ปกหน้า' : pp.kind === 'inside' ? 'ปกใน' : pp.kind === 'end' ? 'หน้าสุดท้าย' : pp.kind === 'insideBack' ? 'ปกหลังด้านใน' : pp.kind === 'backcover' ? 'ปกหลัง' : 'หน้า ' + (at - 1);
    } else {
      const kk = spreadOf(at);
      if (kk === 0) posLabel = 'ปกหน้า';
      else if (kk === B.K + 1) posLabel = 'ปกหลัง';
      else {
        const nums = [2 * kk - 1, 2 * kk]
          .filter((i) => {
            const pp = B.P[i];
            return pp && ('iso' in pp || pp.kind === 'end' || pp.kind === 'summary');
          })
          .map((i) => i - 1);
        posLabel = nums.length === 2 ? 'หน้า ' + nums[0] + '–' + nums[1] : nums.length ? 'หน้า ' + nums[0] : 'ปกใน';
      }
    }
    const firstIdx = B.P[2] && 'iso' in B.P[2] ? 2 : 1;
    const atStart = portrait ? at === 0 : spreadOf(at) === 0;
    const atEnd = portrait ? at >= B.lastIdx : spreadOf(at) >= B.K + 1;
    const onFirst = portrait ? at === firstIdx : spreadOf(at) === spreadOf(firstIdx);
    const onLast = portrait ? at === B.endIdx : spreadOf(at) === spreadOf(B.endIdx);
    const bs = portrait ? 38 : 40;
    const navBtn = (dis: boolean) => css('width:' + bs + 'px;height:' + bs + 'px;border:0;border-radius:50%;cursor:' + (dis ? 'default' : 'pointer') + ';font-size:17px;line-height:1;background:rgba(13,30,29,.07);color:var(--ink);transition:opacity .2s;opacity:' + (dis ? 0.3 : 1));
    const pillBtn = (dis: boolean) => (portrait ? navBtn(dis) : css('height:40px;border:0;border-radius:999px;padding:0 16px;cursor:' + (dis ? 'default' : 'pointer') + ';font-family:inherit;font-size:13px;font-weight:600;background:rgba(13,30,29,.07);color:var(--ink);transition:opacity .2s;opacity:' + (dis ? 0.35 : 1)));
    const arrow = (dis: boolean) => (portrait ? HIDE : css('flex:none;width:34px;height:34px;border:0;border-radius:50%;cursor:' + (dis ? 'default' : 'pointer') + ';background:rgba(13,30,29,.07);color:var(--ink);font-size:15px;opacity:' + (dis ? 0.3 : 1)));
    const selStyle = css('appearance:none;-webkit-appearance:none;border:0;border-radius:999px;padding:' + (portrait ? '8px 26px 8px 13px' : '9px 30px 9px 15px') + ';background:rgba(13,30,29,.07);font-family:Mitr,sans-serif;font-weight:500;font-size:' + (portrait ? 14 : 14.5) + 'px;color:var(--ink);cursor:pointer');

    return (
      <div ref={this.rootRef} style={css("position:relative;isolation:isolate;width:100%;display:flex;flex-direction:column;align-items:center;gap:12px;font-family:'IBM Plex Sans Thai',system-ui,sans-serif;color:var(--ink)")}>
        {this.background()}

        <div style={css('width:100%;max-width:' + (portrait ? W : 2 * W) + 'px;display:flex;align-items:center;gap:' + (portrait ? 8 : 10) + 'px;flex-wrap:wrap')}>
          <div style={css('display:flex;align-items:center;gap:6px;flex:none')}>
            <span style={css('position:relative;display:inline-flex')}>
              <select aria-label="เดือน" value={String(vmM)} onChange={(e) => this.pickMonth(vmY, +e.target.value)} style={selStyle}>
                {TH_MONTHS.map((m, i) => (
                  <option key={m} value={i}>
                    {m}
                  </option>
                ))}
              </select>
              <span style={css('position:absolute;right:12px;top:50%;transform:translateY(-50%);pointer-events:none;font-size:9px;color:var(--muted)')}>▼</span>
            </span>
            <span style={css('position:relative;display:inline-flex')}>
              <select aria-label="ปี" value={String(vmY)} onChange={(e) => this.pickMonth(+e.target.value, vmM)} style={selStyle}>
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
              <span style={css('position:absolute;right:12px;top:50%;transform:translateY(-50%);pointer-events:none;font-size:9px;color:var(--muted)')}>▼</span>
            </span>
          </div>

          <div style={css(portrait ? 'display:flex;align-items:center;width:100%;order:3' : 'display:flex;align-items:center;gap:6px;flex:1;min-width:280px')}>
            <button type="button" aria-label="สัปดาห์ก่อน" onClick={() => this.shiftWeek(-1)} style={arrow(false)}>
              ‹
            </button>
            <div ref={this.stripRef} onPointerDown={this.onStripDown} style={css('flex:1;min-width:0;overflow:hidden;touch-action:pan-y;cursor:grab;user-select:none;-webkit-user-select:none')}>
              <div style={css('display:flex;width:300%;transform:translateX(' + txv + ');' + (st.sAnim ? 'transition:transform .3s cubic-bezier(.2,.7,.2,1)' : ''))}>
                {weeks3.map((ws) => (
                  <div key={ws} style={css('width:33.3333%;flex:none;box-sizing:border-box;padding:0 3px;display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:5px')}>
                    {mkWeek(ws)}
                  </div>
                ))}
              </div>
            </div>
            <button type="button" aria-label="สัปดาห์ถัดไป" onClick={() => this.shiftWeek(1)} style={arrow(!canNext)}>
              ›
            </button>
          </div>

          <button type="button" onClick={() => this.goDate(today, true)} style={css('flex:none;height:' + (portrait ? 36 : 38) + 'px;border:0;border-radius:999px;padding:0 16px;cursor:pointer;background:var(--ink);color:#fff;font-family:inherit;font-size:13px;font-weight:600;' + (portrait ? 'margin-left:auto' : ''))}>
            วันนี้
          </button>
        </div>

        <div ref={this.stageRef} onPointerDown={this.onDown} style={css('position:relative;width:100%;height:' + (H + TOPPAD + (portrait ? 14 : 22)) + 'px;touch-action:pan-y;user-select:none;-webkit-user-select:none;overflow:hidden;cursor:grab')}>
          <div style={css('position:absolute;inset:0;animation:dbIn .9s cubic-bezier(.2,.7,.2,1) both')}>
            <div style={css('position:absolute;left:50%;top:' + TOPPAD + 'px;width:0;height:0;transform:translateX(' + offset.toFixed(1) + 'px)')}>
              <div style={baseL} />
              <div style={baseR} />
              {layers}
            </div>
          </div>
          {st.toast && <div style={css('position:absolute;left:50%;top:' + (TOPPAD + 14) + 'px;transform:translateX(-50%);z-index:80;background:var(--ink);color:#fff;padding:9px 18px;border-radius:999px;font-size:13px;font-weight:600;box-shadow:0 14px 34px -12px rgba(13,30,29,.5);pointer-events:none;white-space:nowrap')}>{st.toast}</div>}
        </div>

        <div style={css('display:flex;align-items:center;justify-content:center;gap:8px')}>
          <button type="button" onClick={() => { if (!onFirst) this.jump(firstIdx); }} style={pillBtn(onFirst)}>
            {portrait ? '«' : '« หน้าแรก'}
          </button>
          <button type="button" aria-label="หน้าก่อน" onClick={() => this.step(-1)} style={navBtn(atStart)}>
            ‹
          </button>
          <span style={css("font-family:var(--font-mono),'IBM Plex Sans Thai',ui-monospace,monospace;font-size:11px;letter-spacing:.12em;color:var(--muted);min-width:86px;text-align:center")}>{posLabel}</span>
          <button type="button" aria-label="หน้าถัดไป" onClick={() => this.step(1)} style={navBtn(atEnd)}>
            ›
          </button>
          <button type="button" onClick={() => { if (!onLast) this.jump(B.endIdx); }} style={pillBtn(onLast)}>
            {portrait ? '»' : 'หน้าสุดท้าย »'}
          </button>
        </div>
      </div>
    );
  }
}
