'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { PageLoader } from '@/components/design/PageLoader';
import { AdminPager, Badge, type Tone } from '@/components/admin/AdminShell';
import { sqliteToMs } from '@/lib/datetime';
import type { NotifyStats } from '@/app/api/admin/notify-stats/route';

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
  /** Accounts that asked to be deleted and are inside the 30-day window. */
  pendingDeletion: number;
  totalWorkshops: number;
  openWorkshops: number;
  workshopRevenue: number;
  /** Newest-first, unpaged. Both boxes below page through this one list. */
  bookings: Booking[];
}

/** Rows per page in each box. */
const BOOKINGS_PER_PAGE = 6;
const ACTIVITY_PER_PAGE = 10;

interface ApiResp {
  users?: { id: string; account_status?: string | null }[];
  workshops?: { id: string; status?: string }[];
  bookings?: Booking[];
  soulsilent?: { total: number };
}

const BOOKING_TONE: Record<string, { label: string; tone: Tone }> = {
  confirmed: { label: 'ยืนยัน', tone: 'ok' },
  pending: { label: 'รอชำระ', tone: 'warn' },
  cancelled: { label: 'ยกเลิก', tone: 'bad' },
};

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [line, setLine] = useState<NotifyStats | null>(null);
  const [orphans, setOrphans] = useState(0);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(true);
  // Paging is per box and client-side: the dashboard already holds every
  // booking, so switching pages never refetches or navigates.
  const [bookingsPage, setBookingsPage] = useState(1);
  const [activityPage, setActivityPage] = useState(1);
  /** Today, read once on the client, for the greeting and "new today". */
  const [today] = useState(() => new Date());

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
          pendingDeletion: (users.users || []).filter((u) => u.account_status === 'pending_deletion').length,
          totalWorkshops: workshops.workshops?.length || 0,
          openWorkshops: (workshops.workshops || []).filter((w) => w.status === 'active').length,
          workshopRevenue: revenue.soulsilent?.total || 0,
          // GET /api/bookings already sorts by created_at DESC for admins.
          bookings: bookings.bookings || [],
        });
      } catch (e) {
        console.error('Failed to load admin stats', e);
      } finally {
        setLoading(false);
      }
    }
    fetchStats();
    // The side pieces load on their own so a failure never blanks the dashboard.
    fetch('/api/admin/notify-stats')
      .then((r) => (r.ok ? (r.json() as Promise<NotifyStats>) : null))
      .then(setLine)
      .catch(() => {});
    fetch('/api/admin/orphan-payments')
      .then((r) => (r.ok ? (r.json() as Promise<{ unresolved?: number }>) : null))
      .then((d) => setOrphans(d?.unresolved || 0))
      .catch(() => {});
    fetch('/api/auth/me')
      .then((r) => (r.ok ? (r.json() as Promise<{ user?: { name?: string; nickname?: string | null } | null }>) : null))
      .then((d) => setName(d?.user?.nickname || d?.user?.name || ''))
      .catch(() => {});
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 256 }}>
        <PageLoader />
      </div>
    );
  }

  const allBookings = stats?.bookings || [];
  const bookingsPageCount = Math.max(1, Math.ceil(allBookings.length / BOOKINGS_PER_PAGE));
  const pagedBookings = allBookings.slice((bookingsPage - 1) * BOOKINGS_PER_PAGE, bookingsPage * BOOKINGS_PER_PAGE);
  const activityPageCount = Math.max(1, Math.ceil(allBookings.length / ACTIVITY_PER_PAGE));
  const pagedActivity = allBookings.slice((activityPage - 1) * ACTIVITY_PER_PAGE, activityPage * ACTIVITY_PER_PAGE);

  const pendingPay = allBookings.filter((b) => b.status === 'pending').length;
  const todayKey = dayKey(today);
  const newToday = allBookings.filter((b) => dayKey(toDate(b.created_at)) === todayKey).length;
  const attention = [
    { n: orphans, label: 'เงินเข้าที่ต้องตรวจ', href: '/admin/ledger', bg: '#fde4e1', color: '#a3261a' },
    { n: pendingPay, label: 'การจองที่รอชำระเงิน', href: '/admin/workshops', bg: '#fdf1d3', color: '#7a5200' },
    { n: stats?.pendingDeletion || 0, label: 'บัญชีที่ขอลบ (ภายใน 30 วัน)', href: '/admin/users', bg: '#eceeed', color: '#4c5755' },
  ].filter((a) => a.n > 0);

  const kpis: { label: string; value: string; sub: string; href?: string; title?: string; bg: string; color: string; d: string; d2?: string }[] = [
    {
      label: 'ผู้ใช้งาน',
      value: (stats?.totalUsers || 0).toLocaleString(),
      sub: 'บัญชีทั้งหมด',
      href: '/admin/users',
      bg: '#e3eefc',
      color: '#1f5fae',
      d: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z',
    },
    {
      label: 'กิจกรรม',
      value: (stats?.totalWorkshops || 0).toLocaleString(),
      sub: `เปิดอยู่ ${(stats?.openWorkshops || 0).toLocaleString()} รอบ`,
      href: '/admin/workshops',
      bg: 'var(--teal-50)',
      color: 'var(--teal-deep)',
      d: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
    },
    {
      label: 'รายรับรวม',
      value: `฿${(stats?.workshopRevenue || 0).toLocaleString()}`,
      sub: `${allBookings.filter((b) => b.status === 'confirmed').length.toLocaleString()} การจองที่ยืนยัน`,
      href: '/admin/revenue',
      bg: '#dff3ec',
      color: '#0b6b4f',
      d: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
    },
    {
      label: 'เชื่อม LINE',
      value: (line?.linked || 0).toLocaleString(),
      sub: line
        ? `+${line.linked30d.toLocaleString()} ใน 30 วัน · ส่งแจ้งเตือน ${line.sent30d.toLocaleString()} ครั้ง`
        : 'สมาชิกที่รับแจ้งเตือน',
      title: line ? `บล็อก/เลิกเป็นเพื่อน ${line.blocked.toLocaleString()} คน` : undefined,
      bg: '#dcf5e5',
      color: '#067a3a',
      d: 'M4 5.5h16a1.5 1.5 0 011.5 1.5v8a1.5 1.5 0 01-1.5 1.5H10l-4 3v-3H4A1.5 1.5 0 012.5 15V7A1.5 1.5 0 014 5.5z',
    },
  ];

  return (
    <>
      <section className="adm-hello">
        <span className="adm-hello-o1" aria-hidden="true" />
        <span className="adm-hello-o2" aria-hidden="true" />
        <div className="adm-hello-text">
          <p className="adm-eyebrow" style={{ color: '#8fd3c9', marginBottom: 10 }}>
            admin · {today.toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
          </p>
          <h1 className="adm-h1">สวัสดี{name ? ` ${name}` : ''}</h1>
          <p className="adm-hello-line">
            {newToday > 0 ? `วันนี้มีการจองใหม่ ${newToday} รายการ` : 'วันนี้ยังไม่มีการจองใหม่'}
            {attention.length > 0 ? ` · มี ${attention.length} เรื่องรอจัดการ` : ' · ไม่มีงานค้าง'}
          </p>
          <span className="adm-hello-hand">have a quiet day ✺</span>
        </div>
        <div className="adm-hello-acts">
          <Link href="/admin/workshops?new=1" className="adm-btn accent">
            + เพิ่มกิจกรรม
          </Link>
          <Link href="/admin/revenue" className="adm-btn glass">
            ดูรายรับ →
          </Link>
        </div>
      </section>

      <section className="adm-kpis">
        {kpis.map((k) => {
          const inner = (
            <>
              <div className="adm-kpi-top">
                <span className="adm-label" style={{ fontSize: 11 }}>
                  {k.label}
                </span>
                <span className="adm-kpi-icon" style={{ background: k.bg, color: k.color }}>
                  <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d={k.d} />
                    {k.d2 && <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d={k.d2} />}
                  </svg>
                </span>
              </div>
              <div className="adm-kpi-value">{k.value}</div>
              <div className="adm-kpi-sub">{k.sub}</div>
            </>
          );
          return k.href ? (
            <Link key={k.label} href={k.href} className="adm-kpi">
              {inner}
            </Link>
          ) : (
            <div key={k.label} className="adm-kpi" title={k.title}>
              {inner}
            </div>
          );
        })}
      </section>

      <div className="adm-two">
        <section className="adm-card">
          <div className="adm-card-head">
            <h2 className="adm-h2">การจองล่าสุด</h2>
            <span className="adm-meta">ทั้งหมด {allBookings.length.toLocaleString()} รายการ</span>
          </div>
          {pagedBookings.length > 0 ? (
            <>
              {pagedBookings.map((b) => {
                const t = BOOKING_TONE[b.status] || { label: b.status, tone: 'mute' as Tone };
                return (
                  <div key={b.id} className="adm-row adm-line">
                    <div className="adm-line-main">
                      <b>{b.workshop_title || '—'}</b>
                      <small>
                        {b.user_name || '—'} · {fmtDayTime(b.created_at)}
                      </small>
                    </div>
                    <div className="adm-line-side">
                      <b>฿{(b.amount || 0).toLocaleString()}</b>
                      <Badge tone={t.tone}>{t.label}</Badge>
                    </div>
                  </div>
                );
              })}
              <AdminPager page={bookingsPage} pageCount={bookingsPageCount} onChange={setBookingsPage} />
            </>
          ) : (
            <p className="adm-empty">ยังไม่มีการจอง</p>
          )}
        </section>

        <div className="adm-stack">
          <section className="adm-card">
            <div className="adm-card-head">
              <h2 className="adm-h2">ต้องจัดการ</h2>
            </div>
            {attention.map((a) => (
              <Link key={a.label} href={a.href} className="adm-row adm-todo">
                <span className="adm-todo-n" style={{ background: a.bg, color: a.color }}>
                  {a.n}
                </span>
                <span style={{ flex: 1 }}>{a.label}</span>
                <span className="adm-meta">›</span>
              </Link>
            ))}
            {attention.length === 0 && (
              <p className="adm-meta" style={{ padding: '0 20px 20px', margin: 0, fontSize: 14 }}>
                ไม่มีงานค้าง ✺
              </p>
            )}
          </section>

          <section className="adm-card">
            <div className="adm-card-head">
              <h2 className="adm-h2">ความเคลื่อนไหวการสมัคร</h2>
              <span className="adm-label">LIVE</span>
            </div>
            {pagedActivity.length > 0 ? (
              <>
                {groupByDay(pagedActivity).map(([day, rows]) => (
                  <div key={day}>
                    <div className="adm-row adm-day">
                      <b>{day}</b>
                      <span className="adm-meta">{rows.length} รายการ</span>
                    </div>
                    {rows.map((b) => (
                      <div key={b.id} className="adm-row adm-act">
                        <span className="adm-mono adm-act-clock">{fmtClock(b.created_at)}</span>
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <b style={{ fontWeight: 600 }}>{b.user_name || 'ไม่ทราบชื่อ'}</b>
                          <span className="adm-meta" style={{ fontSize: 13.5 }}> สมัคร </span>
                          {b.workshop_title || 'ไม่ทราบกิจกรรม'}
                        </span>
                        {b.status === 'cancelled' && <span className="adm-act-cancel">ยกเลิก</span>}
                      </div>
                    ))}
                  </div>
                ))}
                <AdminPager page={activityPage} pageCount={activityPageCount} onChange={setActivityPage} />
              </>
            ) : (
              <p className="adm-empty">ยังไม่มีความเคลื่อนไหว</p>
            )}
          </section>
        </div>
      </div>
    </>
  );
}

/** SQLite timestamps are UTC without a zone marker — normalise before parsing
 *  so the clock shown matches the admin's local time. */
function toDate(v: string): Date {
  return new Date(sqliteToMs(v));
}

function dayKey(d: Date): string {
  return Number.isNaN(d.getTime()) ? '' : `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** "15 ส.ค. 2569 เวลา 18:03 น." — same clock as the activity log. */
function fmtDayTime(v: string): string {
  const d = toDate(v);
  if (Number.isNaN(d.getTime())) return '—';
  const date = d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
  return `${date} เวลา ${fmtClock(v)} น.`;
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
      : d.toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    const last = out[out.length - 1];
    if (last && last[0] === label) last[1].push(r);
    else out.push([label, [r]]);
  }
  return out;
}
