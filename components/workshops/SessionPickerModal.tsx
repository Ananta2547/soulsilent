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
  onNext: (session: PickableSession, kind: BookingKind) => void;
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
  const [kindPicked, setKind] = useState<BookingKind>('group');

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
  // Private means nobody else in the room, so it is only offered while the
  // round is still empty.
  const privateOffered = master.price_private != null;
  const privateOk = !!session && privateOffered && session.booked === 0;
  // A private pick that the chosen round cannot honour reads as group.
  const kind: BookingKind = kindPicked === 'private' && !privateOk ? 'group' : kindPicked;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const canNext = !!session && (kind === 'group' ? groupOk : privateOk);
  const groupPrice = session ? session.price : master.price_group ?? 0;

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

            {/* Group or private */}
            <div className="sp-label" style={{ marginTop: 18 }}>
              <T th="รูปแบบการจอง" en="Booking type" />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label className={`sp-kind${kind === 'group' ? ' on' : ''}`}>
                <input type="radio" name="kind" checked={kind === 'group'} disabled={!!session && !groupOk} onChange={() => setKind('group')} />
                <span style={{ flex: 1 }}>
                  <span style={{ display: 'block', fontWeight: 700, fontSize: 14 }}>{tr(lang, 'กลุ่ม (Group)', 'Group')}</span>
                  <span style={{ display: 'block', fontSize: 12.5, color: 'var(--muted)' }}>{tr(lang, 'จอง 1 ที่นั่ง เรียนร่วมกับคนอื่น', 'One seat, alongside others')}</span>
                </span>
                <b style={{ color: 'var(--teal-deep)' }}>{baht(groupPrice)}</b>
              </label>
              {privateOffered && (
                <label className={`sp-kind${kind === 'private' ? ' on' : ''}${session && !privateOk ? ' off' : ''}`}>
                  <input type="radio" name="kind" checked={kind === 'private'} disabled={!!session && !privateOk} onChange={() => setKind('private')} />
                  <span style={{ flex: 1 }}>
                    <span style={{ display: 'block', fontWeight: 700, fontSize: 14 }}>{tr(lang, 'ส่วนตัว (Private)', 'Private')}</span>
                    <span style={{ display: 'block', fontSize: 12.5, color: 'var(--muted)' }}>
                      {session && !privateOk
                        ? tr(lang, 'รอบนี้มีคนจองแล้ว จึงเหมาไม่ได้', 'Someone already booked this round')
                        : tr(lang, 'เหมาทั้งรอบ ไม่มีคนอื่นร่วม', 'The whole round, nobody else')}
                    </span>
                  </span>
                  <b style={{ color: 'var(--teal-deep)' }}>{baht(master.price_private || 0)}</b>
                </label>
              )}
            </div>
          </div>
        </div>

        <div className="sp-foot">
          <button type="button" onClick={onClose} className="btn btn-paper btn-sm">{tr(lang, 'ยกเลิก', 'Cancel')}</button>
          <Btn kind="teal" disabled={!canNext} onClick={() => session && onNext(session, kind)} style={{ marginLeft: 'auto', opacity: canNext ? 1 : 0.5 }}>
            {tr(lang, 'ต่อไป', 'Next')} <span className="mono">→</span>
          </Btn>
        </div>
      </div>
    </div>
  );
}
