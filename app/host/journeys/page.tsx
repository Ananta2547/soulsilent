'use client';

/* Workshop เดี่ยว — design "Teacher Workshops v2": one-day workshops this
 * teacher leads, as poster cards (open first, then the rest newest first) or a
 * check-in calendar. A workshop running today gets a banner straight into its
 * roster. Round-based activities live under จัดรอบสอน. */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { Workshop } from '@/lib/types';
import { getWorkshopDays, hasWorkshopEnded } from '@/lib/workshop-utils';
import { IcoCal, IcoPin, PAY_PILL, Pill, SeatBar, TdbCalendar, TdbPager, dateOf, fmtLong, fmtMed, monthOf, todayYmd, type Month } from '@/components/teacher/tdb';

type Row = Workshop & { booked: number };
type Kind = 'open' | 'ended' | 'cancelled';

const PER_PAGE = 6;
const kindOf = (w: Row): Kind => (w.status === 'cancelled' ? 'cancelled' : w.status === 'completed' || hasWorkshopEnded(w) ? 'ended' : 'open');
const PILLS: Record<Kind, [string, string, string, string]> = {
  open: ['เปิดรับ', '#075a51', '#eaf6f4', '#0d8a7e'],
  ended: ['จบแล้ว', '#6a7a78', '#f6f1e6', '#6a7a78'],
  cancelled: ['ยกเลิก', '#9a4a3f', '#f4dad4', '#9a4a3f'],
};

export default function TeacherWorkshopsPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [view, setView] = useState<'list' | 'calendar'>('list');
  const [filter, setFilter] = useState<'all' | Kind>('all');
  const [page, setPage] = useState(1);
  const today = todayYmd();
  const [day, setDay] = useState(today);
  const [month, setMonth] = useState<Month>(monthOf(today));

  useEffect(() => {
    let alive = true;
    fetch('/api/teacher/workshops')
      .then((r) => (r.ok ? (r.json() as Promise<{ workshops?: Row[] }>) : { workshops: [] }))
      .catch(() => ({ workshops: [] as Row[] }))
      .then((d) => {
        if (alive) setRows((d.workshops || []).filter((w) => w.master_kind !== 'round'));
      });
    return () => {
      alive = false;
    };
  }, []);

  const list = useMemo(() => rows || [], [rows]);
  const sorted = useMemo(
    () =>
      [...list].sort((a, b) => {
        const ka = kindOf(a), kb = kindOf(b);
        if (ka === 'open' && kb !== 'open') return -1;
        if (kb === 'open' && ka !== 'open') return 1;
        return ka === 'open' ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date);
      }),
    [list],
  );
  const counts = {
    all: list.length,
    open: list.filter((w) => kindOf(w) === 'open').length,
    ended: list.filter((w) => kindOf(w) === 'ended').length,
    cancelled: list.filter((w) => kindOf(w) === 'cancelled').length,
  };
  const filtered = sorted.filter((w) => filter === 'all' || kindOf(w) === filter);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const current = Math.min(page, pageCount);
  const shown = filtered.slice((current - 1) * PER_PAGE, current * PER_PAGE);

  // Days each live workshop runs on — the check-in calendar.
  const byDay = useMemo(() => {
    const m: Record<string, { w: Row; i: number; n: number }[]> = {};
    list
      .filter((w) => kindOf(w) !== 'cancelled')
      .forEach((w) => {
        const days = getWorkshopDays(w);
        days.forEach((d, i) => (m[d] = m[d] || []).push({ w, i, n: days.length }));
      });
    return m;
  }, [list]);
  const marks = useMemo(() => Object.fromEntries(Object.entries(byDay).map(([d, v]) => [d, v.length])), [byDay]);
  const onDay = byDay[day] || [];
  const todayW = list.find((w) => kindOf(w) === 'open' && getWorkshopDays(w).includes(today));

  return (
    <div>
      <div className="tdb-head">
        <div>
          <span className="tdb-eyebrow">01 — กิจกรรมเดี่ยว</span>
          <h1 className="tdb-h1">กิจกรรมเดี่ยว.</h1>
          <p className="tdb-lead">
            กิจกรรมแบบวันเดียวที่คุณเป็นผู้จัด — ดูผู้สมัคร เช็คชื่อ และยอดโอน · แบบเลือกรอบอยู่ใน <Link href="/host/sessions">จัดรอบกิจกรรม →</Link>
          </p>
        </div>
        <div className="tdb-seg full" role="tablist">
          {(
            [
              ['list', 'รายการ'],
              ['calendar', 'ปฏิทินเช็คชื่อ'],
            ] as const
          ).map(([k, label]) => (
            <button key={k} type="button" role="tab" aria-selected={view === k} className={view === k ? 'on' : ''} onClick={() => setView(k)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {todayW && (
        <Link href={`/host/journeys/${todayW.id}`} className="tdb-today">
          <span className="tdb-today-date">
            <b>{dateOf(today).getDate()}</b>
            <span>{dateOf(today).toLocaleDateString('th-TH', { month: 'short' })}</span>
          </span>
          <span className="tdb-today-text">
            <small>วันนี้มีกิจกรรม</small>
            <strong>{todayW.title}</strong>
            <span>
              {todayW.time_start}–{todayW.time_end}
              {todayW.location ? ` · ${todayW.location}` : ''} · {todayW.booked} คน
            </span>
          </span>
          <span className="btn btn-sm">เช็คชื่อตอนนี้ →</span>
        </Link>
      )}

      {rows === null ? null : view === 'list' ? (
        <>
          <div className="tdb-chips">
            {(
              [
                ['all', 'ทั้งหมด'],
                ['open', 'เปิดรับ'],
                ['ended', 'จบแล้ว'],
                ['cancelled', 'ยกเลิก'],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                className={`tdb-chip ${filter === k ? 'on' : ''}`}
                onClick={() => {
                  setFilter(k);
                  setPage(1);
                }}
              >
                {label} <span className="n">{counts[k]}</span>
              </button>
            ))}
          </div>

          {shown.length === 0 ? (
            <div className="tdb-empty">
              <h3>ยังไม่มีกิจกรรมในหมวดนี้</h3>
              <p>กิจกรรมแบบรอบอยู่ในเมนู จัดรอบกิจกรรม</p>
            </div>
          ) : (
            <div className="tdb-grid">
              {shown.map((w) => {
                const k = kindOf(w);
                const days = getWorkshopDays(w);
                const isToday = k === 'open' && days.includes(today);
                const paid = w.payout_status === 'paid';
                const until = Math.round((dateOf(days[0]).getTime() - dateOf(today).getTime()) / 86400000);
                const meta = k === 'open' ? (isToday ? 'กำลังจะเริ่ม' : until > 0 ? `อีก ${until} วัน` : 'กำลังดำเนินอยู่') : k === 'ended' ? (paid ? 'ปิดงานแล้ว' : 'รอทีมงานโอน') : 'ยกเลิกโดย Admin';
                const cta = k === 'open' ? 'ผู้สมัคร / เช็คชื่อ' : k === 'ended' ? 'ดูสรุป' : 'รายละเอียด';
                return (
                  <Link key={w.id} href={`/host/journeys/${w.id}`} className="tdb-card" style={{ opacity: k === 'cancelled' ? 0.7 : 1 }}>
                    <div className="tdb-poster">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {w.image_url && <img src={w.image_url} alt="" />}
                    </div>
                    <div className="tdb-card-body">
                      <div className="tdb-card-tags">
                        <Pill s={isToday ? ['วันนี้', '#0d1e1d', '#f5c243', '#0d1e1d'] : PILLS[k]} />
                        {k !== 'cancelled' && PAY_PILL(paid)}
                      </div>
                      <h3 className="tdb-card-title">{w.title}</h3>
                      <div className="tdb-card-box">
                        <span className="tdb-card-when">
                          <IcoCal />
                          {fmtMed(days[0])}
                          {days.length > 1 ? ` · ${days.length} วัน` : ''} · {w.time_start}–{w.time_end}
                        </span>
                        {w.location && (
                          <span className="tdb-card-loc">
                            <IcoPin />
                            <span>{w.location}</span>
                          </span>
                        )}
                        <SeatBar booked={w.booked} max={w.max_participants} />
                      </div>
                      <div className="tdb-card-foot">
                        <span>{meta}</span>
                        <span className="tdb-card-cta">{cta} →</span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
          <TdbPager page={current} pageCount={pageCount} onChange={setPage} />
        </>
      ) : (
        <div className="tdb-split">
          <section className="tdb-cal">
            <TdbCalendar
              month={month}
              onMonth={setMonth}
              selected={[day]}
              marks={marks}
              markLabel={(n) => `${n} งาน`}
              subUnit="วันมีกิจกรรม"
              onlyMarked
              onPick={setDay}
              onToday={() => {
                setDay(today);
                setMonth(monthOf(today));
              }}
            >
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 14 }}>วันที่มีสี = มีกิจกรรม · กดได้เฉพาะวันที่มีกิจกรรม</div>
            </TdbCalendar>
          </section>
          <section className="tdb-side">
            <div className="tdb-dayhead">
              <div>
                <small>{onDay.length} งานในวันนี้</small>
                <h2>{fmtLong(day)}</h2>
              </div>
            </div>
            {onDay.length === 0 && <div className="tdb-dashed">ไม่มีกิจกรรมในวันนี้ — เลือกวันที่มีสีในปฏิทิน</div>}
            {onDay.map(({ w, i, n }) => (
              <Link key={w.id + i} href={`/host/journeys/${w.id}`} className="tdb-round">
                <div className="tdb-round-top">
                  <div className="tdb-round-time">
                    <b>{w.time_start}</b>
                    <span>– {w.time_end}</span>
                  </div>
                  <div className="tdb-round-info" style={{ gap: 3 }}>
                    <div className="tdb-round-title">{w.title}</div>
                    <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>{w.location || '—'}</div>
                  </div>
                </div>
                <div className="tdb-round-actions" style={{ justifyContent: 'space-between' }}>
                  <span className="tdb-bar-n" style={{ fontSize: 12 }}>
                    {w.booked}/{w.max_participants} คน · {n > 1 ? `วันที่ ${i + 1} จาก ${n}` : 'วันเดียว'}
                  </span>
                  <span className="btn btn-teal btn-sm">เช็คชื่อ →</span>
                </div>
              </Link>
            ))}
          </section>
        </div>
      )}
    </div>
  );
}
