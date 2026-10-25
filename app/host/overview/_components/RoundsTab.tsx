'use client';

import { useState } from 'react';
import type { Analytics } from '@/lib/host-analytics';
import { DOW, HBars, Panel, StatCard, baht, num, pctOrFew } from './kit';

type Act = Analytics['rounds']['activities'][number];
const COLS: { key: keyof Act; label: string; fmt: (a: Act) => string; num?: boolean }[] = [
  { key: 'title', label: 'กิจกรรม', fmt: (a) => a.title },
  { key: 'upcoming', label: 'รอบที่จะถึง', fmt: (a) => String(a.upcoming), num: true },
  { key: 'seats', label: 'ที่นั่งขาย', fmt: (a) => String(a.seats), num: true },
  { key: 'fill', label: 'อัตราเต็ม', fmt: (a) => (a.fill == null ? '—' : `${num(a.fill, 0)}%`), num: true },
  { key: 'sales', label: 'ยอดขาย', fmt: (a) => baht(a.sales), num: true },
  { key: 'avgPrice', label: 'ราคาเฉลี่ย/ที่', fmt: (a) => (a.avgPrice == null ? '—' : baht(a.avgPrice)), num: true },
  { key: 'csat', label: 'พอใจเฉลี่ย', fmt: (a) => (a.csat == null ? '—' : `${num(a.csat)} / 5`), num: true },
  { key: 'views', label: 'เข้าชม', fmt: (a) => String(a.views), num: true },
  { key: 'conversion', label: '% จอง', fmt: (a) => (a.conversion == null ? '—' : `${num(a.conversion)}%`), num: true },
];

/** Which activities to open more of, when to open them, and whether the page sells. */
export function RoundsTab({ a }: { a: Analytics }) {
  const r = a.rounds;
  const [sort, setSort] = useState<{ key: keyof Act; dir: 1 | -1 }>({ key: 'sales', dir: -1 });
  const rows = [...r.activities].sort((x, y) => {
    const a1 = x[sort.key] ?? -1;
    const b1 = y[sort.key] ?? -1;
    return (a1 > b1 ? 1 : a1 < b1 ? -1 : 0) * sort.dir;
  });
  const heatMax = Math.max(1, ...r.heat.flat());
  const f = r.funnel;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Panel title="ตารางกิจกรรม" sub="กดหัวคอลัมน์เพื่อเรียง · เข้าชม = ผู้เข้าชมไม่ซ้ำต่อวัน (เริ่มนับตั้งแต่ระบบเก็บข้อมูล)">
        <div className="hd-table-wrap">
          <table className="hd-table">
            <thead>
              <tr>
                {COLS.map((c) => (
                  <th
                    key={c.key}
                    className={c.num ? 'r' : ''}
                    onClick={() => setSort((s) => ({ key: c.key, dir: s.key === c.key ? (s.dir === 1 ? -1 : 1) : c.num ? -1 : 1 }))}
                    aria-sort={sort.key === c.key ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined}
                  >
                    {c.label}
                    {sort.key === c.key ? (sort.dir === 1 ? ' ↑' : ' ↓') : ''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key}>
                  {COLS.map((c) => (
                    <td key={c.key} className={c.num ? 'r' : 'wrap'}>
                      {c.fmt(row)}
                    </td>
                  ))}
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan={COLS.length} className="hd-few">
                    ยังไม่มีกิจกรรม
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="hd-cards" style={{ marginBottom: 0 }}>
        <StatCard label="เวลาถึงการจองแรก" value={r.firstSaleHours == null ? '—' : r.firstSaleHours < 48 ? `${num(r.firstSaleHours, 0)} ชม.` : `${num(r.firstSaleHours / 24)} วัน`} title="ค่ากลาง: เปิดรอบ → มีคนจ่ายคนแรก" />
        <StatCard label="รอบที่เต็ม" value={r.soldOut.fullPct == null ? '—' : `${num(r.soldOut.fullPct, 0)}%`} delta={<span className="hd-few">{r.soldOut.fullRounds} จาก {r.soldOut.rounds} รอบ</span>} />
        <StatCard label="เต็มก่อนวันจัด" value={r.soldOut.medianDaysBefore == null ? '—' : `${num(r.soldOut.medianDaysBefore)} วัน`} delta={r.soldOut.fastest ? <span className="hd-few">เร็วสุด {num(r.soldOut.fastest.daysBefore)} วัน</span> : undefined} />
        <StatCard label="จองล่วงหน้า" value={r.leadMedianDays == null ? '—' : `${num(r.leadMedianDays)} วัน`} title="ค่ากลางของ (วันจัด − วันชำระ)" />
        <StatCard label="จัดเฉลี่ย / เดือน" value={`${num(r.perMonth)} รอบ`} delta={r.freeShare != null ? <span className="hd-few">ฟรี {num(r.freeShare, 0)}%</span> : undefined} />
        <StatCard label="ผู้จัดยกเลิกรอบ (6 เดือน)" value={`${r.hostCancelled6m} รอบ`} title="รอบที่ถูกยกเลิกหลังมีคนจ่ายเงินแล้ว" />
      </div>

      <div className="hd-grid2 even">
        <Panel title="ช่องทางการจอง" sub="การ์ดถูกเห็น → เข้าชมหน้า → เริ่มจอง → ชำระสำเร็จ">
          <HBars
            rows={[
              { label: 'การ์ดถูกเห็น', value: f.impressions },
              { label: 'เข้าชมหน้า', value: f.views, note: f.impressions ? `${num((f.views / f.impressions) * 100)}%` : undefined },
              { label: 'เริ่มจอง', value: f.started, note: f.views ? `${num((f.started / f.views) * 100)}%` : undefined },
              { label: 'ชำระสำเร็จ', value: f.paid, note: f.started ? `${num((f.paid / f.started) * 100)}%` : undefined },
            ]}
          />
          {f.views === 0 && <p className="hd-few">ยอดเข้าชมเริ่มนับตั้งแต่ระบบเริ่มเก็บข้อมูล — ช่วงก่อนหน้านั้นจะเป็น 0</p>}
        </Panel>
        <Panel title="มาจริง · ยกเลิก · ไม่มา" sub="ของการจองในรอบที่จบแล้วในช่วงนี้ (รวมกัน = 100%)">
          <HBars
            rows={[
              { label: 'มาจริง', value: r.outcome.came, note: pctOrFew(r.outcome.cameP) },
              { label: 'ยกเลิก', value: r.outcome.cancelled, note: pctOrFew(r.outcome.cancelledP) },
              { label: 'ไม่มา', value: r.outcome.noShow, note: pctOrFew(r.outcome.noShowP) },
            ]}
          />
          <p className="hd-few" style={{ marginTop: 10 }}>
            ผู้เข้าร่วมขอคืนเงินเอง {r.userCancelP == null ? '—' : `${num(r.userCancelP)}%`} ของการจองที่ชำระ
            {r.waitlisted > 0 && ` · รายชื่อสำรอง (กิจกรรมคัดเลือก) ${r.waitlisted} คน`}
          </p>
        </Panel>
      </div>

      <div className="hd-grid2 even">
        <Panel title="อัตราเต็มตามวันและช่วงเวลา" sub="ของรอบที่จัดในช่วงนี้ · ในวงเล็บคือจำนวนรอบ">
          <div className="hd-table-wrap">
            <table className="hd-table">
              <thead>
                <tr>
                  <th />
                  <th className="r">เช้า</th>
                  <th className="r">บ่าย</th>
                  <th className="r">เย็น</th>
                </tr>
              </thead>
              <tbody>
                {r.fillGrid.map((row, i) => (
                  <tr key={i}>
                    <td>{DOW[i]}</td>
                    {row.map((c, j) => (
                      <td key={j} className="r" style={{ background: c.fill == null ? undefined : `rgba(12,133,119,${0.08 + (c.fill / 100) * 0.5})` }}>
                        {c.fill == null ? '—' : `${num(c.fill, 0)}%`}
                        {c.rounds > 0 && <span className="hd-few"> ({c.rounds})</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
        <Panel title="จองล่วงหน้ากี่วัน" sub="จำนวนการจองตามระยะก่อนวันจัด">
          <HBars
            rows={[
              { label: '0–1 วัน', value: r.leadBuckets[0] },
              { label: '2–7 วัน', value: r.leadBuckets[1] },
              { label: '8–14 วัน', value: r.leadBuckets[2] },
              { label: '15 วันขึ้นไป', value: r.leadBuckets[3] },
            ]}
          />
        </Panel>
      </div>

      <Panel title="ช่วงเวลาทองของการจอง" sub="วันในสัปดาห์ × ชั่วโมงที่ชำระเงิน (เวลาไทย) · สีเข้ม = จองมาก">
        <div className="hd-table-wrap">
          <div className="hd-heat" style={{ minWidth: 520 }}>
            <span />
            {Array.from({ length: 24 }, (_, h) => (
              <span key={h} style={{ textAlign: 'center' }}>
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
                  style={{ background: v ? `rgba(12,133,119,${0.15 + (v / heatMax) * 0.85})` : 'var(--cream)' }}
                />
              )),
            ])}
          </div>
        </div>
      </Panel>
    </div>
  );
}
