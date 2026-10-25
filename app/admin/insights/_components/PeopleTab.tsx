'use client';

import type { AdminAnalytics } from '@/lib/admin-analytics';
import { SOURCE_LABEL, type Source } from '@/lib/attribution';
import { Bars, Card, Empty, FEW, HBars, Kpis, PAL, Stack100, baht, num, thMonth } from '@/components/dashboard/kit';

/** Who joins, who books, who comes back, and where bookings come from. */
export function PeopleTab({ a }: { a: AdminAnalytics }) {
  const p = a.people;
  const f = p.funnel;
  const steps: [string, number, number | null][] = [
    ['การ์ดถูกเห็น', f.impressions, null],
    ['เข้าชมหน้า', f.views, f.impressions],
    ['เริ่มจอง', f.started, f.views],
    ['ชำระสำเร็จ', f.paid, f.started],
  ];
  const fMax = Math.max(1, ...steps.map((s) => s[1]));
  const cell = (v: number | null, people: number, key: string) =>
    v == null ? (
      <span key={key} className="hx-cell none">
        {people < 5 ? (people ? 'น้อย' : '—') : 'รอครบ'}
      </span>
    ) : (
      <span key={key} className="hx-cell" style={{ background: `rgba(12,133,119,${0.1 + (v / 100) * 0.7})`, color: v > 55 ? '#fff' : 'var(--ink)' }}>
        {num(v, 0)}%
      </span>
    );

  return (
    <div className="hx-stack">
      <Kpis
        items={[
          { label: 'สมาชิกใหม่', value: num(p.signups, 0) },
          { label: 'ผู้จอง', value: num(p.buyers, 0), title: 'คนไม่ซ้ำที่มีการจองที่ชำระ / ยืนยันในช่วงนี้' },
          { label: 'จองครั้งแรก', value: num(p.firstBuyers, 0) },
          { label: 'ผู้จองที่เคยจองมาก่อน', value: p.repeatShare == null ? null : `${num(p.repeatShare, 0)}%`, delta: `${p.repeatBuyers} คน` },
          { label: 'สมัครแล้วจองใน 30 วัน', value: p.activation == null ? null : `${num(p.activation, 0)}%`, delta: `จาก ${p.activationBase} คนที่ครบ 30 วัน` },
          { label: 'ใช้จ่ายต่อผู้จอง', value: p.spendPerBuyer == null ? '—' : baht(p.spendPerBuyer) },
        ]}
      />

      <div className="hx-g g84">
        <Card title="สมาชิกใหม่ / จองครั้งแรก รายเดือน" sub="12 เดือนล่าสุด">
          <Bars
            labels={p.monthly.map((m) => thMonth(m.month))}
            series={[
              { name: 'สมาชิกใหม่', color: '#a5d9d1', values: p.monthly.map((m) => m.signups) },
              { name: 'จองครั้งแรก', color: '#0d8a7e', values: p.monthly.map((m) => m.firstBuyers) },
            ]}
            every={1}
          />
        </Card>
        <Card title="เส้นทางการจองทั้งเว็บ" sub="ยอดเข้าชมเริ่มนับตั้งแต่ระบบเก็บข้อมูล" delay={70}>
          <div className="hx-funnel" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
            {steps.map(([l, v, prev], i) => (
              <div key={l} className="hx-fstep">
                <span className="hx-label">0{i + 1}</span>
                <span className="l">{l}</span>
                <span className="v">{num(v, 0)}</span>
                <span className="c">{prev && v <= prev ? `→ ${num((v / prev) * 100)}%` : ''}</span>
                <span className="bar" style={{ width: `${(v / fMax) * 100}%` }} />
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="hx-g g75">
        <Card title="ตารางรุ่น (cohort)" sub="ผู้จองครั้งแรกแต่ละเดือน จองอีกภายใน 30 / 60 / 90 วันกี่ %" delay={140}>
          <div className="hx-cells-wrap">
            <div className="hx-cells" style={{ gridTemplateColumns: 'minmax(90px,1.3fr) repeat(4, minmax(64px,1fr))', minWidth: 420 }}>
              <span className="hx-cell hd l">เดือนแรก</span>
              <span className="hx-cell hd">คนใหม่</span>
              <span className="hx-cell hd">30 วัน</span>
              <span className="hx-cell hd">60 วัน</span>
              <span className="hx-cell hd">90 วัน</span>
              {[...p.cohorts].reverse().map((c) => [
                <span key={`${c.month}m`} className="hx-cell l thin">
                  {thMonth(c.month)}
                </span>,
                <span key={`${c.month}n`} className="hx-cell thin">
                  {c.people}
                </span>,
                cell(c.r30, c.people, `${c.month}a`),
                cell(c.r60, c.people, `${c.month}b`),
                cell(c.r90, c.people, `${c.month}c`),
              ])}
            </div>
          </div>
        </Card>
        <Card title="ช่วงอายุผู้จอง" sub={`อายุเฉลี่ย ${p.ages.avg ?? '—'} ปี · จาก ${p.ages.people} คนที่มีข้อมูล · ช่วงที่น้อยกว่า 5 คนไม่แสดง`} delay={210}>
          {p.ages.people < 5 ? (
            <Empty>{FEW}</Empty>
          ) : (
            <HBars rows={p.ages.bands.filter((b) => b.n != null).map((b) => ({ label: b.label, value: b.n as number, note: b.share == null ? undefined : `${num(b.share, 0)}%` }))} />
          )}
        </Card>
      </div>

      <div className="hx-g g11">
        <Card title="การจองมาจากไหน" sub="การจองที่ชำระในช่วงนี้" delay={280}>
          <Stack100
            items={p.sources.map((s, i) => ({
              label: s.source === 'unknown' ? 'ก่อนเริ่มเก็บข้อมูล' : s.source === 'host_link' ? 'ลิงก์ของผู้จัด' : SOURCE_LABEL[s.source as Source] || s.source,
              value: s.n,
              color: PAL[i % PAL.length],
            }))}
            noneText="ยังไม่มีการจองในช่วงนี้"
          />
        </Card>
        <Card title="แคมเปญ (utm_campaign)" sub="12 อันดับแรก" delay={350}>
          {p.campaigns.length === 0 ? <Empty>ยังไม่มีการจองจากลิงก์ที่ติดแท็กแคมเปญ</Empty> : <HBars rows={p.campaigns.map((c) => ({ label: c.campaign, value: c.n }))} />}
        </Card>
      </div>
    </div>
  );
}
