'use client';

import { useEffect, useState } from 'react';
import { PageLoader } from '@/components/design/PageLoader';
import { AdminHead, AdminSearch, Badge } from '@/components/admin/AdminShell';
import { HIGH_PRICE_FROM, HIGH_PRICE_RATE, TIERS } from '@/lib/gp';

type Kind = { prevSales: number; table: number; rate: number; why: string | null; sales: number };
type Row = {
  id: string;
  name: string;
  email: string;
  founding: boolean;
  roundZeroUntil: string | null;
  single: Kind;
  round: Kind;
  sales: number;
  gp: number;
  manualSales: number;
};
type Data = { month: string; started: boolean; items: Row[]; totals: { sales: number; gp: number } };

const baht = (n: number) => '฿' + n.toLocaleString('th-TH', { maximumFractionDigits: 2 });
const thisMonth = () => new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 7);

/**
 * ค่าธรรมเนียม GP รายผู้จัด — per host for one month: last month's sales and
 * the tier they set (standalone / round-based), the Founding Host cut, the
 * round 0% period, this month's sales and the GP charged on them (lib/gp).
 */
export default function AdminGpPage() {
  const [month, setMonth] = useState(thisMonth());
  const [data, setData] = useState<Data | null>(null);
  const [q, setQ] = useState('');
  const [onlyActive, setOnlyActive] = useState(true);

  useEffect(() => {
    let live = true;
    fetch(`/api/admin/gp?month=${month}`)
      .then(async (r) => (await r.json()) as Data)
      .then((d) => live && setData(d))
      .catch(() => live && setData({ month, started: false, items: [], totals: { sales: 0, gp: 0 } }));
    return () => {
      live = false;
    };
  }, [month]);

  const rows = (data?.items || []).filter(
    (r) =>
      (!q.trim() || `${r.name} ${r.email}`.toLowerCase().includes(q.trim().toLowerCase())) &&
      (!onlyActive || r.sales > 0 || r.single.prevSales > 0 || r.round.prevSales > 0),
  );
  const cell = (k: Kind) => (
    <>
      <b>{k.rate}%</b>
      {k.rate !== k.table && <span className="adm-meta"> (ตาราง {k.table}%)</span>}
      <div className="adm-meta">เดือนก่อน {baht(k.prevSales)}</div>
      {k.why && <div className="adm-meta">{k.why}</div>}
    </>
  );

  return (
    <>
      <AdminHead eyebrow="admin · gp" title="ค่าธรรมเนียม GP" sub="อัตรา GP ของผู้จัดแต่ละคนตามยอดขายเดือนก่อน และ GP ที่เก็บได้ในเดือนที่เลือก" />

      <div className="adm-card" style={{ padding: 16, marginBottom: 16 }}>
        <div className="adm-label" style={{ marginBottom: 8 }}>
          ตารางอัตรา (เริ่ม 1 ม.ค. 2570)
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 24px', fontSize: 13 }}>
          <span>
            <b>เดี่ยว:</b> {TIERS.single.map(([f, r]) => `${f ? `≥${f.toLocaleString()}` : '<5,000'} ${r}%`).join(' · ')}
          </span>
          <span>
            <b>แบบรอบ:</b> เดือนแรก 0% · {TIERS.round.map(([f, r]) => `${f ? `≥${f.toLocaleString()}` : '<15,000'} ${r}%`).join(' · ')}
          </span>
          <span>
            ส่วนที่เกิน {HIGH_PRICE_FROM.toLocaleString()} บาท/ที่นั่ง {HIGH_PRICE_RATE}% · ฟรี 0% · Founding Host −1% (ไม่ต่ำกว่า 4%) ปี 2570
          </span>
        </div>
      </div>

      <div className="adm-toolbar">
        <input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} style={{ width: 170, flex: '0 0 auto' }} aria-label="เดือน" />
        <AdminSearch value={q} onChange={setQ} placeholder="ค้นหาชื่อหรืออีเมลผู้จัด" />
        <label className="adm-check" style={{ padding: '6px 0' }}>
          <input type="checkbox" checked={onlyActive} onChange={(e) => setOnlyActive(e.target.checked)} />
          <span>เฉพาะผู้จัดที่มียอดขาย</span>
        </label>
      </div>

      {!data ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
          <PageLoader />
        </div>
      ) : (
        <>
          {!data.started && (
            <div className="adm-notice" style={{ marginBottom: 12 }}>
              เดือนนี้อยู่ก่อน 1 ม.ค. 2570 — การจองที่ชำระในเดือนนี้ไม่มี GP (ยอดขายธันวาคม 2569 ใช้คิดขั้นของมกราคม 2570)
            </div>
          )}
          <div className="adm-card" style={{ padding: '14px 18px', marginBottom: 12, display: 'flex', gap: 28, flexWrap: 'wrap' }}>
            <div>
              <div className="adm-label">ยอดขายเดือนนี้</div>
              <b style={{ fontSize: 20 }}>{baht(data.totals.sales)}</b>
            </div>
            <div>
              <div className="adm-label">GP เดือนนี้</div>
              <b style={{ fontSize: 20, color: 'var(--teal)' }}>{baht(data.totals.gp)}</b>
            </div>
            <div>
              <div className="adm-label">GP เฉลี่ย</div>
              <b style={{ fontSize: 20 }}>{data.totals.sales ? `${((data.totals.gp / data.totals.sales) * 100).toFixed(1)}%` : '—'}</b>
            </div>
          </div>
          {rows.length === 0 ? (
            <div className="adm-card adm-empty">ไม่มีผู้จัดที่ตรงเงื่อนไข</div>
          ) : (
            <div className="adm-card">
              <div className="adm-table-wrap">
                <table className="adm-table">
                  <thead>
                    <tr>
                      <th>ผู้จัด</th>
                      <th>เดี่ยว (ข.)</th>
                      <th>แบบรอบ (ก.)</th>
                      <th style={{ textAlign: 'right' }}>ยอดขายเดือนนี้</th>
                      <th style={{ textAlign: 'right' }}>GP เดือนนี้</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id}>
                        <td>
                          <div style={{ fontWeight: 600 }}>{r.name}</div>
                          <div className="adm-meta">{r.email}</div>
                          <span style={{ display: 'inline-flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
                            {r.founding && <Badge tone="teal">Founding Host</Badge>}
                            {r.roundZeroUntil && <Badge tone="info">แบบรอบ 0% ถึง {r.roundZeroUntil}</Badge>}
                          </span>
                        </td>
                        <td>{cell(r.single)}</td>
                        <td>{cell(r.round)}</td>
                        <td style={{ textAlign: 'right' }}>
                          {baht(r.sales)}
                          {r.manualSales > 0 && <div className="adm-meta">ยอดหักเอง {baht(r.manualSales)}</div>}
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>{baht(r.gp)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}
