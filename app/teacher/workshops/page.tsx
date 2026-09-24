'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useLang, T, tr } from '@/lib/i18n';
import { Icon } from '@/components/design/Icon';
import { Pager } from '@/components/teacher/Pager';
import type { Workshop } from '@/lib/types';
import { getWorkshopDays, hasWorkshopEnded } from '@/lib/workshop-utils';
import { MonthPicker } from '@/components/calendar/MonthPicker';
import { fmtDate } from '@/lib/datetime';

type Row = Workshop & { booked: number };

/** Mirrors the grid's CSS: columns are at least this wide, this far apart. */
const MIN_COL = 260;
const GAP = 18;
/** Below this the grid drops its minimum column width and forces two columns:
 *  a single A3 poster per row on a phone is a card taller than the screen, so
 *  the page becomes one long scroll of one card at a time. */
const NARROW = 640;
/** One row of cards per page on desktop, where the shell is exactly one screen
 *  tall and an A3 poster already fills that height. Phones scroll normally and
 *  the cards are half as wide there, so they hold a 2x2 page. */
const ROWS_DESKTOP = 1;
const ROWS_NARROW = 2;

const STATUS = (w: Row) => {
  if (w.status === 'cancelled') return { th: 'ยกเลิก', en: 'Cancelled', tone: '#9a4a3f', bg: '#f4dad4' };
  if (w.status === 'completed' || hasWorkshopEnded(w)) return { th: 'จบแล้ว', en: 'Ended', tone: 'var(--muted)', bg: 'var(--cream)' };
  return { th: 'เปิดรับ', en: 'Open', tone: 'var(--teal-deep)', bg: 'var(--teal-50)' };
};

export default function TeacherWorkshopsPage() {
  const { lang } = useLang();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [page, setPage] = useState(1);
  const gridRef = useRef<HTMLDivElement>(null);
  // How many cards a page holds is how many the grid puts in a row: the poster
  // is A3, so one row of them already fills the height a screen has to spare.
  const [cols, setCols] = useState(4);
  const [narrow, setNarrow] = useState(false);
  const perPage = Math.max(1, cols * (narrow ? ROWS_NARROW : ROWS_DESKTOP));

  // Check-in by calendar: every day one of these workshops runs lights up;
  // pick a day and the rounds that day list with a way into their roster.
  const [view, setView] = useState<'list' | 'calendar'>('list');
  const [day, setDay] = useState<string | null>(null);
  const byDay = useMemo(() => {
    const m = new Map<string, Row[]>();
    (rows || []).filter((w) => w.master_kind !== 'round').forEach((w) => {
      getWorkshopDays(w).forEach((d) => {
        if (!m.has(d)) m.set(d, []);
        m.get(d)!.push(w);
      });
    });
    return m;
  }, [rows]);
  const dayMarks = useMemo(() => {
    const m: Record<string, number> = {};
    byDay.forEach((list, d) => {
      m[d] = list.length;
    });
    return m;
  }, [byDay]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/teacher/workshops');
        const data = (await res.json()) as { workshops?: Row[] };
        setRows(data.workshops || []);
      } catch (e) {
        console.error('Failed to load teacher workshops', e);
        setRows([]);
      }
    })();
  }, []);

  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      if (!w) return;
      const isNarrow = w < NARROW;
      setNarrow(isNarrow);
      setCols(isNarrow ? 2 : Math.max(1, Math.floor((w + GAP) / (MIN_COL + GAP))));
    };
    // ResizeObserver fires once on observe, so the first measurement happens in
    // its callback rather than synchronously inside this effect.
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [rows]);

  // Only one-day workshops live here; activities that run in rounds are
  // managed under "จัดรอบสอน" (/teacher/sessions).
  const cards = useMemo(
    () => (rows || []).filter((w) => w.master_kind !== 'round').map((w): { w: Row; group?: Row[] } => ({ w })),
    [rows],
  );

  const pageCount = Math.max(1, Math.ceil(cards.length / perPage));
  const current = Math.min(page, pageCount);
  const shown = cards.slice((current - 1) * perPage, current * perPage);

  return (
    <div>
      <span className="eyebrow">
        <T th="workshop ของฉัน" en="my workshops" />
      </span>
      <h1 className="display-th" style={{ fontSize: 'clamp(24px,3vw,32px)', margin: '8px 0 4px' }}>
        <T th="เวิร์กชอปของฉัน" en="My Workshops" />
      </h1>
      <p style={{ fontSize: 14, color: 'var(--muted)', margin: '0 0 14px' }}>
        <T th="เวิร์กชอปที่คุณเป็นผู้นำกิจกรรม — ดูผู้สมัคร เช็คชื่อ และยอดโอน" en="Workshops you lead — applicants, check-in and payouts." />
      </p>

      <div className="tch-view" role="tablist" aria-label={tr(lang, 'มุมมอง', 'View')}>
        <button type="button" role="tab" aria-selected={view === 'list'} className={view === 'list' ? 'on' : ''} onClick={() => setView('list')}>
          {tr(lang, 'รายการ', 'List')}
        </button>
        <button type="button" role="tab" aria-selected={view === 'calendar'} className={view === 'calendar' ? 'on' : ''} onClick={() => setView('calendar')}>
          {tr(lang, 'ปฏิทินเช็คชื่อ', 'Check-in calendar')}
        </button>
      </div>

      {rows === null ? (
        <CardGridSkeleton />
      ) : view === 'calendar' ? (
        <div className="tch-cal">
          <div className="card card-static">
            <MonthPicker value={day} onChange={setDay} enabled={new Set(byDay.keys())} marks={dayMarks} min="" />
            <p style={{ fontSize: 12, color: 'var(--muted)', margin: '12px 0 0' }}>
              <T th="วันที่มีสี = มีรอบสอน · ตัวเลขคือจำนวนรอบ" en="Tinted days have a round · the number is how many" />
            </p>
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 10 }}>
              {day ? fmtDate(day, lang) : tr(lang, 'เลือกวันจากปฏิทิน', 'Choose a day')}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {(day ? byDay.get(day) || [] : []).map((w) => (
                <Link key={w.id} href={`/teacher/workshops/${w.id}`} className="card card-static" style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none', color: 'var(--ink)' }}>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontWeight: 700, fontSize: 14.5 }} className="u-clamp-2">{w.title}</span>
                    <span className="mono" style={{ display: 'block', fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                      {w.time_start}–{w.time_end}{w.location ? ` · ${w.location}` : ''}
                    </span>
                  </span>
                  <span className="tag" style={{ fontSize: 11 }}>{w.booked} {tr(lang, 'คน', 'people')}</span>
                  <span className="btn btn-teal btn-sm">{tr(lang, 'เช็คชื่อ', 'Check in')} →</span>
                </Link>
              ))}
              {day && (byDay.get(day) || []).length === 0 && (
                <div style={{ color: 'var(--muted)', fontSize: 13.5 }}><T th="ไม่มีรอบในวันนี้" en="No round on this day." /></div>
              )}
            </div>
          </div>
        </div>
      ) : cards.length === 0 ? (
        <div className="card card-static" style={{ textAlign: 'center', padding: '48px 24px' }}>
          <p style={{ color: 'var(--muted)', margin: 0 }}>
            <T th="ยังไม่มีเวิร์กชอปแบบวันเดียวที่คุณดูแล — Workshop แบบเลือกรอบอยู่ในเมนู จัดรอบสอน" en="No one-day workshops yet — round-based ones are under Session manager." />
          </p>
        </div>
      ) : (
        <>
        <div ref={gridRef} className="tch-wgrid">
          {shown.map(({ w, group }) => {
            const days = getWorkshopDays(w);
            const st = STATUS(w);
            const dateLabel = new Date(days[0] + 'T00:00:00').toLocaleDateString(lang === 'th' ? 'th-TH' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
            const roundDays = group ? new Set(group.map((g) => g.date)).size : 0;
            const href = group ? `/teacher/rounds/${w.master_id}` : `/teacher/workshops/${w.id}`;
            return (
              <Link key={group ? `m-${w.master_id}` : w.id} href={href} className="card card-static" style={{ padding: 0, overflow: 'hidden', textDecoration: 'none', display: 'block' }}>
                {/* Posters are drawn at A3, so the frame is A3: the image fills
                    it edge to edge instead of sitting between bands of
                    background, and stays contained rather than cropped so an
                    odd-sized one is still shown whole. */}
                <div style={{ aspectRatio: '297 / 420', background: 'var(--cream)', position: 'relative' }}>
                  {w.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={w.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                  ) : null}
                  <span className="tch-wbadge" style={{ position: 'absolute', top: 10, right: 10, fontSize: 11, fontWeight: 600, color: st.tone, background: st.bg, borderRadius: 999, padding: '4px 10px' }}>
                    {tr(lang, st.th, st.en)}
                  </span>
                  {/* Whether the platform's share has reached the organizer —
                      the question a teacher has about a finished workshop. */}
                  <span
                    className="tch-wbadge"
                    style={{
                      position: 'absolute',
                      top: 10,
                      left: 10,
                      fontSize: 11,
                      fontWeight: 600,
                      borderRadius: 999,
                      padding: '4px 10px',
                      color: w.payout_status === 'paid' ? 'var(--teal-deep)' : '#8a5a00',
                      background: w.payout_status === 'paid' ? 'var(--teal-50)' : '#fcefcf',
                    }}
                  >
                    {w.payout_status === 'paid' ? tr(lang, 'โอนแล้ว', 'Paid out') : tr(lang, 'รอโอน', 'Awaiting payout')}
                  </span>
                </div>
                <div className="tch-wcard-body" style={{ padding: 16 }}>
                  <h3 className="display-th tch-wcard-title" style={{ fontSize: 17, margin: '0 0 8px', lineHeight: 1.3, color: 'var(--ink)' }}>
                    {w.title}
                  </h3>
                  <div className="tch-wmeta" style={{ fontSize: 13, color: 'var(--muted)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {/* Date and seats share a line — two short facts, one row. */}
                    <span style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <span>
                        <Icon name="date" size={13} /> {dateLabel}
                        {group
                          ? tr(lang, ` · ${roundDays} วัน · ${group.length} รอบ`, ` · ${roundDays} days · ${group.length} rounds`)
                          : days.length > 1
                            ? tr(lang, ` · ${days.length} วัน`, ` · ${days.length} days`)
                            : ''}
                      </span>
                      <span style={{ whiteSpace: 'nowrap' }}>
                        <Icon name="participants" size={13} /> {w.booked}/{w.max_participants} {tr(lang, 'ที่นั่ง', 'seats')}
                      </span>
                    </span>
                    {w.location && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}><Icon name="location" size={13} /> {w.location}</span>}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
        <Pager page={current} pageCount={pageCount} onChange={setPage} label="หน้าเวิร์กชอป" />
        </>
      )}
    </div>
  );
}

/** The grid's own shape while it loads — same columns, same card proportions,
 *  so nothing jumps when the workshops arrive. */
function CardGridSkeleton() {
  return (
    <div
      aria-hidden
      className="tch-wgrid"
    >
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="card card-static" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="skel" style={{ aspectRatio: '297 / 420', borderRadius: 0 }} />
          <div className="tch-wcard-body" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="skel" style={{ height: 17, width: '72%' }} />
            <div className="skel" style={{ height: 12, width: '52%' }} />
            <div className="skel" style={{ height: 12, width: '40%' }} />
          </div>
        </div>
      ))}
    </div>
  );
}
