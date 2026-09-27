'use client';

/* Every seat that changed hands, across all workshops. Admin-only: the rows
 * carry both parties' phone numbers, and the screen exists to answer "who is
 * actually coming, and who paid for it" when the two are not the same person. */
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { PageLoader } from '@/components/design/PageLoader';
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
      <div className="flex items-center justify-center h-64">
        <PageLoader />
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-1">ประวัติการโอนย้ายสิทธิ์</h1>
      <p className="text-sm text-gray mb-6">
        ที่นั่งที่ถูกซื้อเป็นของขวัญหรือโอนให้คนอื่น — ฝั่งซ้ายคือเจ้าของเดิม ฝั่งขวาคือผู้รับ
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
              {rows && rows.length === 0 ? 'ยังไม่มีการโอนย้ายสิทธิ์' : 'ไม่พบรายการที่ตรงกับที่ค้นหา'}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {shown.map((r) => {
                const claimed = r.status === 'claimed';
                return (
                  <div key={r.id} className="card !p-0 overflow-hidden">
                    <div className="flex flex-wrap items-center gap-2 px-5 py-3 bg-surface/60 border-b border-gray-lighter">
                      <span
                        className={`text-[11px] font-medium rounded-full px-2.5 py-1 ${
                          r.kind === 'gift' ? 'bg-amber-100 text-amber-700' : 'bg-primary/15 text-primary'
                        }`}
                      >
                        {r.kind === 'gift' ? 'ของขวัญ' : r.kind === 'invite' ? 'บัตรเชิญ' : 'โอนสิทธิ์'}
                      </span>
                      <span
                        className={`text-[11px] font-medium rounded-full px-2.5 py-1 ${
                          claimed ? 'bg-primary/15 text-primary' : 'bg-gray-lighter text-gray'
                        }`}
                      >
                        {claimed ? 'รับสิทธิ์แล้ว' : r.status === 'cancelled' ? 'ยกเลิก' : 'รอผู้รับสิทธิ์'}
                      </span>
                      <Link
                        href={`/admin/workshops/${r.workshop_id}/attendance`}
                        className="text-sm font-medium text-dark hover:text-primary hover:underline"
                      >
                        {r.workshop_title || 'ไม่พบกิจกรรม'}
                      </Link>
                      {r.workshop_date && (
                        <span className="text-xs text-gray">· {fmtDate(r.workshop_date, 'th', 'medium')}</span>
                      )}
                    </div>

                    <div className="grid gap-4 px-5 py-4 sm:grid-cols-[1fr_auto_1fr] sm:items-start">
                      <Party label="ผู้โอน" name={r.from_name} phone={r.from_phone} email={r.from_email} />
                      <span aria-hidden className="hidden sm:block text-gray pt-5">
                        →
                      </span>
                      {claimed ? (
                        <Party label="ผู้รับ" name={r.to_name} phone={r.to_phone} email={r.to_email} />
                      ) : (
                        // Nothing has moved yet, so nobody is named as receiver.
                        // For a gift the buyer said who it was meant for; that is
                        // an intention, and reads as one.
                        <div>
                          <div className="text-[11px] uppercase tracking-wider text-gray mb-1">ผู้รับ</div>
                          <div className="text-sm text-gray italic">รอผู้รับสิทธิ์</div>
                          {r.to_name && (
                            <div className="text-xs text-gray mt-0.5">
                              ตั้งใจส่งให้ {r.to_name}
                              {r.to_phone ? ` · ${r.to_phone}` : ''}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="px-5 pb-4 text-xs text-gray">
                      สร้างลิงก์ {fmtStamp(r.created_at)}
                      {claimed ? ` · รับสิทธิ์ ${fmtStamp(r.claimed_at)}` : ''}
                    </div>
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
    <div className="min-w-0">
      <div className="text-[11px] uppercase tracking-wider text-gray mb-1">{label}</div>
      <div className="text-sm font-medium text-dark truncate">{name || '—'}</div>
      <div className="text-xs text-gray truncate">
        {phone || '—'}
        {email ? ` · ${email}` : ''}
      </div>
    </div>
  );
}
