'use client';

/* The step before the application form on a session-based activity, built
 * from the "Application Popups" design (2b): three stages on one screen —
 * the month grid full width on top, then the rounds that day beside the
 * booking type — and a cream summary band with the total before moving on.
 * Days without a round are disabled; a day that arrived in the URL (from a
 * teacher's profile) starts selected. */

import { useEffect, useMemo, useState } from 'react';
import { useLang, tr } from '@/lib/i18n';
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
  const [tierId, setTierId] = useState('');
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
  // The admin's tiers; an older master's seat price leads them.
  const tiers = bookableTiers(master, session?.price);
  // What a tier needs from the round: a locking tier (whole round, or a group
  // that locks it) needs it empty; a group needs room for its smallest size.
  const tierOk = (t: PriceTier) => {
    if (t.mode === 'round') return roundOk;
    if (!groupOk) return false;
    if (t.lock) return roundOk && seatsLeft >= (t.mode === 'pack' ? t.size || 2 : t.mode === 'range' ? t.min || 2 : 1);
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
  const rangeMin = tier.min || 2;
  const rangeMax = tier.mode === 'range' ? Math.min(tier.max || 2, session ? seatsLeft : tier.max || 2) : 0;
  const rangeN = tier.mode === 'range' ? Math.min(rangeMax, Math.max(rangeMin, groupN ?? rangeMin)) : 0;
  const seats = tier.mode === 'range' ? rangeN : tierSeats(tier) || 1;
  const total = tierTotal(tier, seats);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const canNext = !!session && tierOk(tier) && (tier.mode !== 'range' || rangeN >= rangeMin);

  // Why a tier the visitor might want is greyed out — one line under the card.
  const blocked = tiers.filter((t) => session && !tierOk(t));
  const blockedNote = blocked
    .map((t) =>
      t.mode === 'round' || t.lock
        ? tr(lang, `${t.label}เลือกไม่ได้ — รอบนี้มีคนจองแล้ว`, `${t.label} unavailable — someone already booked this round`)
        : tr(lang, `${t.label}เลือกไม่ได้ — ที่นั่งในรอบนี้ไม่พอ`, `${t.label} unavailable — not enough seats left`),
    )
    .join(' · ');

  // A whole-round buy is the room itself, so the band counts its seats.
  const shown = tier.mode === 'round' && session ? session.max_participants : seats;
  const summary = session
    ? `${fmtDate(session.date, lang, 'medium')} · ${session.time_start}–${session.time_end} · ${tr(lang, `${shown} คน`, `${shown} ${shown === 1 ? 'person' : 'people'}`)}`
    : day
      ? tr(lang, 'เลือกรอบของวันนี้', 'Pick a round for this day')
      : tr(lang, 'ยังไม่ได้เลือกวัน', 'No day chosen yet');

  return (
    <div
      className="sp2-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="sp2-box pop-mitr" role="dialog" aria-modal="true" aria-label={tr(lang, 'เลือกรอบ', 'Choose a round')}>
        <div className="sp2-head">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="mono sp2-eyebrow">{tr(lang, 'เลือกรอบ · 3 ขั้น', 'Choose a round · 3 steps')}</div>
            <h2 className="display-th u-clamp-2" style={{ fontSize: 24, margin: '4px 0 0' }}>{master.title}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label={tr(lang, 'ปิด', 'Close')} className="sp2-close">×</button>
        </div>

        <div className="sp2-body">
          {/* 01 — day */}
          <div>
            <div className="mono sp2-eyebrow" style={{ marginBottom: 10 }}>01 — {tr(lang, 'วัน', 'Day')}</div>
            <div className="sp2-cal">
              <MonthPicker value={day} onChange={setDay} enabled={days} marks={marks} initialMonth={open[0]?.date} sub={tr(lang, `${days.size} วันเปิดรอบ`, `${days.size} days with rounds`)} />
            </div>
          </div>

          <div className="sp2-cols">
            {/* 02 — round */}
            <div>
              <div className="mono sp2-eyebrow" style={{ marginBottom: 10 }}>02 — {tr(lang, 'รอบ', 'Round')}</div>
              {!day ? (
                <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0, lineHeight: 1.6 }}>{tr(lang, 'จิ้มวันในปฏิทินเพื่อดูรอบ', 'Tap a day on the calendar to see its rounds.')}</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {onDay.map((s) => {
                    const left = Math.max(0, s.max_participants - s.booked);
                    const full = s.private_taken > 0 || left <= 0;
                    const on = sessionId === s.id;
                    return (
                      <label key={s.id} className={`sp2-round${on ? ' on' : ''}${full ? ' full' : ''}`}>
                        <input type="radio" name="session" checked={on} disabled={full} onChange={() => setSessionId(s.id)} />
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span className="display-th" style={{ display: 'block', fontSize: 17 }}>{s.time_start}–{s.time_end}</span>
                          <span style={{ display: 'block', fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{s.is_online ? 'ONLINE' : s.location || '—'}</span>
                        </span>
                        <span className={`tag ${full ? 'tag-warn' : 'tag-ink'}`} style={{ fontSize: 11, padding: '4px 10px' }}>
                          {full ? tr(lang, 'เต็ม', 'Full') : s.booked === 0 ? tr(lang, 'ว่าง', 'Open') : tr(lang, `เหลือ ${left}`, `${left} left`)}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 03 — booking type */}
            <div>
              <div className="mono sp2-eyebrow" style={{ marginBottom: 10 }}>03 — {tr(lang, 'รูปแบบ', 'Type')}</div>
              <div className="sp2-seg">
                {tiers.map((t) => {
                  const ok = !session || tierOk(t);
                  const on = tier.id === t.id;
                  return (
                    <button key={t.id} type="button" className={on ? 'on' : ''} disabled={!ok} onClick={() => setTierId(t.id)}>
                      {t.label}
                    </button>
                  );
                })}
              </div>
              <div className="sp2-tier">
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
                  <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>{tier.label}</span>
                  <b className="display-th" style={{ fontSize: 17, color: 'var(--teal-deep)', whiteSpace: 'nowrap' }}>
                    {baht(tier.price)}
                    {isGroupTier(tier) && <span className="mono" style={{ fontSize: 10, fontWeight: 400, color: 'var(--muted)' }}> {tr(lang, '/คน', '/person')}</span>}
                  </b>
                </div>
                <p style={{ margin: '6px 0 0', fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.55 }}>
                  {tier.mode === 'round'
                    ? tr(lang, 'เหมาทั้งรอบ ไม่มีคนอื่นร่วม', 'The whole round, nobody else')
                    : isGroupTier(tier)
                      ? tierDesc(tier, lang) + (tier.lock ? '' : tr(lang, ' · เรียนร่วมกับคนอื่นได้', ' · alongside others')) + (session ? tr(lang, ` · รอบนี้รับได้ถึง ${seatsLeft} คน`, ` · this round has room for ${seatsLeft}`) : '')
                      : tier.lock
                        ? tr(lang, 'จอง 1 ที่นั่ง แล้วรอบนี้เป็นของคุณคนเดียว', 'One seat, and the round is yours alone')
                        : tr(lang, 'จอง 1 ที่นั่ง เรียนร่วมกับคนอื่น', 'One seat, alongside others')}
                </p>
                {tier.mode === 'range' && (
                  <div className="sp2-stepper">
                    <span style={{ fontSize: 13, color: 'var(--ink)', whiteSpace: 'nowrap' }}>{tr(lang, 'จำนวนคน (รวมคุณ)', 'People (you included)')}</span>
                    <span className="sp2-stepper-ctl">
                      <button type="button" aria-label={tr(lang, 'ลด', 'Fewer')} disabled={rangeN <= rangeMin} onClick={() => setGroupN(Math.max(rangeMin, rangeN - 1))}>−</button>
                      <span className="display-th">{rangeN}</span>
                      <button type="button" aria-label={tr(lang, 'เพิ่ม', 'More')} className="plus" disabled={!session || rangeN >= rangeMax} onClick={() => setGroupN(Math.min(rangeMax, rangeN + 1))}>+</button>
                    </span>
                  </div>
                )}
              </div>
              {blockedNote && <p style={{ margin: '12px 2px 0', fontSize: 12, color: 'var(--muted)', lineHeight: 1.6 }}>{blockedNote}</p>}
            </div>
          </div>
        </div>

        <div className="sp2-foot">
          <div style={{ flex: 1, minWidth: 180 }}>
            <div className="mono" style={{ fontSize: 9.5, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--muted)' }}>{summary}</div>
            <div className="display-th" style={{ fontSize: 26, color: 'var(--ink)', lineHeight: 1.1, marginTop: 3 }}>{session ? baht(total) : '—'}</div>
          </div>
          <button type="button" onClick={onClose} className="btn btn-paper btn-sm">{tr(lang, 'ยกเลิก', 'Cancel')}</button>
          <button type="button" className="btn btn-ink" disabled={!canNext} onClick={() => session && onNext(session, kind, tier, seats)} style={{ opacity: canNext ? 1 : 0.5, cursor: canNext ? 'pointer' : 'not-allowed' }}>
            {tr(lang, 'ต่อไป', 'Next')} <span className="mono">→</span>
          </button>
        </div>
      </div>
    </div>
  );
}
