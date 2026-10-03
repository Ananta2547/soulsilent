'use client';

/* The diary's other two tabs — "อารมณ์" (mood calendar + logging a day's
 * moods) and "สรุปเดือน" (a month in review) — from "Journey + Diary v2".
 * Both read the same entries the book does and write moods back through
 * the page, so a mood logged here shows on that day's page in the book. */

import { useMemo, useState } from 'react';
import { FAM, FAMILIES, MAX_MOODS, TH_MON, TH_MONTHS, TH_DOW, TH_WEEKDAY, blend, conic, css, dateOf, moodFullLabel, type DiaryEntry, type Mood, type MoodKey } from '@/lib/diary';

export type DayWorkshop = { day: string; title: string; time: string; poster: string | null };

const EN_MONTHS = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];
const pad = (n: number) => String(n).padStart(2, '0');
const monthKey = (y: number, m: number) => `${y}-${pad(m + 1)}`;

/** What one month adds up to — shared by both tabs and the book's summary page. */
export function monthStats(entries: DiaryEntry[], workshops: DayWorkshop[], ym: string) {
  const inMonth = entries.filter((e) => e.day.startsWith(ym));
  const counts: Record<MoodKey, number> = { suk: 0, love: 0, calm: 0, wow: 0, fear: 0, angry: 0, sad: 0 };
  let logged = 0;
  let multi = 0;
  const pairs: Record<string, number> = {};
  const wsDays = new Set(workshops.filter((w) => w.day.startsWith(ym)).map((w) => w.day));
  const wsPairs: Record<string, number> = {};
  inMonth.forEach((e) => {
    if (!e.moods.length) return;
    logged++;
    const fams = [...new Set(e.moods.map((x) => x.f))];
    fams.forEach((f) => counts[f]++);
    if (fams.length > 1) {
      multi++;
      for (let i = 0; i < fams.length; i++)
        for (let j = i + 1; j < fams.length; j++) {
          const key = [fams[i], fams[j]].sort().join('|');
          pairs[key] = (pairs[key] || 0) + 1;
          if (wsDays.has(e.day)) wsPairs[key] = (wsPairs[key] || 0) + 1;
        }
    }
  });
  const top = logged ? (Object.keys(counts) as MoodKey[]).sort((a, b) => counts[b] - counts[a])[0] : null;
  const topPair = Object.keys(pairs).sort((a, b) => pairs[b] - pairs[a])[0] || null;
  const wsPair = Object.keys(wsPairs).sort((a, b) => wsPairs[b] - wsPairs[a])[0] || null;
  const pages = inMonth.reduce((s, e) => s + e.notes.filter((t) => t.trim()).length, 0);
  return { inMonth, counts, logged, multi, top, topPair, topPairN: topPair ? pairs[topPair] : 0, wsPair, pages, workshops: workshops.filter((w) => w.day.startsWith(ym)) };
}

function PairChips({ pair, dark }: { pair: string; dark?: boolean }) {
  const [a, b] = pair.split('|') as MoodKey[];
  const chip = (k: MoodKey) => <span style={css('display:inline-block;padding:2px 10px;border-radius:999px;font-weight:600;background:' + FAM[k].c + ';color:' + (FAM[k].ink ? 'var(--ink)' : '#fff'))}>{FAM[k].label}</span>;
  return (
    <>
      {chip(a)}
      <span style={{ color: dark ? '#9ab1ae' : 'var(--muted)' }}>+</span>
      {chip(b)}
    </>
  );
}

/* ================= MOOD TAB ================= */

export function MoodTab({ entries, today, workshops, onSaveMoods }: { entries: DiaryEntry[]; today: string; workshops: DayWorkshop[]; onSaveMoods: (day: string, moods: Mood[]) => void }) {
  const [ym, setYm] = useState(today.slice(0, 7));
  const [sel, setSel] = useState(today);
  const [pickFam, setPickFam] = useState<MoodKey>('suk');
  const [toast, setToast] = useState('');
  const say = (t: string) => {
    setToast(t);
    setTimeout(() => setToast(''), 2000);
  };
  const byDay = useMemo(() => Object.fromEntries(entries.map((e) => [e.day, e])), [entries]);
  const [y, m] = ym.split('-').map(Number);
  const startDow = new Date(y, m - 1, 1).getDay();
  const dim = new Date(y, m, 0).getDate();
  const daysSoFar = ym === today.slice(0, 7) ? +today.slice(8, 10) : ym < today.slice(0, 7) ? dim : 0;
  const stats = monthStats(entries, workshops, ym);
  const selList = byDay[sel]?.moods || [];
  const step = (k: number) => {
    const d = new Date(y, m - 1 + k, 1);
    const next = monthKey(d.getFullYear(), d.getMonth());
    if (next > today.slice(0, 7)) return;
    setYm(next);
  };

  const setMoods = (list: Mood[]) => onSaveMoods(sel, list);
  const toggleFam = (k: MoodKey) => {
    if (selList.some((x) => x.f === k)) setMoods(selList.filter((x) => x.f !== k));
    else {
      if (selList.length >= MAX_MOODS) {
        setPickFam(k);
        say('บันทึกได้ไม่เกิน 3 อารมณ์ต่อวัน');
        return;
      }
      setMoods([...selList, { f: k, n: '' }]);
    }
    setPickFam(k);
  };
  const toggleNu = (k: MoodKey, n: string) => {
    const at = selList.findIndex((x) => x.f === k && x.n === n);
    if (at >= 0) {
      setMoods(selList.filter((_, i) => i !== at));
      return;
    }
    const out = selList.filter((x) => !(x.f === k && !x.n));
    if (out.length >= MAX_MOODS) {
      say('บันทึกได้ไม่เกิน 3 อารมณ์ต่อวัน');
      return;
    }
    setMoods([...out, { f: k, n }]);
  };

  const cells = [];
  for (let i = 0; i < startDow; i++) cells.push(<span key={'e' + i} />);
  for (let d = 1; d <= dim; d++) {
    const iso = `${ym}-${pad(d)}`;
    const list = byDay[iso]?.moods || [];
    const future = iso > today;
    const isSel = sel === iso;
    const isToday = iso === today;
    cells.push(
      <button
        key={iso}
        type="button"
        onClick={() => (future ? say('เลือกวันในอนาคตไม่ได้') : setSel(iso))}
        style={css('position:relative;aspect-ratio:1/.92;border:0;border-radius:14px;padding:0;cursor:' + (future ? 'not-allowed' : 'pointer') + ';font-family:inherit;display:flex;align-items:center;justify-content:center;background:' + (isSel ? 'var(--ink)' : future ? 'transparent' : 'var(--cream)') + ';opacity:' + (future ? 0.4 : 1) + ';transition:background .25s cubic-bezier(.2,.7,.2,1),transform .2s')}
      >
        <span style={css('position:absolute;top:6px;left:8px;font-family:var(--font-mono),ui-monospace,monospace;font-size:11px;line-height:1;color:' + (isSel ? '#fff' : isToday ? 'var(--teal)' : 'var(--muted)') + ';font-weight:' + (isToday ? 700 : 400))}>{d}</span>
        <span style={css('width:54%;aspect-ratio:1;margin-top:10%;border-radius:50%;transition:.3s;background:' + conic(list) + ';box-shadow:' + (list.length ? (isSel ? '0 0 0 3px var(--ink),0 0 0 4px rgba(255,255,255,.4)' : '0 0 0 3px var(--cream)') : 'inset 0 0 0 1.5px ' + (isSel ? 'rgba(255,255,255,.35)' : future ? 'transparent' : 'rgba(13,30,29,.12)')))} />
      </button>,
    );
  }

  const famChip = (k: MoodKey) => {
    const F = FAM[k];
    const picked = selList.filter((x) => x.f === k).length;
    const browsing = pickFam === k;
    const filled = picked > 0;
    return (
      <button key={k} type="button" onClick={() => toggleFam(k)} style={css('display:inline-flex;align-items:center;gap:8px;border:0;cursor:pointer;border-radius:999px;padding:9px 15px;font-family:inherit;font-size:13.5px;font-weight:600;transition:.2s cubic-bezier(.2,.7,.2,1);background:' + (filled ? F.c : browsing ? '#fff' : 'var(--cream)') + ';color:' + (filled ? (F.ink ? 'var(--ink)' : '#fff') : 'var(--ink)') + ';box-shadow:' + (browsing ? 'inset 0 0 0 2px ' + F.c + ',0 8px 20px -12px rgba(13,30,29,.45)' : 'none'))}>
        <span style={css('width:10px;height:10px;border-radius:50%;background:' + (filled ? 'rgba(255,255,255,.75)' : F.c))} />
        {F.label}
        {filled && <span style={css('display:inline-flex;align-items:center;justify-content:center;min-width:18px;height:18px;border-radius:999px;background:var(--ink);color:#fff;font-size:11px;font-weight:700')}>{picked}</span>}
      </button>
    );
  };
  const tone = (t: 'pos' | 'neu' | 'neg', label: string) => (
    <div style={css('display:grid;grid-template-columns:62px minmax(0,1fr);gap:12px;align-items:center')}>
      <span style={css('font-size:12.5px;font-weight:600;color:var(--muted)')}>{label}</span>
      <div style={css('display:flex;gap:8px;flex-wrap:wrap')}>{FAMILIES.filter((f) => f.tone === t).map((f) => famChip(f.key))}</div>
    </div>
  );
  const max = Math.max(1, ...Object.values(stats.counts));
  const selD = dateOf(sel);
  const wsPair = stats.wsPair ? (stats.wsPair.split('|') as MoodKey[]) : null;

  return (
    <div style={{ position: 'relative' }}>
      <div className="jd-grid-2" style={{ maxWidth: 1600, margin: '22px auto 0' }}>
        <div style={css('background:#fff;border-radius:22px;padding:26px 28px')}>
          <div style={css('display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap')}>
            <div style={css('display:flex;flex-direction:column;gap:4px')}>
              <span className="eyebrow" style={{ color: 'var(--teal)' }}>MOOD CALENDAR</span>
              <span style={css('display:flex;align-items:center;gap:8px;font-family:Mitr,sans-serif;font-weight:500;font-size:22px;line-height:1.1')}>
                <button type="button" aria-label="เดือนก่อน" onClick={() => step(-1)} style={css('width:30px;height:30px;border-radius:50%;border:0;background:var(--cream);cursor:pointer;font-size:15px')}>‹</button>
                {TH_MONTHS[m - 1]} {y}
                <button type="button" aria-label="เดือนถัดไป" onClick={() => step(1)} style={css('width:30px;height:30px;border-radius:50%;border:0;background:var(--cream);cursor:pointer;font-size:15px;opacity:' + (ym >= today.slice(0, 7) ? 0.3 : 1))}>›</button>
                <button
                  type="button"
                  onClick={() => {
                    setYm(today.slice(0, 7));
                    setSel(today);
                  }}
                  style={css('height:30px;padding:0 12px;border-radius:999px;border:0;background:var(--cream);cursor:pointer;font-family:inherit;font-size:12.5px;font-weight:600;color:var(--ink);white-space:nowrap')}
                >
                  วันนี้
                </button>
              </span>
            </div>
            <span style={css('font-size:12.5px;color:var(--muted)')}>บันทึกแล้ว {stats.logged} / {daysSoFar} วัน</span>
          </div>
          <div style={css('display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:6px;margin-top:18px')}>
            {TH_DOW.map((d) => (
              <span key={d} style={css('text-align:center;font-size:12px;font-weight:600;color:var(--muted);padding-bottom:4px')}>{d}</span>
            ))}
            {cells}
          </div>
          <div style={css('display:flex;gap:6px 14px;margin-top:18px;padding-top:16px;border-top:1px dashed #cfe8e4;flex-wrap:wrap')}>
            {FAMILIES.map((f) => (
              <span key={f.key} style={css('display:inline-flex;align-items:center;gap:6px;font-size:12.5px;color:var(--muted)')}>
                <span style={css('width:11px;height:11px;border-radius:3px;background:' + f.c)} />
                {f.label}
              </span>
            ))}
            <span style={css('font-size:12.5px;color:var(--muted);margin-left:auto')}>วงแบ่งสี = หลายอารมณ์ในวันเดียว</span>
          </div>
        </div>

        <div style={css('background:#fff;border-radius:22px;padding:26px 28px;display:flex;flex-direction:column;gap:18px')}>
          <div style={css('display:flex;align-items:flex-end;gap:14px')}>
            <span style={css("font-family:'Archivo Black','Mitr',sans-serif;font-size:52px;line-height:.82;letter-spacing:-.02em")}>{selD.getDate()}</span>
            <div style={css('display:flex;flex-direction:column;gap:5px')}>
              <span style={css('font-family:Mitr,sans-serif;font-weight:500;font-size:17px;line-height:1')}>{TH_WEEKDAY[selD.getDay()] + (sel === today ? ' · วันนี้' : '')}</span>
              <span style={css('font-size:13px;line-height:1;color:var(--muted)')}>
                {TH_MONTHS[selD.getMonth()]} {selD.getFullYear()}
              </span>
            </div>
            <div style={{ flex: 1 }} />
            <span style={css('font-family:var(--font-mono),ui-monospace,monospace;font-size:11px;letter-spacing:.12em;padding:6px 12px;border-radius:999px;background:' + (selList.length >= 3 ? 'var(--accent)' : 'var(--cream)') + ';color:var(--ink)')}>{selList.length} / 3</span>
          </div>
          <div style={css('display:flex;flex-direction:column;gap:4px')}>
            <span style={css('font-family:Mitr,sans-serif;font-weight:500;font-size:20px;line-height:1.2')}>วันนี้รู้สึกยังไงบ้าง?</span>
            <span style={css('font-size:13px;color:var(--muted)')}>เลือกได้สูงสุด 3 อารมณ์ · แตะกลุ่มก็บันทึกได้เลย · แตะซ้ำเพื่อยกเลิก</span>
          </div>
          <div style={css('display:flex;flex-direction:column;gap:12px')}>
            {tone('pos', 'ทางบวก')}
            <div style={css('height:1px;background:rgba(13,30,29,.06)')} />
            {tone('neu', 'กลาง')}
            <div style={css('height:1px;background:rgba(13,30,29,.06)')} />
            {tone('neg', 'ทางลบ')}
          </div>
          <div style={css('background:var(--cream);border-radius:16px;padding:14px 16px')}>
            <div style={css('display:flex;align-items:center;gap:10px;flex-wrap:wrap')}>
              <span style={css('height:3px;border-radius:999px;width:44px;background:' + FAM[pickFam].c)} />
              <span style={css('font-size:13px;font-weight:600;color:var(--ink)')}>ความรู้สึกย่อยใน “{FAM[pickFam].label}”</span>
              <span style={css('font-size:12px;color:var(--muted)')}>(ไม่เลือกก็ได้)</span>
            </div>
            <div style={css('display:flex;gap:7px;margin-top:11px;flex-wrap:wrap')}>
              {FAM[pickFam].ring.map((nu) => {
                const on = selList.some((x) => x.f === pickFam && x.n === nu);
                const F = FAM[pickFam];
                return (
                  <button key={nu} type="button" onClick={() => toggleNu(pickFam, nu)} style={css('border:0;cursor:pointer;border-radius:999px;padding:8px 14px;font-family:inherit;font-size:13px;font-weight:' + (on ? '600' : '400') + ';transition:.2s cubic-bezier(.2,.7,.2,1);background:' + (on ? F.c : '#fff') + ';color:' + (on ? (F.ink ? 'var(--ink)' : '#fff') : 'var(--muted)') + ';box-shadow:' + (on ? '0 8px 18px -12px rgba(13,30,29,.5)' : 'inset 0 0 0 1px var(--cream-deep)'))}>
                    {nu}
                  </button>
                );
              })}
            </div>
          </div>
          <div style={css('display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-height:32px')}>
            <span style={css('font-size:13px;font-weight:600;color:var(--muted)')}>บันทึกแล้ว</span>
            {selList.map((mi, i) => (
              <span key={i} style={css('display:inline-flex;align-items:center;gap:6px;background:' + FAM[mi.f].c + ';color:' + (FAM[mi.f].ink ? 'var(--ink)' : '#fff') + ';border-radius:999px;padding:5px 8px 5px 12px;font-size:12.5px;font-weight:600')}>
                {moodFullLabel(mi)}
                <button type="button" aria-label="เอาออก" onClick={() => setMoods(selList.filter((_, j) => j !== i))} style={css('border:0;background:rgba(255,255,255,.35);color:inherit;width:18px;height:18px;border-radius:50%;cursor:pointer;font-size:11px;line-height:1')}>
                  ×
                </button>
              </span>
            ))}
            {!selList.length && <span style={css("font-family:Caveat,'Mitr',cursive;font-size:21px;color:var(--muted)")}>ยังไม่ได้เลือกอารมณ์ ✺</span>}
          </div>
        </div>

        <div className="jd-grid-13" style={{ gridColumn: '1 / -1' }}>
          <div className="jd-dark-split" style={css('background:var(--ink);color:#fff;border-radius:22px;padding:26px 30px')}>
            <div style={css('display:flex;flex-direction:column;gap:10px')}>
              <span className="eyebrow" style={{ color: 'var(--accent)' }}>THIS MONTH</span>
              <span style={css('font-size:13px;color:#9ab1ae')}>อารมณ์ที่บันทึกบ่อยที่สุด</span>
              <span style={css('font-family:Mitr,sans-serif;font-weight:500;font-size:44px;line-height:1')}>{stats.top ? FAM[stats.top].label : '—'}</span>
              <span style={css('font-size:13px;line-height:1.55;color:#cfdcda')}>
                จาก {stats.logged} วันที่บันทึก · {stats.multi} วันมีหลายอารมณ์พร้อมกัน
              </span>
            </div>
            <div style={css('display:flex;flex-direction:column;gap:9px')}>
              {FAMILIES.map((f) => (
                <div key={f.key} style={css('display:grid;grid-template-columns:48px minmax(0,1fr) 22px;gap:12px;align-items:center')}>
                  <span style={css('font-size:13px;color:#cfdcda')}>{f.label}</span>
                  <span style={css('height:10px;border-radius:999px;background:rgba(255,255,255,.08);overflow:hidden;display:block')}>
                    <span style={css('display:block;height:100%;border-radius:999px;background:' + f.c + ';width:' + Math.max(4, Math.round((stats.counts[f.key] / max) * 100)) + '%;transition:width .6s cubic-bezier(.2,.7,.2,1)')} />
                  </span>
                  <span style={css('font-family:var(--font-mono),ui-monospace,monospace;font-size:12px;color:#9ab1ae;text-align:right')}>{stats.counts[f.key]}</span>
                </div>
              ))}
            </div>
          </div>
          <div style={css('background:#fff;border-radius:22px;padding:26px 28px;display:flex;flex-direction:column;gap:12px')}>
            <span className="eyebrow" style={{ color: 'var(--muted)' }}>OFTEN TOGETHER</span>
            {stats.topPair ? (
              <div style={css('display:flex;align-items:center;gap:9px;font-size:14px;flex-wrap:wrap')}>
                <PairChips pair={stats.topPair} />
                <span style={css('font-size:13px;color:var(--muted)')}>มาคู่กัน {stats.topPairN} วัน</span>
              </div>
            ) : (
              <span style={css('font-size:14px;color:var(--muted)')}>ยังไม่มีวันที่บันทึกหลายอารมณ์พร้อมกัน</span>
            )}
            <p style={css('margin:0;font-size:14.5px;line-height:1.65')}>
              {wsPair ? (
                <>
                  วันที่คุณเข้าร่วมกิจกรรมมักมี <span className="mark">{FAM[wsPair[0]].label}</span> ปนกับ <span className="mark">{FAM[wsPair[1]].label}</span> — หลายความรู้สึกมาพร้อมกันได้
                </>
              ) : (
                'บันทึกอารมณ์ในวันที่มีกิจกรรมไว้ แล้วจะเห็นว่าวันแบบนั้นมักพาความรู้สึกแบบไหนมาด้วย'
              )}
            </p>
            <span style={css("font-family:Caveat,'Mitr',cursive;font-size:22px;color:var(--teal)")}>— บันทึกไว้ให้ตัวเองในอนาคต</span>
          </div>
        </div>
      </div>
      {toast && <div style={css('position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:200;background:var(--ink);color:#fff;padding:13px 22px;border-radius:999px;font-size:13.5px;font-weight:600;box-shadow:0 16px 40px -12px rgba(13,30,29,.5)')}>{toast}</div>}
    </div>
  );
}

/* ================= SUMMARY TAB ================= */

export function SummaryTab({
  entries,
  today,
  workshops,
  savedMonths,
  onKeepMonth,
  onOpenBook,
}: {
  entries: DiaryEntry[];
  today: string;
  workshops: DayWorkshop[];
  savedMonths: string[];
  onKeepMonth: (month: string, keep: boolean) => void;
  onOpenBook: (day?: string) => void;
}) {
  const [ym, setYm] = useState(today.slice(0, 7));
  const [y, m] = ym.split('-').map(Number);
  const s = monthStats(entries, workshops, ym);
  const kept = savedMonths.includes(ym);
  const step = (k: number) => {
    const d = new Date(y, m - 1 + k, 1);
    const next = monthKey(d.getFullYear(), d.getMonth());
    if (next > today.slice(0, 7)) return;
    setYm(next);
  };
  const byDay = Object.fromEntries(entries.map((e) => [e.day, e]));
  const startDow = new Date(y, m - 1, 1).getDay();
  const dim = new Date(y, m, 0).getDate();
  const mini = [];
  for (let i = 0; i < startDow; i++) mini.push(<span key={'e' + i} style={css('display:block;aspect-ratio:1;border-radius:3px')} />);
  for (let d = 1; d <= dim; d++) {
    const iso = `${ym}-${pad(d)}`;
    const future = iso > today;
    mini.push(<span key={iso} style={css('display:block;aspect-ratio:1;border-radius:3px;background:' + (future ? 'var(--cream)' : blend(byDay[iso]?.moods || [])) + ';opacity:' + (future ? 0.5 : 1))} />);
  }
  const tn = { pos: 0, neu: 0, neg: 0 };
  FAMILIES.forEach((f) => (tn[f.tone] += s.counts[f.key]));
  const tot = tn.pos + tn.neu + tn.neg || 1;
  const tones: [keyof typeof tn, string, string][] = [
    ['pos', 'บวก', '#f5c243'],
    ['neu', 'กลาง', '#b9a6d4'],
    ['neg', 'ลบ', '#7f95b8'],
  ];

  // The line of the month: the first line of the longest note, preferring a
  // day with a workshop.
  const wsDays = new Set(s.workshops.map((w) => w.day));
  const written = s.inMonth.filter((e) => e.notes.some((t) => t.trim()));
  const pick = [...written].sort((a, b) => Number(wsDays.has(b.day)) - Number(wsDays.has(a.day)) || b.notes.join('').length - a.notes.join('').length)[0];
  const line = pick
    ? pick.notes
        .join('\n')
        .split('\n')
        .map((t) => t.trim())
        .filter(Boolean)[0]
    : null;
  const highlights = [...written].sort((a, b) => Number(wsDays.has(b.day)) - Number(wsDays.has(a.day)) || b.day.localeCompare(a.day)).slice(0, 3);

  // The year: each month coloured by its most frequent mood.
  const yearEntries = entries.filter((e) => e.day.startsWith(String(y)));
  const monthTop = (mi: number) => monthStats(entries, workshops, monthKey(y, mi)).top;
  const yearWs = workshops.filter((w) => w.day.startsWith(String(y))).length;
  const yearLogged = yearEntries.filter((e) => e.moods.length).length;

  return (
    <div style={css('max-width:1600px;margin:22px auto 0;display:flex;flex-direction:column;gap:22px')}>
      <div style={css('position:relative;overflow:hidden;background:var(--teal);color:#fff;border-radius:22px;padding:34px 38px;display:flex;align-items:flex-end;justify-content:space-between;gap:28px;flex-wrap:wrap')}>
        <span style={css("position:absolute;right:-30px;top:-60px;font-family:'Archivo Black','Mitr',sans-serif;font-size:260px;line-height:1;color:rgba(255,255,255,.06);pointer-events:none")}>{pad(m)}</span>
        <div style={css('position:relative;display:flex;flex-direction:column;gap:10px')}>
          <span style={css('display:flex;align-items:center;gap:10px')}>
            <span className="eyebrow" style={{ color: 'var(--accent)' }}>MONTHLY REFLECTION</span>
            <button type="button" aria-label="เดือนก่อน" onClick={() => step(-1)} style={css('width:28px;height:28px;border-radius:50%;border:0;background:rgba(255,255,255,.14);color:#fff;cursor:pointer')}>‹</button>
            <button type="button" aria-label="เดือนถัดไป" onClick={() => step(1)} style={css('width:28px;height:28px;border-radius:50%;border:0;background:rgba(255,255,255,.14);color:#fff;cursor:pointer;opacity:' + (ym >= today.slice(0, 7) ? 0.3 : 1))}>›</button>
          </span>
          <span style={css("font-family:'Archivo Black','Mitr',sans-serif;font-size:clamp(40px,7vw,64px);line-height:.88;letter-spacing:-.02em")}>
            {EN_MONTHS[m - 1]}
            <br />
            {y}
          </span>
          <span style={css("font-family:Caveat,'Mitr',cursive;font-size:26px;color:var(--cream)")}>มาไกลกว่าที่คิดนะ ✺</span>
        </div>
        <div style={css('position:relative;display:flex;flex-wrap:wrap;row-gap:16px')}>
          {[
            [pad(s.workshops.length), 'กิจกรรมที่เข้าร่วม'],
            [String(s.logged), 'วันที่บันทึกอารมณ์'],
            [String(s.pages), 'หน้าไดอารี่'],
            [String(s.multi), 'วันที่มีหลายอารมณ์'],
          ].map(([v, l]) => (
            <div key={l} style={css('display:flex;flex-direction:column;gap:6px;padding:0 22px;border-left:1px solid rgba(255,255,255,.18)')}>
              <span style={css("font-family:'Archivo Black','Mitr',sans-serif;font-size:40px;line-height:1")}>{v}</span>
              <span style={css('font-size:13px;color:rgba(255,255,255,.78)')}>{l}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="jd-grid-3">
        <div style={css('background:#fff;border-radius:22px;padding:24px 26px;display:flex;flex-direction:column;gap:14px')}>
          <span className="eyebrow" style={{ color: 'var(--teal)' }}>MOOD OF THE MONTH</span>
          <div style={css('display:flex;align-items:baseline;gap:10px')}>
            <span style={css('font-family:Mitr,sans-serif;font-weight:500;font-size:34px;line-height:1')}>{s.top ? FAM[s.top].label : '—'}</span>
            <span style={css('font-size:13px;color:var(--muted)')}>อารมณ์ที่พบบ่อยที่สุด</span>
          </div>
          <div style={css('display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:4px')}>{mini}</div>
          <div style={css('display:flex;flex-direction:column;gap:8px;margin-top:auto')}>
            <div style={css('display:flex;height:10px;border-radius:999px;overflow:hidden;gap:2px')}>
              {tones.map(([k, , c]) => (
                <span key={k} style={css('display:block;height:100%;flex:' + Math.max(1, tn[k]) + ';background:' + c)} />
              ))}
            </div>
            <div style={css('display:flex;justify-content:space-between;gap:8px')}>
              {tones.map(([k, l, c]) => (
                <span key={k} style={css('font-size:12.5px;color:var(--muted)')}>
                  <span style={css('display:inline-block;width:8px;height:8px;border-radius:50%;background:' + c)} /> {l} {Math.round((tn[k] / tot) * 100)}%
                </span>
              ))}
            </div>
          </div>
        </div>

        <div style={css('border-radius:22px;padding:24px 26px;display:flex;flex-direction:column;gap:16px;background:#fff')}>
          <span className="eyebrow" style={{ color: 'var(--teal-deep)' }}>JOURNEYS</span>
          {s.workshops.length ? (
            <div style={css('display:grid;grid-template-columns:1fr 1fr;gap:16px')}>
              {s.workshops.slice(0, 4).map((w, i) => (
                <div key={w.day + i} style={css('display:flex;flex-direction:column;gap:9px')}>
                  <div style={css('transform:rotate(' + (i % 2 ? 2 : -2) + 'deg);border-radius:6px;overflow:hidden;box-shadow:0 14px 26px -16px rgba(13,30,29,.55);aspect-ratio:297/420;background:var(--cream)')}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {w.poster && <img src={w.poster} alt="" style={css('width:100%;height:100%;object-fit:cover;display:block')} />}
                  </div>
                  <span style={css('font-family:Mitr,sans-serif;font-weight:500;font-size:14px;line-height:1.3')}>{w.title}</span>
                  <span style={css('font-size:12px;color:var(--muted)')}>
                    {+w.day.slice(8, 10)} {TH_MON[+w.day.slice(5, 7) - 1]} · {w.time}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <span style={css('font-size:14px;color:var(--muted)')}>เดือนนี้ยังไม่ได้เข้าร่วมกิจกรรม</span>
          )}
        </div>

        <div style={css('position:relative;overflow:hidden;background:var(--ink);color:#fff;border-radius:22px;padding:24px 26px;display:flex;flex-direction:column;gap:14px')}>
          <span className="eyebrow" style={{ color: 'var(--accent)' }}>LINE OF THE MONTH</span>
          <span style={css("font-family:Caveat,'Mitr',cursive;font-size:62px;line-height:.6;color:var(--accent);height:26px")}>“</span>
          <p style={css('margin:0;font-family:Mitr,sans-serif;font-weight:500;font-size:24px;line-height:1.35;text-wrap:pretty')}>{line || 'ยังไม่มีบันทึกในเดือนนี้'}</p>
          {pick && (
            <span style={css('font-size:13px;color:#9ab1ae')}>
              จากบันทึกวันที่ {+pick.day.slice(8, 10)} {TH_MON[+pick.day.slice(5, 7) - 1]} {pick.day.slice(0, 4)}
            </span>
          )}
          {s.topPair && (
            <div style={css('display:flex;align-items:center;gap:9px;margin-top:auto;padding-top:14px;border-top:1px solid rgba(255,255,255,.1);flex-wrap:wrap')}>
              <span style={css('font-size:13px;color:#cfdcda')}>มักมาคู่กัน</span>
              <PairChips pair={s.topPair} dark />
              <span style={css('font-size:13px;color:#9ab1ae')}>{s.topPairN} วัน</span>
            </div>
          )}
        </div>
      </div>

      <div className="jd-grid-125">
        <div style={css('background:#fff;border-radius:22px;padding:24px 28px 10px')}>
          <div style={css('display:flex;align-items:center;justify-content:space-between;gap:12px;padding-bottom:12px')}>
            <span className="eyebrow" style={{ color: 'var(--teal)' }}>HIGHLIGHTS</span>
            <button type="button" onClick={() => onOpenBook()} style={css('border:0;background:transparent;cursor:pointer;font-family:inherit;font-size:13px;font-weight:600;color:var(--teal)')}>
              เปิดสมุด →
            </button>
          </div>
          {!highlights.length && <div style={css('padding:16px 0 20px;border-top:1px dashed #cfe8e4;font-size:14px;color:var(--muted)')}>ยังไม่มีบันทึกในเดือนนี้</div>}
          {highlights.map((e) => (
            <button key={e.day} type="button" onClick={() => onOpenBook(e.day)} style={css('display:grid;grid-template-columns:64px minmax(0,1fr);gap:16px;padding:16px 0;border:0;border-top:1px dashed #cfe8e4;background:transparent;width:100%;text-align:left;cursor:pointer;font-family:inherit;color:inherit')}>
              <div style={css('display:flex;flex-direction:column;gap:3px')}>
                <span style={css("font-family:'Archivo Black','Mitr',sans-serif;font-size:28px;line-height:.9")}>{+e.day.slice(8, 10)}</span>
                <span style={css('font-size:12px;color:var(--muted)')}>
                  {TH_MON[+e.day.slice(5, 7) - 1]} {e.day.slice(0, 4)}
                </span>
              </div>
              <div style={css('display:flex;flex-direction:column;gap:7px;min-width:0')}>
                {e.moods[0] && <span style={css('align-self:flex-start;display:inline-flex;border-radius:999px;padding:3px 10px;font-size:12px;font-weight:600;background:' + FAM[e.moods[0].f].c + ';color:' + (FAM[e.moods[0].f].ink ? 'var(--ink)' : '#fff'))}>{moodFullLabel(e.moods[0])}</span>}
                <span style={css('font-size:14.5px;line-height:1.6;text-wrap:pretty;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;white-space:pre-line')}>{e.notes.join('\n').trim()}</span>
              </div>
            </button>
          ))}
        </div>

        <div style={css('display:flex;flex-direction:column;gap:22px')}>
          <div style={css('background:#fff;border-radius:22px;padding:24px 26px;display:flex;flex-direction:column;gap:16px')}>
            <div style={css('display:flex;align-items:baseline;justify-content:space-between;gap:12px;flex-wrap:wrap')}>
              <span className="eyebrow" style={{ color: 'var(--teal)' }}>YEAR {y}</span>
              <span style={css('font-size:13px;color:var(--muted)')}>
                {yearWs} กิจกรรม · {yearLogged} วันที่บันทึก
              </span>
            </div>
            <div style={css('display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:12px 8px')}>
              {TH_MON.map((label, mi) => {
                const key = monthKey(y, mi);
                const past = key <= today.slice(0, 7);
                const cur = key === ym;
                const top = past ? monthTop(mi) : null;
                return (
                  <button key={label} type="button" disabled={!past} onClick={() => setYm(key)} style={css('display:flex;flex-direction:column;align-items:center;gap:6px;border:0;background:transparent;cursor:' + (past ? 'pointer' : 'default') + ';padding:0;font-family:inherit')}>
                    <span style={css('width:100%;max-width:40px;aspect-ratio:1;border-radius:50%;background:' + (top ? FAM[top].c : 'transparent') + ';box-shadow:' + (cur ? '0 0 0 3px #fff,0 0 0 5px var(--ink)' : top ? 'none' : 'inset 0 0 0 1.5px rgba(13,30,29,.12)'))} />
                    <span style={css('font-size:12px;font-weight:' + (cur ? 700 : 400) + ';color:' + (cur ? 'var(--ink)' : 'var(--muted)'))}>{label}</span>
                  </button>
                );
              })}
            </div>
            <span style={css('font-size:12.5px;color:var(--muted)')}>สีของแต่ละเดือน = อารมณ์ที่พบบ่อยที่สุด · แตะเดือนเพื่อดูสรุป</span>
          </div>
          <div style={css('background:var(--accent);border-radius:22px;padding:22px 26px;display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap')}>
            <div style={css('display:flex;flex-direction:column;gap:4px')}>
              <span style={css('font-family:Mitr,sans-serif;font-weight:500;font-size:17px;color:var(--ink)')}>{kept ? 'เก็บสรุปเดือนนี้ไว้ในสมุดแล้ว' : 'เก็บสรุปเดือนนี้ไว้ในสมุด'}</span>
              <span style={css('font-size:13px;color:var(--ink)')}>{(kept ? 'อยู่เป็นหน้าสรุปท้ายเดือน' : 'จะแทรกเป็นหน้าสรุปท้ายเดือน') + TH_MONTHS[m - 1]}</span>
            </div>
            <button type="button" className="btn btn-ink btn-sm" onClick={() => onKeepMonth(ym, !kept)}>
              {kept ? 'นำออกจากสมุด' : 'บันทึกลงสมุด'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
