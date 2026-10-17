'use client';

import { PageLoader } from '@/components/design/PageLoader';

import { useEffect, useState, type ReactNode } from 'react';
import { useParams } from 'next/navigation';
import type { DayTime, Workshop } from '@/lib/types';
import { getWorkshopDays, safeParseArray } from '@/lib/workshop-utils';
import { formatTravel, type TravelInfo } from '@/lib/travel';
import { PdpaBadge } from '@/components/workshops/PdpaBadge';
import { RefundSlipModal } from '@/components/admin/RefundSlipModal';
import { FacilitatorNote } from '@/components/admin/FacilitatorNote';
import { applicantName } from '@/lib/applicant';
import { adminAlert, AdminHead, AdminSheet, Badge } from '@/components/admin/AdminShell';

type BookingRow = {
  id: string;
  user_name: string | null;
  user_email: string | null;
  status: string;
  payment_status: string;
  amount: number;
  attended: number | null;
  application_json: string | null;
  /** Staff-only note about this participant (migration 045). */
  facilitator_note: string | null;
  attendance_json: string | null;
  refund_slip_url: string | null;
  refund_slip_meta: string | null;
  created_at: string;
};

/** DD/MM/YYYY (Gregorian, numeric). */
function fmtDMY(d: string): string {
  const [y, m, day] = (d || '').split('-');
  return y && m && day ? `${day}/${m}/${y}` : d;
}

/** Parse a booking's per-day check-in map: { "0": 1, "1": 0 }. */
function parseAttendance(json: string | null): Record<string, number> {
  if (!json) return {};
  try {
    const v = JSON.parse(json);
    return v && typeof v === 'object' ? (v as Record<string, number>) : {};
  } catch {
    return {};
  }
}

type AppAnswer = { id: string; label: string; value: string | string[] };
type AppProfile = {
  fullName?: string;
  nickname?: string;
  age?: number | null;
  gender?: string;
  email?: string;
  phone?: string;
  facebook?: string;
  lineId?: string;
  emergency?: { name?: string; relation?: string; phone?: string };
  medical?: string;
  dietary?: string;
};
type ApplicationSnapshot = {
  profile?: AppProfile;
  answers?: AppAnswer[];
  /** Absent on applications submitted before the travel question existed. */
  travel?: TravelInfo;
  consent?: { photoVideo?: string; label?: string };
};

export default function AttendancePage() {
  const { id } = useParams<{ id: string }>();
  const [workshop, setWorkshop] = useState<Workshop | null>(null);
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const [slipFor, setSlipFor] = useState<BookingRow | null>(null);
  const [activeDay, setActiveDay] = useState(0);
  const [showAdd, setShowAdd] = useState(false);
  // The row admin asked to take off the workshop, held while they confirm.
  const [removeFor, setRemoveFor] = useState<BookingRow | null>(null);

  const isDeposit = workshop?.payment_type === 'deposit';
  const days = workshop ? getWorkshopDays(workshop) : [];
  const isMultiDay = days.length > 1;
  const dayTimes = workshop ? safeParseArray<DayTime>(workshop.day_times_json, []) : [];

  async function load() {
    setLoadError(false);
    try {
      const [wsRes, bRes] = await Promise.all([
        fetch(`/api/workshops/${id}`),
        fetch(`/api/bookings?workshop_id=${id}`),
      ]);
      if (!wsRes.ok || !bRes.ok) throw new Error(`HTTP ${wsRes.status}/${bRes.status}`);
      const wsData = (await wsRes.json()) as { workshop: Workshop };
      const bData = (await bRes.json()) as { bookings: BookingRow[] };
      setWorkshop(wsData.workshop);
      // Keep every paid booking on the roster — including ones later cancelled
      // (user cancellation or a cancelled event), so admin never loses the list
      // and can still attach a refund slip. `payment_status='paid'` survives a
      // status→'cancelled' change, so those rows stay visible.
      setBookings(
        (bData.bookings || []).filter((b) => b.payment_status === 'paid' || b.status === 'confirmed'),
      );
    } catch (e) {
      console.error('Failed to load attendance', e);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function mark(bookingId: string, attended: number | null) {
    setPendingIds((s) => new Set(s).add(bookingId));
    // optimistic update
    setBookings((rows) =>
      rows.map((r) => (r.id === bookingId ? { ...r, attended } : r))
    );
    try {
      await fetch(`/api/bookings/${bookingId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attended }),
      });
    } finally {
      setPendingIds((s) => {
        const next = new Set(s);
        next.delete(bookingId);
        return next;
      });
    }
  }

  /** Toggle a single day's check-in for a booking (multi-day workshops). */
  async function markDay(bookingId: string, dayIndex: number, present: boolean) {
    setPendingIds((s) => new Set(s).add(bookingId));
    // optimistic update of the per-day map
    setBookings((rows) =>
      rows.map((r) => {
        if (r.id !== bookingId) return r;
        const map = parseAttendance(r.attendance_json);
        if (present) map[String(dayIndex)] = 1;
        else delete map[String(dayIndex)];
        return { ...r, attendance_json: JSON.stringify(map) };
      })
    );
    try {
      await fetch(`/api/bookings/${bookingId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attendance_day: dayIndex, present }),
      });
    } finally {
      setPendingIds((s) => {
        const next = new Set(s);
        next.delete(bookingId);
        return next;
      });
    }
  }

  /** Take a participant off the workshop.
   *
   *  A seat that took money is cancelled rather than deleted: revenue, payouts
   *  and the reconcile screens are read straight off the booking row, so
   *  deleting one would take the money out of the books with it. A ฿0 seat —
   *  a manual add, a free confirm — has nothing to keep, and goes for good. */
  async function removeParticipant(b: BookingRow) {
    const paidForMoney = b.payment_status === 'paid' && b.amount > 0;
    setPendingIds((s) => new Set(s).add(b.id));
    try {
      if (paidForMoney) {
        const res = await fetch(`/api/bookings/${b.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'cancelled' }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setBookings((rows) => rows.map((r) => (r.id === b.id ? { ...r, status: 'cancelled' } : r)));
      } else {
        const res = await fetch(`/api/bookings/${b.id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setBookings((rows) => rows.filter((r) => r.id !== b.id));
      }
      setRemoveFor(null);
    } catch (e) {
      console.error('Failed to remove participant', e);
      adminAlert('เอาผู้เข้าร่วมออกไม่สำเร็จ', 'กรุณาลองใหม่');
    } finally {
      setPendingIds((s) => {
        const next = new Set(s);
        next.delete(b.id);
        return next;
      });
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <PageLoader />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-4 text-gray">
        <p>โหลดข้อมูลไม่สำเร็จ</p>
        <button onClick={() => { setLoading(true); load(); }} className="border border-primary text-primary rounded-full px-6 py-2 text-sm font-semibold">ลองใหม่</button>
      </div>
    );
  }

  if (!workshop) {
    return <p className="text-gray text-center py-12">ไม่พบกิจกรรม</p>;
  }

  const attended = bookings.filter((b) => b.attended === 1).length;
  const missed = bookings.filter((b) => b.attended === 0).length;
  const unmarked = bookings.filter((b) => b.attended == null).length;

  // Slip column: shown for any paid workshop (deposit or full). Wording follows
  // the payment model — "คืนมัดจำ" for deposit, "คืนเงิน" otherwise. Admin can
  // attach to any paid participant without cancelling the whole event first.
  const showSlipCol = workshop.payment_type !== 'free';
  const slipNoun = isDeposit ? 'สลิปคืนมัดจำ' : 'สลิปคืนเงิน';

  // Per-day (active session) stats for multi-day workshops.
  const day = Math.min(activeDay, Math.max(0, days.length - 1));
  const presentToday = bookings.filter(
    (b) => parseAttendance(b.attendance_json)[String(day)] === 1
  ).length;
  const absentToday = bookings.length - presentToday;
  const activeDt = dayTimes.find((d) => d.date === days[day]);

  return (
    <>
      <AdminHead
        back={{ href: '/admin/workshops', label: 'กลับไปรายการกิจกรรม' }}
        eyebrow="admin · attendance"
        title={`เช็คชื่อ · ${workshop.title}`}
        sub={
          isMultiDay
            ? `${fmtDMY(days[0])}–${fmtDMY(days[days.length - 1])} · ${days.length} วัน · ${bookings.length} ผู้ลงทะเบียน`
            : `${new Date(workshop.date).toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} · ${workshop.time_start}–${workshop.time_end} · ${bookings.length} ผู้ลงทะเบียน`
        }
        actions={
          <button type="button" onClick={() => setShowAdd(true)} className="adm-btn teal">
            + เพิ่มผู้เข้าร่วม
          </button>
        }
      />

      {/* Day selector — only for multi-day workshops */}
      {isMultiDay && (
        <div>
          <p className="adm-label" style={{ fontSize: 11, margin: '0 0 8px' }}>
            เลือกวันที่เช็คชื่อ
          </p>
          <div className="adm-daytabs">
            {days.map((d, i) => (
              <button key={d} type="button" onClick={() => setActiveDay(i)} className={`adm-daytab${i === day ? ' is-on' : ''}`} aria-pressed={i === day}>
                <b>วันที่ {i + 1}</b>
                <span>{fmtDMY(d)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Quick stats */}
      <section className="adm-kpis" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))' }}>
        {isMultiDay ? (
          <>
            <StatTile label={`เช็คอินแล้ว · ${fmtDMY(days[day])}${activeDt ? ` · ${activeDt.time_start}–${activeDt.time_end}` : ''}`} value={presentToday} tone="ok" />
            <StatTile label="ยังไม่เช็คอิน" value={absentToday} tone="mute" />
          </>
        ) : (
          <>
            <StatTile label="มาเข้าร่วม" value={attended} tone="ok" />
            <StatTile label="ไม่ได้มา" value={missed} tone="warn" />
            <StatTile label="ยังไม่ตรวจ" value={unmarked} tone="mute" />
          </>
        )}
      </section>

      <section className="adm-card">
        {bookings.length === 0 ? (
          <p className="adm-empty">ยังไม่มีผู้ที่ชำระเงินสำหรับกิจกรรมนี้</p>
        ) : (
          bookings.map((b, idx) => {
            const busy = pendingIds.has(b.id);
            const open = openId === b.id;
            // The name on the application, not the account's display name —
            // see lib/applicant.ts.
            const name = applicantName(b.application_json, b.user_name);
            // Any secured participant (paid or confirmed) can get a refund slip
            // — the amount may be ฿0 for manually added or free-confirmed seats.
            const slipOk = showSlipCol && (b.payment_status === 'paid' || b.status === 'confirmed');
            const present = isMultiDay && parseAttendance(b.attendance_json)[String(day)] === 1;
            return (
              <div key={b.id} className="adm-att" style={{ borderTop: idx ? '1px solid var(--adm-line)' : 0, opacity: b.status === 'cancelled' ? 0.6 : 1 }}>
                <div className="adm-att-row">
                  <div className="adm-att-who">
                    <span className="adm-avatar" style={{ width: 40, height: 40, fontSize: 14 }}>
                      {(name || '?').charAt(0).toUpperCase()}
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontWeight: 600, fontSize: 15 }}>{name}</span>
                        <PdpaBadge applicationJson={b.application_json} />
                        {b.status === 'cancelled' && <Badge tone="bad">ยกเลิกแล้ว</Badge>}
                      </div>
                      <div className="adm-meta" style={{ marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {b.user_email || '—'} · <span className="adm-mono">฿{b.amount.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>

                  {isMultiDay ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => markDay(b.id, day, !present)}
                      title={present ? 'คลิกเพื่อยกเลิกเช็คอิน' : 'คลิกเพื่อเช็คอิน'}
                      className={`adm-btn${present ? ' teal' : ' soft'}`}
                      style={{ minHeight: 42 }}
                    >
                      {present ? '✓ เช็คอินแล้ว' : 'เช็คอิน'}
                    </button>
                  ) : (
                    <div role="group" aria-label="การเข้าร่วม" className="adm-seg">
                      <AttendChip label="มา" active={b.attended === 1} disabled={busy} tone="green" onClick={() => mark(b.id, 1)} />
                      <AttendChip label="ไม่มา" active={b.attended === 0} disabled={busy} tone="orange" onClick={() => mark(b.id, 0)} />
                      <AttendChip label="—" active={b.attended == null} disabled={busy} tone="gray" onClick={() => mark(b.id, null)} />
                    </div>
                  )}

                  <div className="adm-att-acts">
                    <button type="button" onClick={() => setOpenId(open ? null : b.id)} className="adm-btn sm" aria-expanded={open}>
                      {open ? 'ซ่อนใบสมัคร' : 'ดูใบสมัคร'}
                    </button>
                    {slipOk &&
                      (b.refund_slip_url ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <a href={b.refund_slip_url} target="_blank" rel="noopener noreferrer" className="adm-thumb" style={{ width: 30, height: 36 }} title="ดูสลิป">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={b.refund_slip_url} alt="slip" />
                          </a>
                          <button type="button" onClick={() => setSlipFor(b)} className="adm-btn sm soft">
                            แก้{slipNoun}
                          </button>
                        </span>
                      ) : (
                        <button type="button" onClick={() => setSlipFor(b)} className="adm-btn sm soft">
                          + แนบ{slipNoun}
                        </button>
                      ))}
                    {b.status !== 'cancelled' && (
                      <button type="button" onClick={() => setRemoveFor(b)} disabled={busy} className="adm-btn sm danger">
                        เอาออก
                      </button>
                    )}
                  </div>
                </div>
                {open && (
                  <div className="adm-att-detail">
                    <ApplicationDetail json={b.application_json} />
                    <FacilitatorNote
                      // Remount per booking so the textarea always starts from
                      // that participant's saved note.
                      key={b.id}
                      initial={b.facilitator_note ?? null}
                      endpoint={`/api/bookings/${b.id}`}
                    />
                  </div>
                )}
              </div>
            );
          })
        )}
      </section>

      {slipFor && (
        <RefundSlipModal
          booking={slipFor}
          title={slipNoun}
          autoCancels={!isDeposit}
          onClose={() => setSlipFor(null)}
          onSaved={(url, meta) => {
            // A full refund (non-deposit) auto-cancels the booking server-side —
            // mirror that locally so the row reflects it immediately.
            const autoCancel = !!url && !isDeposit;
            const patch = (r: BookingRow) =>
              r.id === slipFor.id
                ? {
                    ...r,
                    refund_slip_url: url,
                    refund_slip_meta: meta ? JSON.stringify(meta) : null,
                    status: autoCancel ? 'cancelled' : r.status,
                  }
                : r;
            setBookings((rows) => rows.map(patch));
            setSlipFor(null);
          }}
        />
      )}

      {removeFor && (
        <RemoveParticipantModal
          booking={removeFor}
          busy={pendingIds.has(removeFor.id)}
          onClose={() => setRemoveFor(null)}
          onConfirm={() => removeParticipant(removeFor)}
        />
      )}

      {showAdd && (
        <AddParticipantModal
          workshopId={id}
          // Only live rows block: someone whose booking was cancelled can be
          // added back (the API revives that same booking).
          existingEmails={new Set(bookings.filter((b) => b.status !== 'cancelled').map((b) => (b.user_email || '').toLowerCase()).filter(Boolean))}
          onClose={() => setShowAdd(false)}
          onAdded={(booking) => {
            // A revived booking comes back with its old id — replace that row.
            setBookings((rows) => [booking, ...rows.filter((r) => r.id !== booking.id)]);
            setShowAdd(false);
          }}
        />
      )}
    </>
  );
}


type UserHit = { id: string; name: string | null; email: string | null };

/** Search the user directory and add one as a manual participant. */
/**
 * Confirm taking a participant off the workshop. What the button does depends
 * on the seat: one that took money is cancelled (the money stays in the books),
 * a ฿0 one is deleted outright — so the dialog says which before it happens.
 */
function RemoveParticipantModal({
  booking,
  busy,
  onClose,
  onConfirm,
}: {
  booking: BookingRow;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const paidForMoney = booking.payment_status === 'paid' && booking.amount > 0;
  const name = applicantName(booking.application_json, booking.user_name);
  return (
    <div className="adm-dlg-scrim" onClick={onClose}>
      <div className="adm-dlg" role="alertdialog" aria-modal="true" aria-labelledby="rm-title" onClick={(e) => e.stopPropagation()}>
        <h3 id="rm-title">{paidForMoney ? 'ยกเลิกที่นั่งนี้?' : 'เอาผู้เข้าร่วมออก?'}</h3>
        <div style={{ fontSize: 14, marginBottom: 8 }}>
          <b style={{ fontWeight: 600 }}>{name}</b>
          {booking.user_email ? <span className="adm-meta"> · {booking.user_email}</span> : null}
        </div>
        {paidForMoney ? (
          <p>
            ที่นั่งนี้ชำระเงินมาแล้ว ฿{booking.amount.toLocaleString()} ระบบจะ<b style={{ color: 'var(--ink)' }}>ยกเลิกที่นั่ง</b>
            เพื่อคืนที่ว่างให้คนอื่น แต่ยังเก็บรายการเงินไว้ในรายงาน — แถวนี้จะยังอยู่ในรายชื่อพร้อมป้าย “ยกเลิกแล้ว”
            เผื่อต้องแนบสลิปคืนเงินภายหลัง
          </p>
        ) : (
          <p>
            ที่นั่งนี้ไม่มียอดชำระ ระบบจะ<b style={{ color: 'var(--ink)' }}>ลบออกถาวร</b> พร้อมลิงก์โอนสิทธิ์ที่ผูกกับที่นั่งนี้ (ถ้ามี) —
            กู้คืนไม่ได้
          </p>
        )}
        <div className="adm-dlg-acts">
          <button type="button" onClick={onClose} disabled={busy} className="adm-btn">
            ยกเลิก
          </button>
          <button type="button" onClick={onConfirm} disabled={busy} className="adm-btn bad">
            {busy ? 'กำลังดำเนินการ…' : paidForMoney ? 'ยกเลิกที่นั่ง' : 'ลบออกถาวร'}
          </button>
        </div>
      </div>
    </div>
  );
}

function AddParticipantModal({
  workshopId,
  existingEmails,
  onClose,
  onAdded,
}: {
  workshopId: string;
  existingEmails: Set<string>;
  onClose: () => void;
  onAdded: (booking: BookingRow) => void;
}) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<UserHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<UserHit | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Debounced typeahead against /api/users?q=
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/users?q=${encodeURIComponent(term)}`);
        const data = (await res.json()) as { users?: UserHit[] };
        if (!cancelled) setResults(data.users || []);
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q]);

  async function confirm() {
    if (!selected) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/workshops/${workshopId}/attendance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: selected.id }),
      });
      const data = (await res.json()) as { booking?: BookingRow; error?: string };
      if (!res.ok || !data.booking) {
        setError(data.error || 'เพิ่มไม่สำเร็จ');
        return;
      }
      onAdded(data.booking);
    } catch {
      setError('เชื่อมต่อไม่ได้');
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminSheet
      open
      onClose={onClose}
      eyebrow="admin · attendance"
      title="เพิ่มผู้เข้าร่วม"
      sub="ค้นหาด้วยชื่อ หรืออีเมล"
      width={520}
      footer={
        <>
          <button type="button" onClick={onClose} className="adm-btn">
            ยกเลิก
          </button>
          <button type="button" onClick={confirm} disabled={!selected || saving} className="adm-btn teal">
            {saving ? 'กำลังเพิ่ม…' : 'ยืนยันเพิ่มเข้ารายชื่อ'}
          </button>
        </>
      }
    >
      <div style={{ padding: '20px 0', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {error && <div className="adm-notice is-bad">{error}</div>}
        <input
          autoFocus
          type="text"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setSelected(null);
          }}
          placeholder="พิมพ์ชื่อ หรืออีเมล..."
          aria-label="ค้นหาผู้เข้าร่วม"
        />
        {selected ? (
          <div className="adm-picked">
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 14.5 }}>{selected.name || '—'}</div>
              <div className="adm-meta">{selected.email || '—'}</div>
            </div>
            <button type="button" onClick={() => setSelected(null)} className="adm-btn sm white">
              เปลี่ยน
            </button>
          </div>
        ) : searching ? (
          <p className="adm-meta" style={{ textAlign: 'center', padding: '24px 0', margin: 0, fontSize: 13.5 }}>
            กำลังค้นหา…
          </p>
        ) : q.trim().length < 2 ? (
          <p className="adm-meta" style={{ textAlign: 'center', padding: '24px 0', margin: 0, fontSize: 13.5 }}>
            พิมพ์อย่างน้อย 2 ตัวอักษร
          </p>
        ) : results.length === 0 ? (
          <p className="adm-meta" style={{ textAlign: 'center', padding: '24px 0', margin: 0, fontSize: 13.5 }}>
            ไม่พบผู้เข้าร่วม
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {results.map((u) => {
              const already = existingEmails.has((u.email || '').toLowerCase());
              return (
                <button key={u.id} type="button" disabled={already} onClick={() => setSelected(u)} className="adm-pick-row">
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <b>{u.name || '—'}</b>
                    <span>{u.email || '—'}</span>
                  </span>
                  {already && <span className="adm-meta" style={{ fontSize: 11.5 }}>อยู่ในรายชื่อแล้ว</span>}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </AdminSheet>
  );
}

function ApplicationDetail({ json }: { json: string | null }) {
  let snap: ApplicationSnapshot | null = null;
  try {
    snap = json ? (JSON.parse(json) as ApplicationSnapshot) : null;
  } catch {
    snap = null;
  }
  if (!snap) {
    return <p className="adm-meta" style={{ margin: 0 }}>ไม่มีข้อมูลใบสมัคร</p>;
  }
  const p = snap.profile || {};
  const items: [string, string][] = [
    ['ชื่อ-นามสกุล', p.fullName || '—'],
    ['ชื่อเล่น', p.nickname || '—'],
    ['อายุ', p.age != null ? `${p.age} ปี` : '—'],
    ['เพศ', p.gender || '—'],
    ['โทร', p.phone || '—'],
    ['อีเมล', p.email || '—'],
    ['Facebook', p.facebook || '—'],
    ['Line', p.lineId || '—'],
    ['ผู้ติดต่อฉุกเฉิน', p.emergency ? `${p.emergency.name || '—'} (${p.emergency.relation || '—'}) ${p.emergency.phone || ''}` : '—'],
    ['สุขภาพ/แพ้', p.medical || '—'],
    ['อาหาร', p.dietary || '—'],
    ['การเดินทาง', formatTravel(snap.travel)],
  ];
  return (
    <>
      <div className="adm-app-grid">
        {items.map(([k, v]) => (
          <div key={k}>
            <div className="adm-label" style={{ letterSpacing: '.08em' }}>
              {k}
            </div>
            <div className="adm-app-v">{v}</div>
          </div>
        ))}
      </div>
      {(snap.answers || []).length > 0 && (
        <div className="adm-app-sec">
          <div style={{ fontSize: 13, fontWeight: 600 }}>คำตอบแบบฟอร์ม</div>
          {(snap.answers || []).map((a) => (
            <div key={a.id} style={{ fontSize: 13.5 }}>
              <span className="adm-meta" style={{ fontSize: 13.5 }}>{a.label}: </span>
              {Array.isArray(a.value) ? a.value.join(', ') : a.value || '—'}
            </div>
          ))}
        </div>
      )}
      {snap.consent && (
        <div className="adm-app-sec" style={{ fontSize: 13.5 }}>
          <span>
            <span className="adm-meta" style={{ fontSize: 13.5 }}>ยินยอมบันทึกภาพ/วิดีโอ (PDPA): </span>
            <b style={{ fontWeight: 600, color: snap.consent.photoVideo === 'granted' ? '#0b6b4f' : '#c75f17' }}>
              {snap.consent.label || (snap.consent.photoVideo === 'granted' ? 'ยินยอม' : 'ไม่ยินยอม')}
            </b>
          </span>
        </div>
      )}
    </>
  );
}

function StatTile({ label, value, tone }: { label: string; value: number; tone: 'ok' | 'warn' | 'mute' }) {
  const [bg, color] = tone === 'ok' ? ['#dff3ec', '#0b6b4f'] : tone === 'warn' ? ['#fdf1d3', '#7a5200'] : ['#eceeed', '#4c5755'];
  return (
    <div className="adm-kpi adm-stat">
      <span className="adm-label" style={{ fontSize: 11, lineHeight: '16px' }}>
        {label}
      </span>
      <span className="adm-stat-value" style={{ background: bg, color }}>
        {value}
      </span>
    </div>
  );
}

function AttendChip({
  label,
  active,
  disabled,
  tone,
  onClick,
}: {
  label: ReactNode;
  active: boolean;
  disabled: boolean;
  tone: 'green' | 'orange' | 'gray';
  onClick: () => void;
}) {
  const on = tone === 'green' ? ['#0b6b4f', '#fff'] : tone === 'orange' ? ['#c75f17', '#fff'] : ['#4c5755', '#fff'];
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className="adm-seg-btn"
      style={active ? { background: on[0], color: on[1] } : undefined}
    >
      {label}
    </button>
  );
}
