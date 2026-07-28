'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { Workshop } from '@/lib/types';
import { useLang, T, tr } from '@/lib/i18n';
import { Reveal } from '@/components/design/Reveal';
import { getEffectivePrice, getWorkshopDays, hasWorkshopEnded } from '@/lib/workshop-utils';

type Booking = {
  workshop_id: string;
  status: string;
  payment_status: string;
  attended: number | null;
  app_status: string;
};

/** Calendar colour status per user + seats. */
type CalStatus = 'available' | 'applied' | 'full' | 'past';

/** Green = open, Yellow = you applied/registered (today/upcoming), Red = full,
 *  Gray = ended (past — the ⭐/🌧️ icon then tells attended vs no-show). */
function calStatusOf(w: Workshop, hasBooking: boolean, taken: number): CalStatus {
  const ended = hasWorkshopEnded(w);
  if (hasBooking && !ended) return 'applied'; // 🟡 booked & today/upcoming
  if (ended) return 'past'; // ⚪ any past event
  if (taken >= w.max_participants) return 'full'; // 🔴 upcoming but full
  return 'available'; // 🟢 today / upcoming with seats
}

/** Star for a registered/attended booking, rain-cloud for a past no-show. */
function bookingIcon(w: Workshop, booking: Booking | undefined): '⭐' | '🌧️' | null {
  if (!booking) return null;
  if (hasWorkshopEnded(w) && booking.attended === 0) return '🌧️'; // จองแต่ไม่ได้ไป
  return '⭐'; // จองแล้ว / กำลังจะมา / เคยเข้าร่วม
}

/** Contiguous date ranges the workshop occupies (for the calendar bar).
 *  multi_day → one spanning range; multi_part → one segment per day; one_day → single. */
function workshopSegments(w: Workshop): { start: Date; end: Date }[] {
  const dateOnly = (s: string) => new Date(s + 'T00:00:00');
  const type = w.workshop_type || 'one_day';
  if (type === 'multi_day' && w.end_date && w.end_date >= w.date) {
    return [{ start: dateOnly(w.date), end: dateOnly(w.end_date) }];
  }
  if (type === 'multi_part') {
    const list = getWorkshopDays(w);
    return list.map((d) => ({ start: dateOnly(d), end: dateOnly(d) }));
  }
  return [{ start: dateOnly(w.date), end: dateOnly(w.date) }];
}

/** Whole-day difference b - a (both at local midnight). */
function dayDiff(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
];
const EN_MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const TH_DOW = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
const EN_DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function buildStart(w: Workshop): Date {
  return new Date(`${w.date}T${w.time_start}:00`);
}
function buildEnd(w: Workshop): Date {
  return new Date(`${w.date}T${w.time_end}:00`);
}
function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
function fmtMonth(d: Date, lang: 'th' | 'en') {
  return lang === 'th'
    ? `${THAI_MONTHS[d.getMonth()]} ${d.getFullYear() + 543}`
    : `${EN_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}
function fmtDate(d: Date, lang: 'th' | 'en') {
  if (lang === 'th') return `${d.getDate()} ${THAI_MONTHS[d.getMonth()].slice(0, 3)} ${d.getFullYear() + 543}`;
  return `${d.getDate()} ${EN_MONTHS[d.getMonth()].slice(0, 3)} ${d.getFullYear()}`;
}
function fmtTime(d: Date) {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
function isPast(d: Date) {
  return d.getTime() < Date.now();
}

function gcalUrl(w: Workshop, lang: 'th' | 'en'): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const start = buildStart(w);
  const end = buildEnd(w);
  const toG = (d: Date) =>
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
  const text = encodeURIComponent(w.title);
  const dates = `${toG(start)}/${toG(end)}`;
  // Location field = a Google Maps link. Prefer the venue's admin-set map_url;
  // otherwise build a Maps search link from the address text.
  const mapLink = w.map_url
    ? w.map_url
    : w.location
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(w.location)}`
      : '';
  const location = encodeURIComponent(mapLink);
  // Keep the readable address in the details so it isn't lost when the location
  // field holds a Maps link.
  const addressLine = w.location
    ? `${tr(lang, 'สถานที่', 'Location')}: ${w.location}\n`
    : '';
  const details = encodeURIComponent(
    `${w.short_description ? w.short_description + '\n\n' : ''}${addressLine}— ${tr(lang, 'จัดโดย soulsilent', 'organized by soulsilent')}`
  );
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${text}&dates=${dates}&location=${location}&details=${details}&ctz=Asia/Bangkok`;
}

export default function CalendarPage() {
  const { lang } = useLang();
  const [workshops, setWorkshops] = useState<Workshop[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [seatCounts, setSeatCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  const [monthDate, setMonthDate] = useState(() => {
    const t = new Date();
    return new Date(t.getFullYear(), t.getMonth(), 1);
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [selected, setSelected] = useState<Workshop | null>(null);

  useEffect(() => {
    fetch('/api/calendar')
      .then((r) => r.json() as Promise<{ workshops: Workshop[]; bookings: Booking[]; seatCounts?: Record<string, number> }>)
      .then((d) => {
        setWorkshops(d.workshops || []);
        setBookings(d.bookings || []);
        setSeatCounts(d.seatCounts || {});
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelected(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    document.body.style.overflow = selected ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [selected]);

  // Quick lookup: workshop_id → booking
  const bookingMap = useMemo(() => {
    const m = new Map<string, Booking>();
    bookings.forEach((b) => m.set(b.workshop_id, b));
    return m;
  }, [bookings]);

  // Apply search filter
  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return workshops;
    return workshops.filter(
      (w) =>
        w.title.toLowerCase().includes(q) ||
        (w.short_description || '').toLowerCase().includes(q) ||
        (w.location || '').toLowerCase().includes(q) ||
        (w.category || '').toLowerCase().includes(q)
    );
  }, [workshops, searchQuery]);

  return (
    <section className="section" style={{ paddingTop: 48, paddingBottom: 64 }}>
      <div className="container">
        <Reveal>
          <span className="eyebrow">
            <T th="soulsilent · workshop calendar" en="soulsilent · workshop calendar" />
          </span>
          <h1
            className="giant-th"
            style={{ marginTop: 14, marginBottom: 10, fontSize: 'clamp(36px, 5.5vw, 68px)' }}
          >
            <T
              th={
                <>
                  ปฏิทิน <span style={{ color: 'var(--teal)' }}>Workshop</span>
                </>
              }
              en={
                <>
                  <span style={{ color: 'var(--teal)' }}>Workshop</span> Calendar
                </>
              }
            />
          </h1>
          <p
            style={{
              fontSize: 'clamp(15px, 1.3vw, 17px)',
              color: 'var(--muted)',
              maxWidth: 640,
              margin: '0 0 32px',
              lineHeight: 1.6,
            }}
          >
            <T
              th="ดู workshop ทั้งหมดในมุมมองเดือน · เลื่อนตามเดือนได้ ค้นหาได้ และเพิ่มลง Google Calendar ได้ในคลิกเดียว"
              en="See every workshop in a monthly view. Browse, filter, and add to Google Calendar in one click."
            />
          </p>
        </Reveal>

        {/* Toolbar */}
        <Reveal>
          <div className="cal-toolbar">
            <button
              className="cal-icon-btn"
              onClick={() => setMonthDate(new Date(monthDate.getFullYear(), monthDate.getMonth() - 1, 1))}
              title={tr(lang, 'เดือนก่อน', 'Prev month')}
              aria-label="prev"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path d="M11 3 L6 8 L11 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <button
              className="cal-icon-btn"
              onClick={() => setMonthDate(new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 1))}
              title={tr(lang, 'เดือนถัดไป', 'Next month')}
              aria-label="next"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path d="M5 3 L10 8 L5 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <div className="cal-month-label">{fmtMonth(monthDate, lang)}</div>
            <button
              className="cal-today-pill"
              onClick={() => {
                const t = new Date();
                setMonthDate(new Date(t.getFullYear(), t.getMonth(), 1));
              }}
            >
              {tr(lang, 'วันนี้', 'Today')}
            </button>
          </div>
        </Reveal>

        <Reveal>
          <div className="cal-toolbar">
            <div className="cal-search-wrap">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.8" />
                <path d="M11 11 L14 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
              <input
                className="cal-search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={tr(lang, 'ค้นหา workshop, สถานที่, หมวดหมู่', 'Search by title, place, category')}
              />
            </div>
          </div>
        </Reveal>

        {/* Calendar grid */}
        {loading ? (
          <div style={{ padding: 80, textAlign: 'center' }}>
            <div
              style={{
                width: 32,
                height: 32,
                border: '2px solid var(--teal)',
                borderTopColor: 'transparent',
                borderRadius: '50%',
                margin: '0 auto',
                animation: 'float 1s linear infinite',
              }}
            />
          </div>
        ) : (
          <Reveal variant="reveal-zoom">
            <CalendarGrid
              monthDate={monthDate}
              workshops={filtered}
              bookingMap={bookingMap}
              seatCounts={seatCounts}
              lang={lang}
              onSelect={setSelected}
            />
          </Reveal>
        )}

        {/* Legend */}
        <div className="cal-legend">
          <span className="swatch">
            <span className="demo bar-available">{tr(lang, 'ว่าง', 'available')}</span>
            {tr(lang, 'มีที่นั่งว่าง · ยังไม่ได้สมัคร', 'seats open · not applied')}
          </span>
          <span className="swatch">
            <span className="demo bar-applied">★ {tr(lang, 'จองแล้ว', 'registered')}</span>
            {tr(lang, 'คุณสมัคร / ลงทะเบียนแล้ว · กำลังจะมา', 'you applied / registered · upcoming')}
          </span>
          <span className="swatch">
            <span className="demo bar-full">{tr(lang, 'เต็มแล้ว', 'full')}</span>
            {tr(lang, 'ที่นั่งเต็ม · สมัครไม่ได้', 'fully booked')}
          </span>
          <span className="swatch">
            <span className="demo bar-past">{tr(lang, 'จบแล้ว', 'ended')}</span>
            {tr(lang, 'กิจกรรมที่ผ่านไปแล้ว', 'past events')}
          </span>
          <span className="swatch">
            <span className="demo bar-past">★ {tr(lang, 'เข้าร่วม', 'attended')}</span>
            {tr(lang, 'เคยเข้าร่วม', 'past attended')}
          </span>
          <span className="swatch">
            <span className="demo bar-past">🌧️ {tr(lang, 'ไม่ได้ไป', 'no-show')}</span>
            {tr(lang, 'จองแต่ไม่ได้ไป', 'booked but missed')}
          </span>
        </div>

        {filtered.length === 0 && !loading && (
          <div
            style={{
              marginTop: 24,
              padding: 18,
              borderRadius: 12,
              background: 'var(--cream)',
              color: 'var(--muted)',
              fontSize: 14,
              textAlign: 'center',
            }}
          >
            {tr(lang, 'ไม่พบ workshop · ลองเปลี่ยนคำค้น', 'No workshops · try a different search')}
          </div>
        )}
      </div>

      {selected && (
        <WorkshopModal
          w={selected}
          booking={bookingMap.get(selected.id)}
          lang={lang}
          onClose={() => setSelected(null)}
        />
      )}
    </section>
  );
}

function CalendarGrid({
  monthDate,
  workshops,
  bookingMap,
  seatCounts,
  lang,
  onSelect,
}: {
  monthDate: Date;
  workshops: Workshop[];
  bookingMap: Map<string, Booking>;
  seatCounts: Record<string, number>;
  lang: 'th' | 'en';
  onSelect: (w: Workshop) => void;
}) {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const today = new Date();

  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  type Cell = { date: Date; isOther: boolean };
  const cells: Cell[] = [];
  for (let i = 0; i < 42; i++) {
    if (i < firstDow) {
      cells.push({ date: new Date(year, month - 1, daysInPrevMonth - (firstDow - i - 1)), isOther: true });
    } else if (i >= firstDow + daysInMonth) {
      cells.push({ date: new Date(year, month + 1, i - firstDow - daysInMonth + 1), isOther: true });
    } else {
      cells.push({ date: new Date(year, month, i - firstDow + 1), isOther: false });
    }
  }

  // Always render 6 rows (42 cells) so the calendar height never jumps between
  // months — short months are padded with the following month's days.
  const visibleCells = cells;
  const dowLabels = lang === 'th' ? TH_DOW : EN_DOW;

  // Split the flat cells into weeks of 7 so multi-day bars can span columns.
  const weeks: Cell[][] = [];
  for (let i = 0; i < visibleCells.length; i += 7) weeks.push(visibleCells.slice(i, i + 7));

  return (
    <div className="cal-grid">
      <div className="cal-weekdays">
        {dowLabels.map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>
      <div className="cal-weeks">
        {weeks.map((week, wi) => (
          <CalendarWeek
            key={wi}
            week={week}
            workshops={workshops}
            bookingMap={bookingMap}
            seatCounts={seatCounts}
            today={today}
            lang={lang}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  );
}

/** One week row: date-number header + vertical grid lines + spanning event bars. */
function CalendarWeek({
  week,
  workshops,
  bookingMap,
  seatCounts,
  today,
  lang,
  onSelect,
}: {
  week: { date: Date; isOther: boolean }[];
  workshops: Workshop[];
  bookingMap: Map<string, Booking>;
  seatCounts: Record<string, number>;
  today: Date;
  lang: 'th' | 'en';
  onSelect: (w: Workshop) => void;
}) {
  const weekStart = week[0].date;
  const weekEnd = week[6].date;

  type RawBar = { w: Workshop; startCol: number; endCol: number; cl: boolean; cr: boolean; status: CalStatus; icon: '⭐' | '🌧️' | null };
  const raw: RawBar[] = [];
  for (const w of workshops) {
    const booking = bookingMap.get(w.id);
    const status = calStatusOf(w, !!booking, seatCounts[w.id] || 0);
    const icon = bookingIcon(w, booking);
    for (const seg of workshopSegments(w)) {
      if (seg.end < weekStart || seg.start > weekEnd) continue; // no overlap this week
      const s = seg.start < weekStart ? weekStart : seg.start;
      const e = seg.end > weekEnd ? weekEnd : seg.end;
      raw.push({
        w,
        startCol: dayDiff(weekStart, s),
        endCol: dayDiff(weekStart, e),
        cl: seg.start < weekStart, // continues from a previous week
        cr: seg.end > weekEnd, // continues into the next week
        status,
        icon,
      });
    }
  }
  // Lane packing: earliest first, longer spans first, first free lane wins.
  raw.sort((a, b) => a.startCol - b.startCol || b.endCol - b.startCol - (a.endCol - a.startCol));
  const laneEnd: number[] = [];
  const bars = raw.map((r) => {
    let lane = 0;
    while (lane < laneEnd.length && laneEnd[lane] >= r.startCol) lane++;
    laneEnd[lane] = r.endCol;
    return { ...r, lane };
  });
  const laneCount = Math.max(1, laneEnd.length);

  return (
    <div className="cal-week" style={{ minHeight: Math.max(116, 34 + laneCount * 26 + 10) }}>
      {/* Vertical grid lines / other-month tint (full column height) */}
      <div className="cal-week-cols" aria-hidden>
        {week.map((c, i) => (
          <div key={i} className={c.isOther ? 'other' : ''} />
        ))}
      </div>

      {/* Date-number header: 19 | 20 | 21 ... */}
      <div className="cal-week-dates">
        {week.map((c, ci) => {
          const isToday = sameDay(c.date, today);
          const firstDay = c.date.getDate() === 1;
          return (
            <div key={ci} className={`cal-wd ${c.isOther ? 'other' : ''} ${isToday ? 'today' : ''}`}>
              <span className="cal-day-num">{isToday ? 'Today' : c.date.getDate()}</span>
              {firstDay && !isToday && (
                <span className="cal-day-first">
                  {(lang === 'th' ? THAI_MONTHS : EN_MONTHS)[c.date.getMonth()].slice(0, 3)}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Event bars — multi-day events span across the columns they cover. */}
      <div className="cal-week-bars" style={{ gridTemplateRows: `repeat(${laneCount}, 24px)` }}>
        {bars.map((b, bi) => (
          <button
            key={`${b.w.id}-${bi}`}
            className={`cal-bar bar-${b.status} ${b.cl ? 'cl' : ''} ${b.cr ? 'cr' : ''}`}
            style={{ gridColumn: `${b.startCol + 1} / ${b.endCol + 2}`, gridRow: b.lane + 1 }}
            onClick={() => onSelect(b.w)}
            title={b.w.title}
          >
            {b.cl && <span className="cal-bar-arrow">‹</span>}
            {b.icon && <span className="cal-bar-ico">{b.icon}</span>}
            <span className="cal-bar-title">{b.w.title}</span>
            {b.cr && <span className="cal-bar-arrow">›</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

function WorkshopModal({
  w,
  booking,
  lang,
  onClose,
}: {
  w: Workshop;
  booking?: Booking;
  lang: 'th' | 'en';
  onClose: () => void;
}) {
  const start = buildStart(w);
  const end = buildEnd(w);
  const past = isPast(end);
  const today = sameDay(start, new Date());
  const upcomingPaid =
    booking && (booking.payment_status === 'paid' || booking.status === 'confirmed') && !past;
  const bannerCls = today ? 'today-banner' : past ? 'past' : 'upcoming';
  const eff = getEffectivePrice(w);

  // For paid + upcoming events, paint the banner with the workshop's theme color
  const bannerStyle =
    upcomingPaid && w.theme_color
      ? {
          background: `linear-gradient(135deg, ${w.theme_color} 0%, ${w.theme_color} 100%)`,
        }
      : undefined;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="cal-modal" onClick={(e) => e.stopPropagation()}>
        <div className={`cal-modal-banner ${bannerCls}`} style={bannerStyle}>
          <button className="cal-modal-close" onClick={onClose} aria-label="close">
            ✕
          </button>
          <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
            {w.category && (
              <span
                className="tag"
                style={{ background: 'rgba(255,255,255,.18)', color: '#fff', backdropFilter: 'blur(8px)' }}
              >
                {w.category}
              </span>
            )}
            {upcomingPaid && <span className="tag tag-accent">★ {tr(lang, 'จองแล้ว', 'registered')}</span>}
            {today && <span className="tag tag-accent">{tr(lang, 'วันนี้', 'today')}</span>}
          </div>
          <h3
            className="display-th"
            style={{
              fontSize: 'clamp(20px, 2.4vw, 26px)',
              margin: '0 0 6px',
              color: '#fff',
              lineHeight: 1.2,
            }}
          >
            {w.title}
          </h3>
          <div style={{ fontSize: 13.5, color: 'rgba(255,255,255,.85)', fontFamily: 'JetBrains Mono' }}>
            {(() => {
              const days = getWorkshopDays(w);
              const multi = days.length > 1;
              const lastStart = new Date(`${days[days.length - 1]}T${w.time_start}:00`);
              return multi ? (
                <>{fmtDate(start, lang)} – {fmtDate(lastStart, lang)} · {days.length} {tr(lang, 'วัน', 'days')}</>
              ) : (
                <>{fmtDate(start, lang)} · {fmtTime(start)} – {fmtTime(end)}</>
              );
            })()}
          </div>
        </div>

        <div className="cal-modal-body">
          {!past && (
            <div className="cal-countdown" style={{ marginBottom: 18 }}>
              <span className="mini">▸ {tr(lang, 'นับถอยหลัง', 'count-down')}</span>
              <Countdown target={start} lang={lang} />
            </div>
          )}

          {w.location && (
            <div className="cal-meta-row">
              <div className="lbl">{tr(lang, 'สถานที่', 'Place')}</div>
              <div>{w.location}</div>
            </div>
          )}
          {w.short_description && (
            <div className="cal-meta-row">
              <div className="lbl">{tr(lang, 'รายละเอียด', 'About')}</div>
              <div style={{ color: 'var(--muted)', lineHeight: 1.55 }}>{w.short_description}</div>
            </div>
          )}
          <div className="cal-meta-row">
            <div className="lbl">{tr(lang, 'ราคา · ที่นั่ง', 'Price · Seats')}</div>
            <div>
              {eff.isPromo ? (
                <span>
                  <span style={{ color: 'var(--teal)', fontWeight: 600 }}>
                    ฿{eff.price.toLocaleString()}
                  </span>{' '}
                  <span style={{ textDecoration: 'line-through', color: 'var(--muted)' }}>
                    ฿{eff.originalPrice.toLocaleString()}
                  </span>
                </span>
              ) : (
                <>฿{eff.price.toLocaleString()}</>
              )}{' '}
              · {w.max_participants} {tr(lang, 'ที่นั่ง', 'seats')}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 18 }}>
            <a className="gcal-btn" href={gcalUrl(w, lang)} target="_blank" rel="noopener noreferrer">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <rect x="3" y="3" width="10" height="10" rx="1" stroke="currentColor" strokeWidth="1.4" />
                <path d="M5 1 V3 M11 1 V3 M3 6 H13" stroke="currentColor" strokeWidth="1.4" />
              </svg>
              {tr(lang, 'เพิ่มลง Google Calendar', 'Add To Google Calendar')}
            </a>
            <Link
              href={`/workshops/${w.id}`}
              className="btn btn-teal"
              style={{ justifyContent: 'center', width: '100%' }}
              onClick={onClose}
            >
              {tr(lang, 'ดูรายละเอียดเต็ม', 'View full details')} <span className="mono">→</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function Countdown({ target, lang }: { target: Date; lang: 'th' | 'en' }) {
  const [now, setNow] = useState<number>(0);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  if (now === 0) return <span>—</span>;
  const diff = Math.max(0, target.getTime() - now);
  if (diff === 0) return <span>{tr(lang, 'เริ่มแล้ว', 'in progress')}</span>;
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  return (
    <span>
      {d}d {h}h {m}min {String(s).padStart(2, '0')}sec
    </span>
  );
}
