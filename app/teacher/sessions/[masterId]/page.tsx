'use client';

/* One activity in the session manager: a big month calendar of the days it
 * already runs (a count under each day), the rounds of the chosen day with
 * their venue, seats taken and a way into the roster, and an "add rounds"
 * popup to pick days (several at once, or a daily / weekly pattern), time
 * ranges, a venue and the seat count — every day × time becomes a bookable
 * round. Editing a round uses the same popup. */

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useLang, T, tr } from '@/lib/i18n';
import { Btn } from '@/components/design/RippleButton';
import { MonthPicker, todayYmd } from '@/components/calendar/MonthPicker';
import { TimeField24 } from '@/components/admin/TimeField24';
import { fmtDate } from '@/lib/datetime';
import type { WorkshopMaster } from '@/lib/types';
import { bookableTiers, parseTiers, tierDesc } from '@/lib/pricing';

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

const baht = (n: number | null | undefined) => (n == null ? '—' : '฿' + Math.round(n).toLocaleString());
const EMPTY: Data = { masters: [], rounds: [], locations: [] };

export default function TeacherMasterSessionsPage() {
  const { masterId } = useParams<{ masterId: string }>();
  const { lang } = useLang();
  const [data, setData] = useState<Data | null>(null);
  // The add / edit popup, and the day picked on the page calendar.
  const [formOpen, setFormOpen] = useState(false);
  const [day, setDay] = useState<string | null>(null);
  // Days: hand-picked (repeat 'once') or a pattern from `date` to `endDate`.
  const [repeat, setRepeat] = useState<'once' | 'daily' | 'weekly'>('once');
  const [dates, setDates] = useState<string[]>([]);
  const [date, setDate] = useState<string | null>(null);
  const [endDate, setEndDate] = useState('');
  const [weekdays, setWeekdays] = useState<number[]>([]);
  // Time ranges — a morning and an evening round on every picked day.
  const [slots, setSlots] = useState<Slot[]>([{ time_start: '09:00', time_end: '12:00' }]);
  const [locationId, setLocationId] = useState('');
  const [seats, setSeats] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  // What the last save did, shown on the page once the popup has closed.
  const [notice, setNotice] = useState<string | null>(null);
  // A round being edited: the form shows that one round's fields.
  const [editing, setEditing] = useState<Round | null>(null);

  function load(): Promise<Data> {
    return fetch('/api/teacher/sessions')
      .then((res) => (res.ok ? (res.json() as Promise<Data>) : EMPTY))
      .catch(() => EMPTY)
      .then((d) => {
        setData(d);
        return d;
      });
  }
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
        setDay(next ? next.date : todayYmd());
      });
    return () => {
      alive = false;
    };
  }, [masterId]);

  const master = data?.masters.find((m) => m.id === masterId) || null;

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

  // Days this activity already runs on — counts under the day while picking.
  const marks = useMemo(() => {
    const m: Record<string, number> = {};
    (data?.rounds || [])
      .filter((r) => r.status !== 'cancelled' && r.master_id === masterId)
      .forEach((r) => {
        m[r.date] = (m[r.date] || 0) + 1;
      });
    return m;
  }, [data, masterId]);

  // Rounds of this activity: every live one, and those on the picked day.
  const mine = useMemo(() => (data?.rounds || []).filter((r) => r.status !== 'cancelled' && r.master_id === masterId), [data, masterId]);
  const upcoming = useMemo(() => mine.filter((r) => r.date >= todayYmd()), [mine]);
  const onDay = useMemo(() => (day ? mine.filter((r) => r.date === day) : []), [mine, day]);

  function resetForm() {
    setEditing(null);
    setDates([]);
    setDate(null);
    setMsg(null);
  }

  function closeForm() {
    resetForm();
    setFormOpen(false);
  }

  function openAdd(m: WorkshopMaster) {
    resetForm();
    setNotice(null);
    setFormOpen(true);
    setRepeat('once');
    setWeekdays([]);
    setEndDate('');
    setSlots([{ time_start: '09:00', time_end: '12:00' }]);
    setLocationId('');
    setSeats(m.default_max_participants ? String(m.default_max_participants) : '');
  }

  function startEdit(r: Round) {
    setNotice(null);
    setEditing(r);
    setFormOpen(true);
    setRepeat('once');
    setDates([r.date]);
    setDate(r.date);
    setSlots([{ time_start: r.time_start, time_end: r.time_end }]);
    setLocationId(r.location_id || '');
    setSeats(String(r.max_participants));
    setMsg(null);
  }

  async function submit() {
    if (!master) return;
    setSaving(true);
    setMsg(null);
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
            max_participants: seats ? Number(seats) : undefined,
          }),
        });
        const d = (await res.json()) as { error?: string };
        if (!res.ok) {
          setMsg({ ok: false, text: d.error || tr(lang, 'แก้ไขไม่สำเร็จ', 'Could not save') });
          return;
        }
        setNotice(tr(lang, 'บันทึกการแก้ไขแล้ว', 'Round updated'));
        closeForm();
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
          max_participants: seats ? Number(seats) : undefined,
        }),
      });
      const d = (await res.json()) as { error?: string; created?: number; skipped?: number };
      if (!res.ok) {
        setMsg({ ok: false, text: d.error || tr(lang, 'เปิดรอบไม่สำเร็จ', 'Could not open the round') });
        return;
      }
      const n = d.created || 1;
      const skipped = d.skipped ? tr(lang, ` (ข้าม ${d.skipped} รอบที่มีอยู่แล้ว)`, ` (${d.skipped} already-open rounds skipped)`) : '';
      setNotice(n === 1 ? tr(lang, `เปิดรอบแล้ว${skipped}`, `Round opened${skipped}`) : tr(lang, `เปิด ${n} รอบแล้ว${skipped}`, `${n} rounds opened${skipped}`));
      const first = repeat === 'once' ? dates[0] : date;
      if (first) setDay(first);
      closeForm();
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function cancel(r: Round) {
    if (!confirm(tr(lang, `ยกเลิกรอบ ${fmtDate(r.date, lang)} ${r.time_start}–${r.time_end}?`, `Cancel the ${fmtDate(r.date, lang)} ${r.time_start}–${r.time_end} round?`))) return;
    const res = await fetch(`/api/teacher/sessions/${r.id}`, { method: 'DELETE' });
    const d = (await res.json()) as { error?: string };
    if (!res.ok) {
      setMsg({ ok: false, text: d.error || tr(lang, 'ยกเลิกไม่สำเร็จ', 'Could not cancel') });
      return;
    }
    if (editing?.id === r.id) closeForm();
    await load();
  }

  const slotsOk = slots.every((s) => s.time_start && s.time_end && s.time_start < s.time_end);
  const daysOk = repeat === 'once' ? dates.length > 0 : !!date && !!endDate && endDate >= date && (repeat === 'daily' || weekdays.length > 0);
  const priced = !!master && (master.price_group != null || parseTiers(master.price_tiers_json).length > 0);
  const ready = !!master && daysOk && slotsOk && !!locationId && priced;
  // Why the open button is greyed out, spelled out under it — one line per
  // step still missing, in the order the form asks for them.
  const blockers: string[] = [];
  if (master && !priced) blockers.push(tr(lang, 'Admin ยังไม่ได้ตั้งราคาให้ Workshop นี้ — ติดต่อ Admin', 'No price set for this workshop yet — ask an admin'));
  if (!daysOk) {
    if (repeat === 'once') blockers.push(tr(lang, 'ยังไม่ได้เลือกวันจากปฏิทิน (ข้อ 1)', 'Pick at least one day on the calendar (step 1)'));
    else if (!date || !endDate) blockers.push(tr(lang, 'ยังไม่ได้ใส่วันเริ่มและวันสิ้นสุด (ข้อ 1)', 'Set a start and an end date (step 1)'));
    else if (endDate < date) blockers.push(tr(lang, 'วันสิ้นสุดอยู่ก่อนวันเริ่ม (ข้อ 1)', 'The end date is before the start date (step 1)'));
    else blockers.push(tr(lang, 'ยังไม่ได้เลือกวันในสัปดาห์ (ข้อ 1)', 'Pick the weekdays (step 1)'));
  }
  if (!slotsOk) blockers.push(tr(lang, 'เวลาเริ่มต้องอยู่ก่อนเวลาจบทุกช่วง (ข้อ 2)', 'Every time slot must start before it ends (step 2)'));
  if (!locationId)
    blockers.push(
      master && allowedLocs.length === 0
        ? tr(lang, 'ยังไม่มีสถานที่ให้เลือกสำหรับ Workshop นี้ — ติดต่อ Admin ให้เพิ่มสถานที่', 'No venue is available for this workshop — ask an admin to add one')
        : tr(lang, 'ยังไม่ได้เลือกสถานที่ (ข้อ 3)', 'Pick a venue (step 3)'),
    );
  const DOW = lang === 'th' ? ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'] : ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
  const editLocked = !!editing && editing.booked > 0;

  return (
    <div>
      <Link href="/teacher/sessions" style={{ fontSize: 13, color: 'var(--muted)' }}>← {tr(lang, 'จัดรอบสอนทั้งหมด', 'All workshops')}</Link>

      {data === null ? null : !master ? (
        <div className="card card-static" style={{ textAlign: 'center', padding: '48px 24px', marginTop: 16 }}>
          <p style={{ color: 'var(--muted)', margin: 0 }}>
            <T th="ไม่พบ Workshop นี้ หรือไม่ได้อยู่ในความดูแลของคุณ" en="This workshop was not found, or isn't yours." />
          </p>
        </div>
      ) : (
        <>
          <div className="tsm-head">
            <div style={{ flex: 1, minWidth: 0 }}>
              <h1 className="display-th" style={{ fontSize: 'clamp(24px,3vw,34px)', margin: '10px 0 4px' }}>{master.title}</h1>
              <div style={{ fontSize: 13.5, color: 'var(--muted)' }}>
                {tr(lang, `เปิดอยู่ ${upcoming.length} รอบ · จิ้มวันในปฏิทินเพื่อดูรอบและเช็คชื่อ`, `${upcoming.length} open · tap a day to see its rounds and check people in`)}
              </div>
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 6, fontSize: 12.5, color: 'var(--muted)' }}>
                {bookableTiers(master).map((t) => (
                  <span key={t.id}>{t.label} <b style={{ color: 'var(--ink)' }}>{baht(t.price)}</b> · {tierDesc(t, lang)}</span>
                ))}
              </div>
            </div>
            <Btn kind="teal" onClick={() => openAdd(master)}>+ {tr(lang, 'เพิ่มรอบ', 'Add rounds')}</Btn>
          </div>

          {notice && (
            <div style={{ margin: '16px 0 0', padding: '10px 14px', borderRadius: 12, fontSize: 13.5, background: 'var(--teal-50)', color: 'var(--teal-deep)', fontWeight: 600 }}>✓ {notice}</div>
          )}

          <div className="tsm-view">
            <section className="card card-static tsm-view-cal">
              <MonthPicker value={day} onChange={setDay} marks={marks} min="" initialMonth={day || undefined} />
              <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 10 }}>
                {tr(lang, 'ตัวเลขใต้วัน = จำนวนรอบในวันนั้น', 'The number under a day is how many rounds run that day')}
              </div>
            </section>

            <section>
              <h2 className="display-th" style={{ fontSize: 19, margin: '0 0 12px' }}>
                {day ? fmtDate(day, lang, 'long') : tr(lang, 'เลือกวัน', 'Pick a day')}{' '}
                <span style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 400 }}>· {tr(lang, `${onDay.length} รอบ`, `${onDay.length} rounds`)}</span>
              </h2>
              {onDay.length === 0 ? (
                <div className="card card-static" style={{ color: 'var(--muted)', fontSize: 13.5, textAlign: 'center', padding: 28 }}>
                  {tr(lang, 'วันนี้ยังไม่มีรอบ — กด "+ เพิ่มรอบ" เพื่อเปิด', 'No rounds this day — press "+ Add rounds" to open one')}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {onDay.map((r) => (
                    <div key={r.id} className="card card-static tsm-round">
                      <div style={{ flex: 1, minWidth: 160 }}>
                        <div className="mono" style={{ fontSize: 17, fontWeight: 700 }}>{r.time_start}–{r.time_end}</div>
                        <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>{r.loc_name || tr(lang, 'ยังไม่ระบุสถานที่', 'No venue')}</div>
                      </div>
                      <span className="tag" style={{ fontSize: 11.5 }}>{r.booked}/{r.max_participants} {tr(lang, 'ที่นั่ง', 'seats')}</span>
                      <button type="button" onClick={() => startEdit(r)} className="btn btn-paper btn-sm">{tr(lang, 'แก้ไข', 'Edit')}</button>
                      {r.booked === 0 && (
                        <button type="button" onClick={() => cancel(r)} className="btn btn-paper btn-sm" style={{ color: '#a04a14' }}>
                          {tr(lang, 'ยกเลิก', 'Cancel')}
                        </button>
                      )}
                      <Link href={`/teacher/workshops/${r.id}`} className="btn btn-teal btn-sm">{tr(lang, 'เช็คชื่อ', 'Check-in')} →</Link>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          {/* Popup: pick days, times, venue for the chosen workshop */}
          {formOpen && (
            <div
              className="tsm-pop-backdrop"
              onMouseDown={(e) => {
                if (e.target === e.currentTarget && !saving) closeForm();
              }}
            >
              <section className="tsm-pop" role="dialog" aria-modal="true" aria-label={master.title}>
                <div className="tsm-pop-head">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="eyebrow" style={{ fontSize: 11 }}>{editing ? tr(lang, 'แก้ไขรอบ', 'Edit a round') : tr(lang, 'เพิ่มรอบ', 'Add rounds')}</div>
                    <h2 className="display-th" style={{ fontSize: 22, margin: '4px 0 0' }}>{master.title}</h2>
                    {editing && (
                      <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
                        {tr(lang, `${fmtDate(editing.date, lang)} · ${editing.time_start}–${editing.time_end} — เปลี่ยนวัน เวลา สถานที่ หรือที่นั่ง แล้วกดบันทึก`, `${fmtDate(editing.date, lang)} · ${editing.time_start}–${editing.time_end} — change the day, time, venue or seats, then save`)}
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 8, fontSize: 12.5, color: 'var(--muted)' }}>
                      {bookableTiers(master).map((t) => (
                        <span key={t.id}>{t.label} <b style={{ color: 'var(--ink)' }}>{baht(t.price)}</b> · {tierDesc(t, lang)}</span>
                      ))}
                      {!priced && <span style={{ color: '#a04a14' }}>⚠ {tr(lang, 'Admin ยังไม่ตั้งราคา — เปิดรอบไม่ได้', 'No price set yet — cannot open')}</span>}
                    </div>
                  </div>
                  <button type="button" className="tsm-pop-close" onClick={closeForm} disabled={saving} aria-label={tr(lang, 'ปิด', 'Close')}>×</button>
                </div>

            {/* Days */}
            <label className="tsm-label" style={{ marginTop: 20 }}>
              <T th="1 · วันที่" en="1 · Days" />
            </label>
            {!editing && (
              <div className="tsm-repeat" role="radiogroup">
                {(
                  [
                    ['once', tr(lang, 'เลือกวันเอง', 'Pick days')],
                    ['daily', tr(lang, 'ทุกวัน', 'Every day')],
                    ['weekly', tr(lang, 'ทุกสัปดาห์', 'Weekly')],
                  ] as const
                ).map(([k, label]) => (
                  <button key={k} type="button" role="radio" aria-checked={repeat === k} className={repeat === k ? 'on' : ''} onClick={() => { setRepeat(k); setMsg(null); }}>
                    {label}
                  </button>
                ))}
              </div>
            )}
            {editLocked ? (
              <div style={{ fontSize: 13, color: '#a04a14', background: '#fde7d3', borderRadius: 12, padding: '10px 14px' }}>
                {tr(lang, `รอบนี้มีผู้จองแล้ว ${editing?.booked} คน — เปลี่ยนวันและเวลาไม่ได้ แก้ได้เฉพาะสถานที่กับที่นั่ง`, `${editing?.booked} people hold seats — day and time are fixed; venue and seats can still change`)}
              </div>
            ) : repeat === 'once' ? (
              <>
                <MonthPicker
                  value={null}
                  multi={dates}
                  onChange={(d) => {
                    setMsg(null);
                    if (editing) setDates([d]);
                    else setDates((x) => (x.includes(d) ? x.filter((v) => v !== d) : [...x, d].sort()));
                  }}
                  marks={marks}
                />
                <div style={{ fontSize: 13, marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  {dates.length === 0 ? (
                    <span style={{ color: 'var(--muted)' }}>{tr(lang, editing ? 'จิ้มวันใหม่' : 'จิ้มวันในปฏิทิน จิ้มซ้ำเพื่อเอาออก', editing ? 'Tap the new day' : 'Tap days on the calendar; tap again to remove')}</span>
                  ) : (
                    dates.map((d) => (
                      <span key={d} className="tag" style={{ background: 'var(--teal-50)', color: 'var(--teal-deep)' }}>
                        {fmtDate(d, lang)}
                      </span>
                    ))
                  )}
                  {!editing && dates.length > 1 && (
                    <button type="button" onClick={() => setDates([])} className="btn btn-paper btn-sm" style={{ fontSize: 12 }}>
                      {tr(lang, 'ล้าง', 'Clear')}
                    </button>
                  )}
                </div>
              </>
            ) : (
              <>
                <MonthPicker value={date} onChange={(d) => { setDate(d); setMsg(null); }} marks={marks} />
                {date && <div style={{ fontSize: 13, color: 'var(--teal-deep)', marginTop: 8, fontWeight: 600 }}>{tr(lang, `เริ่ม ${fmtDate(date, lang)}`, `From ${fmtDate(date, lang)}`)}</div>}
                <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {repeat === 'weekly' && (
                    <div className="tsm-dow">
                      {DOW.map((d, i) => (
                        <button
                          key={i}
                          type="button"
                          aria-pressed={weekdays.includes(i)}
                          className={weekdays.includes(i) ? 'on' : ''}
                          onClick={() => setWeekdays((w) => (w.includes(i) ? w.filter((x) => x !== i) : [...w, i].sort()))}
                        >
                          {d}
                        </button>
                      ))}
                    </div>
                  )}
                  <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
                    <span style={{ color: 'var(--muted)' }}>{tr(lang, 'ถึงวันที่', 'Until')}</span>
                    <input type="date" value={endDate} min={date || undefined} onChange={(e) => setEndDate(e.target.value)} className="field" style={{ width: 170 }} />
                  </label>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                    <T th="ระบบจะเปิดรอบให้ทุกวันที่ตรงเงื่อนไข (สูงสุด 92 วันต่อครั้ง) วันและเวลาที่มีรอบอยู่แล้วจะถูกข้าม" en="A round opens on every matching day (up to 92 per run); days and times already open are skipped." />
                  </div>
                </div>
              </>
            )}

            {/* Time ranges */}
            <label className="tsm-label" style={{ marginTop: 20 }}>
              <T th="2 · ช่วงเวลา" en="2 · Time ranges" />
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {slots.map((sl, i) => (
                <div key={i} className="tsm-slot" style={{ display: 'flex', gap: 14, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                  {/* Hour and minute dropdowns, 24-hour, whatever the device
                      locale — the same field the admin forms use. */}
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>{tr(lang, 'เวลาเริ่ม (24 ชม.)', 'Start (24h)')}</div>
                    <fieldset disabled={editLocked} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
                      <TimeField24 className="field" value={sl.time_start} onChange={(v) => setSlots((x) => x.map((s, j) => (j === i ? { ...s, time_start: v } : s)))} />
                    </fieldset>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>{tr(lang, 'เวลาจบ (24 ชม.)', 'End (24h)')}</div>
                    <fieldset disabled={editLocked} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
                      <TimeField24 className="field" value={sl.time_end} onChange={(v) => setSlots((x) => x.map((s, j) => (j === i ? { ...s, time_end: v } : s)))} />
                    </fieldset>
                  </div>
                  {!editing && slots.length > 1 && (
                    <button type="button" onClick={() => setSlots((x) => x.filter((_, j) => j !== i))} className="btn btn-paper btn-sm" aria-label={tr(lang, 'ลบช่วงเวลา', 'Remove range')} style={{ color: '#a04a14' }}>
                      ✕
                    </button>
                  )}
                  {sl.time_start && sl.time_end && sl.time_end <= sl.time_start && (
                    <span style={{ fontSize: 12, color: '#a04a14' }}>{tr(lang, 'เวลาจบต้องหลังเวลาเริ่ม', 'End must be after start')}</span>
                  )}
                </div>
              ))}
              {!editing && (
                <button
                  type="button"
                  onClick={() => setSlots((x) => [...x, { time_start: '13:00', time_end: '16:00' }])}
                  className="btn btn-paper btn-sm"
                  style={{ alignSelf: 'flex-start' }}
                >
                  + {tr(lang, 'เพิ่มช่วงเวลา (เช่น รอบเย็น)', 'Add a time range (e.g. evening)')}
                </button>
              )}
            </div>
            {!editing && slots.length > 1 && (
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>
                {tr(lang, `แต่ละวันจะเปิด ${slots.length} รอบ ผู้เรียนเลือกเวลาได้ตอนจอง`, `Each day opens ${slots.length} rounds; learners pick the time when booking`)}
              </div>
            )}

            {/* Venue */}
            <label className="tsm-label" style={{ marginTop: 20 }}>
              <T th="3 · สถานที่" en="3 · Venue" />
            </label>
            <select value={locationId} onChange={(e) => setLocationId(e.target.value)} className="field">
              <option value="">{tr(lang, '— เลือกสถานที่ —', '— choose a venue —')}</option>
              {allowedLocs.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}{l.province ? ` · ${l.province}` : ''}
                </option>
              ))}
            </select>
            {master && allowedLocs.length < data.locations.length && (
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>
                {tr(lang, `Admin กำหนดให้เปิดได้ ${allowedLocs.length} สถานที่`, `Admin allows ${allowedLocs.length} venues for this activity`)}
              </div>
            )}

            {/* Seats */}
            <label className="tsm-label" style={{ marginTop: 20 }}>
              <T th="4 · จำนวนที่นั่ง" en="4 · Seats" />
            </label>
            <input type="number" min={editing?.booked || 1} value={seats} onChange={(e) => setSeats(e.target.value)} className="field" style={{ width: 130 }} placeholder={String(master?.default_max_participants ?? 20)} />

            {msg && (
              <div style={{ marginTop: 16, padding: '10px 14px', borderRadius: 12, fontSize: 13, background: msg.ok ? 'var(--teal-50)' : '#fde7d3', color: msg.ok ? 'var(--teal-deep)' : '#a04a14' }}>
                {msg.ok ? '✓ ' : ''}{msg.text}
              </div>
            )}

            <div style={{ marginTop: 20, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <Btn kind="teal" onClick={submit} disabled={!ready || saving} style={{ opacity: ready ? 1 : 0.5 }}>
                {saving
                  ? tr(lang, 'กำลังบันทึก…', 'Saving…')
                  : editing
                    ? tr(lang, 'บันทึกการแก้ไข', 'Save changes')
                    : tr(lang, `เปิดรอบ${repeat === 'once' && dates.length * slots.length > 1 ? ` ${dates.length * slots.length} รอบ` : ''}`, `Open ${repeat === 'once' && dates.length * slots.length > 1 ? `${dates.length * slots.length} rounds` : 'round'}`)}{' '}
                <span className="mono">→</span>
              </Btn>
              <button type="button" onClick={closeForm} disabled={saving} className="btn btn-paper btn-sm">
                {tr(lang, 'ยกเลิก', 'Cancel')}
              </button>
            </div>
            {!ready && !saving && blockers.length > 0 && (
              <div role="alert" style={{ marginTop: 12, padding: '10px 14px', borderRadius: 12, fontSize: 13, lineHeight: 1.6, background: '#fde7d3', color: '#a04a14' }}>
                <div style={{ fontWeight: 700 }}>{tr(lang, 'ยังเปิดรอบไม่ได้ เพราะ', 'Can’t open yet:')}</div>
                {blockers.map((b) => (
                  <div key={b}>⚠ {b}</div>
                ))}
              </div>
            )}
              </section>
            </div>
          )}

        </>
      )}
    </div>
  );
}
