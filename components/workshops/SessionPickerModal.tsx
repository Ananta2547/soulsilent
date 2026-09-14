'use client';

/* The step before the application form on a session-based activity: which
 * day, which round that day, and whether the booking takes one seat (group)
 * or the whole round (private). Days without a round are disabled; a day that
 * arrived in the URL (from a teacher's profile) starts selected. */

import { useEffect, useMemo, useState } from 'react';
import { useLang, T, tr } from '@/lib/i18n';
import { Btn } from '@/components/design/RippleButton';
import { Icon } from '@/components/design/Icon';
import { MonthPicker } from '@/components/calendar/MonthPicker';
import { fmtDate } from '@/lib/datetime';
import type { Workshop, WorkshopMaster } from '@/lib/types';
import { bookableTiers, isGroupTier, tierDesc, tierSeats, tierTotal, type PriceTier } from '@/lib/pricing';

export type BookingKind = 'group' | 'private';
export type PickableSession = Workshop & { booked: number; private_taken: number };

const baht = (n: number) => '฿' + Math.round(n).toLocaleString();

export function SessionPickerModal({
  master,
  sessions,
  initialDate,
  onClose,
  onNext,
}: {
  master: WorkshopMaster;
  sessions: PickableSession[];
  /** YYYY-MM-DD carried in from a teacher's profile; pre-selects that day. */
  initialDate?: string | null;
  onClose: () => void;
  /** `seats` = how many the booking holds (1 for a seat, the group size for a group tier). */
  onNext: (session: PickableSession, kind: BookingKind, tier: PriceTier, seats: number) => void;
}) {
  const { lang } = useLang();

  const open = useMemo(() => sessions.filter((s) => s.status === 'active'), [sessions]);
  const days = useMemo(() => new Set(open.map((s) => s.date)), [open]);
  const marks = useMemo(() => {
    const m: Record<string, number> = {};
    open.forEach((s) => {
      m[s.date] = (m[s.date] || 0) + 1;
    });
    return m;
  }, [open]);

  const [day, setDayState] = useState<string | null>(initialDate && days.has(initialDate) ? initialDate : null);
  const [pickedId, setSessionId] = useState<string | null>(null);
  const [tierId, setTierId] = useState('seat');
  // Range group tiers: how many people the booker is bringing (themselves included).
  const [groupN, setGroupN] = useState<number | null>(null);

  const onDay = useMemo(() => (day ? open.filter((s) => s.date === day) : []), [open, day]);
  const setDay = (d: string) => {
    setDayState(d);
    setSessionId(null); // a new day, a new choice of round
  };

  // One round that day → it is the choice; several → the visitor picks.
  const sessionId = onDay.length === 1 ? onDay[0].id : onDay.some((s) => s.id === pickedId) ? pickedId : null;
  const session = onDay.find((s) => s.id === sessionId) || null;
  const seatsLeft = session ? Math.max(0, session.max_participants - session.booked) : 0;
  const takenPrivately = !!session && session.private_taken > 0;
  const groupOk = !!session && !takenPrivately && seatsLeft > 0;
  // A whole-round tier means nobody else in the room, so it is only offered
  // while the round is still empty.
  const roundOk = !!session && session.booked === 0;
  // The base seat price is the round's own price; the admin's tiers follow.
  const tiers = bookableTiers(master, session?.price);
  // What a tier needs from the round: a locking tier (whole round, or a group
  // that locks it) needs it empty; a group needs room for its smallest size.
  const tierOk = (t: PriceTier) => {
    if (t.mode === 'round') return roundOk;
    if (!groupOk) return false;
    if (t.lock) return roundOk && seatsLeft >= (t.mode === 'pack' ? t.size || 2 : t.min || 2);
    if (t.mode === 'pack') return seatsLeft >= (t.size || 2);
    if (t.mode === 'range') return seatsLeft >= (t.min || 2);
    return true;
  };
  const picked = tiers.find((t) => t.id === tierId) || tiers[0];
  // A pick the chosen round cannot honour falls back to the seat price.
  const tier: PriceTier = tierOk(picked) || !session ? picked : tiers[0];
  const kind: BookingKind = tier.mode === 'round' || tier.lock ? 'private' : 'group';
  // Seats this purchase takes: a range tier follows the number picked, clamped
  // to what the round has left.
  const rangeMax = tier.mode === 'range' ? Math.min(tier.max || 2, session ? seatsLeft : tier.max || 2) : 0;
  const rangeN = tier.mode === 'range' ? Math.min(rangeMax, Math.max(tier.min || 2, groupN ?? (tier.min || 2))) : 0;
  const seats = tier.mode === 'range' ? rangeN : tierSeats(tier) || 1;
  const total = tierTotal(tier, seats);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const canNext = !!session && tierOk(tier) && (tier.mode !== 'range' || rangeN >= (tier.min || 2));

  return (
    <div
      className="sp-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="sp-box" role="dialog" aria-modal="true" aria-label={tr(lang, 'เลือกรอบ', 'Choose a round')}>
        <div className="sp-head">
          <div style={{ minWidth: 0 }}>
            <div className="mono" style={{ fontSize: 11, color: 'var(--muted)', letterSpacing: '.1em', textTransform: 'uppercase' }}>
              {tr(lang, 'ขั้นตอนที่ 1 · เลือกรอบ', 'Step 1 · choose a round')}
            </div>
            <h2 className="display-th u-clamp-2" style={{ fontSize: 20, margin: '2px 0 0' }}>{master.title}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="close" className="sp-close">×</button>
        </div>

        <div className="sp-body">
          <div className="sp-cal">
            <MonthPicker value={day} onChange={setDay} enabled={days} marks={marks} initialMonth={open[0]?.date} />
            <p style={{ fontSize: 12, color: 'var(--muted)', margin: '10px 0 0' }}>
              <T th="เลือกได้เฉพาะวันที่ผู้สอนเปิดรอบไว้" en="Only days with an open round can be picked" />
            </p>
          </div>

          <div className="sp-side">
            {/* Rounds on the chosen day */}
            <div className="sp-label">{day ? fmtDate(day, lang) : tr(lang, 'ยังไม่ได้เลือกวัน', 'No day chosen yet')}</div>
            {!day ? (
              <p style={{ fontSize: 13.5, color: 'var(--muted)', margin: 0 }}>
                <T th="จิ้มวันในปฏิทินเพื่อดูรอบ" en="Tap a day on the calendar to see its rounds." />
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {onDay.map((s) => {
                  const left = Math.max(0, s.max_participants - s.booked);
                  const full = s.private_taken > 0 || left <= 0;
                  return (
                    <label key={s.id} className={`sp-round${sessionId === s.id ? ' on' : ''}${full ? ' full' : ''}`}>
                      <input type="radio" name="session" checked={sessionId === s.id} disabled={full} onChange={() => setSessionId(s.id)} />
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: 'block', fontWeight: 700, fontSize: 14 }}>
                          <Icon name="time" size={13} /> {s.time_start}–{s.time_end}
                        </span>
                        <span style={{ display: 'block', fontSize: 12.5, color: 'var(--muted)', marginTop: 2 }}>
                          {s.is_online ? 'ONLINE' : s.location || '—'}
                          {' · '}
                          {full ? tr(lang, 'เต็มแล้ว', 'Full') : s.booked === 0 ? tr(lang, 'ว่าง', 'Open') : tr(lang, `เหลือ ${left} ที่นั่ง`, `${left} seats left`)}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            )}

            {/* Which price — one seat, or one of the admin's tiers */}
            <div className="sp-label" style={{ marginTop: 18 }}>
              <T th="รูปแบบการจอง" en="Booking type" />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {tiers.map((t) => {
                const ok = !session || tierOk(t);
                const on = tier.id === t.id;
                return (
                  <label key={t.id} className={`sp-kind${on ? ' on' : ''}${!ok ? ' off' : ''}`}>
                    <input type="radio" name="kind" checked={on} disabled={!ok} onChange={() => setTierId(t.id)} />
                    <span style={{ flex: 1 }}>
                      <span style={{ display: 'block', fontWeight: 700, fontSize: 14 }}>{t.label}</span>
                      <span style={{ display: 'block', fontSize: 12.5, color: 'var(--muted)' }}>
                        {t.mode === 'round'
                          ? !ok
                            ? tr(lang, 'รอบนี้มีคนจองแล้ว จึงเหมาไม่ได้', 'Someone already booked this round')
                            : tr(lang, 'เหมาทั้งรอบ ไม่มีคนอื่นร่วม', 'The whole round, nobody else')
                          : isGroupTier(t)
                            ? !ok
                              ? t.lock && session && session.booked > 0
                                ? tr(lang, 'รอบนี้มีคนจองแล้ว จึงล็อกรอบไม่ได้', 'Someone already booked this round')
                                : tr(lang, 'ที่นั่งในรอบนี้ไม่พอสำหรับกลุ่ม', 'Not enough seats left for a group')
                              : tierDesc(t, lang) + (t.lock ? '' : tr(lang, ' · เรียนร่วมกับคนอื่นได้', ' · alongside others'))
                            : tr(lang, 'จอง 1 ที่นั่ง เรียนร่วมกับคนอื่น', 'One seat, alongside others')}
                      </span>
                      {/* Range tier: how many are coming (the booker counts as one) */}
                      {on && ok && t.mode === 'range' && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, fontSize: 13 }}>
                          <span>{tr(lang, 'จำนวนคน (รวมคุณ)', 'People (you included)')}</span>
                          <select value={rangeN} onChange={(e) => setGroupN(Number(e.target.value))} className="input-field" style={{ width: 'auto', padding: '4px 8px' }}>
                            {Array.from({ length: Math.max(0, rangeMax - (t.min || 2) + 1) }, (_, i) => (t.min || 2) + i).map((n) => (
                              <option key={n} value={n}>{n}</option>
                            ))}
                          </select>
                        </span>
                      )}
                    </span>
                    <b style={{ color: 'var(--teal-deep)', textAlign: 'right' }}>
                      {on && isGroupTier(t) ? (
                        <>
                          {baht(total)}
                          <span style={{ display: 'block', fontSize: 11, fontWeight: 400, color: 'var(--muted)' }}>{seats} × {baht(t.price)}</span>
                        </>
                      ) : (
                        <>
                          {baht(t.price)}
                          {isGroupTier(t) && <span style={{ display: 'block', fontSize: 11, fontWeight: 400, color: 'var(--muted)' }}>{tr(lang, '/คน', '/person')}</span>}
                        </>
                      )}
                    </b>
                  </label>
                );
              })}
            </div>
          </div>
        </div>

        <div className="sp-foot">
          <button type="button" onClick={onClose} className="btn btn-paper btn-sm">{tr(lang, 'ยกเลิก', 'Cancel')}</button>
          <Btn kind="teal" disabled={!canNext} onClick={() => session && onNext(session, kind, tier, seats)} style={{ marginLeft: 'auto', opacity: canNext ? 1 : 0.5 }}>
            {tr(lang, 'ต่อไป', 'Next')} <span className="mono">→</span>
          </Btn>
        </div>
      </div>
    </div>
  );
}
