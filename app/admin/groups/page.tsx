'use client';

/* Every group booking on the platform: who bought the seats, for which round,
 * how many seats, and which friends have joined through the invite link so
 * far. Admin-only — it lists names and phone numbers across all workshops. */
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { PageLoader } from '@/components/design/PageLoader';
import { AdminHead, AdminSearch, AdminChips, Badge } from '@/components/admin/AdminShell';
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 256 }}>
        <PageLoader />
      </div>
    );
  }

  return (
    <>
      <AdminHead
        eyebrow="admin · groups"
        title="จองแบบกลุ่ม"
        sub="ผู้จองซื้อที่นั่งทีเดียวหลายที่ แล้วส่งลิงก์ชวนเพื่อน — ดูว่าใครจอง กี่ที่ และเพื่อนคนไหนกดรับสิทธิ์แล้ว"
      />

      {loadError ? (
        <div className="adm-card adm-empty">โหลดข้อมูลไม่สำเร็จ</div>
      ) : (
        <>
          <div className="adm-toolbar">
            <AdminSearch value={q} onChange={setQ} placeholder="ค้นหาชื่อ เบอร์ อีเมล หรือกิจกรรม" />
            <AdminChips value={filter} onChange={setFilter} items={FILTERS} />
          </div>

          {shown.length === 0 ? (
            <div className="adm-card adm-empty">
              {rows && rows.length === 0 ? 'ยังไม่มีการจองแบบกลุ่ม' : 'ไม่พบการจองแบบกลุ่ม'}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {shown.map((g) => {
                const joined = joinedOf(g);
                const taken = joined + 1;
                const full = taken >= g.group_size;
                const isPaid = paid(g);
                const cancelled = g.status === 'cancelled' || g.payment_status === 'expired';
                const pct = g.group_size ? Math.min(100, (taken / g.group_size) * 100) : 0;
                return (
                  <article key={g.id} className="adm-card">
                    <div className="adm-group-head">
                      <div className="adm-badges">
                        <Badge tone={cancelled ? 'bad' : isPaid ? 'ok' : 'warn'}>
                          {cancelled ? 'ยกเลิก / หมดเวลา' : isPaid ? 'ชำระแล้ว' : 'รอชำระ'}
                        </Badge>
                        {isPaid && !cancelled && <Badge tone={full ? 'info' : 'mute'}>{full ? 'ครบกลุ่ม' : 'ยังรับเพื่อนได้'}</Badge>}
                        {g.kind === 'private' && <Badge tone="teal">ล็อกรอบส่วนตัว</Badge>}
                      </div>
                      <div className="adm-group-title">
                        <div style={{ minWidth: 0 }}>
                          <Link href={`/admin/workshops/${g.workshop_id}/attendance`} className="adm-link-title">
                            {g.workshop_title || 'ไม่พบกิจกรรม'}
                          </Link>
                          {g.workshop_date && (
                            <div className="adm-meta" style={{ marginTop: 2 }}>
                              {fmtDate(g.workshop_date, 'th', 'medium')}
                              {g.time_start ? ` · ${g.time_start}–${g.time_end}` : ''}
                            </div>
                          )}
                        </div>
                        <div style={{ minWidth: 140 }}>
                          <div style={{ fontSize: 13, textAlign: 'right' }}>
                            <b>{taken}</b>
                            <span className="adm-meta"> / {g.group_size} คน</span>
                          </div>
                          <div className="adm-progress-bar">
                            <span style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="adm-group-body">
                      <div>
                        <div className="adm-label" style={{ marginBottom: 6 }}>
                          ผู้จอง · 1 ที่นั่ง
                        </div>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{g.booker.name}</div>
                        <div className="adm-meta" style={{ marginTop: 2 }}>
                          {[g.booker.phone, g.booker.email].filter(Boolean).join(' · ') || '—'}
                        </div>
                        <div className="adm-meta" style={{ marginTop: 8 }}>
                          {g.tier_label ? `${g.tier_label} · ` : ''}
                          {g.amount != null ? `฿${Math.round(g.amount).toLocaleString()}` : '—'}
                        </div>
                      </div>
                      <div>
                        <div className="adm-label" style={{ marginBottom: 6 }}>
                          เพื่อนที่รับสิทธิ์ ({joined}/{Math.max(0, g.group_size - 1)})
                        </div>
                        {g.members.length === 0 ? (
                          <div className="adm-meta" style={{ fontSize: 13.5 }}>
                            ยังไม่มีเพื่อนกดรับสิทธิ์
                          </div>
                        ) : (
                          <ol className="adm-members">
                            {g.members.map((m, i) => (
                              <li key={m.id}>
                                <span className="adm-mono adm-meta" style={{ fontSize: 12, width: 18, flexShrink: 0 }}>
                                  {i + 1}.
                                </span>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <b style={{ fontWeight: 600, textDecoration: m.status === 'cancelled' ? 'line-through' : undefined }}>{m.name}</b>{' '}
                                  {m.attended ? <span style={{ fontSize: 11.5, fontWeight: 600, color: '#0b6b4f' }}>· มาแล้ว</span> : null}
                                  {m.status === 'cancelled' && <span style={{ fontSize: 11.5, fontWeight: 600, color: '#a3261a' }}> · ยกเลิก</span>}
                                  <div className="adm-meta" style={{ fontSize: 12 }}>
                                    {[m.phone, m.email].filter(Boolean).join(' · ') || '—'} · รับสิทธิ์ {fmtStamp(m.created_at)}
                                  </div>
                                </div>
                              </li>
                            ))}
                          </ol>
                        )}
                        {isPaid && !cancelled && !full && (
                          <div style={{ fontSize: 12.5, color: '#7a5200', marginTop: 8 }}>
                            ยังว่างอีก {g.group_size - taken} ที่ — รอเพื่อนกดลิงก์ชวน
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="adm-meta" style={{ padding: '0 20px 14px', fontSize: 12 }}>
                      จองเมื่อ {fmtStamp(g.created_at)}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}
    </>
  );
}
