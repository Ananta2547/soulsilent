'use client';

import { PageLoader } from '@/components/design/PageLoader';

import { useEffect, useState } from 'react';

interface MonthlyData {
  month: string;
  total: number;
  count: number;
}

interface RevenueData {
  soulsilent: { total: number; count: number; monthly: MonthlyData[] };
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
      <div className="flex items-center justify-center h-64">
        <PageLoader />
      </div>
    );
  }
  if (!data) {
    return (
      <div className="card text-center py-12">
        <p className="text-gray text-sm">โหลดข้อมูลรายรับไม่สำเร็จ · ตรวจสอบว่าเข้าสู่ระบบในฐานะ admin แล้ว</p>
      </div>
    );
  }

  const sortedMonths = data.soulsilent.monthly.map((m) => m.month).sort().reverse();
  const wsMap = new Map(data.soulsilent.monthly.map((m) => [m.month, m]));
  const maxMonthTotal = Math.max(...sortedMonths.map((m) => wsMap.get(m)?.total || 0), 1);

  return (
    <div className="space-y-8">
      <header>
        <p className="text-xs font-mono text-primary tracking-[.2em] uppercase mb-2">
          revenue · summary
        </p>
        <h1 className="font-heading text-3xl text-dark">สรุปรายรับ</h1>
        <p className="text-sm text-gray mt-1">รายรับจากการจองกิจกรรม</p>
      </header>

      {/* Big totals */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <StatBig label="รายรับรวมทั้งหมด" value={data.soulsilent.total} meta={`${data.soulsilent.count} รายการ`} tone="dark" />
        <StatBig label="soulsilent" sublabel="การจองกิจกรรม" value={data.soulsilent.total} meta={`${data.soulsilent.count} การจอง`} tone="primary" dot />
      </section>

      {/* Monthly bars */}
      <section className="card !p-6">
        <h2 className="font-heading text-lg text-dark mb-6">รายรับรายเดือน</h2>
        {sortedMonths.length === 0 ? (
          <p className="text-sm text-gray text-center py-8">ยังไม่มีข้อมูลรายรับ</p>
        ) : (
          <div className="space-y-4">
            {sortedMonths.map((month) => {
              const wsTotal = wsMap.get(month)?.total || 0;
              const wsPct = (wsTotal / maxMonthTotal) * 100;
              return (
                <div key={month}>
                  <div className="flex items-center justify-between mb-1.5 text-xs">
                    <span className="font-mono text-gray tracking-wider">{month}</span>
                    <span className="font-mono text-dark font-medium">฿{wsTotal.toLocaleString()}</span>
                  </div>
                  <div className="flex h-3 bg-gray-lighter/60 rounded-full overflow-hidden">
                    {wsPct > 0 && (
                      <div className="bg-primary h-full transition-all duration-500" style={{ width: `${wsPct}%` }} title={`กิจกรรม ฿${wsTotal.toLocaleString()}`} />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Detail table */}
      <section className="card !p-0 overflow-hidden">
        <div className="p-5 border-b border-gray-lighter">
          <h2 className="font-heading text-lg text-dark">รายละเอียดรายเดือน</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface">
              <tr>
                <th className="text-left py-3 px-5 text-gray font-medium">เดือน</th>
                <th className="text-right py-3 px-5 text-gray font-medium">กิจกรรม</th>
                <th className="text-right py-3 px-5 text-gray font-medium">รวม</th>
              </tr>
            </thead>
            <tbody>
              {sortedMonths.map((month) => {
                const ws = wsMap.get(month);
                return (
                  <tr key={month} className="border-t border-gray-lighter hover:bg-surface/50">
                    <td className="py-3 px-5 text-dark font-mono text-xs">{month}</td>
                    <td className="py-3 px-5 text-right">
                      <span className="text-primary font-medium">฿{(ws?.total || 0).toLocaleString()}</span>
                      <span className="text-gray text-xs ml-1.5">({ws?.count || 0})</span>
                    </td>
                    <td className="py-3 px-5 text-right text-dark font-bold">฿{(ws?.total || 0).toLocaleString()}</td>
                  </tr>
                );
              })}
              {sortedMonths.length === 0 && (
                <tr>
                  <td colSpan={3} className="py-8 text-center text-gray">ยังไม่มีข้อมูลรายรับ</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function StatBig({
  label,
  sublabel,
  value,
  meta,
  tone,
  dot,
}: {
  label: string;
  sublabel?: string;
  value: number;
  meta: string;
  tone: 'dark' | 'primary';
  dot?: boolean;
}) {
  const valueColor = tone === 'primary' ? 'text-primary' : 'text-dark';
  return (
    <div className="card !p-6 flex flex-col gap-3">
      <div className="flex items-center gap-2 min-h-[20px]">
        {dot && <span className="w-2.5 h-2.5 rounded-full bg-primary" />}
        <span className="text-sm font-medium text-dark">{label}</span>
      </div>
      <div
        className={`font-heading text-4xl leading-none ${valueColor} truncate`}
        style={{ fontFamily: 'Archivo Black, Mitr, sans-serif', letterSpacing: '-0.025em' }}
      >
        ฿{value.toLocaleString()}
      </div>
      <div className="text-xs text-gray font-mono uppercase tracking-wider">
        {sublabel ? `${sublabel} · ${meta}` : meta}
      </div>
    </div>
  );
}
