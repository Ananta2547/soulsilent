'use client';

import { PageLoader } from '@/components/design/PageLoader';
import { AdminHead } from '@/components/admin/AdminShell';

import { useEffect, useState } from 'react';

interface MonthlyData {
  month: string;
  total: number;
  count: number;
}

interface RevenueData {
  soulsilent: { total: number; count: number; monthly: MonthlyData[] };
}

const TH_MONTH = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

/** "2026-10" → "ต.ค. 2569". */
function monthLabel(m: string): string {
  const [y, mo] = m.split('-').map(Number);
  return y && mo ? `${TH_MONTH[mo - 1]} ${y + 543}` : m;
}

export default function AdminRevenuePage() {
  const [data, setData] = useState<RevenueData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/revenue')
      .then(async (r) => {
        const body = (await r.json()) as Partial<RevenueData> & { error?: string };
        // Guard against an auth-error body being cast to RevenueData.
        if (!r.ok || !body.soulsilent) return null;
        return body as RevenueData;
      })
      .then((d) => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 256 }}>
        <PageLoader />
      </div>
    );
  }
  if (!data) {
    return <div className="adm-card adm-empty">โหลดข้อมูลรายรับไม่สำเร็จ · ตรวจสอบว่าเข้าสู่ระบบในฐานะ admin แล้ว</div>;
  }

  const months = [...data.soulsilent.monthly].sort((a, b) => (a.month < b.month ? 1 : -1));
  const max = Math.max(...months.map((m) => m.total), 1);
  const avg = months.length ? Math.round(data.soulsilent.total / months.length) : 0;
  const best = months.reduce<MonthlyData | null>((b, m) => (!b || m.total > b.total ? m : b), null);

  return (
    <>
      <AdminHead eyebrow="admin · revenue" title="รายรับ" sub="รายรับจากการจองกิจกรรม (ยอดที่ชำระแล้ว)" />

      <section className="adm-kpis" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))' }}>
        <div className="adm-kpi">
          <div className="adm-label" style={{ fontSize: 11 }}>
            รายรับรวม
          </div>
          <div className="adm-kpi-value" style={{ color: 'var(--teal)', fontSize: 32 }}>
            ฿{data.soulsilent.total.toLocaleString()}
          </div>
          <div className="adm-kpi-sub">
            {data.soulsilent.count.toLocaleString()} การจอง · {months.length} เดือน
          </div>
        </div>
        <div className="adm-kpi">
          <div className="adm-label" style={{ fontSize: 11 }}>
            เฉลี่ยต่อเดือน
          </div>
          <div className="adm-kpi-value" style={{ fontSize: 32 }}>
            ฿{avg.toLocaleString()}
          </div>
        </div>
        <div className="adm-kpi">
          <div className="adm-label" style={{ fontSize: 11 }}>
            เดือนที่สูงสุด
          </div>
          <div className="adm-kpi-value" style={{ fontSize: 32 }}>
            ฿{(best?.total || 0).toLocaleString()}
          </div>
          <div className="adm-kpi-sub">{best ? monthLabel(best.month) : '—'}</div>
        </div>
      </section>

      <section className="adm-card">
        <div className="adm-card-head" style={{ paddingBottom: 8 }}>
          <h2 className="adm-h2">รายรับรายเดือน</h2>
        </div>
        {months.length === 0 ? (
          <p className="adm-empty">ยังไม่มีข้อมูลรายรับ</p>
        ) : (
          months.map((m) => (
            <div key={m.month} className="adm-row adm-month">
              <span className="adm-mono" style={{ fontSize: 12.5 }}>
                {monthLabel(m.month)}
              </span>
              <div className="adm-month-bar" title={`฿${m.total.toLocaleString()}`}>
                <span style={{ width: `${(m.total / max) * 100}%` }} />
              </div>
              <span style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                <b style={{ fontWeight: 600 }}>฿{m.total.toLocaleString()}</b>
                <span className="adm-meta" style={{ fontSize: 12, marginLeft: 6 }}>
                  {m.count} จอง
                </span>
              </span>
            </div>
          ))
        )}
      </section>
    </>
  );
}
