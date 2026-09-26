'use client';

/* My Journey + Diary — design "AllSoulLearn Journey + Diary v2" (the site's
 * own navbar stays; the design's top bar is not brought over).
 *
 * MY JOURNEY: a life map of every attended workshop (a dashed rail on
 * phones). DIARY: a paper book to write in every day, a mood calendar, and a
 * month in review. A workshop's "memory of the day" is that day's diary page,
 * so both halves read and write the same entries (/api/me/diary). */

import './journey.css';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLang, tr } from '@/lib/i18n';
import { Btn } from '@/components/design/RippleButton';
import { useLoadingTracker } from '@/components/design/DataLoading';
import type { JourneyItem } from '@/lib/journey';
import { cleanNotes, css, todayIso, FAM, type DiaryEntry, type Mood } from '@/lib/diary';
import { DiaryBook, type BookWorkshop, type MonthSummary } from '@/components/diary/DiaryBook';
import { MoodTab, SummaryTab, monthStats, type DayWorkshop } from '@/components/diary/DiaryTabs';
import { JourneyMap, JourneyRail, StopFull, StopModal, itemHours } from '@/components/journey/JourneyV2';

type View = 'journey' | 'diary';
type DiaryTab = 'book' | 'mood' | 'sum';

export default function MyJourneyPage() {
  const { lang } = useLang();
  const track = useLoadingTracker();
  const [items, setItems] = useState<JourneyItem[]>([]);
  const [entries, setEntries] = useState<DiaryEntry[]>([]);
  const [months, setMonths] = useState<string[]>([]);
  const [owner, setOwner] = useState('');
  const [loading, setLoading] = useState(true);
  const [unauthorized, setUnauthorized] = useState(false);
  // ?view=diary opens the diary straight away.
  const [view, setView] = useState<View>(() => (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('view') === 'diary' ? 'diary' : 'journey'));
  const [tab, setTab] = useState<DiaryTab>('book');
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const [full, setFull] = useState(false);
  const [writeNonce, setWriteNonce] = useState(0);
  const [jump, setJump] = useState<{ day: string | null; n: number }>({ day: null, n: 0 });
  const [phone, setPhone] = useState(false);
  const today = todayIso();

  useEffect(() => {
    const onPop = () => {
      setView(new URLSearchParams(window.location.search).get('view') === 'diary' ? 'diary' : 'journey');
      setFull(false);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 760px)');
    const on = () => setPhone(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  useEffect(() => {
    track(
      Promise.all([
        fetch('/api/me/journey').then((r) => {
          if (r.status === 401) {
            setUnauthorized(true);
            return null;
          }
          return r.json() as Promise<{ items: JourneyItem[] }>;
        }),
        fetch('/api/me/diary').then((r) => (r.ok ? (r.json() as Promise<{ entries: DiaryEntry[]; months: string[] }>) : null)),
        fetch('/api/auth/me').then((r) => r.json() as Promise<{ user?: { name?: string | null } | null }>),
      ])
        .then(([j, d, me]) => {
          if (j) setItems(j.items || []);
          if (d) {
            setEntries(d.entries || []);
            setMonths(d.months || []);
          }
          setOwner(me?.user?.name || '');
        })
        .catch(() => {})
        .finally(() => setLoading(false)),
    );
  }, [track]);

  /** Writes one day and keeps the page's copy in step. */
  const saveDay = useCallback(async (day: string, patch: { notes?: string[]; moods?: Mood[] }) => {
    setEntries((list) => {
      const cur = list.find((e) => e.day === day) || { day, moods: [], notes: [''] };
      const next = { ...cur, ...patch };
      const rest = list.filter((e) => e.day !== day);
      const has = next.moods.length > 0 || next.notes.some((t) => t.trim());
      return (has ? [...rest, next] : rest).sort((a, b) => a.day.localeCompare(b.day));
    });
    await fetch('/api/me/diary', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ day, ...patch }) }).catch(() => {});
  }, []);

  const keepMonth = useCallback(async (month: string, keep: boolean) => {
    setMonths((m) => (keep ? [...new Set([...m, month])] : m.filter((x) => x !== month)));
    await fetch('/api/me/diary', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ month, keep }) }).catch(() => {});
  }, []);

  const dayWorkshops: DayWorkshop[] = useMemo(() => items.map((it) => ({ day: it.date, title: it.title, time: `${it.time_start}–${it.time_end}`, poster: it.image_url })), [items]);
  const bookWorkshops = useMemo(() => {
    const m: Record<string, BookWorkshop> = {};
    items.forEach((it) => {
      if (!m[it.date]) m[it.date] = { title: it.title, time: `${it.time_start}–${it.time_end}`, poster: it.image_url, drive: it.photos_drive_url };
    });
    return m;
  }, [items]);
  const summaries: MonthSummary[] = useMemo(
    () =>
      months.map((month) => {
        const s = monthStats(entries, dayWorkshops, month);
        return { month, top: s.top ? FAM[s.top].label : '', logged: s.logged, workshops: s.workshops.length, pages: s.pages };
      }),
    [months, entries, dayWorkshops],
  );

  const stats = useMemo(() => {
    const hours = Math.round(items.reduce((s, it) => s + itemHours(it), 0));
    const pages = entries.filter((e) => e.notes.some((t) => t.trim())).length;
    return { hours, pages };
  }, [items, entries]);

  const openDiaryAt = (day?: string) => {
    setOpenIdx(null);
    setFull(false);
    setView('diary');
    setTab('book');
    // The diary has no switch back; it gets its own history entry so the
    // browser's back button returns to the map.
    if (view !== 'diary') window.history.pushState(null, '', '?view=diary');
    if (day) setJump((j) => ({ day, n: j.n + 1 }));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (loading) return null;
  if (unauthorized) {
    return (
      <section className="section" style={{ padding: '80px 0', textAlign: 'center' }}>
        <p style={{ color: 'var(--muted)', marginBottom: 16 }}>{tr(lang, 'กรุณาเข้าสู่ระบบเพื่อดู My Journey', 'Please sign in to view My Journey')}</p>
        <Btn kind="teal" href="/auth/login?redirect=/me/journey">
          {tr(lang, 'เข้าสู่ระบบ', 'Sign in')}
        </Btn>
      </section>
    );
  }

  const open = openIdx != null ? items[openIdx] : null;
  const stopProps = open
    ? {
        it: open,
        index: items.length - (openIdx as number),
        memo: entries.find((e) => e.day === open.date)?.notes[0] || '',
        onSaveMemo: (text: string) => {
          const cur = entries.find((e) => e.day === open.date);
          return saveDay(open.date, { notes: cleanNotes([text, ...(cur?.notes.slice(1) || [])]) });
        },
        onReviewed: (rating: number, comment: string | null) => setItems((list) => list.map((x) => (x.booking_id === open.booking_id ? { ...x, review_rating: rating, review_comment: comment } : x))),
        onOpenDiary: () => openDiaryAt(open.date),
      }
    : null;

  return (
    <div className="jd-page">

      {view === 'journey' && full && stopProps && <StopFull {...stopProps} onBack={() => setFull(false)} />}

      {view === 'journey' && !full && (
        <div style={css('position:relative;overflow:hidden;background-color:var(--cream);background-image:radial-gradient(rgba(13,138,126,.14) 1.2px,transparent 1.4px);background-size:28px 28px')}>
          <div style={css('position:relative;max-width:1180px;margin:0 auto;padding:' + (phone ? '24px 16px 48px' : '40px 0 0'))}>
            {phone ? (
              <>
                <h2 style={css("font-family:'Archivo Black','Mitr',sans-serif;font-size:34px;line-height:.95;margin:4px 0 6px")}>
                  MY
                  <br />
                  JOURNEY
                </h2>
                <p style={css('margin:0 0 20px;font-size:13px;color:var(--muted)')}>
                  {items.length} workshops · {stats.hours} ชั่วโมง
                </p>
                {items.length ? <JourneyRail items={items} onOpen={setOpenIdx} /> : <EmptyJourney />}
                <button type="button" onClick={() => openDiaryAt()} style={css('margin-top:26px;width:100%;display:flex;align-items:center;gap:14px;border:0;cursor:pointer;text-align:left;font-family:inherit;background:var(--ink);color:#fff;border-radius:22px;padding:14px 20px 14px 14px')}>
                  <DiaryBookIcon />
                  <span style={css('display:flex;flex-direction:column;gap:5px')}>
                    <span style={css('font-family:Mitr,sans-serif;font-weight:500;font-size:17px;line-height:1.1')}>เปิดสมุดไดอารี่</span>
                    <span style={css('font-size:13px;font-weight:600;color:var(--accent)')}>ไปที่ Diary →</span>
                  </span>
                </button>
              </>
            ) : (
              <>
                <div style={css('display:flex;align-items:center;justify-content:space-between;gap:28px;flex-wrap:wrap;padding:0 32px')}>
                  <div style={css('display:flex;flex-direction:column;gap:12px;flex:1;min-width:280px')}>
                    <span className="eyebrow" style={{ color: 'var(--teal)' }}>LIFE MAP · แผนที่ชีวิตของฉัน</span>
                    <h1 style={css("font-family:'Archivo Black','Mitr',sans-serif;font-size:58px;line-height:.88;letter-spacing:-.03em;margin:0;white-space:nowrap")}>MY JOURNEY</h1>
                    <p style={css('font-size:15px;line-height:1.6;color:var(--muted);margin:0;text-wrap:pretty')}>ทุก workshop คือหมุดหนึ่งบนแผนที่ เดินย้อนลงไปดูว่าเราผ่านอะไรมาบ้าง — แตะที่การ์ดเพื่อเปิดความทรงจำของวันนั้น</p>
                  </div>
                  <div style={css('flex:none;display:flex;align-items:stretch;flex-wrap:nowrap;background:#fff;border-radius:22px;box-shadow:0 20px 40px -30px rgba(13,30,29,.4);overflow:hidden')}>
                    <button type="button" onClick={() => openDiaryAt()} style={css('position:relative;flex:none;display:flex;align-items:center;gap:16px;border:0;cursor:pointer;text-align:left;font-family:inherit;background:var(--ink);color:#fff;border-radius:22px;padding:14px 20px 14px 14px')}>
                      <DiaryBookIcon />
                      <span style={css('display:flex;flex-direction:column;gap:5px')}>
                        <span style={css('font-family:Mitr,sans-serif;font-weight:500;font-size:18px;line-height:1.1')}>เปิดสมุดไดอารี่</span>
                        <span style={css('font-size:12.5px;line-height:1.3;color:#cfdcda;white-space:nowrap')}>{stats.pages} หน้า · อารมณ์ · สรุปเดือน</span>
                        <span style={css('font-size:13px;font-weight:600;color:var(--accent)')}>ไปที่ Diary →</span>
                      </span>
                    </button>
                    <div style={css('display:flex;align-items:center;padding:16px 8px')}>
                      {(
                        [
                          [String(items.length).padStart(2, '0'), 'จุดที่เดินผ่าน', true],
                          [String(stats.hours), 'ชั่วโมงเรียนรู้', false],
                          [String(stats.pages), 'บันทึกในไดอารี่', false],
                        ] as const
                      ).map(([n, l, teal], i) => (
                        <div key={l} style={{ display: 'flex', alignItems: 'stretch' }}>
                          {i > 0 && <div style={css('width:1px;align-self:stretch;margin:6px 0;background:rgba(13,30,29,.08)')} />}
                          <div style={css('display:flex;flex-direction:column;gap:6px;padding:0 18px')}>
                            <span style={css("font-family:'Archivo Black','Mitr',sans-serif;font-size:32px;line-height:1;color:" + (teal ? 'var(--teal)' : 'var(--ink)'))}>{n}</span>
                            <span style={css('font-size:13px;color:var(--muted);white-space:nowrap')}>{l}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                {!items.length && (
                  <div style={{ padding: '40px 32px 80px' }}>
                    <EmptyJourney />
                  </div>
                )}
              </>
            )}
          </div>
          {/* The map spans the whole screen width, outside the hero's column. */}
          {!phone && items.length > 0 && <JourneyMap items={items} onOpen={setOpenIdx} />}
        </div>
      )}

      {view === 'diary' && (
        <div style={css('position:relative;isolation:isolate;overflow:hidden;background:var(--cream);min-height:calc(100vh - 70px);padding:' + (phone ? '14px 12px 40px' : '18px 32px 40px') + '')}>
          <div style={css('max-width:1600px;margin:0 auto;display:flex;align-items:flex-end;justify-content:space-between;gap:16px 24px;flex-wrap:wrap')}>
            <div style={css('display:flex;align-items:baseline;gap:14px;flex-wrap:wrap')}>
              <h1 style={css("font-family:'Archivo Black','Mitr',sans-serif;font-size:34px;line-height:1;letter-spacing:-.02em;margin:0")}>DIARY</h1>
              <span style={css('color:var(--muted);font-size:13.5px')}>เขียนได้ทุกวัน · workshop ที่เข้าร่วมจะเข้ามาอยู่ในหน้าของวันนั้นเอง</span>
            </div>
            <div style={css('display:flex;align-items:center;gap:12px;flex-wrap:wrap')}>
              <div className="jd-soft" role="tablist">
                {(
                  [
                    ['book', 'สมุดบันทึก'],
                    ['mood', 'อารมณ์'],
                    ['sum', 'สรุปเดือน'],
                  ] as const
                ).map(([k, l]) => (
                  <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
                    {l}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="btn btn-teal btn-sm"
                style={css('display:inline-flex;align-items:center;gap:7px')}
                onClick={() => {
                  setTab('book');
                  setWriteNonce((n) => n + 1);
                }}
              >
                ✎ เขียนวันนี้
              </button>
            </div>
          </div>

          {tab === 'book' && (
            <div style={css('max-width:1600px;margin:14px auto 0')}>
              <DiaryBook
                owner={owner || 'ฉัน'}
                today={today}
                entries={entries}
                workshops={bookWorkshops}
                summaries={summaries}
                writeNonce={writeNonce}
                jumpNonce={jump.n}
                jumpTo={jump.day}
                onSave={(day, data) => saveDay(day, { notes: data.notes, moods: data.moods })}
              />
            </div>
          )}
          {tab === 'mood' && <MoodTab entries={entries} today={today} workshops={dayWorkshops} onSaveMoods={(day, moods) => saveDay(day, { moods })} />}
          {tab === 'sum' && <SummaryTab entries={entries} today={today} workshops={dayWorkshops} savedMonths={months} onKeepMonth={keepMonth} onOpenBook={(day) => openDiaryAt(day)} />}
        </div>
      )}

      {view === 'journey' && !full && stopProps && <StopModal {...stopProps} onClose={() => setOpenIdx(null)} onFull={() => setFull(true)} />}
    </div>
  );
}

function DiaryBookIcon() {
  return (
    <span style={css('position:relative;flex:none;width:52px;height:70px;border-radius:4px 10px 10px 4px;background:var(--teal);box-shadow:inset 6px 0 0 rgba(0,0,0,.2),3px 3px 0 #efe7d6,5px 5px 0 #e6dcc6;transform:rotate(-5deg)')}>
      <span style={css('position:absolute;top:0;bottom:0;right:10px;width:7px;background:var(--accent)')} />
      <span style={css('position:absolute;left:12px;top:14px;width:30px;height:20px;border-radius:3px;background:var(--cream)')} />
    </span>
  );
}

function EmptyJourney() {
  return (
    <div style={css('background:#fff;border-radius:22px;padding:48px 24px;text-align:center;display:flex;flex-direction:column;align-items:center;gap:12px')}>
      <span style={css('font-family:Mitr,sans-serif;font-weight:500;font-size:22px')}>เส้นทางเริ่มที่หมุดแรก</span>
      <span style={css('font-size:14px;color:var(--muted);max-width:420px')}>เมื่อเข้าร่วม workshop และถูกเช็คชื่อแล้ว หมุดจะขึ้นบนแผนที่ให้อัตโนมัติ</span>
      <Btn kind="teal" href="/workshops">
        ดูกิจกรรมทั้งหมด →
      </Btn>
    </div>
  );
}
