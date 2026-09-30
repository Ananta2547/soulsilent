'use client';

/* One activity in the session manager — design "Teacher Sessions v2" (screen
 * 02 ปฏิทินรอบ): its prices, a stat strip, a month calendar of the days it
 * runs, the rounds of the picked day with a way into their roster, and the
 * next few rounds. "+ เพิ่มรอบ" opens the add popup: pick days (several at
 * once, or a daily / weekly pattern), time ranges, a venue and seats, with a
 * live summary of how many rounds that makes. Editing a round uses the same
 * popup; a round somebody booked keeps its day and time. */

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import type { WorkshopMaster } from '@/lib/types';
import { bookableTiers, parseTiers, tierDesc } from '@/lib/pricing';
import { useLang } from '@/lib/i18n';
import { DOW_TH, IcoPin, SeatBar, TdbCalendar, baht, dateOf, fmtLong, fmtMed, fmtShort, monShort, monthOf, todayYmd, type Month } from '@/components/teacher/tdb';

type Round = {
  id: string;
  master_id: string;
  title: string;
  date: string;
  time_start: string;
  time_end: string;
  location_id: string | null;
  loc_name: string | null;
  max_participants: number;
  status: string;
  booked: number;
};
type Loc = { id: string; name: string; province: string | null; district: string | null };
type Data = { masters: WorkshopMaster[]; rounds: Round[]; locations: Loc[] };
type Slot = { time_start: string; time_end: string };
type Repeat = 'once' | 'daily' | 'weekly';

const EMPTY: Data = { masters: [], rounds: [], locations: [] };
const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'));
const PRESETS = [
  { label: 'เช้า', ts: '09:00', te: '12:00' },
  { label: 'บ่าย', ts: '13:00', te: '16:00' },
  { label: 'เย็น', ts: '18:00', te: '21:00' },
];

/** Every day a daily / weekly pattern lands on, capped like the API (92). */
function patternDays(repeat: Repeat, start: string | null, end: string, weekdays: number[]): string[] {
  if (repeat === 'once' || !start || !end || end < start) return [];
  const out: string[] = [];
  const d = dateOf(start);
  const stop = dateOf(end);
  while (d <= stop && out.length < 92) {
    if (repeat === 'daily' || weekdays.includes(d.getDay())) {
      out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
    }
    d.setDate(d.getDate() + 1);
  }
  return out;
}

export default function TeacherMasterSessionsPage() {
  const { masterId } = useParams<{ masterId: string }>();
  const { lang } = useLang();
  const today = todayYmd();
  const [data, setData] = useState<Data | null>(null);
  const [day, setDay] = useState(today);
  const [month, setMonth] = useState<Month>(monthOf(today));
  // The add / edit popup.
  const [formOpen, setFormOpen] = useState(false);
  // Phones walk the popup in two sheets: 1 days, 2 time / venue / seats.
  const [mstep, setMstep] = useState<1 | 2>(1);
  const [editing, setEditing] = useState<Round | null>(null);
  const [repeat, setRepeat] = useState<Repeat>('once');
  const [dates, setDates] = useState<string[]>([]);
  const [date, setDate] = useState<string | null>(null);
  const [endDate, setEndDate] = useState('');
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [slots, setSlots] = useState<Slot[]>([{ time_start: '09:00', time_end: '12:00' }]);
  const [locationId, setLocationId] = useState('');
  const [seats, setSeats] = useState('');
  const [popMonth, setPopMonth] = useState<Month>(monthOf(today));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmR, setConfirmR] = useState<Round | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const load = () =>
    fetch('/api/teacher/sessions')
      .then((res) => (res.ok ? (res.json() as Promise<Data>) : EMPTY))
      .catch(() => EMPTY)
      .then((d) => {
        setData(d);
        return d;
      });

  useEffect(() => {
    let alive = true;
    fetch('/api/teacher/sessions')
      .then((res) => (res.ok ? (res.json() as Promise<Data>) : EMPTY))
      .catch(() => EMPTY)
      .then((d) => {
        if (!alive) return;
        setData(d);
        // Open on the nearest day with a round from today, else the latest.
        const mine = d.rounds.filter((r) => r.master_id === masterId && r.status !== 'cancelled');
        const next = mine.find((r) => r.date >= todayYmd()) || mine[mine.length - 1];
        const first = next ? next.date : todayYmd();
        setDay(first);
        setMonth(monthOf(first));
      });
    return () => {
      alive = false;
    };
  }, [masterId]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  const master = data?.masters.find((m) => m.id === masterId) || null;
  const mine = useMemo(
    () => (data?.rounds || []).filter((r) => r.status !== 'cancelled' && r.master_id === masterId).sort((a, b) => a.date.localeCompare(b.date) || a.time_start.localeCompare(b.time_start)),
    [data, masterId],
  );
  const marks = useMemo(() => {
    const m: Record<string, number> = {};
    mine.forEach((r) => (m[r.date] = (m[r.date] || 0) + 1));
    return m;
  }, [mine]);
  const upcoming = mine.filter((r) => r.date >= today);
  const onDay = mine.filter((r) => r.date === day);

  // Venues the admin allowed for this activity; none listed = every venue.
  const allowedLocs = useMemo(() => {
    if (!data) return [];
    let ids: string[] = [];
    try {
      const a = master?.location_ids_json ? (JSON.parse(master.location_ids_json) as unknown) : [];
      ids = Array.isArray(a) ? (a as string[]) : [];
    } catch {
      ids = [];
    }
    return ids.length ? data.locations.filter((l) => ids.includes(l.id)) : data.locations;
  }, [data, master]);

  function openAdd(onDate?: string) {
    if (!master) return;
    setEditing(null);
    setRepeat('once');
    setDates(onDate ? [onDate] : []);
    setDate(null);
    setEndDate('');
    setWeekdays([]);
    setSlots([{ time_start: '09:00', time_end: '12:00' }]);
    setLocationId(allowedLocs.length === 1 ? allowedLocs[0].id : '');
    setSeats(String(master.default_max_participants || 20));
    setPopMonth(monthOf(onDate || today));
    setError(null);
    setMstep(1);
    setFormOpen(true);
  }

  function startEdit(r: Round) {
    setEditing(r);
    setRepeat('once');
    setDates([r.date]);
    setDate(r.date);
    setSlots([{ time_start: r.time_start, time_end: r.time_end }]);
    setLocationId(r.location_id || '');
    setSeats(String(r.max_participants));
    setPopMonth(monthOf(r.date));
    setError(null);
    // A booked round keeps its day, so its sheet opens straight on step 2.
    setMstep(r.booked > 0 ? 2 : 1);
    setFormOpen(true);
  }

  const closeForm = () => {
    if (saving) return;
    setFormOpen(false);
    setEditing(null);
  };

  const pDays = patternDays(repeat, date, endDate, weekdays);
  const days = repeat === 'once' ? dates : pDays;
  const slotsOk = slots.length > 0 && slots.every((s) => s.time_start < s.time_end);
  const daysOk = days.length > 0;
  const priced = !!master && (master.price_group != null || parseTiers(master.price_tiers_json).length > 0);
  const ready = !!master && daysOk && slotsOk && !!locationId && priced;
  const editLocked = !!editing && editing.booked > 0;
  let skip = 0;
  if (!editing) days.forEach((d) => slots.forEach((s) => mine.some((r) => r.date === d && r.time_start === s.time_start) && skip++));
  const total = editing ? 1 : days.length * slots.length - skip;
  const minSeats = editing ? Math.max(1, editing.booked) : 1;
  const seatsNum = Number(seats) || 0;

  let dayMsg = `เลือกแล้ว ${days.length} วัน`;
  if (!daysOk) {
    if (repeat === 'once') dayMsg = 'ยังไม่ได้เลือกวันจากปฏิทิน';
    else if (!date) dayMsg = 'จิ้มวันเริ่มในปฏิทิน';
    else if (!endDate) dayMsg = 'ใส่วันสิ้นสุด';
    else if (endDate < date) dayMsg = 'วันสิ้นสุดอยู่ก่อนวันเริ่ม';
    else dayMsg = 'เลือกวันในสัปดาห์อย่างน้อย 1 วัน';
  }
  const loc = allowedLocs.find((l) => l.id === locationId) || data?.locations.find((l) => l.id === locationId) || null;
  const dayList = days.length ? (days.length <= 4 ? days.map(fmtShort).join(', ') : `${days.slice(0, 3).map(fmtShort).join(', ')} และอีก ${days.length - 3} วัน`) : '—';

  async function submit() {
    if (!master || !ready || saving) return;
    setSaving(true);
    setError(null);
    try {
      if (editing) {
        const res = await fetch(`/api/teacher/sessions/${editing.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            date: dates[0] || editing.date,
            time_start: slots[0].time_start,
            time_end: slots[0].time_end,
            location_id: locationId || undefined,
            max_participants: seatsNum || undefined,
          }),
        });
        const d = (await res.json()) as { error?: string };
        if (!res.ok) {
          setError(d.error || 'แก้ไขไม่สำเร็จ');
          return;
        }
        setFormOpen(false);
        setEditing(null);
        setToast('บันทึกการแก้ไขแล้ว');
        await load();
        return;
      }
      const res = await fetch('/api/teacher/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          master_id: master.id,
          repeat,
          dates: repeat === 'once' ? dates : undefined,
          date: repeat === 'once' ? dates[0] : date,
          end_date: repeat === 'once' ? undefined : endDate,
          weekdays: repeat === 'weekly' ? weekdays : undefined,
          slots,
          location_id: locationId,
          max_participants: seatsNum || undefined,
        }),
      });
      const d = (await res.json()) as { error?: string; created?: number; skipped?: number };
      if (!res.ok) {
        setError(d.error || 'เปิดรอบไม่สำเร็จ');
        return;
      }
      const first = days[0];
      setFormOpen(false);
      setToast(`เปิด ${d.created || 1} รอบแล้ว${d.skipped ? ` · ข้าม ${d.skipped} รอบที่มีอยู่` : ''}`);
      if (first) {
        setDay(first);
        setMonth(monthOf(first));
      }
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function doCancel() {
    if (!confirmR) return;
    const r = confirmR;
    setConfirmR(null);
    const res = await fetch(`/api/teacher/sessions/${r.id}`, { method: 'DELETE' });
    const d = (await res.json()) as { error?: string };
    setToast(res.ok ? 'ยกเลิกรอบแล้ว' : d.error || 'ยกเลิกไม่สำเร็จ');
    if (res.ok) await load();
  }

  const togglePreset = (p: { ts: string; te: string }, on: boolean) =>
    setSlots((x) =>
      on
        ? x.length > 1
          ? x.filter((s) => !(s.time_start === p.ts && s.time_end === p.te))
          : x
        : [...x, { time_start: p.ts, time_end: p.te }].sort((a, b) => a.time_start.localeCompare(b.time_start)),
    );

  const setSlot = (i: number, key: keyof Slot, part: 'h' | 'm', v: string) =>
    setSlots((x) =>
      x.map((sl, j) => {
        if (j !== i) return sl;
        const [h, mi] = sl[key].split(':');
        return { ...sl, [key]: part === 'h' ? `${v}:${mi}` : `${h}:${v}` };
      }),
    );

  if (data === null) return null;
  if (!master) {
    return (
      <div>
        <Link href="/host/sessions" className="tdb-back">← กิจกรรมทั้งหมด</Link>
        <div className="tdb-empty" style={{ marginTop: 18 }}>
          <p>ไม่พบกิจกรรมนี้ หรือไม่ได้อยู่ในความดูแลของคุณ</p>
        </div>
      </div>
    );
  }

  const nx = upcoming[0];
  const bookedUp = upcoming.reduce((a, r) => a + r.booked, 0);
  const capUp = upcoming.reduce((a, r) => a + r.max_participants, 0);

  return (
    <div>
      <Link href="/host/sessions" className="tdb-back">← กิจกรรมทั้งหมด</Link>

      <div className="tdb-head" style={{ margin: '18px 0 24px' }}>
        <div style={{ flex: 1, minWidth: 280, maxWidth: 'none' }}>
          <h1 className="tdb-h1 sm">{master.title}</h1>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {bookableTiers(master).map((t) => (
              <span key={t.id} className="tdb-tier">
                {t.label} <b>{baht(t.price)}</b> <span style={{ fontSize: 12 }}>{tierDesc(t, lang)}</span>
              </span>
            ))}
            {!priced && <span className="tdb-warn-pill">⚠ Admin ยังไม่ได้ตั้งราคา</span>}
          </div>
        </div>
        <button type="button" className="btn btn-teal" onClick={() => openAdd()}>
          <span style={{ fontSize: 18, lineHeight: 1 }}>+</span> เพิ่มรอบ
        </button>
      </div>

      <div className="tdb-stats">
        <div>
          <span className="tdb-mono-label">รอบที่เปิดอยู่</span>
          <b>
            {upcoming.length} <small>รอบ</small>
          </b>
        </div>
        <div>
          <span className="tdb-mono-label">จองแล้ว</span>
          <b>
            {bookedUp}/{capUp} <small>ที่นั่ง</small>
          </b>
        </div>
        <div>
          <span className="tdb-mono-label">รอบถัดไป</span>
          <b>
            {nx ? fmtShort(nx.date) : '—'} <small>{nx ? `${nx.time_start} น.` : ''}</small>
          </b>
        </div>
      </div>

      <div className="tdb-split">
        <section className="tdb-cal">
          <TdbCalendar
            month={month}
            onMonth={setMonth}
            selected={[day]}
            marks={marks}
            onPick={setDay}
            onToday={() => {
              setDay(today);
              setMonth(monthOf(today));
            }}
          >
            <div className="tdb-legend">
              <span>
                <i style={{ background: '#eaf6f4' }} />
                มีรอบ
              </span>
              <span>
                <i style={{ background: 'var(--teal)' }} />
                วันที่เลือก
              </span>
              <span>
                <i style={{ width: 6, height: 6, borderRadius: 99, background: 'var(--accent)' }} />
                วันนี้
              </span>
            </div>
          </TdbCalendar>
        </section>

        <section className="tdb-side">
          <div className="tdb-dayhead">
            <div>
              <small>{onDay.length} รอบในวันนี้</small>
              <h2>{fmtLong(day)}</h2>
            </div>
            {day >= today && (
              <button type="button" className="btn btn-paper btn-sm" onClick={() => openAdd(day)}>
                + เพิ่มรอบวันนี้
              </button>
            )}
          </div>

          {onDay.length === 0 && (
            <div className="tdb-dashed" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <span style={{ fontFamily: "'Mitr', sans-serif", fontWeight: 500, fontSize: 17, color: 'var(--ink)' }}>วันนี้ยังว่างอยู่</span>
              <span style={{ fontSize: 13 }}>{day < today ? 'วันนี้ผ่านไปแล้ว' : 'กด "+ เพิ่มรอบวันนี้" เพื่อเปิดรอบในวันนี้'}</span>
            </div>
          )}

          {onDay.map((r) => {
            const full = r.booked >= r.max_participants;
            return (
              <div key={r.id} className="tdb-round">
                <div className="tdb-round-top">
                  <div className="tdb-round-time">
                    <b>{r.time_start}</b>
                    <span>– {r.time_end}</span>
                  </div>
                  <div className="tdb-round-info">
                    <span className="tdb-round-loc">
                      <IcoPin />
                      {r.loc_name || 'ยังไม่ระบุสถานที่'}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ flex: 1 }}>
                        <SeatBar booked={r.booked} max={r.max_participants} soft />
                      </div>
                      {full && (
                        <span className="tag tag-accent" style={{ padding: '3px 9px', fontSize: 10 }}>
                          เต็ม
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="tdb-round-actions">
                  <Link href={`/host/sessions/round/${r.id}`} className="btn btn-teal btn-sm">
                    เช็คชื่อ →
                  </Link>
                  <button type="button" className="tdb-soft-btn" style={{ padding: '9px 16px', fontSize: 13 }} onClick={() => startEdit(r)}>
                    แก้ไข
                  </button>
                  {r.booked === 0 ? (
                    <button type="button" className="tdb-link-danger" onClick={() => setConfirmR(r)}>
                      ยกเลิกรอบ
                    </button>
                  ) : r.date >= today ? (
                    <span className="tdb-hide-phone" style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--muted)' }}>
                      มีผู้จองแล้ว · ยกเลิกไม่ได้
                    </span>
                  ) : null}
                </div>
              </div>
            );
          })}

          {upcoming.length > 0 && (
            <div className="tdb-upcoming">
              <span className="tdb-mono-label">รอบถัดไป</span>
              <div style={{ display: 'flex', flexDirection: 'column', marginTop: 8 }}>
                {upcoming.slice(0, 5).map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    className={r.date === day ? 'on' : ''}
                    onClick={() => {
                      setDay(r.date);
                      setMonth(monthOf(r.date));
                    }}
                  >
                    <span className="dd">
                      <b>{dateOf(r.date).getDate()}</b>
                      <span>{monShort(r.date)}</span>
                    </span>
                    <span style={{ flex: 1, minWidth: 0, fontFamily: 'var(--font-mono)', fontSize: 13 }}>
                      {r.time_start}–{r.time_end}
                    </span>
                    <span className="tdb-bar-n">
                      {r.booked}/{r.max_participants}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>

      {/* ============ add / edit popup (desktop) ============ */}
      {formOpen && (
        <div className="tdb-backdrop tdb-hide-phone" onMouseDown={(e) => e.target === e.currentTarget && closeForm()}>
          <section className="tdb-modal tdb-add" role="dialog" aria-modal="true" aria-label={master.title}>
            <div className="tdb-add-form">
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 6 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span className="tdb-eyebrow" style={{ fontSize: 11 }}>{editing ? 'แก้ไขรอบ' : 'เพิ่มรอบใหม่'}</span>
                  <h2 style={{ fontFamily: "'Mitr', sans-serif", fontWeight: 500, fontSize: 24, lineHeight: 1.2, margin: '8px 0 0' }}>{master.title}</h2>
                </div>
                <button type="button" className="tdb-x" onClick={closeForm} aria-label="ปิด">
                  ×
                </button>
              </div>

              {editLocked && (
                <div className="tdb-note-warn" style={{ marginTop: 16 }}>
                  <span style={{ fontWeight: 700 }}>🔒</span>
                  <span>รอบนี้มีผู้จองแล้ว {editing?.booked} คน — เปลี่ยนวันและเวลาไม่ได้ แก้ได้เฉพาะสถานที่และจำนวนที่นั่ง</span>
                </div>
              )}

              {/* Step 1 — days */}
              <div className="tdb-step">
                <div className="tdb-step-head">
                  <span className={`tdb-step-n ${daysOk ? 'ok' : ''}`}>{daysOk ? '✓' : '1'}</span>
                  <span className="tdb-step-t">เลือกวัน</span>
                  {!editing && (
                    <div className="tdb-repeat" role="radiogroup">
                      {(
                        [
                          ['once', 'เลือกวันเอง'],
                          ['daily', 'ทุกวัน'],
                          ['weekly', 'ทุกสัปดาห์'],
                        ] as const
                      ).map(([k, label]) => (
                        <button
                          key={k}
                          type="button"
                          role="radio"
                          aria-checked={repeat === k}
                          className={repeat === k ? 'on' : ''}
                          onClick={() => {
                            setRepeat(k);
                            setPopMonth(monthOf(k === 'once' ? dates[0] || today : date || today));
                          }}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {!editLocked && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'flex-start' }}>
                    <div style={{ flex: '1 1 320px', minWidth: 0, userSelect: 'none' }}>
                      <TdbCalendar
                        small
                        month={popMonth}
                        onMonth={setPopMonth}
                        selected={repeat === 'once' ? dates : date ? [date] : []}
                        preview={repeat === 'once' ? undefined : new Set(pDays)}
                        marks={marks}
                        floor={today}
                        onPick={(d) => {
                          if (repeat !== 'once') setDate(d);
                          else if (editing) setDates([d]);
                          else setDates((x) => (x.includes(d) ? x.filter((v) => v !== d) : [...x, d].sort()));
                        }}
                      />
                    </div>
                    <div style={{ flex: '1 1 180px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {repeat === 'once' ? (
                        <>
                          <span style={{ fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.55 }}>
                            {editing ? 'จิ้มวันใหม่ในปฏิทินเพื่อย้ายรอบ' : dates.length ? 'จิ้มซ้ำเพื่อเอาวันออก' : 'จิ้มวันในปฏิทิน เลือกได้หลายวันพร้อมกัน'}
                          </span>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            {dates.map((d) => (
                              <span key={d} className="tdb-datetag">
                                {fmtShort(d)}
                                {!editing && (
                                  <button type="button" aria-label="เอาออก" onClick={() => setDates((x) => x.filter((v) => v !== d))}>
                                    ×
                                  </button>
                                )}
                              </span>
                            ))}
                          </div>
                          {!editing && dates.length > 1 && (
                            <button type="button" onClick={() => setDates([])} style={{ alignSelf: 'flex-start', border: 0, background: 'transparent', padding: 0, font: 'inherit', fontSize: 12.5, color: 'var(--muted)', cursor: 'pointer', textDecoration: 'underline' }}>
                              ล้างทั้งหมด
                            </button>
                          )}
                        </>
                      ) : (
                        <>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <span className="tdb-mono-label" style={{ fontSize: 10 }}>เริ่ม</span>
                            <span style={{ fontSize: 14, fontWeight: 600, color: date ? 'var(--teal-deep)' : 'var(--muted)' }}>{date ? fmtMed(date) : 'จิ้มวันในปฏิทิน'}</span>
                          </div>
                          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <span className="tdb-mono-label" style={{ fontSize: 10 }}>ถึงวันที่</span>
                            <input type="date" value={endDate} min={date || today} onChange={(e) => setEndDate(e.target.value)} className="field" style={{ padding: '11px 14px', fontSize: 14 }} />
                          </label>
                          {repeat === 'weekly' && (
                            <>
                              <span className="tdb-mono-label" style={{ fontSize: 10 }}>ทุกวัน</span>
                              <div className="tdb-dowbtns">
                                {DOW_TH.map((d, i) => (
                                  <button
                                    key={d}
                                    type="button"
                                    aria-pressed={weekdays.includes(i)}
                                    className={weekdays.includes(i) ? 'on' : ''}
                                    onClick={() => setWeekdays((w) => (w.includes(i) ? w.filter((x) => x !== i) : [...w, i].sort()))}
                                  >
                                    {d}
                                  </button>
                                ))}
                              </div>
                            </>
                          )}
                          <span style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.55 }}>วันที่จะเปิดรอบแสดงเป็นสีเขียวอ่อนในปฏิทิน · สูงสุด 92 วันต่อครั้ง</span>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Step 2 — time */}
              <div className="tdb-step">
                <div className="tdb-step-head">
                  <span className={`tdb-step-n ${slotsOk ? 'ok' : ''}`}>{slotsOk ? '✓' : '2'}</span>
                  <span className="tdb-step-t">ช่วงเวลา</span>
                  <span className="tdb-step-hint">เลือกได้หลายช่วงต่อวัน</span>
                </div>
                {!editing && (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                    {PRESETS.map((p) => {
                      const on = slots.some((s) => s.time_start === p.ts && s.time_end === p.te);
                      return (
                        <button
                          key={p.label}
                          type="button"
                          className={`tdb-preset ${on ? 'on' : ''}`}
                          onClick={() =>
                            setSlots((x) =>
                              on
                                ? x.length > 1
                                  ? x.filter((s) => !(s.time_start === p.ts && s.time_end === p.te))
                                  : x
                                : [...x, { time_start: p.ts, time_end: p.te }].sort((a, b) => a.time_start.localeCompare(b.time_start)),
                            )
                          }
                        >
                          <b>{p.label}</b>
                          <span>
                            {p.ts}–{p.te}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {slots.map((sl, i) => {
                    const pr = PRESETS.find((p) => p.ts === sl.time_start && p.te === sl.time_end);
                    return (
                      <div key={i} className="tdb-slot">
                        <span className="tdb-slot-label">{pr ? pr.label : `ช่วง ${i + 1}`}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <select aria-label="ชั่วโมงเริ่ม" value={sl.time_start.slice(0, 2)} disabled={editLocked} onChange={(e) => setSlot(i, 'time_start', 'h', e.target.value)}>
                            {HOURS.map((h) => <option key={h} value={h}>{h}</option>)}
                          </select>
                          <b>:</b>
                          <select aria-label="นาทีเริ่ม" value={sl.time_start.slice(3)} disabled={editLocked} onChange={(e) => setSlot(i, 'time_start', 'm', e.target.value)}>
                            {MINUTES.map((m) => <option key={m} value={m}>{m}</option>)}
                          </select>
                        </div>
                        <span style={{ color: 'var(--muted)' }}>→</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <select aria-label="ชั่วโมงจบ" value={sl.time_end.slice(0, 2)} disabled={editLocked} onChange={(e) => setSlot(i, 'time_end', 'h', e.target.value)}>
                            {HOURS.map((h) => <option key={h} value={h}>{h}</option>)}
                          </select>
                          <b>:</b>
                          <select aria-label="นาทีจบ" value={sl.time_end.slice(3)} disabled={editLocked} onChange={(e) => setSlot(i, 'time_end', 'm', e.target.value)}>
                            {MINUTES.map((m) => <option key={m} value={m}>{m}</option>)}
                          </select>
                          <span style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 2 }}>น.</span>
                        </div>
                        {sl.time_end <= sl.time_start && <span style={{ fontSize: 12, color: '#a04a14', fontWeight: 500 }}>เวลาจบต้องหลังเวลาเริ่ม</span>}
                        {!editing && slots.length > 1 && (
                          <button type="button" className="tdb-slot-x" aria-label="ลบช่วงเวลา" onClick={() => setSlots((x) => x.filter((_, j) => j !== i))}>
                            ✕
                          </button>
                        )}
                      </div>
                    );
                  })}
                  {!editing && (
                    <button type="button" className="tdb-textlink" onClick={() => setSlots((x) => [...x, { time_start: '10:00', time_end: '12:00' }])}>
                      + กำหนดช่วงเวลาเอง
                    </button>
                  )}
                </div>
              </div>

              {/* Step 3 — venue */}
              <div className="tdb-step">
                <div className="tdb-step-head">
                  <span className={`tdb-step-n ${locationId ? 'ok' : ''}`}>{locationId ? '✓' : '3'}</span>
                  <span className="tdb-step-t">สถานที่</span>
                  {allowedLocs.length < data.locations.length && <span className="tdb-step-hint">Admin อนุญาต {allowedLocs.length} แห่ง</span>}
                </div>
                {allowedLocs.length === 0 ? (
                  <div className="tdb-note-warn">ยังไม่มีสถานที่ให้เลือกสำหรับกิจกรรมนี้ — ติดต่อ Admin ให้เพิ่มสถานที่</div>
                ) : (
                  <div className="tdb-locs">
                    {allowedLocs.map((l) => (
                      <button key={l.id} type="button" aria-pressed={locationId === l.id} className={`tdb-loc ${locationId === l.id ? 'on' : ''}`} onClick={() => setLocationId(l.id)}>
                        <span className="dot">
                          <i />
                        </span>
                        <span style={{ minWidth: 0 }}>
                          <b>{l.name}</b>
                          {l.province && <small>{l.province}</small>}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Step 4 — seats */}
              <div className="tdb-step">
                <div className="tdb-step-head" style={{ marginBottom: 0 }}>
                  <span className="tdb-step-n ok">✓</span>
                  <span className="tdb-step-t">จำนวนที่นั่งต่อรอบ</span>
                  <div className="tdb-stepper">
                    <button type="button" aria-label="ลด" onClick={() => setSeats(String(Math.max(minSeats, seatsNum - 1)))}>
                      −
                    </button>
                    <input type="number" value={seats} min={minSeats} onChange={(e) => setSeats(e.target.value)} aria-label="จำนวนที่นั่ง" />
                    <button type="button" aria-label="เพิ่ม" onClick={() => setSeats(String(seatsNum + 1))}>
                      +
                    </button>
                  </div>
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 8 }}>
                  {editing && editing.booked ? `จองแล้ว ${editing.booked} ที่ — ลดต่ำกว่านี้ไม่ได้` : `ค่าเริ่มต้นจาก Admin ${master.default_max_participants ?? 20} ที่นั่ง`}
                </div>
              </div>
            </div>

            {/* Summary */}
            <aside className="tdb-add-sum">
              <span className="tdb-mono-label" style={{ letterSpacing: '.16em' }}>{editing ? 'สรุปการแก้ไข' : 'สรุปก่อนเปิดรอบ'}</span>
              <div>
                <div className="tdb-sum-big">
                  <b>{Math.max(0, total)}</b>
                  <span>รอบ</span>
                </div>
                <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 8 }}>
                  {editing ? 'แก้ไขรอบเดียว' : repeat === 'once' ? `${days.length} วัน × ${slots.length} ช่วงเวลา` : `${repeat === 'daily' ? 'ทุกวัน' : 'ทุกสัปดาห์'} · ${days.length} วัน × ${slots.length} ช่วงเวลา`}
                </div>
              </div>
              <div className="tdb-sum-rows">
                {editing && (
                  <div>
                    <span className="k">เดิม</span>
                    <span className="v" style={{ color: 'var(--muted)' }}>
                      {fmtShort(editing.date)} · {editing.time_start}–{editing.time_end}
                    </span>
                  </div>
                )}
                <div>
                  <span className="k">วันที่</span>
                  <span className="v" style={{ color: days.length ? 'var(--ink)' : 'var(--muted)' }}>{dayList}</span>
                </div>
                <div>
                  <span className="k">เวลา</span>
                  <span className="v">{slots.map((s) => `${s.time_start}–${s.time_end}`).join(' · ')}</span>
                </div>
                <div>
                  <span className="k">สถานที่</span>
                  <span className="v" style={{ color: loc ? 'var(--ink)' : 'var(--muted)' }}>{loc ? loc.name : '—'}</span>
                </div>
                <div>
                  <span className="k">ที่นั่ง</span>
                  <span className="v">{seatsNum} ที่ / รอบ</span>
                </div>
              </div>
              {skip > 0 && <div className="tdb-note-ok">ข้าม {skip} รอบที่มีอยู่แล้วในวันและเวลาเดียวกัน</div>}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                <div className={`tdb-check ${daysOk ? 'ok' : ''}`}>
                  <i>{daysOk ? '✓' : ''}</i>
                  <span>{dayMsg}</span>
                </div>
                <div className={`tdb-check ${slotsOk ? 'ok' : ''}`}>
                  <i>{slotsOk ? '✓' : ''}</i>
                  <span>{slotsOk ? 'ช่วงเวลาถูกต้อง' : 'เวลาเริ่มต้องอยู่ก่อนเวลาจบ'}</span>
                </div>
                <div className={`tdb-check ${locationId ? 'ok' : ''}`}>
                  <i>{locationId ? '✓' : ''}</i>
                  <span>{locationId ? 'เลือกสถานที่แล้ว' : allowedLocs.length ? 'ยังไม่ได้เลือกสถานที่' : 'ยังไม่มีสถานที่ — ติดต่อ Admin'}</span>
                </div>
                {!priced && (
                  <div className="tdb-check bad">
                    <i>!</i>
                    <span>Admin ยังไม่ได้ตั้งราคา — ติดต่อ Admin ก่อนเปิดรอบ</span>
                  </div>
                )}
              </div>
              {error && <div className="tdb-note-warn">{error}</div>}
              <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 4 }}>
                <button
                  type="button"
                  className="btn btn-teal"
                  onClick={submit}
                  disabled={!ready || saving}
                  style={{ justifyContent: 'center', width: '100%', padding: '16px 22px', fontSize: 15.5, opacity: ready ? 1 : 0.45, cursor: ready ? 'pointer' : 'not-allowed' }}
                >
                  {saving ? 'กำลังบันทึก…' : editing ? 'บันทึกการแก้ไข' : total > 0 ? `เปิด ${total} รอบ` : 'เปิดรอบ'} <span className="mono">→</span>
                </button>
                <button type="button" onClick={closeForm} style={{ border: 0, background: 'transparent', padding: 10, font: 'inherit', fontSize: 13.5, fontWeight: 500, color: 'var(--muted)', cursor: 'pointer' }}>
                  ยกเลิก
                </button>
              </div>
            </aside>
          </section>
        </div>
      )}


      {/* ============ add / edit sheet (phone, 2 steps) ============ */}
      {formOpen && (
        <div className="tdb-sheet-back tdb-phone-only" onMouseDown={(e) => e.target === e.currentTarget && closeForm()}>
          <section className="tdb-sheet" role="dialog" aria-modal="true" aria-label={master.title}>
            <div className="tdb-sheet-grab" />
            {mstep === 1 ? (
              <>
                <div className="tdb-sheet-head">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span className="tdb-sheet-eyebrow">{editing ? 'แก้ไขรอบ' : 'เพิ่มรอบใหม่'} · 1/2</span>
                    <div style={{ fontFamily: "'Mitr', sans-serif", fontSize: 19, lineHeight: 1.2, marginTop: 4 }}>{master.title}</div>
                  </div>
                  <button type="button" className="tdb-x" style={{ width: 36, height: 36, fontSize: 19 }} onClick={closeForm} aria-label="ปิด">
                    ×
                  </button>
                </div>
                <div className="tdb-sheet-body">
                  {!editing && (
                    <div className="tdb-repeat tdb-sheet-repeat" role="radiogroup">
                      {(
                        [
                          ['once', 'เลือกวันเอง'],
                          ['daily', 'ทุกวัน'],
                          ['weekly', 'ทุกสัปดาห์'],
                        ] as const
                      ).map(([k, label]) => (
                        <button
                          key={k}
                          type="button"
                          role="radio"
                          aria-checked={repeat === k}
                          className={repeat === k ? 'on' : ''}
                          onClick={() => {
                            setRepeat(k);
                            setPopMonth(monthOf(k === 'once' ? dates[0] || today : date || today));
                          }}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  )}
                  {repeat === 'weekly' && (
                    <>
                      <div className="tdb-mono-label" style={{ fontSize: 10, marginBottom: 8 }}>ทุกวัน</div>
                      <div className="tdb-dowbtns tdb-sheet-dow">
                        {DOW_TH.map((d, i) => (
                          <button
                            key={d}
                            type="button"
                            aria-pressed={weekdays.includes(i)}
                            className={weekdays.includes(i) ? 'on' : ''}
                            onClick={() => setWeekdays((w) => (w.includes(i) ? w.filter((x) => x !== i) : [...w, i].sort()))}
                          >
                            {d}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                  {repeat !== 'once' && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
                      <div className="tdb-sheet-box">
                        <div className="tdb-mono-label" style={{ fontSize: 9.5 }}>เริ่ม · จิ้มในปฏิทิน</div>
                        <div style={{ fontSize: 14, fontWeight: 600, marginTop: 2, color: date ? 'var(--teal-deep)' : 'var(--muted)' }}>{date ? fmtShort(date) : '—'}</div>
                      </div>
                      <label className="tdb-sheet-box">
                        <div className="tdb-mono-label" style={{ fontSize: 9.5 }}>ถึงวันที่</div>
                        <input type="date" value={endDate} min={date || today} onChange={(e) => setEndDate(e.target.value)} style={{ border: 0, background: 'transparent', font: 'inherit', fontSize: 14, fontWeight: 600, padding: 0, marginTop: 2, width: '100%', color: 'var(--ink)', outline: 'none' }} />
                      </label>
                    </div>
                  )}
                  <TdbCalendar
                    small
                    month={popMonth}
                    onMonth={setPopMonth}
                    selected={repeat === 'once' ? dates : date ? [date] : []}
                    preview={repeat === 'once' ? undefined : new Set(pDays)}
                    marks={marks}
                    floor={today}
                    onPick={(d) => {
                      if (repeat !== 'once') setDate(d);
                      else if (editing) setDates([d]);
                      else setDates((x) => (x.includes(d) ? x.filter((v) => v !== d) : [...x, d].sort()));
                    }}
                  />
                  {repeat === 'once' && (
                    <>
                      <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 12 }}>
                        {editing ? 'จิ้มวันใหม่ในปฏิทินเพื่อย้ายรอบ' : dates.length ? 'จิ้มซ้ำเพื่อเอาวันออก' : 'จิ้มวันในปฏิทิน เลือกได้หลายวันพร้อมกัน'}
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                        {dates.map((d) => (
                          <span key={d} className="tdb-datetag" style={{ fontSize: 13, padding: '6px 6px 6px 13px' }}>
                            {fmtShort(d)}
                            {!editing && (
                              <button type="button" aria-label="เอาออก" style={{ width: 22, height: 22 }} onClick={() => setDates((x) => x.filter((v) => v !== d))}>
                                ×
                              </button>
                            )}
                          </span>
                        ))}
                      </div>
                    </>
                  )}
                </div>
                <div className="tdb-sheet-foot">
                  <div style={{ flex: 1 }}>
                    <div className="tdb-mono-label" style={{ fontSize: 10 }}>เลือกแล้ว</div>
                    <div style={{ fontFamily: "'Mitr', sans-serif", fontSize: 18 }}>{daysOk ? `${days.length} วัน` : '—'}</div>
                  </div>
                  <button type="button" className="btn btn-teal" style={{ padding: '15px 22px', opacity: daysOk ? 1 : 0.45 }} disabled={!daysOk} onClick={() => setMstep(2)}>
                    ถัดไป · เวลา →
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="tdb-sheet-head" style={{ alignItems: 'center' }}>
                  {!editLocked && (
                    <button type="button" className="tdb-x" style={{ width: 36, height: 36, fontSize: 18 }} onClick={() => setMstep(1)} aria-label="ย้อนกลับ">
                      ‹
                    </button>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span className="tdb-sheet-eyebrow">{editing ? 'แก้ไขรอบ' : 'เพิ่มรอบใหม่'} · 2/2</span>
                    <div style={{ fontFamily: "'Mitr', sans-serif", fontSize: 17, lineHeight: 1.2, marginTop: 2 }}>เวลา สถานที่ และที่นั่ง</div>
                  </div>
                  <button type="button" className="tdb-x" style={{ width: 36, height: 36, fontSize: 19 }} onClick={closeForm} aria-label="ปิด">
                    ×
                  </button>
                </div>
                <div className="tdb-sheet-body" style={{ paddingTop: 4, display: 'flex', flexDirection: 'column', gap: 20 }}>
                  {editLocked && <div className="tdb-note-warn">🔒 รอบนี้มีผู้จองแล้ว {editing?.booked} คน — เปลี่ยนวันและเวลาไม่ได้ แก้ได้เฉพาะสถานที่และจำนวนที่นั่ง</div>}
                  <div>
                    <div className="tdb-step-head" style={{ marginBottom: 10 }}>
                      <span className={`tdb-step-n ${slotsOk ? 'ok' : ''}`} style={{ width: 24, height: 24, fontSize: 11 }}>{slotsOk ? '✓' : '1'}</span>
                      <span className="tdb-step-t" style={{ fontSize: 16 }}>ช่วงเวลา</span>
                    </div>
                    {!editing && (
                      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                        {PRESETS.map((p) => {
                          const on = slots.some((x) => x.time_start === p.ts && x.time_end === p.te);
                          return (
                            <button key={p.label} type="button" className={`tdb-sheet-preset ${on ? 'on' : ''}`} onClick={() => togglePreset(p, on)}>
                              <b>{p.label}</b>
                              <span>
                                {p.ts}–{p.te}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {slots.map((sl, i) => {
                        const pr = PRESETS.find((p) => p.ts === sl.time_start && p.te === sl.time_end);
                        return (
                          <div key={i} className="tdb-slot tdb-sheet-slot">
                            <span className="tdb-slot-label" style={{ width: 38, fontSize: 10 }}>{pr ? pr.label : `ช่วง ${i + 1}`}</span>
                            <select aria-label="ชั่วโมงเริ่ม" value={sl.time_start.slice(0, 2)} disabled={editLocked} onChange={(e) => setSlot(i, 'time_start', 'h', e.target.value)}>
                              {HOURS.map((h) => <option key={h} value={h}>{h}</option>)}
                            </select>
                            <select aria-label="นาทีเริ่ม" value={sl.time_start.slice(3)} disabled={editLocked} onChange={(e) => setSlot(i, 'time_start', 'm', e.target.value)}>
                              {MINUTES.map((m) => <option key={m} value={m}>{m}</option>)}
                            </select>
                            <span style={{ color: 'var(--muted)' }}>→</span>
                            <select aria-label="ชั่วโมงจบ" value={sl.time_end.slice(0, 2)} disabled={editLocked} onChange={(e) => setSlot(i, 'time_end', 'h', e.target.value)}>
                              {HOURS.map((h) => <option key={h} value={h}>{h}</option>)}
                            </select>
                            <select aria-label="นาทีจบ" value={sl.time_end.slice(3)} disabled={editLocked} onChange={(e) => setSlot(i, 'time_end', 'm', e.target.value)}>
                              {MINUTES.map((m) => <option key={m} value={m}>{m}</option>)}
                            </select>
                            {!editing && slots.length > 1 && (
                              <button type="button" className="tdb-slot-x" aria-label="ลบช่วงเวลา" onClick={() => setSlots((x) => x.filter((_, j) => j !== i))}>
                                ✕
                              </button>
                            )}
                            {sl.time_end <= sl.time_start && <span style={{ width: '100%', fontSize: 11.5, color: '#a04a14', paddingLeft: 44 }}>เวลาจบต้องหลังเวลาเริ่ม</span>}
                          </div>
                        );
                      })}
                    </div>
                    {!editing && (
                      <button type="button" className="tdb-textlink" style={{ padding: '8px 0 0' }} onClick={() => setSlots((x) => [...x, { time_start: '10:00', time_end: '12:00' }])}>
                        + กำหนดช่วงเวลาเอง
                      </button>
                    )}
                  </div>
                  <div>
                    <div className="tdb-step-head" style={{ marginBottom: 10 }}>
                      <span className={`tdb-step-n ${locationId ? 'ok' : ''}`} style={{ width: 24, height: 24, fontSize: 11 }}>{locationId ? '✓' : '2'}</span>
                      <span className="tdb-step-t" style={{ fontSize: 16 }}>สถานที่</span>
                      {allowedLocs.length < data.locations.length && <span style={{ fontSize: 12, color: 'var(--muted)' }}>Admin อนุญาต {allowedLocs.length} แห่ง</span>}
                    </div>
                    {allowedLocs.length === 0 ? (
                      <div className="tdb-note-warn">ยังไม่มีสถานที่ให้เลือกสำหรับกิจกรรมนี้ — ติดต่อ Admin ให้เพิ่มสถานที่</div>
                    ) : (
                      <div className="tdb-locs" style={{ gap: 6 }}>
                        {allowedLocs.map((l) => (
                          <button key={l.id} type="button" aria-pressed={locationId === l.id} className={`tdb-loc ${locationId === l.id ? 'on' : ''}`} onClick={() => setLocationId(l.id)}>
                            <span className="dot">
                              <i />
                            </span>
                            <span style={{ minWidth: 0 }}>
                              <b>{l.name}</b>
                              {l.province && <small>{l.province}</small>}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontFamily: "'Mitr', sans-serif", fontSize: 16, flex: 1 }}>ที่นั่งต่อรอบ</span>
                    <div className="tdb-stepper" style={{ marginLeft: 0 }}>
                      <button type="button" aria-label="ลด" style={{ width: 38, height: 38 }} onClick={() => setSeats(String(Math.max(minSeats, seatsNum - 1)))}>
                        −
                      </button>
                      <input type="number" value={seats} min={minSeats} onChange={(e) => setSeats(e.target.value)} aria-label="จำนวนที่นั่ง" style={{ width: 44 }} />
                      <button type="button" aria-label="เพิ่ม" style={{ width: 38, height: 38 }} onClick={() => setSeats(String(seatsNum + 1))}>
                        +
                      </button>
                    </div>
                  </div>
                </div>
                <div className="tdb-sheet-sum">
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontFamily: "'Mitr', sans-serif", fontSize: 36, color: 'var(--teal)', lineHeight: 1 }}>{Math.max(0, total)}</span>
                    <span style={{ fontFamily: "'Mitr', sans-serif", fontSize: 16 }}>รอบ</span>
                    <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>{editing ? 'แก้ไขรอบเดียว' : `${days.length} วัน × ${slots.length} ช่วงเวลา`}{skip ? ` · ข้าม ${skip}` : ''}</span>
                  </div>
                  {!slotsOk && <div className="tdb-check bad"><i>!</i><span>เวลาเริ่มต้องอยู่ก่อนเวลาจบ</span></div>}
                  {!locationId && <div className="tdb-check bad"><i>!</i><span>{allowedLocs.length ? 'ยังไม่ได้เลือกสถานที่' : 'ยังไม่มีสถานที่ — ติดต่อ Admin'}</span></div>}
                  {!priced && <div className="tdb-check bad"><i>!</i><span>Admin ยังไม่ได้ตั้งราคา — ติดต่อ Admin ก่อนเปิดรอบ</span></div>}
                  {error && <div className="tdb-note-warn">{error}</div>}
                  <button type="button" className="btn btn-teal" onClick={submit} disabled={!ready || saving} style={{ justifyContent: 'center', padding: 16, opacity: ready ? 1 : 0.45 }}>
                    {saving ? 'กำลังบันทึก…' : editing ? 'บันทึกการแก้ไข' : total > 0 ? `เปิด ${total} รอบ` : 'เปิดรอบ'} →
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      )}

      {/* ============ confirm cancel ============ */}
      {confirmR && (
        <div className="tdb-backdrop center" style={{ zIndex: 120 }} onMouseDown={(e) => e.target === e.currentTarget && setConfirmR(null)}>
          <section className="tdb-modal" role="alertdialog" aria-modal="true" style={{ maxWidth: 420, padding: 28, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ width: 52, height: 52, borderRadius: 99, background: '#fde7d3', color: '#a04a14', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <rect x="3.5" y="5" width="17" height="15" rx="2" strokeWidth="1.8" />
                <path strokeLinecap="round" strokeWidth="1.8" d="M8 3v4M16 3v4M3.5 10h17M10 13.5l4 4M14 13.5l-4 4" />
              </svg>
            </div>
            <div>
              <h3 style={{ fontFamily: "'Mitr', sans-serif", fontWeight: 500, fontSize: 22, margin: '0 0 6px' }}>ยกเลิกรอบนี้?</h3>
              <p style={{ margin: 0, fontSize: 14, color: 'var(--muted)', lineHeight: 1.6 }}>รอบนี้ยังไม่มีผู้จอง ยกเลิกแล้วจะหายจากหน้าจองทันที</p>
            </div>
            <div style={{ background: 'var(--cream)', borderRadius: 16, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 15, fontWeight: 700 }}>
                {confirmR.time_start}–{confirmR.time_end}
              </span>
              <span style={{ fontSize: 13.5 }}>{fmtLong(confirmR.date)}</span>
              {confirmR.loc_name && <span style={{ fontSize: 13, color: 'var(--muted)' }}>{confirmR.loc_name}</span>}
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button type="button" className="tdb-soft-btn" style={{ padding: '12px 20px', fontSize: 14 }} onClick={() => setConfirmR(null)}>
                เก็บรอบไว้
              </button>
              <button type="button" className="btn" style={{ background: '#a04a14', color: '#fff', padding: '12px 20px', fontSize: 14 }} onClick={doCancel}>
                ยกเลิกรอบ
              </button>
            </div>
          </section>
        </div>
      )}

      {toast && (
        <div className="toast" style={{ zIndex: 200 }}>
          <span style={{ color: 'var(--accent)' }}>✓</span> {toast}
        </div>
      )}
    </div>
  );
}
