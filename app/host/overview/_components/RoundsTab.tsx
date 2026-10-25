'use client';

import { useState } from 'react';
import type { Analytics } from '@/lib/host-analytics';
import { Card, DOW, Dropdown, Empty, HBars, Kpis, Stack100, baht, num } from '@/components/dashboard/kit';

type Act = Analytics['rounds']['activities'][number];
const SORTS: [keyof Act, string][] = [
  ['sales', 'ยอดขาย'],
  ['seats', 'ที่นั่งขาย'],
  ['fill', 'อัตราเต็ม'],
  ['upcoming', 'รอบที่จะถึง'],
  ['views', 'ยอดเข้าชม'],
  ['title', 'ชื่อกิจกรรม'],
];
const PARTS = ['เช้า', 'บ่าย', 'เย็น'];

/** Which activities to open more of, when to open them, and whether the page sells. */
export function RoundsTab({ a }: { a: Analytics }) {
  const r = a.rounds;
  const f = r.funnel;
  const [sort, setSort] = useState<keyof Act>('sales');
  const [sortOpen, setSortOpen] = useState(false);
  const acts = [...r.activities].sort((x, y) =>
    sort === 'title' ? x.title.localeCompare(y.title, 'th') : ((y[sort] as number | null) ?? -1) - ((x[sort] as number | null) ?? -1),
  );
  const heatMax = Math.max(1, ...r.heat.flat());
  const steps: [string, number, number | null][] = [
    ['การ์ดถูกเห็น', f.impressions, null],
    ['เข้าชมหน้า', f.views, f.impressions],
    ['เริ่มจอง', f.started, f.views],
    ['ชำระสำเร็จ', f.paid, f.started],
  ];
  const fMax = Math.max(1, ...steps.map((s) => s[1]));

  return (
    <div className="hx-stack">
      <Kpis
        items={[
          {
            label: 'เวลาถึงการจองแรก',
            value: r.firstSaleHours == null ? '—' : r.firstSaleHours < 48 ? `${num(r.firstSaleHours, 0)} ชม.` : `${num(r.firstSaleHours / 24)} วัน`,
            title: 'ค่ากลาง: เปิดรอบ → มีคนจ่ายคนแรก',
          },
          { label: 'รอบที่เต็ม', value: r.soldOut.fullPct == null ? '—' : `${num(r.soldOut.fullPct, 0)}%`, delta: `${r.soldOut.fullRounds} จาก ${r.soldOut.rounds} รอบ` },
          {
            label: 'เต็มก่อนวันจัด',
            value: r.soldOut.medianDaysBefore == null ? '—' : `${num(r.soldOut.medianDaysBefore)} วัน`,
            delta: r.soldOut.fastest ? `เร็วสุด ${num(r.soldOut.fastest.daysBefore)} วัน` : undefined,
          },
          { label: 'จองล่วงหน้า', value: r.leadMedianDays == null ? '—' : `${num(r.leadMedianDays)} วัน`, title: 'ค่ากลางของ (วันจัด − วันชำระ)' },
          { label: 'จัดเฉลี่ย / เดือน', value: `${num(r.perMonth)} รอบ`, delta: r.freeShare != null ? `ฟรี ${num(r.freeShare, 0)}%` : undefined },
          { label: 'ผู้จัดยกเลิกรอบ', value: `${r.hostCancelled6m} รอบ`, delta: '6 เดือนล่าสุด', title: 'รอบที่ถูกยกเลิกหลังมีคนจ่ายเงินแล้ว' },
        ]}
      />

      <Card
        title="กิจกรรมของคุณ"
        sub="เข้าชม = ผู้เข้าชมไม่ซ้ำต่อวัน (เริ่มนับตั้งแต่ระบบเก็บข้อมูล)"
        className={`raised${sortOpen ? ' menu-open' : ''}`}
        right={
          <>
            <span className="hx-note">เรียงตาม</span>
            <Dropdown
              small
              label={SORTS.find((s) => s[0] === sort)![1]}
              options={SORTS.map(([k, l]) => ({ key: k, label: l }))}
              value={sort}
              onPick={(k) => setSort(k as keyof Act)}
              onOpen={setSortOpen}
              ariaLabel="เรียงตาม"
            />
          </>
        }
      >
        {acts.length === 0 ? (
          <Empty>ยังไม่มีกิจกรรม</Empty>
        ) : (
          <div className="hx-acts">
            {acts.map((x) => (
              <div key={x.key} className="hx-act">
                <div style={{ minWidth: 0 }}>
                  <div className="t">{x.title}</div>
                  <div className="m">
                    รอบที่จะถึง {x.upcoming} · ขาย {x.seats} ที่ · ราคาเฉลี่ย {x.avgPrice == null ? '—' : baht(x.avgPrice)} · เข้าชม {x.views} · จอง{' '}
                    {x.conversion == null ? '—' : `${num(x.conversion)}%`}
                  </div>
                </div>
                <div className="fill">
                  <div>
                    <span>อัตราเต็ม</span>
                    <b>{x.fill == null ? '—' : `${num(x.fill, 0)}%`}</b>
                  </div>
                  <span className="hx-track">
                    <span style={{ width: `${x.fill || 0}%` }} />
                  </span>
                </div>
                <div className="sum">
                  <div>{baht(x.sales)}</div>
                  <div>{x.csat == null ? 'ยังไม่มีคะแนน' : `พอใจ ${num(x.csat)} / 5`}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title="เส้นทางการจอง" sub="การ์ดถูกเห็น → เข้าชมหน้า → เริ่มจอง → ชำระสำเร็จ" delay={70}>
        <div className="hx-funnel">
          {steps.map(([l, v, prev], i) => (
            <div key={l} className="hx-fstep">
              <span className="hx-label">0{i + 1}</span>
              <span className="l">{l}</span>
              <span className="v">{num(v, 0)}</span>
              <span className="c">{/* Views began counting later than bookings, so a step can outgrow the one before it. */}
              {prev && v <= prev ? `→ ${num((v / prev) * 100)}%` : ''}</span>
              <span className="bar" style={{ width: `${(v / fMax) * 100}%` }} />
            </div>
          ))}
        </div>
        {f.views === 0 && <Empty>ยอดเข้าชมเริ่มนับตั้งแต่ระบบเริ่มเก็บข้อมูล — ช่วงก่อนหน้านั้นจะเป็น 0</Empty>}
      </Card>

      <div className="hx-g g11">
        <Card title="มาจริง · ยกเลิก · ไม่มา" sub="ของการจองในรอบที่จบแล้วในช่วงนี้" delay={140}>
          <Stack100
            items={[
              { label: 'มาจริง', value: r.outcome.came, color: '#0d8a7e' },
              { label: 'ยกเลิก', value: r.outcome.cancelled, color: '#e3b23c' },
              { label: 'ไม่มา', value: r.outcome.noShow, color: '#c86b5a' },
            ]}
            noneText="ยังไม่มีรอบที่จบในช่วงนี้"
          />
          <p className="hx-note">
            ผู้เข้าร่วมขอคืนเงินเอง {r.userCancelP == null ? '—' : `${num(r.userCancelP)}%`} ของการจองที่ชำระ
            {r.waitlisted ? ` · รายชื่อสำรอง ${r.waitlisted} คน` : ''}
          </p>
        </Card>
        <Card title="จองล่วงหน้ากี่วัน" sub="จำนวนการจองตามระยะก่อนวันจัด" delay={210}>
          <HBars
            rows={[
              { label: '0–1 วัน', value: r.leadBuckets[0] },
              { label: '2–7 วัน', value: r.leadBuckets[1] },
              { label: '8–14 วัน', value: r.leadBuckets[2] },
              { label: '15 วันขึ้นไป', value: r.leadBuckets[3] },
            ]}
          />
        </Card>
      </div>

      <div className="hx-g g57">
        <Card title="อัตราเต็มตามวันและช่วงเวลา" sub="ของรอบที่จัดในช่วงนี้ · ชี้ที่ช่องเพื่อดูจำนวนรอบ" delay={280}>
          <div className="hx-cells-wrap">
            <div className="hx-cells" style={{ gridTemplateColumns: '40px repeat(3, minmax(56px, 1fr))', minWidth: 240 }}>
              <span className="hx-cell hd" />
              {PARTS.map((p) => (
                <span key={p} className="hx-cell hd">
                  {p}
                </span>
              ))}
              {r.fillGrid.map((row, i) => [
                <span key={`d${i}`} className="hx-cell l" style={{ color: 'var(--mu)' }}>
                  {DOW[i]}
                </span>,
                ...row.map((c, j) =>
                  c.fill == null ? (
                    <span key={`${i}-${j}`} className="hx-cell none" title={`${DOW[i]} ${PARTS[j]} · ${c.rounds} รอบ`}>
                      —
                    </span>
                  ) : (
                    <span
                      key={`${i}-${j}`}
                      className="hx-cell"
                      title={`${DOW[i]} ${PARTS[j]} · ${c.rounds} รอบ`}
                      style={{ background: `rgba(12,133,119,${0.15 + (c.fill / 100) * 0.75})`, color: c.fill > 50 ? '#fff' : 'var(--ink)' }}
                    >
                      {num(c.fill, 0)}%
                    </span>
                  ),
                ),
              ])}
            </div>
          </div>
        </Card>
        <Card title="ช่วงเวลาทองของการจอง" sub="วัน × ชั่วโมงที่ชำระเงิน (เวลาไทย) · สีเข้ม = จองมาก" delay={350}>
          <div className="hx-heat-wrap">
            <div className="hx-heat">
              <span />
              {Array.from({ length: 24 }, (_, h) => (
                <span key={h} className="h">
                  {h % 3 === 0 ? h : ''}
                </span>
              ))}
              {r.heat.map((row, d) => [
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
    </div>
  );
}
