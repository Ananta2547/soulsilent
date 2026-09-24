'use client';

/* Every group booking on the platform: who bought the seats, for which round,
 * how many seats, and which friends have joined through the invite link so
 * far. Admin-only — it lists names and phone numbers across all workshops. */
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { PageLoader } from '@/components/design/PageLoader';
import { fmtDate, sqliteToMs } from '@/lib/datetime';
import type { AdminGroupRow } from '@/app/api/admin/groups/route';

type Filter = 'all' | 'open' | 'full' | 'unpaid';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'ทั้งหมด' },
  { key: 'open', label: 'ยังรับเพื่อนไม่ครบ' },
  { key: 'full', label: 'ครบกลุ่มแล้ว' },
  { key: 'unpaid', label: 'ยังไม่ชำระ / ยกเลิก' },
];

const paid = (g: AdminGroupRow) => g.payment_status === 'paid' || g.status === 'confirmed';
const joinedOf = (g: AdminGroupRow) => g.members.filter((m) => m.status !== 'cancelled').length;

export default function AdminGroupsPage() {
  const [rows, setRows] = useState<AdminGroupRow[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/admin/groups');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { groups?: AdminGroupRow[] };
        if (!cancelled) setRows(data.groups || []);
      } catch (e) {
        console.error('Failed to load groups', e);
        if (!cancelled) setLoadError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (rows || []).filter((g) => {
      // The booker holds one seat; friends fill the rest.
      const full = joinedOf(g) + 1 >= g.group_size;
      if (filter === 'open' && (!paid(g) || full)) return false;
      if (filter === 'full' && (!paid(g) || !full)) return false;
      if (filter === 'unpaid' && paid(g)) return false;
      if (!term) return true;
      return [g.workshop_title, g.booker.name, g.booker.phone, g.booker.email, ...g.members.flatMap((m) => [m.name, m.phone, m.email])]
        .filter(Boolean)
        .some((v) => (v as string).toLowerCase().includes(term));
    });
  }, [rows, filter, q]);

  const fmtStamp = (v: string | null) => {
    if (!v) return '—';
    const ms = sqliteToMs(v);
    if (!ms) return '—';
    return new Date(ms).toLocaleString('th-TH', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  if (!rows && !loadError) {
    return (
      <div className="flex items-center justify-center h-64">
        <PageLoader />
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-1">การจองแบบกลุ่ม</h1>
      <p className="text-sm text-gray mb-6">
        ผู้จองซื้อที่นั่งทีเดียวหลายที่ แล้วส่งลิงก์ชวนเพื่อน — ดูว่าใครจอง กี่ที่ และเพื่อนคนไหนกดรับสิทธิ์แล้ว
      </p>

      {loadError ? (
        <div className="card text-center py-10 text-gray">โหลดข้อมูลไม่สำเร็จ</div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <div className="flex flex-wrap gap-2">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setFilter(f.key)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    filter === f.key ? 'bg-primary text-white' : 'bg-surface text-gray hover:text-dark'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="ค้นหาชื่อ เบอร์ อีเมล หรือกิจกรรม..."
              className="input-field sm:max-w-xs"
            />
          </div>

          {shown.length === 0 ? (
            <div className="card text-center py-12 text-gray text-sm">
              {rows && rows.length === 0 ? 'ยังไม่มีการจองแบบกลุ่ม' : 'ไม่พบรายการที่ตรงกับที่ค้นหา'}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {shown.map((g) => {
                const joined = joinedOf(g);
                const taken = joined + 1;
                const full = taken >= g.group_size;
                const isPaid = paid(g);
                const cancelled = g.status === 'cancelled' || g.payment_status === 'expired';
                return (
                  <div key={g.id} className="card !p-0 overflow-hidden">
                    <div className="flex flex-wrap items-center gap-2 px-5 py-3 bg-surface/60 border-b border-gray-lighter">
                      <span className={`adm-pill ${cancelled ? 'adm-pill-cancel' : isPaid ? 'adm-pill-open' : 'adm-pill-draft'}`}>
                        {cancelled ? 'ยกเลิก / หมดเวลา' : isPaid ? 'ชำระแล้ว' : 'รอชำระ'}
                      </span>
                      {isPaid && !cancelled && (
                        <span className={`adm-pill ${full ? 'adm-pill-ended' : 'adm-pill-closed'}`}>{full ? 'ครบกลุ่ม' : 'ยังรับเพื่อนได้'}</span>
                      )}
                      {g.kind === 'private' && <span className="adm-pill adm-pill-closed">ล็อกรอบส่วนตัว</span>}
                      <Link href={`/admin/workshops/${g.workshop_id}/attendance`} className="text-sm font-medium text-dark hover:text-primary hover:underline">
                        {g.workshop_title || 'ไม่พบกิจกรรม'}
                      </Link>
                      {g.workshop_date && (
                        <span className="text-xs text-gray">
                          · {fmtDate(g.workshop_date, 'th', 'medium')}
                          {g.time_start ? ` · ${g.time_start}–${g.time_end}` : ''}
                        </span>
                      )}
                      <span className="ml-auto text-sm font-semibold text-dark">
                        {taken}/{g.group_size} คน
                      </span>
                    </div>

                    <div className="grid gap-5 px-5 py-4 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
                      <div>
                        <div className="text-[11px] uppercase tracking-wider text-gray mb-1">ผู้จอง (1 ที่นั่ง)</div>
                        <div className="text-sm font-medium text-dark">{g.booker.name}</div>
                        <div className="text-xs text-gray mt-0.5">{[g.booker.phone, g.booker.email].filter(Boolean).join(' · ') || '—'}</div>
                        <div className="text-xs text-gray mt-2">
                          {g.tier_label ? `${g.tier_label} · ` : ''}
                          {g.amount != null ? `฿${Math.round(g.amount).toLocaleString()}` : '—'}
                        </div>
                      </div>
                      <div>
                        <div className="text-[11px] uppercase tracking-wider text-gray mb-1">
                          เพื่อนที่รับสิทธิ์แล้ว ({joined}/{Math.max(0, g.group_size - 1)})
                        </div>
                        {g.members.length === 0 ? (
                          <div className="text-sm text-gray italic">ยังไม่มีเพื่อนกดรับสิทธิ์</div>
                        ) : (
                          <ol className="flex flex-col gap-2">
                            {g.members.map((m, i) => (
                              <li key={m.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-sm">
                                <span className="text-xs text-gray w-5">{i + 1}.</span>
                                <span className={`font-medium ${m.status === 'cancelled' ? 'line-through text-gray' : 'text-dark'}`}>{m.name}</span>
                                <span className="text-xs text-gray">{[m.phone, m.email].filter(Boolean).join(' · ')}</span>
                                <span className="text-xs text-gray">รับสิทธิ์ {fmtStamp(m.created_at)}</span>
                                {m.attended ? <span className="adm-pill adm-pill-open">มาแล้ว</span> : null}
                                {m.status === 'cancelled' && <span className="adm-pill adm-pill-cancel">ยกเลิก</span>}
                              </li>
                            ))}
                          </ol>
                        )}
                        {isPaid && !cancelled && !full && (
                          <div className="text-xs text-gray mt-2">ยังว่างอีก {g.group_size - taken} ที่ — รอเพื่อนกดลิงก์ชวน</div>
                        )}
                      </div>
                    </div>

                    <div className="px-5 pb-4 text-xs text-gray">จองเมื่อ {fmtStamp(g.created_at)}</div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
