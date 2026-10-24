'use client';

/* Cancel a round people have paid for. Everyone starts in "คืนเงิน". Each
 * party can be sent somewhere else on its own — to any other round of the
 * activity that has room, or to a new round opened on a picked day at the
 * same time and venue — by its "ไปที่" menu, or by dragging the card onto a
 * round's row (mouse: drag; finger: press and hold, then drag). Whoever is
 * left in "คืนเงิน" is refunded by admin (GET /api/admin/refunds); moved
 * members are told and may still take the refund until their new round. */

import { useEffect, useMemo, useRef, useState } from 'react';
import { TdbCalendar, baht, fmtLong, fmtShort, monthOf, todayYmd, type Month } from '@/components/teacher/tdb';

type Party = {
  id: string;
  name: string;
  email: string | null;
  seats: number;
  kind: 'seat' | 'group' | 'private';
  amount: number;
  members: string[];
};
type Target = { id: string; date: string; time_start: string; time_end: string; venue: string; max: number; free: number; empty: boolean };
type Data = {
  round: { id: string; title: string; date: string; time_start: string; time_end: string; venue: string; started: boolean };
  parties: Party[];
  pending: number;
  targets: Target[];
};
/** Where a party goes: 'refund', 'r:<round id>' or 'd:<YYYY-MM-DD>' (a new round). */
type Dest = string;

const HOLD_MS = 350;

export function CancelRoundModal({
  roundId,
  marks,
  onClose,
  onDone,
}: {
  roundId: string;
  /** Rounds per day for this activity, to tint the new-round picker. */
  marks: Record<string, number>;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [data, setData] = useState<Data | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [dest, setDest] = useState<Record<string, Dest>>({});
  // Days the host opened a new-round row for.
  const [newDays, setNewDays] = useState<string[]>([]);
  // The picker for a new round; `forParty` is set when it was opened from a
  // card's menu, so the picked day also takes that party.
  const [picker, setPicker] = useState<{ forParty: string | null } | null>(null);
  const [month, setMonth] = useState<Month>(monthOf(todayYmd()));
  const [over, setOver] = useState<Dest | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/teacher/sessions/${roundId}/cancel`)
      .then(async (r) => {
        const d = (await r.json()) as Data & { error?: string };
        if (!alive) return;
        if (!r.ok) setLoadErr(d.error || 'โหลดข้อมูลไม่สำเร็จ');
        else setData(d);
      })
      .catch(() => alive && setLoadErr('เชื่อมต่อไม่สำเร็จ'));
    return () => {
      alive = false;
    };
  }, [roundId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, busy]);

  const parties = useMemo(() => data?.parties ?? [], [data]);
  const targets = useMemo(() => data?.targets ?? [], [data]);
  const destOf = (id: string): Dest => dest[id] || 'refund';
  const inLane = (key: Dest) => parties.filter((p) => destOf(p.id) === key);
  const seatsIn = (key: Dest, except?: string) => inLane(key).reduce((a, p) => (p.id === except ? a : a + p.seats), 0);

  /** Can `p` go to `key` given who else is already there? */
  const fits = (p: Party, key: Dest): boolean => {
    if (key === 'refund') return true;
    const others = inLane(key).filter((x) => x.id !== p.id);
    if (p.kind === 'private' || others.some((x) => x.kind === 'private')) {
      if (others.length > 0) return false;
      if (key.startsWith('d:')) return true;
      return !!targets.find((t) => `r:${t.id}` === key)?.empty;
    }
    if (key.startsWith('d:')) return true;
    const t = targets.find((x) => `r:${x.id}` === key);
    return !!t && t.free - seatsIn(key, p.id) >= p.seats;
  };
  const laneOver = (key: Dest) => inLane(key).some((p) => !fits(p, key));

  const send = (id: string, key: Dest) => {
    setDest((d) => ({ ...d, [id]: key }));
    setConfirming(false);
  };
  const addDay = (day: string) => {
    if (data && day === data.round.date) return;
    setNewDays((d) => (d.includes(day) ? d : [...d, day].sort()));
    if (picker?.forParty) send(picker.forParty, `d:${day}`);
    setPicker(null);
  };
  const dropDay = (day: string) => {
    setNewDays((d) => d.filter((x) => x !== day));
    setDest((d) => Object.fromEntries(Object.entries(d).map(([k, v]) => [k, v === `d:${day}` ? 'refund' : v])));
  };

  const refundList = inLane('refund');
  const refundSum = refundList.reduce((a, p) => a + p.amount, 0);
  const moved = parties.filter((p) => destOf(p.id) !== 'refund');
  const laneKeys = [...targets.map((t) => `r:${t.id}`), ...newDays.map((d) => `d:${d}`)];
  const usedLanes = laneKeys.filter((k) => inLane(k).length > 0);
  const valid = !!data && !data.round.started && laneKeys.every((k) => !laneOver(k));

  // ---------- drag (mouse: drag; finger: press and hold, then drag) ----------
  const [drag, setDrag] = useState<{ id: string; name: string; x: number; y: number } | null>(null);
  const press = useRef<{ id: string; name: string; x: number; y: number; timer: number | null; pointerId: number; el: HTMLElement } | null>(null);
  const zoneAt = (x: number, y: number) => document.elementFromPoint(x, y)?.closest('[data-zone]')?.getAttribute('data-zone') ?? null;

  // While dragging with a finger the page must not scroll under it.
  useEffect(() => {
    if (!drag) return;
    const stop = (e: TouchEvent) => e.preventDefault();
    document.addEventListener('touchmove', stop, { passive: false });
    return () => document.removeEventListener('touchmove', stop);
  }, [drag]);

  const begin = (p: { id: string; name: string; x: number; y: number }) => {
    setDrag(p);
    try {
      navigator.vibrate?.(12);
    } catch {}
  };
  const onPointerDown = (party: Party) => (e: React.PointerEvent<HTMLDivElement>) => {
    if (busy || e.button !== 0) return;
    if ((e.target as HTMLElement).closest('select, button')) return;
    const el = e.currentTarget;
    const base = { id: party.id, name: party.name, x: e.clientX, y: e.clientY, pointerId: e.pointerId, el };
    if (e.pointerType === 'mouse') {
      press.current = { ...base, timer: null };
      el.setPointerCapture(e.pointerId);
      return;
    }
    // Touch on the ⋮⋮ handle lifts the card at once (the handle never scrolls).
    if ((e.target as HTMLElement).closest('.tdb-cx-grip')) {
      press.current = { ...base, timer: null };
      el.setPointerCapture(e.pointerId);
      begin({ id: party.id, name: party.name, x: e.clientX, y: e.clientY });
      return;
    }
    // Touch: a still press of HOLD_MS lifts the card; moving first is a scroll.
    press.current = {
      ...base,
      timer: window.setTimeout(() => {
        const pr = press.current;
        if (!pr) return;
        pr.timer = null;
        try {
          pr.el.setPointerCapture(pr.pointerId);
        } catch {}
        begin({ id: pr.id, name: pr.name, x: pr.x, y: pr.y });
      }, HOLD_MS),
    };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const pr = press.current;
    if (!pr) return;
    if (!drag) {
      const far = Math.hypot(e.clientX - pr.x, e.clientY - pr.y) > 6;
      if (pr.timer != null) {
        if (far) {
          clearTimeout(pr.timer);
          press.current = null;
        }
        return;
      }
      if (far) begin({ id: pr.id, name: pr.name, x: e.clientX, y: e.clientY });
      return;
    }
    setDrag({ ...drag, x: e.clientX, y: e.clientY });
    setOver(zoneAt(e.clientX, e.clientY));
  };
  const endPress = (e: React.PointerEvent | null) => {
    const pr = press.current;
    if (pr?.timer != null) clearTimeout(pr.timer);
    press.current = null;
    if (drag && e) {
      const key = zoneAt(e.clientX, e.clientY);
      const p = parties.find((x) => x.id === drag.id);
      if (key && p) send(p.id, key);
    }
    setDrag(null);
    setOver(null);
  };

  async function submit() {
    if (!valid || busy) return;
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/teacher/sessions/${roundId}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          moves: moved.map((p) => {
            const k = destOf(p.id);
            return k.startsWith('r:') ? { id: p.id, round_id: k.slice(2) } : { id: p.id, date: k.slice(2) };
          }),
        }),
      });
      const d = (await res.json()) as { error?: string; moved?: number; refunded?: number };
      if (!res.ok) {
        setError(d.error || 'ยกเลิกรอบไม่สำเร็จ');
        setConfirming(false);
        return;
      }
      const parts = ['ยกเลิกรอบแล้ว'];
      if (d.moved) parts.push(`ย้าย ${d.moved} ราย`);
      if (d.refunded) parts.push(`รอคืนเงิน ${d.refunded} ราย`);
      onDone(parts.join(' · '));
    } catch {
      setError('เชื่อมต่อไม่สำเร็จ');
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  }

  const laneLabel = (key: Dest) => {
    if (key === 'refund') return 'คืนเงิน';
    if (key.startsWith('d:')) return `รอบใหม่ ${fmtShort(key.slice(2))} ${data?.round.time_start ?? ''}`;
    const t = targets.find((x) => `r:${x.id}` === key);
    return t ? `${fmtShort(t.date)} ${t.time_start}` : '—';
  };

  const card = (p: Party) => {
    const here = destOf(p.id);
    return (
      <div
        key={p.id}
        className={`tdb-cx-card ${drag?.id === p.id ? 'lifted' : ''}`}
        onPointerDown={onPointerDown(p)}
        onPointerMove={onPointerMove}
        onPointerUp={endPress}
        onPointerCancel={() => endPress(null)}
        onContextMenu={(e) => e.preventDefault()}
      >
        <span className="tdb-cx-grip" aria-hidden>
          ⋮⋮
        </span>
        <span className="tdb-cx-av" aria-hidden>
          {(p.name.trim()[0] || '?').toUpperCase()}
        </span>
        <span className="tdb-cx-who">
          <b>{p.name}</b>
          <small>
            {p.kind === 'private' ? 'เหมารอบ' : p.kind === 'group' ? `กลุ่ม ${p.seats} คน` : '1 ที่นั่ง'}
            {p.members.length > 0 && ` · ${p.members.join(', ')}`}
            {' · '}
            {p.amount > 0 ? baht(p.amount) : 'ไม่มียอดชำระ'}
          </small>
        </span>
        <label className="tdb-cx-to">
          <span>ไปที่</span>
          <select
            value={here}
            disabled={busy}
            aria-label={`ปลายทางของ ${p.name}`}
            onChange={(e) => {
              const v = e.target.value;
              if (v === '__new') setPicker({ forParty: p.id });
              else send(p.id, v);
            }}
          >
            <option value="refund">คืนเงิน</option>
            {targets.map((t) => {
              const key = `r:${t.id}`;
              const ok = here === key || fits(p, key);
              const left = t.free - seatsIn(key, p.id);
              return (
                <option key={key} value={key} disabled={!ok}>
                  {fmtShort(t.date)} {t.time_start} · {ok ? `ว่าง ${left}` : 'ที่ไม่พอ'}
                </option>
              );
            })}
            {newDays.map((d) => (
              <option key={d} value={`d:${d}`} disabled={!fits(p, `d:${d}`) && here !== `d:${d}`}>
                รอบใหม่ {fmtShort(d)} {data?.round.time_start}
              </option>
            ))}
            <option value="__new">+ เปิดรอบใหม่ (เลือกวัน)…</option>
          </select>
        </label>
      </div>
    );
  };

  const lane = (key: Dest, head: React.ReactNode, extra?: React.ReactNode) => {
    const list = inLane(key);
    const bad = laneOver(key);
    const empty = list.length === 0;
    return (
      <div key={key} className={`tdb-cx-lane ${empty ? 'empty' : ''} ${bad ? 'bad' : ''}`}>
        <div className="tdb-cx-lanehead">
          {head}
          {extra}
        </div>
        <div className={`tdb-cx-zone ${over === key ? 'over' : ''} ${drag ? 'live' : ''}`} data-zone={key}>
          {empty ? <div className="tdb-cx-empty">{drag ? 'ปล่อยที่นี่' : 'ยังไม่มีใคร'}</div> : list.map(card)}
        </div>
      </div>
    );
  };

  return (
    <div className="tdb-backdrop" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <section className="tdb-modal tdb-cx" role="dialog" aria-modal="true" aria-label="ยกเลิกรอบ">
        <div className="tdb-grab tdb-phone-only" aria-hidden />
        <div className="tdb-cx-head">
          <div style={{ flex: 1, minWidth: 0 }}>
            <span className="tdb-eyebrow" style={{ fontSize: 11 }}>
              ยกเลิกรอบ · คืนเงินหรือย้ายรอบ
            </span>
            <h2>{data?.round.title || 'กำลังโหลด…'}</h2>
            {data && (
              <p>
                {fmtLong(data.round.date)} · {data.round.time_start}–{data.round.time_end} · {data.round.venue}
              </p>
            )}
          </div>
          <button type="button" className="tdb-x" onClick={onClose} disabled={busy} aria-label="ปิด">
            ×
          </button>
        </div>

        {loadErr && <div className="tdb-note-warn">{loadErr}</div>}
        {data?.round.started && <div className="tdb-note-warn">รอบนี้เริ่มไปแล้ว — ยกเลิกไม่ได้ ติดต่อ Admin</div>}

        {data && (
          <div className="tdb-cx-body">
            {parties.length === 0 ? (
              <div className="tdb-cx-empty" style={{ padding: 24 }}>
                ยังไม่มีผู้ชำระเงินในรอบนี้
              </div>
            ) : (
              <>
                <p className="tdb-cx-hint">
                  เลือก “ไปที่” ของแต่ละคน หรือลากการ์ดไปวางที่รอบปลายทาง (มือถือ: กดค้างแล้วลาก) · ย้ายแต่ละคนไปคนละรอบได้ · ใครอยู่ใน “คืนเงิน” Admin จะโอนคืนตามยอดที่จ่ายจริง
                </p>
                {lane(
                  'refund',
                  <>
                    <span className="tdb-cx-lanename refund">คืนเงิน</span>
                    <span className="tdb-cx-cap">
                      {refundList.length} ราย · {baht(refundSum)}
                    </span>
                  </>,
                )}

                <div className="tdb-cx-zonehead">
                  <span className="tdb-step-t">ย้ายไปรอบอื่น</span>
                  <span className="tdb-step-hint">
                    {moved.length} ราย{usedLanes.length > 1 ? ` · ${usedLanes.length} รอบ` : ''}
                  </span>
                </div>
                {targets.map((t) => {
                  const key = `r:${t.id}`;
                  const used = seatsIn(key);
                  return lane(
                    key,
                    <>
                      <span className="tdb-cx-lanename">
                        {fmtShort(t.date)} · {t.time_start}–{t.time_end}
                      </span>
                      <small className="tdb-cx-venue">{t.venue}</small>
                    </>,
                    <span className={`tdb-cx-cap ${laneOver(key) ? 'bad' : ''}`}>{used ? `ใช้ ${used} / ว่าง ${t.free}` : `ว่าง ${t.free}/${t.max}`}</span>,
                  );
                })}
                {newDays.map((d) =>
                  lane(
                    `d:${d}`,
                    <>
                      <span className="tdb-cx-lanename">
                        รอบใหม่ {fmtShort(d)} · {data.round.time_start}–{data.round.time_end}
                      </span>
                      <small className="tdb-cx-venue">{data.round.venue}</small>
                    </>,
                    <button type="button" className="tdb-cx-drop" onClick={() => dropDay(d)} aria-label={`เอารอบใหม่ ${fmtShort(d)} ออก`}>
                      ×
                    </button>,
                  ),
                )}
                {picker ? (
                  <div className="tdb-cx-cal">
                    <div className="tdb-cx-zonehead" style={{ marginTop: 0 }}>
                      <span className="tdb-step-hint">
                        {picker.forParty ? `เลือกวันรอบใหม่ของ ${parties.find((p) => p.id === picker.forParty)?.name ?? ''}` : 'เลือกวันของรอบใหม่'} · เวลา {data.round.time_start}–{data.round.time_end}
                      </span>
                      <button type="button" className="tdb-textlink" style={{ marginLeft: 'auto' }} onClick={() => setPicker(null)}>
                        ยกเลิก
                      </button>
                    </div>
                    <TdbCalendar small month={month} onMonth={setMonth} selected={newDays} marks={marks} floor={todayYmd()} onPick={addDay} />
                  </div>
                ) : (
                  <button type="button" className="tdb-cx-add" onClick={() => setPicker({ forParty: null })}>
                    + เปิดรอบใหม่ (เวลาและสถานที่เดิม)
                  </button>
                )}
              </>
            )}

            {data.pending > 0 && <p className="tdb-cx-hint">มีการจองที่ยังไม่ชำระเงิน {data.pending} รายการ — จะถูกยกเลิกไปพร้อมกัน</p>}
          </div>
        )}

        {data && !data.round.started && (
          <div className="tdb-cx-foot">
            {error && <div className="tdb-note-warn">{error}</div>}
            {!valid && laneKeys.some(laneOver) && <div className="tdb-note-warn">บางรอบที่นั่งไม่พอ — ย้ายบางคนไปรอบอื่นก่อน</div>}
            {confirming && (
              <div className="tdb-note-warn" style={{ flexDirection: 'column', gap: 4 }}>
                <b>ยืนยันอีกครั้ง: รอบนี้จะถูกยกเลิกทันที</b>
                {usedLanes.map((k) => (
                  <span key={k}>
                    ย้ายไป {laneLabel(k)}: {inLane(k).map((p) => p.name).join(', ')}
                  </span>
                ))}
                {refundList.filter((p) => p.amount > 0).length > 0 && (
                  <span>
                    คืนเงิน {refundList.filter((p) => p.amount > 0).length} ราย · {baht(refundSum)}
                  </span>
                )}
              </div>
            )}
            <div className="tdb-cx-actions">
              <button type="button" className="tdb-soft-btn" style={{ padding: '12px 20px' }} onClick={onClose} disabled={busy}>
                เก็บรอบไว้
              </button>
              <button type="button" className="btn tdb-cx-go" onClick={submit} disabled={!valid || busy}>
                {busy ? 'กำลังยกเลิก…' : confirming ? 'ยืนยันยกเลิกรอบ' : 'ยกเลิกรอบ'}
              </button>
            </div>
          </div>
        )}
      </section>
      {drag && (
        <div className="tdb-cx-ghost" style={{ left: drag.x, top: drag.y }} aria-hidden>
          {drag.name}
        </div>
      )}
    </div>
  );
}
