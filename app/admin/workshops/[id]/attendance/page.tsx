'use client';

import { PageLoader } from '@/components/design/PageLoader';

import { Fragment, useEffect, useState, type ReactNode } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import type { DayTime, Workshop } from '@/lib/types';
import { getWorkshopDays, safeParseArray } from '@/lib/workshop-utils';
import { formatTravel, type TravelInfo } from '@/lib/travel';
import { PdpaBadge } from '@/components/workshops/PdpaBadge';
import { RefundSlipModal } from '@/components/admin/RefundSlipModal';
import { FacilitatorNote } from '@/components/admin/FacilitatorNote';
import { Icon } from '@/components/design/Icon';

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
    return <p className="text-gray text-center py-12">ไม่พบ Workshop</p>;
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
    <div className="space-y-6">
      <header>
        <Link
          href="/admin/workshops"
          className="text-xs font-mono text-gray hover:text-primary tracking-wider uppercase"
        >
          ← กลับไป Workshops
        </Link>
        <p className="text-xs font-mono text-primary tracking-[.2em] uppercase mt-3 mb-2">
          admin · attendance
        </p>
        <h1 className="font-heading text-3xl text-dark">เช็คชื่อ · {workshop.title}</h1>
        <p className="text-sm text-gray mt-1">
          {isMultiDay ? (
            <>
              {fmtDMY(days[0])}–{fmtDMY(days[days.length - 1])} · {days.length} วัน · {bookings.length} ผู้ลงทะเบียน
            </>
          ) : (
            <>
              {new Date(workshop.date).toLocaleDateString('th-TH', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}{' '}
              · {workshop.time_start}–{workshop.time_end} · {bookings.length} ผู้ลงทะเบียน
            </>
          )}
        </p>
      </header>

      {/* Day selector — only for multi-day workshops */}
      {isMultiDay && (
        <section>
          <p className="text-xs font-mono text-gray tracking-wider uppercase mb-2">เลือกวันที่เช็คชื่อ</p>
          <div className="flex gap-2 flex-wrap">
            {days.map((d, i) => {
              const on = i === day;
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => setActiveDay(i)}
                  className={`px-4 py-2 rounded-xl border text-sm font-medium transition ${
                    on
                      ? 'border-primary bg-primary text-white'
                      : 'border-gray-lighter bg-white text-dark hover:border-primary/40'
                  }`}
                >
                  <span className="block">วันที่ {i + 1}</span>
                  <span className={`block text-xs ${on ? 'text-white/80' : 'text-gray'}`}>{fmtDMY(d)}</span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Quick stats */}
      {isMultiDay ? (
        <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <StatTile label={`เช็คอินแล้ว · ${fmtDMY(days[day])}${activeDt ? ` · ${activeDt.time_start}–${activeDt.time_end}` : ''}`} value={presentToday} tint="bg-emerald-50 text-emerald-700" />
          <StatTile label="ยังไม่เช็คอิน" value={absentToday} tint="bg-gray-50 text-gray" />
        </section>
      ) : (
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <StatTile label="มาเข้าร่วม" value={attended} tint="bg-emerald-50 text-emerald-700" />
          <StatTile label="ไม่ได้มา" value={missed} tint="bg-orange-50 text-orange-700" />
          <StatTile label="ยังไม่ตรวจ" value={unmarked} tint="bg-gray-50 text-gray" />
        </section>
      )}

      {/* Add walk-in participant */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary/90 transition"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          เพิ่มผู้เข้าร่วม
        </button>
      </div>

      {/* Table */}
      <div className="card !p-0 overflow-hidden">
        {bookings.length === 0 ? (
          <p className="text-gray text-sm py-10 text-center">ยังไม่มีผู้ที่ชำระเงินสำหรับ workshop นี้</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface">
                <tr>
                  <th className="text-left py-3 px-5 text-gray font-medium">ผู้เข้าร่วม</th>
                  <th className="text-left py-3 px-5 text-gray font-medium">อีเมล</th>
                  <th className="text-center py-3 px-5 text-gray font-medium">ใบสมัคร</th>
                  <th className="text-right py-3 px-5 text-gray font-medium">จำนวน</th>
                  <th className="text-center py-3 px-5 text-gray font-medium">
                    {isMultiDay ? `เช็คอิน · วันที่ ${day + 1}` : 'การเข้าร่วม'}
                  </th>
                  {showSlipCol && (
                    <th className="text-center py-3 px-5 text-gray font-medium">{slipNoun}</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {bookings.map((b) => {
                  const busy = pendingIds.has(b.id);
                  const open = openId === b.id;
                  return (
                    <Fragment key={b.id}>
                      <tr className="border-t border-gray-lighter">
                        <td className="py-3 px-5 text-dark font-medium">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span>{b.user_name || '—'}</span>
                            <PdpaBadge applicationJson={b.application_json} />
                          </div>
                        </td>
                        <td className="py-3 px-5 text-gray text-xs">{b.user_email || '—'}</td>
                        <td className="py-3 px-5 text-center">
                          <button
                            type="button"
                            onClick={() => setOpenId(open ? null : b.id)}
                            className="text-xs font-medium text-primary hover:underline"
                          >
                            {open ? 'ซ่อน' : 'ดูใบสมัคร'}
                          </button>
                        </td>
                        <td className="py-3 px-5 text-right text-dark font-medium">
                          ฿{b.amount.toLocaleString()}
                        </td>
                        <td className="py-3 px-5">
                          {isMultiDay ? (
                            (() => {
                              const present = parseAttendance(b.attendance_json)[String(day)] === 1;
                              return (
                                <div className="flex items-center justify-center">
                                  <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() => markDay(b.id, day, !present)}
                                    title={present ? 'คลิกเพื่อยกเลิกเช็คอิน' : 'คลิกเพื่อเช็คอิน'}
                                    className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-medium transition-colors disabled:opacity-50 ${
                                      present
                                        ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                                        : 'bg-primary/10 text-primary hover:bg-primary/20'
                                    }`}
                                  >
                                    {present ? (
                                      <>
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.4} d="M5 13l4 4L19 7" /></svg>
                                        เช็คอินแล้ว
                                      </>
                                    ) : (
                                      'เช็คอิน'
                                    )}
                                  </button>
                                </div>
                              );
                            })()
                          ) : (
                            <div className="flex items-center justify-center gap-2">
                              <AttendChip label={<><span>มา</span> <Icon name="rating" size={13} filled /></>} active={b.attended === 1} disabled={busy} tone="green" onClick={() => mark(b.id, 1)} />
                              <AttendChip label={<><span>ไม่มา</span> <Icon name="weather" size={13} /></>} active={b.attended === 0} disabled={busy} tone="orange" onClick={() => mark(b.id, 0)} />
                              <AttendChip label="—" active={b.attended == null} disabled={busy} tone="gray" onClick={() => mark(b.id, null)} />
                            </div>
                          )}
                        </td>
                        {showSlipCol && (
                          <td className="py-3 px-5">
                            {(() => {
                              // Any secured participant (paid or confirmed) can get
                              // a refund slip — the amount may be ฿0 for manually
                              // added or free-confirmed seats and that's fine.
                              const applicable = b.payment_status === 'paid' || b.status === 'confirmed';
                              if (!applicable) {
                                return <div className="text-center text-gray text-xs">—</div>;
                              }
                              return (
                                <div className="flex items-center justify-center gap-2">
                                  {b.refund_slip_url ? (
                                    <>
                                      <a
                                        href={b.refund_slip_url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center justify-center w-9 h-11 rounded-md overflow-hidden border border-gray-lighter shrink-0 bg-cream"
                                        title="ดูสลิป"
                                      >
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img src={b.refund_slip_url} alt="slip" className="max-w-full max-h-full object-contain" />
                                      </a>
                                      <button
                                        type="button"
                                        onClick={() => setSlipFor(b)}
                                        className="text-xs font-medium text-primary hover:underline"
                                      >
                                        แก้ไข
                                      </button>
                                    </>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => setSlipFor(b)}
                                      className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                                    >
                                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                      </svg>
                                      {isDeposit ? 'แนบสลิปคืนมัดจำ' : 'แนบสลิปคืนเงิน'}
                                    </button>
                                  )}
                                </div>
                              );
                            })()}
                          </td>
                        )}
                      </tr>
                      {open && (
                        <tr className="bg-surface/50">
                          <td colSpan={showSlipCol ? 6 : 5} className="px-5 py-4 border-t border-gray-lighter">
                            <ApplicationDetail json={b.application_json} />
                            <FacilitatorNote
                              // Remount per booking so the textarea always
                              // starts from that participant's saved note.
                              key={b.id}
                              initial={b.facilitator_note ?? null}
                              endpoint={`/api/bookings/${b.id}`}
                            />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {slipFor && (
        <RefundSlipModal
          booking={slipFor}
          title={slipNoun}
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

      {showAdd && (
        <AddParticipantModal
          workshopId={id}
          existingEmails={new Set(bookings.map((b) => (b.user_email || '').toLowerCase()).filter(Boolean))}
          onClose={() => setShowAdd(false)}
          onAdded={(booking) => {
            setBookings((rows) => [booking, ...rows]);
            setShowAdd(false);
          }}
        />
      )}
    </div>
  );
}

type UserHit = { id: string; name: string | null; email: string | null };

/** Search the user directory and add one as a manual participant. */
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
    <div onClick={onClose} className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-gray-lighter flex-shrink-0">
          <div>
            <h2 className="font-heading text-lg text-dark">เพิ่มผู้เข้าร่วม</h2>
            <p className="text-xs text-gray mt-0.5">ค้นหาด้วยชื่อ หรืออีเมล</p>
          </div>
          <button type="button" onClick={onClose} aria-label="ปิด" className="flex-shrink-0 w-9 h-9 rounded-full bg-surface hover:bg-gray-lighter text-dark flex items-center justify-center transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="overflow-y-auto p-6 space-y-4">
          {error && <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">{error}</div>}

          <input
            autoFocus
            type="text"
            value={q}
            onChange={(e) => { setQ(e.target.value); setSelected(null); }}
            placeholder="พิมพ์ชื่อ หรืออีเมล..."
            className="input-field"
          />

          {selected ? (
            <div className="flex items-center justify-between gap-3 p-3 rounded-xl border border-primary bg-primary/5">
              <div className="min-w-0">
                <div className="text-sm font-medium text-dark truncate">{selected.name || '—'}</div>
                <div className="text-xs text-gray truncate">{selected.email || '—'}</div>
              </div>
              <button type="button" onClick={() => setSelected(null)} className="text-xs text-gray hover:text-primary shrink-0">เปลี่ยน</button>
            </div>
          ) : (
            <div className="max-h-64 overflow-y-auto -mx-1">
              {searching ? (
                <p className="text-sm text-gray text-center py-6">กำลังค้นหา...</p>
              ) : q.trim().length < 2 ? (
                <p className="text-sm text-gray text-center py-6">พิมพ์อย่างน้อย 2 ตัวอักษร</p>
              ) : results.length === 0 ? (
                <p className="text-sm text-gray text-center py-6">ไม่พบผู้ใช้</p>
              ) : (
                results.map((u) => {
                  const already = existingEmails.has((u.email || '').toLowerCase());
                  return (
                    <button
                      key={u.id}
                      type="button"
                      disabled={already}
                      onClick={() => setSelected(u)}
                      className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-surface transition flex items-center justify-between gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-dark truncate">{u.name || '—'}</span>
                        <span className="block text-xs text-gray truncate">{u.email || '—'}</span>
                      </span>
                      {already && <span className="text-[11px] text-gray shrink-0">อยู่ในรายชื่อแล้ว</span>}
                    </button>
                  );
                })
              )}
            </div>
          )}

          <div className="flex items-center gap-3 pt-1">
            <button type="button" onClick={confirm} disabled={!selected || saving} className="btn-primary flex-1 disabled:opacity-50">
              {saving ? 'กำลังเพิ่ม...' : 'ยืนยันเพิ่มเข้ารายชื่อ'}
            </button>
            <button type="button" onClick={onClose} className="btn-ghost flex-1">ยกเลิก</button>
          </div>
        </div>
      </div>
    </div>
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
    return <p className="text-xs text-gray">ไม่มีข้อมูลใบสมัคร</p>;
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
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1.5 text-xs">
        {items.map(([k, v]) => (
          <div key={k}>
            <span className="text-gray">{k}: </span>
            <span className="text-dark">{v}</span>
          </div>
        ))}
      </div>
      {(snap.answers || []).length > 0 && (
        <div className="border-t border-gray-lighter pt-3 space-y-1.5 text-xs">
          <div className="font-medium text-dark mb-1">คำตอบแบบฟอร์ม</div>
          {(snap.answers || []).map((a) => (
            <div key={a.id}>
              <span className="text-gray">{a.label}: </span>
              <span className="text-dark">{Array.isArray(a.value) ? a.value.join(', ') : a.value || '—'}</span>
            </div>
          ))}
        </div>
      )}
      {snap.consent && (
        <div className="border-t border-gray-lighter pt-3 text-xs">
          <span className="text-gray">ยินยอมบันทึกภาพ/วิดีโอ (PDPA): </span>
          <span className={snap.consent.photoVideo === 'granted' ? 'text-emerald-700 font-medium' : 'text-orange-700 font-medium'}>
            {snap.consent.label || (snap.consent.photoVideo === 'granted' ? 'ยินยอม' : 'ไม่ยินยอม')}
          </span>
        </div>
      )}
    </div>
  );
}

function StatTile({
  label,
  value,
  tint,
}: {
  label: string;
  value: number;
  tint: string;
}) {
  return (
    <div className="card !p-4">
      <div className="mono text-[11px] tracking-[.12em] uppercase text-gray mb-1">{label}</div>
      <div
        className={`inline-flex items-center justify-center rounded-xl px-3 py-1 text-2xl font-bold ${tint}`}
        style={{ fontFamily: 'Archivo Black, Mitr, sans-serif', letterSpacing: '-.02em' }}
      >
        {value}
      </div>
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
  const toneClass =
    tone === 'green'
      ? active
        ? 'bg-emerald-600 text-white'
        : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
      : tone === 'orange'
        ? active
          ? 'bg-orange-600 text-white'
          : 'bg-orange-50 text-orange-700 hover:bg-orange-100'
        : active
          ? 'bg-gray text-white'
          : 'bg-gray-lighter/50 text-gray hover:bg-gray-lighter';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${toneClass} disabled:opacity-50`}
    >
      {label}
    </button>
  );
}
