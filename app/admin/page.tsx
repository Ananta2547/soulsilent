'use client';

import { PageLoader } from '@/components/design/PageLoader';
import { sqliteToMs } from '@/lib/datetime';

import { useEffect, useState } from 'react';

interface Booking {
  id: string;
  workshop_title: string;
  user_name: string;
  amount: number;
  created_at: string;
  status: string;
}

interface Stats {
  totalUsers: number;
  totalWorkshops: number;
  workshopRevenue: number;
  recentBookings: Booking[];
  /** Newest-first feed behind the registration activity log. */
  activity: Booking[];
}

/** Rows the activity log renders. The API already returns newest-first. */
const ACTIVITY_LIMIT = 30;

interface ApiResp {
  users?: { id: string }[];
  workshops?: { id: string }[];
  bookings?: Booking[];
  soulsilent?: { total: number };
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      try {
        const [usersRes, workshopsRes, revenueRes, bookingsRes] = await Promise.all([
          fetch('/api/users'),
          fetch('/api/workshops'),
          fetch('/api/revenue'),
          fetch('/api/bookings'),
        ]);

        const [users, workshops, revenue, bookings] = (await Promise.all([
          usersRes.json(),
          workshopsRes.json(),
          revenueRes.json(),
          bookingsRes.json(),
        ])) as [ApiResp, ApiResp, ApiResp, ApiResp];

        setStats({
          totalUsers: users.users?.length || 0,
          totalWorkshops: workshops.workshops?.length || 0,
          workshopRevenue: revenue.soulsilent?.total || 0,
          recentBookings: (bookings.bookings || []).slice(0, 5),
          // GET /api/bookings already sorts by created_at DESC for admins.
          activity: (bookings.bookings || []).slice(0, ACTIVITY_LIMIT),
        });
      } catch (e) {
        console.error('Failed to load admin stats', e);
      } finally {
        setLoading(false);
      }
    }
    fetchStats();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <PageLoader />
      </div>
    );
  }

  const totalRevenue = stats?.workshopRevenue || 0;

  const statCards = [
    { label: 'ผู้ใช้งาน', value: stats?.totalUsers || 0, suffix: 'คน', icon: UsersIcon, tint: 'bg-blue-50 text-blue-600' },
    { label: 'Workshop', value: stats?.totalWorkshops || 0, suffix: 'รายการ', icon: WorkshopIcon, tint: 'bg-primary/10 text-primary' },
    { label: 'รายรับรวม', value: totalRevenue, suffix: 'บาท', icon: MoneyIcon, tint: 'bg-emerald-50 text-emerald-600', money: true },
  ];

  return (
    <div className="space-y-8">
      <header>
        <p className="text-xs font-mono text-primary tracking-[.2em] uppercase mb-2">
          admin · overview
        </p>
        <h1 className="font-heading text-3xl text-dark">ภาพรวม</h1>
        <p className="text-sm text-gray mt-1">สถิติทั้งหมด ณ ปัจจุบัน</p>
      </header>

      {/* Stat cards */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((s) => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="card !p-5">
              <div className="flex items-start justify-between mb-4">
                <span className={`w-10 h-10 rounded-xl flex items-center justify-center ${s.tint}`}>
                  <Icon />
                </span>
              </div>
              <div className="font-mono text-[11px] tracking-[.12em] uppercase text-gray mb-1">
                {s.label}
              </div>
              <div
                className="text-3xl text-dark leading-none truncate"
                style={{ fontFamily: 'Archivo Black, Mitr, sans-serif', letterSpacing: '-0.025em' }}
              >
                {s.money ? `฿${s.value.toLocaleString()}` : s.value.toLocaleString()}
              </div>
              <div className="text-xs text-gray mt-1">{s.suffix}</div>
            </div>
          );
        })}
      </section>

      {/* Recent bookings */}
      <section className="card !p-0 overflow-hidden">
        <div className="p-5 border-b border-gray-lighter">
          <h2 className="font-heading text-lg text-dark">การจองล่าสุด</h2>
        </div>
        {stats?.recentBookings && stats.recentBookings.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface">
                <tr>
                  <th className="text-left py-3 px-5 text-gray font-medium">Workshop</th>
                  <th className="text-left py-3 px-5 text-gray font-medium">ผู้จอง</th>
                  <th className="text-right py-3 px-5 text-gray font-medium">จำนวน</th>
                  <th className="text-left py-3 px-5 text-gray font-medium">สถานะ</th>
                  <th className="text-right py-3 px-5 text-gray font-medium">วันที่</th>
                </tr>
              </thead>
              <tbody>
                {stats.recentBookings.map((b) => (
                  <tr key={b.id} className="border-t border-gray-lighter hover:bg-surface/50">
                    <td className="py-3 px-5 text-dark font-medium max-w-[200px] truncate">
                      {b.workshop_title || '—'}
                    </td>
                    <td className="py-3 px-5 text-gray">{b.user_name || '—'}</td>
                    <td className="py-3 px-5 text-right text-dark font-medium">
                      ฿{b.amount?.toLocaleString()}
                    </td>
                    <td className="py-3 px-5">
                      <span
                        className={
                          b.status === 'confirmed'
                            ? 'badge-success'
                            : b.status === 'cancelled'
                              ? 'badge-danger'
                              : 'badge-accent'
                        }
                      >
                        {b.status === 'confirmed'
                          ? 'ยืนยัน'
                          : b.status === 'pending'
                            ? 'รอชำระ'
                            : b.status === 'cancelled'
                              ? 'ยกเลิก'
                              : b.status}
                      </span>
                    </td>
                    <td className="py-3 px-5 text-right text-gray text-xs">
                      {new Date(b.created_at).toLocaleDateString('th-TH', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-gray text-sm py-8 text-center">ยังไม่มีการจอง</p>
        )}
      </section>

      {/* Registration activity log — who applied to what, when. Grouped by day
          so bursts of sign-ups are obvious at a glance. */}
      <section className="card !p-0 overflow-hidden">
        <div className="p-5 border-b border-gray-lighter flex items-baseline justify-between gap-3">
          <div>
            <h2 className="font-heading text-lg text-dark">ความเคลื่อนไหวการสมัคร</h2>
            <p className="text-xs text-gray mt-0.5">ใหม่ล่าสุดอยู่บนสุด · แสดง {ACTIVITY_LIMIT} รายการล่าสุด</p>
          </div>
          <span className="font-mono text-[11px] tracking-[.12em] uppercase text-gray">
            activity log
          </span>
        </div>

        {stats?.activity && stats.activity.length > 0 ? (
          <ol className="divide-y divide-gray-lighter">
            {groupByDay(stats.activity).map(([dayLabel, rows]) => (
              <li key={dayLabel}>
                <div className="flex items-center gap-3 px-5 py-2 bg-surface">
                  <span className="text-xs font-medium text-dark">{dayLabel}</span>
                  <span className="text-[11px] text-gray">{rows.length} รายการ</span>
                </div>
                <ol>
                  {rows.map((b) => (
                    <li
                      key={b.id}
                      className="flex items-start gap-3 px-5 py-3 border-t border-gray-lighter hover:bg-surface/50"
                    >
                      <span className="font-mono text-xs text-gray tabular-nums pt-0.5 w-12 shrink-0">
                        {fmtClock(b.created_at)}
                      </span>
                      <span className="text-sm text-dark min-w-0">
                        <span className="font-medium">{b.user_name || 'ไม่ทราบชื่อ'}</span>
                        <span className="text-gray"> สมัคร </span>
                        <span className="font-medium">{b.workshop_title || 'ไม่ทราบกิจกรรม'}</span>
                      </span>
                      {b.status === 'cancelled' && (
                        <span className="badge-danger ml-auto shrink-0">ยกเลิก</span>
                      )}
                    </li>
                  ))}
                </ol>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-gray text-sm py-8 text-center">ยังไม่มีความเคลื่อนไหว</p>
        )}
      </section>
    </div>
  );
}

/** SQLite timestamps are UTC without a zone marker — normalise before parsing
 *  so the clock shown matches the admin's local time. */
function toDate(v: string): Date {
  return new Date(sqliteToMs(v));
}

function fmtClock(v: string): string {
  const d = toDate(v);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', hour12: false });
}

/** Bucket the (already newest-first) feed into calendar days, keeping order. */
function groupByDay(rows: Booking[]): [string, Booking[]][] {
  const out: [string, Booking[]][] = [];
  for (const r of rows) {
    const d = toDate(r.created_at);
    const label = Number.isNaN(d.getTime())
      ? 'ไม่ทราบวันที่'
      : d.toLocaleDateString('th-TH', {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        });
    const last = out[out.length - 1];
    if (last && last[0] === label) last[1].push(r);
    else out.push([label, [r]]);
  }
  return out;
}

/* Inline icons (avoid emoji rendering inconsistencies) */
function UsersIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}
function WorkshopIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  );
}
function MoneyIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}
