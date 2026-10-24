'use client';

/* Cancel a round people have paid for. Everyone starts in the top box — the
 * ones who will be refunded. Drag a card (or tap "ย้าย ↓") into the box below
 * to move that party to another round instead; then pick the round, or a day
 * to open a new one at the same time and venue. Admin transfers the refunds
 * and attaches the slips (GET /api/admin/refunds); moved members are told and
 * may still ask for the refund until the new round starts. */

import { useEffect, useMemo, useState } from 'react';
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
  const [moving, setMoving] = useState<string[]>([]);
  const [over, setOver] = useState<'refund' | 'move' | null>(null);
  const [target, setTarget] = useState<string | null>(null);
  const [newDate, setNewDate] = useState<string | null>(null);
  const [month, setMonth] = useState<Month>(monthOf(todayYmd()));
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
  const moveList = parties.filter((p) => moving.includes(p.id));
  const refundList = parties.filter((p) => !moving.includes(p.id));
  const seatsMoving = moveList.reduce((a, p) => a + p.seats, 0);
  const hasPrivate = moveList.some((p) => p.kind === 'private');
  const refundSum = refundList.reduce((a, p) => a + p.amount, 0);

  // A target fits when it has the seats — a whole-round booking needs an
  // empty round to itself.
  const fits = (t: Target) => (hasPrivate ? t.empty && moveList.length === 1 : t.free >= seatsMoving);
  const picked = data?.targets.find((t) => t.id === target) || null;
  const targetOk = moveList.length === 0 || (picked ? fits(picked) : !!newDate);
  const ready = !!data && !data.round.started && targetOk;

  const setMove = (id: string, on: boolean) => {
    setMoving((m) => (on ? (m.includes(id) ? m : [...m, id]) : m.filter((x) => x !== id)));
    setConfirming(false);
  };

  // Pointer drag (mouse and touch alike — HTML5 drag-and-drop does not work
  // with fingers). A mouse drags the whole card; a finger drags from the ⋮⋮
  // handle so the list still scrolls. A copy of the card follows the pointer
  // and the box under it lights up.
  const [drag, setDrag] = useState<{ id: string; name: string; x: number; y: number; live: boolean } | null>(null);
  const zoneAt = (x: number, y: number) => {
    const el = document.elementFromPoint(x, y)?.closest('[data-zone]');
    return (el?.getAttribute('data-zone') as 'refund' | 'move' | null) ?? null;
  };
  const onPointerDown = (p: Party) => (e: React.PointerEvent<HTMLDivElement>) => {
    if (busy || e.button !== 0) return;
    if ((e.target as HTMLElement).closest('button')) return;
    if (e.pointerType !== 'mouse' && !(e.target as HTMLElement).closest('.tdb-cx-grip')) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ id: p.id, name: p.name, x: e.clientX, y: e.clientY, live: false });
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag) return;
    const live = drag.live || Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 6 || e.pointerType !== 'mouse';
    setDrag({ ...drag, x: e.clientX, y: e.clientY, live });
    if (live) setOver(zoneAt(e.clientX, e.clientY));
  };
  const onPointerUp = (e: React.PointerEvent) => {
    if (!drag) return;
    const zone = drag.live ? zoneAt(e.clientX, e.clientY) : null;
    if (zone) setMove(drag.id, zone === 'move');
    setDrag(null);
    setOver(null);
  };

  async function submit() {
    if (!ready || busy) return;
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
          move_ids: moving,
          target: moveList.length ? (picked ? { round_id: picked.id } : { date: newDate }) : undefined,
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

  const card = (p: Party, zone: 'refund' | 'move') => (
    <div
      key={p.id}
      className={`tdb-cx-card ${drag?.live && drag.id === p.id ? 'lifted' : ''}`}
      onPointerDown={onPointerDown(p)}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        setDrag(null);
        setOver(null);
      }}
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
      <button type="button" className="tdb-cx-flip" onClick={() => setMove(p.id, zone === 'refund')} disabled={busy}>
        {zone === 'refund' ? 'ย้าย ↓' : '↑ คืนเงิน'}
      </button>
    </div>
  );

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
            {/* 1 · refund (everyone starts here) */}
            <div className="tdb-cx-zonehead">
              <span className="tdb-step-n">1</span>
              <span className="tdb-step-t">คืนเงิน</span>
              <span className="tdb-step-hint">
                {refundList.length} ราย · {baht(refundSum)}
              </span>
              {refundList.length > 1 && (
                <button type="button" className="tdb-textlink" style={{ marginLeft: 'auto' }} onClick={() => setMoving(parties.map((p) => p.id))}>
                  ย้ายทั้งหมด ↓
                </button>
              )}
            </div>
            <div className={`tdb-cx-zone refund ${over === 'refund' ? 'over' : ''}`} data-zone="refund">
              {parties.length === 0 ? (
                <div className="tdb-cx-empty">ยังไม่มีผู้ชำระเงินในรอบนี้</div>
              ) : refundList.length === 0 ? (
                <div className="tdb-cx-empty">ทุกคนถูกย้ายรอบ — ไม่มีใครต้องคืนเงิน</div>
              ) : (
                refundList.map((p) => card(p, 'refund'))
              )}
            </div>
            {parties.length > 0 && (
              <p className="tdb-cx-hint">ลากชื่อลงไปช่องด้านล่างเพื่อย้ายรอบ · คนที่อยู่ในช่องนี้ Admin จะโอนเงินคืนตามยอดที่จ่ายจริง</p>
            )}

            {/* 2 · move */}
            {parties.length > 0 && (
              <>
                <div className="tdb-cx-zonehead">
                  <span className="tdb-step-n">2</span>
                  <span className="tdb-step-t">ย้ายไปรอบอื่น</span>
                  <span className="tdb-step-hint">
                    {moveList.length} ราย · {seatsMoving} ที่นั่ง
                  </span>
                  {moveList.length > 1 && (
                    <button type="button" className="tdb-textlink" style={{ marginLeft: 'auto' }} onClick={() => setMoving([])}>
                      ↑ คืนเงินทั้งหมด
                    </button>
                  )}
                </div>
                <div className={`tdb-cx-zone move ${over === 'move' ? 'over' : ''} ${moveList.length ? '' : 'idle'}`} data-zone="move">
                  {moveList.length === 0 ? <div className="tdb-cx-empty">ลากรายชื่อมาวางที่นี่ หรือกด “ย้าย ↓”</div> : moveList.map((p) => card(p, 'move'))}
                </div>
              </>
            )}

            {/* 3 · where to */}
            {moveList.length > 0 && (
              <>
                <div className="tdb-cx-zonehead">
                  <span className="tdb-step-n">3</span>
                  <span className="tdb-step-t">ย้ายไปรอบไหน</span>
                  <span className="tdb-step-hint">ทั้ง {moveList.length} รายไปด้วยกัน</span>
                </div>
                <div className="tdb-cx-targets">
                  {data.targets.map((t) => {
                    const ok = fits(t);
                    const on = target === t.id;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        className={`tdb-cx-target ${on ? 'on' : ''}`}
                        disabled={!ok}
                        aria-pressed={on}
                        onClick={() => {
                          setTarget(t.id);
                          setNewDate(null);
                          setConfirming(false);
                        }}
                      >
                        <b>
                          {fmtShort(t.date)} · {t.time_start}–{t.time_end}
                        </b>
                        <small>{t.venue}</small>
                        <span className="free">{ok ? `ว่าง ${t.free}/${t.max}` : hasPrivate ? 'มีคนจองแล้ว' : `ว่าง ${t.free} ไม่พอ`}</span>
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    className={`tdb-cx-target new ${target === null ? 'on' : ''}`}
                    aria-pressed={target === null}
                    onClick={() => {
                      setTarget(null);
                      setConfirming(false);
                    }}
                  >
                    <b>+ เปิดรอบใหม่</b>
                    <small>
                      เวลา {data.round.time_start}–{data.round.time_end} · {data.round.venue}
                    </small>
                    <span className="free">{newDate ? fmtShort(newDate) : 'เลือกวันในปฏิทิน'}</span>
                  </button>
                </div>
                {target === null && (
                  <div className="tdb-cx-cal">
                    <TdbCalendar
                      small
                      month={month}
                      onMonth={setMonth}
                      selected={newDate ? [newDate] : []}
                      marks={marks}
                      floor={todayYmd()}
                      onPick={(d) => {
                        setNewDate(d === data.round.date ? null : d);
                        setConfirming(false);
                      }}
                    />
                  </div>
                )}
              </>
            )}

            {data.pending > 0 && (
              <p className="tdb-cx-hint">มีการจองที่ยังไม่ชำระเงิน {data.pending} รายการ — จะถูกยกเลิกไปพร้อมกัน</p>
            )}
          </div>
        )}

        {data && !data.round.started && (
          <div className="tdb-cx-foot">
            {error && <div className="tdb-note-warn">{error}</div>}
            {confirming && (
              <div className="tdb-note-warn">
                ยืนยันอีกครั้ง: รอบนี้จะถูกยกเลิกทันที
                {moveList.length > 0 && ` · ย้าย ${moveList.length} รายไป${picked ? `รอบ ${fmtShort(picked.date)} ${picked.time_start}` : newDate ? `รอบใหม่ ${fmtShort(newDate)} ${data.round.time_start}` : ''}`}
                {refundList.filter((p) => p.amount > 0).length > 0 && ` · คืนเงิน ${refundList.filter((p) => p.amount > 0).length} ราย ${baht(refundSum)}`}
              </div>
            )}
            <div className="tdb-cx-actions">
              <button type="button" className="tdb-soft-btn" style={{ padding: '12px 20px' }} onClick={onClose} disabled={busy}>
                เก็บรอบไว้
              </button>
              <button type="button" className="btn tdb-cx-go" onClick={submit} disabled={!ready || busy}>
                {busy ? 'กำลังยกเลิก…' : confirming ? 'ยืนยันยกเลิกรอบ' : 'ยกเลิกรอบ'}
              </button>
            </div>
          </div>
        )}
      </section>
      {drag?.live && (
        <div className="tdb-cx-ghost" style={{ left: drag.x, top: drag.y }} aria-hidden>
          {drag.name}
        </div>
      )}
    </div>
  );
}
