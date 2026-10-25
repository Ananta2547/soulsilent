'use client';

import type { AdminAnalytics } from '@/lib/admin-analytics';
import { Card, DOW, Empty, HBars, Kpis, PAL, Rows, Stack100, baht, deltaOf, num } from '@/components/dashboard/kit';

/** What sells: by category, format, type and price, how rounds fill, how
 *  bookings end, and when people pay. */
export function ActivitiesTab({ a }: { a: AdminAnalytics }) {
  const x = a.activities;
  const heatMax = Math.max(1, ...x.heat.flat());
  const stack = (rows: { label: string; value: number }[]) => rows.map((r, i) => ({ label: r.label, value: r.value, color: PAL[i % PAL.length] }));

  return (
    <div className="hx-stack">
      <Kpis
        items={[
          { label: 'รอบที่จัด', value: num(x.held, 0), delta: deltaOf(x.held, x.heldPrev, 'abs') },
          { label: 'รอบใน 30 วันข้างหน้า', value: num(x.upcoming30, 0) },
          { label: 'อัตราเต็มรอบ', value: x.fill.cur == null ? '—' : `${num(x.fill.cur, 0)}%`, delta: deltaOf(x.fill.cur, x.fill.prev, 'pt'), title: 'ที่นั่งขาย ÷ ความจุ ของรอบที่จัดในช่วงนี้' },
          { label: 'ผู้จัดยกเลิกรอบ', value: `${x.hostCancelled} รอบ`, title: 'รอบที่ถูกยกเลิกหลังมีคนจ่ายเงินแล้ว' },
          { label: 'ขอคืนเงิน', value: x.refundRequestP == null ? '—' : `${num(x.refundRequestP)}%`, title: 'การจองที่ผู้จองขอคืนเงิน ÷ การจองที่ชำระในช่วงนี้' },
          { label: 'จองล่วงหน้า (ค่ากลาง)', value: x.leadMedian == null ? '—' : `${num(x.leadMedian)} วัน` },
        ]}
      />

      <div className="hx-g g11">
        <Card title="ยอดขายตามหมวด" sub="หมวดของรอบกิจกรรม">
          <HBars rows={x.byCategory} fmt={baht} />
        </Card>
        <Card title="รูปแบบและประเภท" sub="สัดส่วนยอดขายในช่วงนี้" delay={70}>
          <Stack100 items={stack(x.byFormat)} noneText="ยังไม่มียอดขายในช่วงนี้" />
          <div style={{ height: 8 }} />
          <Stack100 items={stack(x.byKind)} noneText="—" />
        </Card>
      </div>

      <div className="hx-g g11">
        <Card title="มาจริง · ยกเลิก · ไม่มา" sub="ของการจองในรอบที่จบแล้วในช่วงนี้" delay={140}>
          <Stack100
            items={[
              { label: 'มาจริง', value: x.outcome.came, color: '#0d8a7e' },
              { label: 'ยกเลิก', value: x.outcome.cancelled, color: '#e3b23c' },
              { label: 'ไม่มา', value: x.outcome.noShow, color: '#c86b5a' },
            ]}
            noneText="ยังไม่มีรอบที่จบในช่วงนี้"
          />
        </Card>
        <Card title="ช่วงราคาต่อที่นั่ง" sub="จำนวนที่นั่งที่ขายได้ในช่วงนี้" delay={210}>
          <HBars rows={x.priceBands} />
        </Card>
      </div>

      <Card title="กิจกรรมที่ขายได้มากที่สุด" sub="15 อันดับแรกของช่วงนี้" delay={280}>
        {x.top.length === 0 ? (
          <Empty>ยังไม่มียอดขายในช่วงนี้</Empty>
        ) : (
          <Rows rows={x.top.map((t) => ({ key: t.key, main: t.title, sub: `${t.host} · ${t.seats} ที่${t.fill == null ? '' : ` · เต็ม ${num(t.fill, 0)}%`}`, amt: baht(t.sales) }))} />
        )}
      </Card>

      <Card title="ช่วงเวลาที่คนจ่ายเงิน" sub="วัน × ชั่วโมง (เวลาไทย) ทั้งเว็บ · สีเข้ม = จองมาก" delay={350}>
        <div className="hx-heat-wrap">
          <div className="hx-heat">
            <span />
            {Array.from({ length: 24 }, (_, h) => (
              <span key={h} className="h">
                {h % 3 === 0 ? h : ''}
              </span>
            ))}
            {x.heat.map((row, d) => [
              <span key={`l${d}`}>{DOW[d]}</span>,
              ...row.map((v, h) => (
                <span
                  key={`${d}-${h}`}
                  className="c"
                  title={`${DOW[d]} ${h}:00 · ${v} การจอง`}
                  style={{ background: v ? `rgba(12,133,119,${0.2 + (v / heatMax) * 0.8})` : 'var(--cr)' }}
                />
              )),
            ])}
          </div>
        </div>
      </Card>
    </div>
  );
}
