'use client';

import { PageLoader } from '@/components/design/PageLoader';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useLang, T, tr } from '@/lib/i18n';
import type { Workshop } from '@/lib/types';
import { getWorkshopDays, hasWorkshopEnded } from '@/lib/workshop-utils';
import { PdpaBadge } from '@/components/workshops/PdpaBadge';
import { FacilitatorNote } from '@/components/admin/FacilitatorNote';
import { applicantName } from '@/lib/applicant';

type Row = {
  id: string;
  amount: number;
  attendance_json: string | null;
  application_json: string | null;
  /** Staff-only note about this participant (migration 045). */
  facilitator_note: string | null;
  user_name: string | null;
  user_email: string | null;
  teacher_nickname: string | null;
  payment_status?: string;
  status?: string;
  app_status?: string;
  waitlist_rank?: number | null;
  confirmed_at?: string | null;
};
type Finance = { gross: number; deduction: number; net: number };
type Data = { workshop: Workshop; bookings: Row[]; finance: Finance };

const baht = (n: number) => '฿' + Math.round(n).toLocaleString();

function parseMap(json: string | null): Record<string, number> {
  try {
    return json ? (JSON.parse(json) as Record<string, number>) : {};
  } catch {
    return {};
  }
}

function appStatusLabel(s: string, rank: number | null | undefined, lang: 'th' | 'en'): string {
  if (s === 'approved') return tr(lang, 'ผ่านการคัดเลือก', 'Approved');
  if (s === 'waitlisted') return tr(lang, `ตัวสำรอง #${rank ?? '—'}`, `Waitlist #${rank ?? '—'}`);
  if (s === 'rejected') return tr(lang, 'ไม่ผ่าน', 'Not selected');
  return tr(lang, 'รอพิจารณา', 'Under review');
}

function appStatusStyle(s: string): { background: string; color: string } {
  if (s === 'approved') return { background: 'var(--teal-50)', color: 'var(--teal-deep)' };
  if (s === 'waitlisted') return { background: '#fcefcf', color: '#a06a14' };
  if (s === 'rejected') return { background: '#fde7d3', color: '#a04a14' };
  return { background: 'var(--cream-deep)', color: 'var(--muted)' };
}

function chipStyle(active: boolean, tone: 'green' | 'red', ended: boolean): React.CSSProperties {
  const bg = tone === 'green' ? 'var(--teal)' : '#d35d52';
  return {
    fontSize: 12.5,
    fontWeight: 600,
    borderRadius: 999,
    padding: '6px 14px',
    border: 0,
    cursor: ended ? 'not-allowed' : 'pointer',
    opacity: ended ? 0.55 : 1,
    background: active ? bg : 'var(--cream)',
    color: active ? '#fff' : 'var(--muted)',
  };
}

export default function TeacherWorkshopDetail() {
  const { id } = useParams<{ id: string }>();
  const { lang } = useLang();
  const [data, setData] = useState<Data | null>(null);
  // Several applications can stay open at once: comparing two answers means
  // reading them side by side, and one-at-a-time made that impossible.
  const [openApps, setOpenApps] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [nickEdit, setNickEdit] = useState<string | null>(null);
  const [nickDraft, setNickDraft] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/teacher/workshops/${id}`);
        if (res.ok) setData((await res.json()) as Data);
        else setData({ workshop: null as unknown as Workshop, bookings: [], finance: { gross: 0, deduction: 0, net: 0 } });
      } catch (e) {
        console.error('Failed to load teacher workshop', e);
        setData({ workshop: null as unknown as Workshop, bookings: [], finance: { gross: 0, deduction: 0, net: 0 } });
      }
    })();
  }, [id]);

  if (!data) {
    return (
      <div className="flex items-center justify-center h-40">
        <PageLoader />
      </div>
    );
  }
  if (!data.workshop) {
    return <p style={{ color: 'var(--muted)', textAlign: 'center', padding: 48 }}>{tr(lang, 'ไม่พบเวิร์กชอป', 'Workshop not found')}</p>;
  }

  const { workshop: w, bookings, finance } = data;
  const days = getWorkshopDays(w);
  const ended = hasWorkshopEnded(w);

  async function setDay(bookingId: string, dayIndex: number, value: number | null) {
    const key = `${bookingId}:${dayIndex}`;
    setPending((s) => new Set(s).add(key));
    // optimistic
    setData((d) => {
      if (!d) return d;
      return {
        ...d,
        bookings: d.bookings.map((b) => {
          if (b.id !== bookingId) return b;
          const map = parseMap(b.attendance_json);
          if (value === null) delete map[String(dayIndex)];
          else map[String(dayIndex)] = value;
          return { ...b, attendance_json: JSON.stringify(map) };
        }),
      };
    });
    try {
      await fetch(`/api/teacher/bookings/${bookingId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dayIndex, value }),
      });
    } finally {
      setPending((s) => {
        const n = new Set(s);
        n.delete(key);
        return n;
      });
    }
  }

  async function saveNickname(bookingId: string) {
    const value = nickDraft.trim();
    setNickEdit(null);
    setData((d) =>
      d ? { ...d, bookings: d.bookings.map((b) => (b.id === bookingId ? { ...b, teacher_nickname: value || null } : b)) } : d,
    );
    try {
      await fetch(`/api/teacher/bookings/${bookingId}/nickname`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname: value }),
      });
    } catch {}
  }

  const payoutPaid = w.payout_status === 'paid';

  return (
    <div>
      <Link href="/teacher/workshops" className="mono" style={{ fontSize: 12, color: 'var(--muted)', textDecoration: 'none' }}>
        ← {tr(lang, 'กลับไปเวิร์กชอปของฉัน', 'Back to my workshops')}
      </Link>
      <h1 className="display-th" style={{ fontSize: 'clamp(24px,3.5vw,36px)', margin: '12px 0 4px' }}>
        {w.title}
      </h1>
      <p style={{ fontSize: 14, color: 'var(--muted)', margin: '0 0 26px' }}>
        {new Date(days[0] + 'T00:00:00').toLocaleDateString(lang === 'th' ? 'th-TH' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
        {days.length > 1 ? tr(lang, ` · ${days.length} วัน`, ` · ${days.length} days`) : ''} · {w.time_start}–{w.time_end}
      </p>

      {/* PART 1 — Financial */}
      <section className="card card-static" style={{ marginBottom: 26 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <h2 className="display-th" style={{ fontSize: 20, margin: 0 }}>
            <T th="ข้อมูลการเงิน" en="Financial info" />
          </h2>
          <span style={{ fontSize: 12, fontWeight: 600, borderRadius: 999, padding: '4px 12px', color: payoutPaid ? 'var(--teal-deep)' : '#9a4a3f', background: payoutPaid ? 'var(--teal-50)' : '#f6e7e4' }}>
            {payoutPaid ? tr(lang, 'โอนแล้ว', 'Paid out') : tr(lang, 'รอโอน', 'Pending')}
          </span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px,1fr))', gap: 12, marginBottom: 16 }}>
          <Stat label={tr(lang, 'รายรับรวม', 'Gross')} value={baht(finance.gross)} />
          <Stat label={tr(lang, 'หักค่าใช้จ่าย', 'Deduction')} value={'− ' + baht(finance.deduction)} tone="#c2410c" />
          <Stat label={tr(lang, 'ยอดโอนสุทธิ', 'Net payout')} value={baht(finance.net)} tone="var(--teal-deep)" big />
        </div>
        {w.payout_remark && (
          <div style={{ fontSize: 13.5, color: 'var(--ink)', background: 'var(--cream)', borderRadius: 12, padding: '12px 14px', marginBottom: w.payout_slip_url ? 14 : 0 }}>
            <span style={{ color: 'var(--muted)', fontSize: 11, display: 'block', marginBottom: 4 }}>{tr(lang, 'หมายเหตุจากทีมงาน', 'Note from the team')}</span>
            {w.payout_remark}
          </div>
        )}
        {w.payout_slip_url && (
          <div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6 }}>{tr(lang, 'สลิปโอนเงิน', 'Transfer slip')}</div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={w.payout_slip_url} alt="slip" style={{ maxWidth: 240, borderRadius: 12, border: '1px solid var(--cream-deep)' }} />
          </div>
        )}
      </section>

      {/* PART 2 — Participants */}
      <section>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
          <h2 className="display-th" style={{ fontSize: 20, margin: 0 }}>
            <T th="ผู้เข้าร่วม" en="Participants" />
          </h2>
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>· {bookings.length} {tr(lang, 'คน', 'people')}</span>
          {ended && (
            <span style={{ fontSize: 12, color: '#9a4a3f', background: '#f6e7e4', borderRadius: 999, padding: '3px 10px' }}>
              🔒 {tr(lang, 'ปิดการเช็คชื่อ (จบแล้ว)', 'Check-in locked (ended)')}
            </span>
          )}
        </div>

        {bookings.length === 0 ? (
          <div className="card card-static" style={{ textAlign: 'center', padding: 36 }}>
            <p style={{ color: 'var(--muted)', margin: 0 }}>{tr(lang, 'ยังไม่มีผู้ชำระเงิน', 'No paid participants yet')}</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {bookings.map((b, idx) => {
              const map = parseMap(b.attendance_json);
              const expanded = openApps.has(b.id);
              return (
                <div key={b.id} className="card card-static" style={{ padding: 0, border: '1.5px solid var(--cream-deep)', overflow: 'hidden' }}>
                  {/* Name header band — clearer separation per applicant */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '14px 16px', background: 'var(--cream)', borderBottom: '1px solid var(--cream-deep)' }}>
                    <span style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--teal)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>
                      {idx + 1}
                    </span>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontWeight: 700, color: 'var(--ink)', fontSize: 15, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        {applicantName(b.application_json, b.user_name)}
                        {b.teacher_nickname && (
                          <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--teal-deep)', background: 'var(--teal-50)', borderRadius: 999, padding: '2px 10px' }}>
                            “{b.teacher_nickname}”
                          </span>
                        )}
                        <PdpaBadge applicationJson={b.application_json} lang={lang} />
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--muted)' }}>{b.user_email || '—'}</div>
                      {w.admission_type === 'selection' && b.app_status && (
                        <span style={{ display: 'inline-block', marginTop: 4, fontSize: 11.5, fontWeight: 600, borderRadius: 999, padding: '2px 10px', ...appStatusStyle(b.app_status) }}>
                          {appStatusLabel(b.app_status, b.waitlist_rank, lang)}
                          {(b.payment_status === 'paid' || b.status === 'confirmed') ? tr(lang, ' · ชำระแล้ว', ' · paid') : b.confirmed_at ? tr(lang, ' · ยืนยันแล้ว', ' · confirmed') : ''}
                        </span>
                      )}
                      {nickEdit === b.id ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                          <input
                            autoFocus
                            value={nickDraft}
                            onChange={(e) => setNickDraft(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') saveNickname(b.id);
                              if (e.key === 'Escape') setNickEdit(null);
                            }}
                            placeholder={tr(lang, 'ชื่อเล่นของนักเรียน', "Student's nickname")}
                            className="field"
                            style={{ maxWidth: 220, padding: '6px 10px', fontSize: 13 }}
                          />
                          <button type="button" onClick={() => saveNickname(b.id)} className="btn btn-teal btn-sm">
                            {tr(lang, 'บันทึก', 'Save')}
                          </button>
                          <button type="button" onClick={() => setNickEdit(null)} className="btn btn-paper btn-sm">
                            {tr(lang, 'ยกเลิก', 'Cancel')}
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setNickDraft(b.teacher_nickname || '');
                            setNickEdit(b.id);
                          }}
                          style={{ marginTop: 6, fontSize: 12, color: 'var(--teal)', background: 'none', border: 0, cursor: 'pointer', padding: 0 }}
                        >
                          {b.teacher_nickname ? tr(lang, '✎ แก้ชื่อเล่น', '✎ Edit nickname') : tr(lang, '+ เพิ่มชื่อเล่น', '+ Add nickname')}
                        </button>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setOpenApps((prev) => {
                          const next = new Set(prev);
                          if (!next.delete(b.id)) next.add(b.id);
                          return next;
                        })
                      }
                      aria-expanded={expanded}
                      className="btn btn-paper btn-sm"
                      style={{ alignSelf: 'flex-start' }}
                    >
                      {expanded ? tr(lang, 'ซ่อนใบสมัคร', 'Hide form') : tr(lang, 'ดูใบสมัคร', 'View form')}
                    </button>
                  </div>

                  <div style={{ padding: '14px 16px' }}>
                    {/* Per-day check-in: present / absent / unmarked */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {days.map((d, di) => {
                        const present = map[String(di)] === 1;
                        const absent = map[String(di)] === 0;
                        const key = `${b.id}:${di}`;
                        const busy = pending.has(key);
                        return (
                          <div key={di} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }} title={d}>
                            <span style={{ fontSize: 12.5, color: 'var(--muted)', minWidth: 56, fontWeight: 600 }}>
                              {tr(lang, `วันที่ ${di + 1}`, `Day ${di + 1}`)}
                            </span>
                            <button type="button" disabled={ended || busy} onClick={() => setDay(b.id, di, present ? null : 1)} style={chipStyle(present, 'green', ended)}>
                              {tr(lang, 'มา', 'In')}
                            </button>
                            <button type="button" disabled={ended || busy} onClick={() => setDay(b.id, di, absent ? null : 0)} style={chipStyle(absent, 'red', ended)}>
                              {tr(lang, 'ไม่มา', 'Out')}
                            </button>
                          </div>
                        );
                      })}
                    </div>

                    {expanded && (
                      <>
                        <ApplicationDetail json={b.application_json} lang={lang} />
                        <FacilitatorNote
                          // Remount per booking so the textarea always starts
                          // from that participant's saved note.
                          key={b.id}
                          initial={b.facilitator_note ?? null}
                          endpoint={`/api/teacher/bookings/${b.id}/note`}
                          lang={lang}
                        />
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, tone, big }: { label: string; value: string; tone?: string; big?: boolean }) {
  return (
    <div style={{ background: 'var(--cream)', borderRadius: 14, padding: '12px 14px' }}>
      <div className="mono" style={{ fontSize: 10.5, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{label}</div>
      <div style={{ fontSize: big ? 22 : 18, fontWeight: 700, color: tone || 'var(--ink)', marginTop: 2 }}>{value}</div>
    </div>
  );
}

type AppProfile = {
  fullName?: string;
  firstName?: string;
  lastName?: string;
  age?: number | null;
  gender?: string;
  phone?: string;
  email?: string;
  facebook?: string;
  lineId?: string;
  emergency?: { name?: string; relation?: string; phone?: string };
  medical?: string;
  dietary?: string;
};

function ApplicationDetail({ json, lang }: { json: string | null; lang: 'th' | 'en' }) {
  let parsed: { profile?: AppProfile; answers?: { label: string; value: unknown }[] } | null = null;
  try {
    parsed = json ? JSON.parse(json) : null;
  } catch {
    parsed = null;
  }
  if (!parsed) {
    return <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 12 }}>{tr(lang, 'ไม่มีข้อมูลใบสมัคร', 'No application data')}</p>;
  }
  const p = parsed.profile || {};
  const em = p.emergency || {};
  const fmt = (v: unknown) => (Array.isArray(v) ? v.join(', ') : String(v ?? '')) || '—';

  return (
    <div style={{ marginTop: 12, paddingTop: 14, borderTop: '1px dashed var(--cream-deep)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px,1fr))', gap: '10px 16px' }}>
      <Field label={tr(lang, 'ชื่อ-นามสกุล', 'Full name')} value={p.fullName || '—'} />
      <Field label={tr(lang, 'อายุ', 'Age')} value={p.age != null ? `${p.age}` : '—'} />
      <Field label={tr(lang, 'เพศ', 'Gender')} value={p.gender || '—'} />
      <Field label={tr(lang, 'โทร', 'Phone')} value={p.phone || '—'} />
      <Field label={tr(lang, 'อีเมล', 'Email')} value={p.email || '—'} />
      <Field label="Facebook" value={p.facebook || '—'} />
      <Field label="Line ID" value={p.lineId || '—'} />
      <Field label={tr(lang, 'ติดต่อฉุกเฉิน', 'Emergency')} value={[em.name, em.relation, em.phone].filter(Boolean).join(' · ') || '—'} />
      <Field label={tr(lang, 'สุขภาพ / แพ้', 'Medical')} value={p.medical || '—'} />
      <Field label={tr(lang, 'ข้อจำกัดอาหาร', 'Food')} value={p.dietary || '—'} />
      {(parsed.answers || []).map((a, i) => (
        <Field key={`a${i}`} label={a.label} value={fmt(a.value)} />
      ))}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--muted)' }}>{label}</div>
      <div style={{ fontSize: 13.5, color: 'var(--ink)', fontWeight: 500, wordBreak: 'break-word' }}>{value}</div>
    </div>
  );
}
