'use client';

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
  totalCourses: number;
  workshopRevenue: number;
  courseRevenue: number;
  recentBookings: Booking[];
}

interface ApiResp {
  users?: { id: string }[];
  workshops?: { id: string }[];
  courses?: { id: string }[];
  bookings?: Booking[];
  soulsilent?: { total: number };
  allsoullearn?: { total: number };
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      try {
        const [usersRes, workshopsRes, coursesRes, revenueRes, bookingsRes] = await Promise.all([
          fetch('/api/users'),
          fetch('/api/workshops'),
          fetch('/api/courses?all=1'),
          fetch('/api/revenue'),
          fetch('/api/bookings'),
        ]);

        const [users, workshops, courses, revenue, bookings] = (await Promise.all([
          usersRes.json(),
          workshopsRes.json(),
          coursesRes.json(),
          revenueRes.json(),
          bookingsRes.json(),
        ])) as [ApiResp, ApiResp, ApiResp, ApiResp, ApiResp];

        setStats({
          totalUsers: users.users?.length || 0,
          totalWorkshops: workshops.workshops?.length || 0,
          totalCourses: courses.courses?.length || 0,
          workshopRevenue: revenue.soulsilent?.total || 0,
          courseRevenue: revenue.allsoullearn?.total || 0,
          recentBookings: (bookings.bookings || []).slice(0, 5),
        });
      } catch {
      } finally {
        setLoading(false);
      }
    }
    fetchStats();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const totalRevenue = (stats?.workshopRevenue || 0) + (stats?.courseRevenue || 0);
  const wsShare = totalRevenue > 0 ? ((stats?.workshopRevenue || 0) / totalRevenue) * 100 : 0;
  const csShare = totalRevenue > 0 ? ((stats?.courseRevenue || 0) / totalRevenue) * 100 : 0;

  const statCards = [
    { label: 'ผู้ใช้งาน', value: stats?.totalUsers || 0, suffix: 'คน', icon: UsersIcon, tint: 'bg-blue-50 text-blue-600' },
    { label: 'Workshop', value: stats?.totalWorkshops || 0, suffix: 'รายการ', icon: WorkshopIcon, tint: 'bg-primary/10 text-primary' },
    { label: 'คอร์สเรียน', value: stats?.totalCourses || 0, suffix: 'คอร์ส', icon: CourseIcon, tint: 'bg-accent/15 text-accent-dark' },
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

      {/* Revenue split */}
      <section className="card !p-6">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <h2 className="font-heading text-lg text-dark">รายรับแยกตามแพลตฟอร์ม</h2>
          <a
            href="/admin/revenue"
            className="text-xs text-primary font-medium hover:underline"
          >
            ดูทั้งหมด →
          </a>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <PlatformRow
            label="soulsilent"
            sublabel="การจอง Workshop"
            value={stats?.workshopRevenue || 0}
            dotClass="bg-primary"
            textClass="text-primary"
          />
          <PlatformRow
            label="allsoullearn"
            sublabel="คอร์สที่ขายได้"
            value={stats?.courseRevenue || 0}
            dotClass="bg-accent"
            textClass="text-accent-dark"
          />
        </div>
        {/* Share bar */}
        {totalRevenue > 0 && (
          <div className="flex h-2 rounded-full overflow-hidden bg-gray-lighter/60">
            <div className="bg-primary h-full" style={{ width: `${wsShare}%` }} />
            <div className="bg-accent h-full" style={{ width: `${csShare}%` }} />
          </div>
        )}
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
    </div>
  );
}

function PlatformRow({
  label,
  sublabel,
  value,
  dotClass,
  textClass,
}: {
  label: string;
  sublabel: string;
  value: number;
  dotClass: string;
  textClass: string;
}) {
  return (
    <div className="flex items-start gap-3 p-4 rounded-xl bg-surface">
      <span className={`w-3 h-3 rounded-full mt-1.5 flex-shrink-0 ${dotClass}`} />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-dark">{label}</div>
        <div
          className={`text-2xl ${textClass} leading-tight mt-0.5 truncate`}
          style={{ fontFamily: 'Archivo Black, Mitr, sans-serif', letterSpacing: '-0.02em' }}
        >
          ฿{value.toLocaleString()}
        </div>
        <div className="text-xs text-gray mt-0.5">{sublabel}</div>
      </div>
    </div>
  );
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
function CourseIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
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
