'use client';

/* Session manager — where a teacher opens rounds of the activities the admin
 * handed them. Pick the activity, point at a day on the calendar, give it a
 * start and end time and a venue, and a bookable round exists. */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useLang, T, tr } from '@/lib/i18n';
import { Btn } from '@/components/design/RippleButton';
import { MonthPicker } from '@/components/calendar/MonthPicker';
import { fmtDate } from '@/lib/datetime';
import type { WorkshopMaster } from '@/lib/types';

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

const baht = (n: number | null | undefined) => (n == null ? '—' : '฿' + Math.round(n).toLocaleString());

export default function TeacherSessionsPage() {
  const { lang } = useLang();
  const [data, setData] = useState<Data | null>(null);
  const [masterId, setMasterId] = useState('');
  const [date, setDate] = useState<string | null>(null);
  const [timeStart, setTimeStart] = useState('09:00');
  const [timeEnd, setTimeEnd] = useState('12:00');
  const [locationId, setLocationId] = useState('');
  const [seats, setSeats] = useState('');
  // A round can be a single day, or a run: every day / chosen weekdays,
  // from the picked day through an end date.
  const [repeat, setRepeat] = useState<'once' | 'daily' | 'weekly'>('once');
  const [endDate, setEndDate] = useState('');
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const EMPTY: Data = { masters: [], rounds: [], locations: [] };
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
        if (alive) setData(d);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // Days this activity already runs on — drawn as counts under the day so
  // the teacher sees the month at a glance while picking.
  const marks = useMemo(() => {
    const m: Record<string, number> = {};
    (data?.rounds || [])
      .filter((r) => r.status !== 'cancelled' && (!masterId || r.master_id === masterId))
      .forEach((r) => {
        m[r.date] = (m[r.date] || 0) + 1;
      });
    return m;
  }, [data, masterId]);

  const upcoming = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return (data?.rounds || []).filter((r) => r.status !== 'cancelled' && r.date >= today);
  }, [data]);

  async function create() {
    if (!master || !date) return;
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch('/api/teacher/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          master_id: master.id,
          date,
          time_start: timeStart,
          time_end: timeEnd,
          location_id: locationId,
          max_participants: seats ? Number(seats) : undefined,
          repeat,
          end_date: repeat === 'once' ? undefined : endDate,
          weekdays: repeat === 'weekly' ? weekdays : undefined,
        }),
      });
      const d = (await res.json()) as { error?: string; created?: number; skipped?: number };
      if (!res.ok) {
        setMsg({ ok: false, text: d.error || tr(lang, 'เปิดรอบไม่สำเร็จ', 'Could not open the round') });
        return;
      }
      const n = d.created || 1;
      const skipped = d.skipped ? tr(lang, ` (ข้าม ${d.skipped} วันที่มีอยู่แล้ว)`, ` (${d.skipped} already-open days skipped)`) : '';
      setMsg({
        ok: true,
        text:
          n === 1
            ? tr(lang, `เปิดรอบวันที่ ${fmtDate(date, lang)} แล้ว${skipped}`, `Round opened for ${fmtDate(date, lang)}${skipped}`)
            : tr(lang, `เปิด ${n} รอบแล้ว${skipped}`, `${n} rounds opened${skipped}`),
      });
      setDate(null);
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
    await load();
  }

  const repeatOk = repeat === 'once' || (!!endDate && !!date && endDate >= date && (repeat === 'daily' || weekdays.length > 0));
  const ready = !!master && !!date && !!locationId && timeStart < timeEnd && repeatOk;
  const DOW = lang === 'th' ? ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'] : ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

  return (
    <div>
      <span className="eyebrow">
        <T th="จัดรอบสอน" en="session manager" />
      </span>
      <h1 className="display-th" style={{ fontSize: 'clamp(24px,3vw,32px)', margin: '8px 0 4px' }}>
        <T th="เปิดรอบสอน" en="Open a round" />
      </h1>
      <p style={{ fontSize: 14, color: 'var(--muted)', margin: '0 0 22px' }}>
        <T th="เลือก Workshop ที่ Admin ผูกชื่อคุณไว้ จิ้มวันในปฏิทิน ใส่เวลาและสถานที่ — รอบนั้นจะเปิดจองทันที" en="Pick an activity the admin assigned to you, tap a day, set the time and venue — the round opens for booking right away." />
      </p>

      {data === null ? null : data.masters.length === 0 ? (
        <div className="card card-static" style={{ textAlign: 'center', padding: '48px 24px' }}>
          <p style={{ color: 'var(--muted)', margin: 0 }}>
            <T th="ยังไม่มี Workshop ที่ Admin ผูกชื่อคุณไว้" en="No activity has been assigned to you yet." />
          </p>
        </div>
      ) : (
        <div className="tsm-grid">
          {/* Left: the form */}
          <section className="card card-static">
            <label className="tsm-label">
              <T th="1 · Workshop" en="1 · Activity" />
            </label>
            <select value={masterId} onChange={(e) => { setMasterId(e.target.value); setMsg(null); setLocationId(''); const m = data.masters.find((x) => x.id === e.target.value); setSeats(m?.default_max_participants ? String(m.default_max_participants) : ''); }} className="field">
              <option value="">{tr(lang, '— เลือก Workshop —', '— choose —')}</option>
              {data.masters.map((m) => (
                <option key={m.id} value={m.id}>{m.title}</option>
              ))}
            </select>
            {master && (
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 8, fontSize: 12.5, color: 'var(--muted)' }}>
                <span>{tr(lang, 'กลุ่ม', 'Group')} <b style={{ color: 'var(--ink)' }}>{baht(master.price_group)}</b>{tr(lang, '/ที่นั่ง', '/seat')}</span>
                <span>{tr(lang, 'ส่วนตัว', 'Private')} <b style={{ color: 'var(--ink)' }}>{master.price_private == null ? tr(lang, 'ไม่เปิด', 'off') : baht(master.price_private)}</b></span>
                {master.price_group == null && <span style={{ color: '#a04a14' }}>⚠ {tr(lang, 'Admin ยังไม่ตั้งราคา — เปิดรอบไม่ได้', 'No price set yet — cannot open')}</span>}
              </div>
            )}

            <label className="tsm-label" style={{ marginTop: 20 }}>
              <T th="2 · วันที่" en="2 · Day" />
            </label>
            <div className="tsm-repeat" role="radiogroup">
              {(
                [
                  ['once', tr(lang, 'ครั้งเดียว', 'Once')],
                  ['daily', tr(lang, 'ทุกวัน', 'Every day')],
                  ['weekly', tr(lang, 'ทุกสัปดาห์', 'Weekly')],
                ] as const
              ).map(([k, label]) => (
                <button key={k} type="button" role="radio" aria-checked={repeat === k} className={repeat === k ? 'on' : ''} onClick={() => setRepeat(k)}>
                  {label}
                </button>
              ))}
            </div>
            <MonthPicker value={date} onChange={(d) => { setDate(d); setMsg(null); }} marks={marks} />
            {date && (
              <div style={{ fontSize: 13, color: 'var(--teal-deep)', marginTop: 8, fontWeight: 600 }}>
                {repeat === 'once' ? fmtDate(date, lang) : tr(lang, `เริ่ม ${fmtDate(date, lang)}`, `From ${fmtDate(date, lang)}`)}
              </div>
            )}
            {repeat !== 'once' && (
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
                  <T th="ระบบจะเปิดรอบให้ทุกวันที่ตรงเงื่อนไข (สูงสุด 92 รอบต่อครั้ง) วันที่มีรอบเวลานี้อยู่แล้วจะถูกข้าม" en="A round opens on every matching day (up to 92 per run); days that already have this time are skipped." />
                </div>
              </div>
            )}

            <label className="tsm-label" style={{ marginTop: 20 }}>
              <T th="3 · เวลา" en="3 · Time" />
            </label>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <input type="time" value={timeStart} onChange={(e) => setTimeStart(e.target.value)} className="field" style={{ width: 130 }} />
              <span style={{ color: 'var(--muted)' }}>–</span>
              <input type="time" value={timeEnd} onChange={(e) => setTimeEnd(e.target.value)} className="field" style={{ width: 130 }} />
            </div>

            <label className="tsm-label" style={{ marginTop: 20 }}>
              <T th="4 · สถานที่" en="4 · Venue" />
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

            <label className="tsm-label" style={{ marginTop: 20 }}>
              <T th="5 · จำนวนที่นั่ง" en="5 · Seats" />
            </label>
            <input type="number" min={1} value={seats} onChange={(e) => setSeats(e.target.value)} className="field" style={{ width: 130 }} placeholder={String(master?.default_max_participants ?? 20)} />

            {msg && (
              <div style={{ marginTop: 16, padding: '10px 14px', borderRadius: 12, fontSize: 13, background: msg.ok ? 'var(--teal-50)' : '#fde7d3', color: msg.ok ? 'var(--teal-deep)' : '#a04a14' }}>
                {msg.ok ? '✓ ' : ''}{msg.text}
              </div>
            )}

            <div style={{ marginTop: 20 }}>
              <Btn kind="teal" onClick={create} disabled={!ready || saving || master?.price_group == null} style={{ opacity: ready && master?.price_group != null ? 1 : 0.5 }}>
                {saving ? tr(lang, 'กำลังเปิดรอบ…', 'Opening…') : tr(lang, 'เปิดรอบนี้', 'Open this round')} <span className="mono">→</span>
              </Btn>
            </div>
          </section>

          {/* Right: what is already open */}
          <section>
            <h2 className="display-th" style={{ fontSize: 18, margin: '0 0 12px' }}>
              <T th="รอบที่เปิดอยู่" en="Open rounds" /> <span style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 400 }}>· {upcoming.length}</span>
            </h2>
            {upcoming.length === 0 ? (
              <div className="card card-static" style={{ color: 'var(--muted)', fontSize: 13.5, textAlign: 'center', padding: 28 }}>
                <T th="ยังไม่มีรอบที่กำลังจะมาถึง" en="No upcoming rounds." />
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {upcoming.map((r) => (
                  <div key={r.id} className="card card-static" style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 180 }}>
                      <div style={{ fontWeight: 700, fontSize: 14.5 }}>{r.title}</div>
                      <div className="mono" style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                        {fmtDate(r.date, lang)} · {r.time_start}–{r.time_end}{r.loc_name ? ` · ${r.loc_name}` : ''}
                      </div>
                    </div>
                    <span className="tag" style={{ fontSize: 11 }}>{r.booked}/{r.max_participants} {tr(lang, 'ที่นั่ง', 'seats')}</span>
                    <Link href={`/teacher/workshops/${r.id}`} className="btn btn-paper btn-sm">{tr(lang, 'ผู้สมัคร', 'Applicants')}</Link>
                    {r.booked === 0 && (
                      <button type="button" onClick={() => cancel(r)} className="btn btn-paper btn-sm" style={{ color: '#a04a14' }}>
                        {tr(lang, 'ยกเลิก', 'Cancel')}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
