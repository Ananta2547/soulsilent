'use client';

/* Every seat that changed hands, across all workshops. Admin-only: the rows
 * carry both parties' phone numbers, and the screen exists to answer "who is
 * actually coming, and who paid for it" when the two are not the same person. */
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { PageLoader } from '@/components/design/PageLoader';
import { AdminHead, AdminSearch, AdminChips, Badge } from '@/components/admin/AdminShell';
import { fmtDate, sqliteToMs } from '@/lib/datetime';

type Row = {
  id: string;
  booking_id: string;
  workshop_id: string;
  kind: 'gift' | 'transfer' | 'invite';
  status: 'pending' | 'claimed' | 'cancelled';
  created_at: string;
  claimed_at: string | null;
  from_name: string | null;
  from_phone: string | null;
  to_name: string | null;
  to_phone: string | null;
  workshop_title: string | null;
  workshop_date: string | null;
  from_email: string | null;
  to_email: string | null;
};

type Filter = 'all' | 'gift' | 'transfer' | 'pending';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'ทั้งหมด' },
  { key: 'gift', label: 'ของขวัญ' },
  { key: 'transfer', label: 'โอนสิทธิ์' },
  { key: 'pending', label: 'รอผู้รับ' },
];

export default function AdminTransfersPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/admin/transfers');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { transfers?: Row[] };
        if (!cancelled) setRows(data.transfers || []);
      } catch (e) {
        console.error('Failed to load transfers', e);
        if (!cancelled) setLoadError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (rows || []).filter((r) => {
      if (filter === 'pending') {
        if (r.status !== 'pending') return false;
      } else if (filter !== 'all' && r.kind !== filter) {
        return false;
      }
      if (!term) return true;
      return [r.workshop_title, r.from_name, r.from_phone, r.from_email, r.to_name, r.to_phone, r.to_email]
        .filter(Boolean)
        .some((v) => (v as string).toLowerCase().includes(term));
    });
  }, [rows, filter, q]);

  const fmtStamp = (v: string | null) => {
    if (!v) return '—';
    const ms = sqliteToMs(v);
    if (!ms) return '—';
    return new Date(ms).toLocaleString('th-TH', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
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
        eyebrow="admin · transfers"
        title="โอนย้ายสิทธิ์"
        sub="ที่นั่งที่ถูกซื้อเป็นของขวัญ โอนให้คนอื่น หรือส่งเป็นบัตรเชิญ — ซ้ายคือเจ้าของเดิม ขวาคือผู้รับ"
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
            <div className="adm-card adm-empty">{rows && rows.length === 0 ? 'ยังไม่มีการโอนย้ายสิทธิ์' : 'ไม่พบรายการโอนสิทธิ์'}</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {shown.map((r) => {
                const claimed = r.status === 'claimed';
                return (
                  <article key={r.id} className="adm-card adm-transfer">
                    <div className="adm-transfer-head">
                      <Badge tone={r.kind === 'gift' ? 'warn' : r.kind === 'invite' ? 'info' : 'teal'}>
                        {r.kind === 'gift' ? 'ของขวัญ' : r.kind === 'invite' ? 'บัตรเชิญ' : 'โอนสิทธิ์'}
                      </Badge>
                      <Badge tone={claimed ? 'ok' : r.status === 'cancelled' ? 'bad' : 'mute'}>
                        {claimed ? 'รับสิทธิ์แล้ว' : r.status === 'cancelled' ? 'ยกเลิก' : 'รอผู้รับสิทธิ์'}
                      </Badge>
                      <Link href={`/admin/workshops/${r.workshop_id}/attendance`} className="adm-link-title" style={{ fontSize: 14.5, marginLeft: 4 }}>
                        {r.workshop_title || 'ไม่พบกิจกรรม'}
                      </Link>
                      {r.workshop_date && <span className="adm-meta">· {fmtDate(r.workshop_date, 'th', 'medium')}</span>}
                    </div>

                    <div className="adm-transfer-parties">
                      <Party label="ผู้โอน" name={r.from_name} phone={r.from_phone} email={r.from_email} />
                      <div className="adm-transfer-arrow" aria-hidden="true">
                        →
                      </div>
                      <div className="adm-party is-to">
                        <div className="adm-label" style={{ marginBottom: 4 }}>
                          ผู้รับ
                        </div>
                        {claimed ? (
                          <>
                            <div style={{ fontWeight: 600, fontSize: 14 }}>{r.to_name || '—'}</div>
                            <div className="adm-meta">
                              {r.to_phone || '—'}
                              {r.to_email ? ` · ${r.to_email}` : ''}
                            </div>
                          </>
                        ) : (
                          // Nothing has moved yet, so nobody is named as receiver.
                          // For a gift the buyer said who it was meant for; that is
                          // an intention, and reads as one.
                          <>
                            <div className="adm-meta" style={{ fontSize: 14 }}>
                              รอผู้รับสิทธิ์
                            </div>
                            {r.to_name && (
                              <div className="adm-meta" style={{ marginTop: 2 }}>
                                ตั้งใจส่งให้ {r.to_name}
                                {r.to_phone ? ` · ${r.to_phone}` : ''}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </div>

                    <div className="adm-meta" style={{ fontSize: 12 }}>
                      สร้างลิงก์ {fmtStamp(r.created_at)}
                      {claimed ? ` · รับสิทธิ์ ${fmtStamp(r.claimed_at)}` : ''}
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

function Party({
  label,
  name,
  phone,
  email,
}: {
  label: string;
  name: string | null;
  phone: string | null;
  email: string | null;
}) {
  return (
    <div className="adm-party">
      <div className="adm-label" style={{ marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontWeight: 600, fontSize: 14 }}>{name || '—'}</div>
      <div className="adm-meta">
        {phone || '—'}
        {email ? ` · ${email}` : ''}
      </div>
    </div>
  );
}
