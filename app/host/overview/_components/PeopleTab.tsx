'use client';

import { useState } from 'react';
import type { Analytics } from '@/lib/host-analytics';
import { Bars, Card, Empty, FEW, HBars, Kpis, Rows, Seg, num, thDay, thMonth } from '@/components/dashboard/kit';

type Win = 'd30' | 'd90' | 'd180' | 'all';
const C = 2 * Math.PI * 50;

/** Who comes, who comes back, and how old they are — totals only beyond your
 *  own regulars. */
export function PeopleTab({ a }: { a: Analytics }) {
  const p = a.people;
  const [win, setWin] = useState<Win>('d90');
  const rep = p.repeat[win];
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
          { label: 'ผู้เข้าร่วม', value: `${p.total} คน`, title: 'นับคนไม่ซ้ำที่เช็คอิน' },
          { label: 'ใหม่', value: `${p.new} คน` },
          { label: 'กลับมาซ้ำ', value: `${p.returning} คน` },
          {
            label: 'ไปต่อบน ASL',
            value: p.aslReturn.rate == null ? null : `${num(p.aslReturn.rate, 0)}%`,
            title: '% ของผู้เข้าร่วมของคุณที่ไปเข้ากิจกรรมอื่นบน AllSoulLearn ภายใน 90 วัน (ตัวเลขรวม ไม่แสดงว่าไปกับใคร)',
          },
          { label: 'ครั้งแรกบน ASL กับคุณ', value: `${p.platformFirst} คน`, title: 'คนที่กิจกรรมของคุณเป็นกิจกรรมแรกบน AllSoulLearn' },
          { label: 'อายุเฉลี่ย', value: p.ages.avg == null ? null : `${p.ages.avg} ปี`, delta: `จาก ${p.ages.people} คนที่มีข้อมูล` },
        ]}
      />

      <div className="hx-g g84">
        <Card title="ใหม่ / กลับมาซ้ำ รายเดือน" sub="นับคนไม่ซ้ำที่เช็คอินในแต่ละเดือน">
          <Bars
            labels={p.monthly.map((m) => thMonth(m.month))}
            series={[
              { name: 'ใหม่', color: '#0d8a7e', values: p.monthly.map((m) => m.new) },
              { name: 'กลับมาซ้ำ', color: '#e3b23c', values: p.monthly.map((m) => m.returning) },
            ]}
            every={1}
          />
        </Card>
        <Card title="อัตรากลับมาซ้ำ" sub="ของผู้เข้าร่วมครั้งแรกที่กลับมาจองกับคุณอีก" delay={70}>
          <Seg<Win>
            options={[
              ['d30', '30 วัน'],
              ['d90', '90 วัน'],
              ['d180', '180 วัน'],
              ['all', 'ทั้งหมด'],
            ]}
            value={win}
            onChange={setWin}
          />
          <div className="hx-ring-row">
            <div className="hx-ring">
              <svg width="120" height="120" viewBox="0 0 120 120" aria-hidden>
                <circle cx="60" cy="60" r="50" fill="none" stroke="#f6f1e6" strokeWidth="12" />
                <circle
                  className="v"
                  cx="60"
                  cy="60"
                  r="50"
                  fill="none"
                  stroke="#0d8a7e"
                  strokeWidth="12"
                  strokeLinecap="round"
                  strokeDasharray={rep.rate == null ? `0 ${C}` : `${(C * rep.rate) / 100} ${C}`}
                  transform="rotate(-90 60 60)"
                />
              </svg>
              <span className={rep.rate == null ? 'few' : ''}>{rep.rate == null ? FEW : `${num(rep.rate, 0)}%`}</span>
            </div>
            <p className="hx-note" style={{ lineHeight: 1.6 }}>
              {rep.back} จาก {rep.people} คน{win !== 'all' ? ' · นับเฉพาะคนที่มาครั้งแรกนานพอจนครบช่วงแล้ว' : ''}
            </p>
          </div>
        </Card>
      </div>

      <div className="hx-g g75">
        <Card title="ตารางรุ่น (cohort)" sub="ผู้เข้าร่วมครั้งแรกแต่ละเดือน กลับมาภายใน 30 / 60 / 90 วันกี่ %" delay={140}>
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
        <Card title="ช่วงอายุ" sub="ช่วงที่มีน้อยกว่า 5 คนจะไม่แสดง" delay={210}>
          {p.ages.people < 5 ? (
            <Empty>{FEW}</Empty>
          ) : (
            <HBars rows={p.ages.bands.filter((b) => b.n != null).map((b) => ({ label: b.label, value: b.n as number, note: b.share == null ? undefined : `${num(b.share, 0)}%` }))} />
          )}
        </Card>
      </div>

      <Card title="ลูกค้าประจำ" sub="มากับคุณ 3 ครั้งขึ้นไป · เห็นเฉพาะคนที่จองกับคุณ" delay={280}>
        {p.regulars.length === 0 ? (
          <Empty>ยังไม่มีผู้เข้าร่วมที่มา 3 ครั้งขึ้นไป</Empty>
        ) : (
          <Rows rows={p.regulars.slice(0, 40).map((x, i) => ({ key: String(i), main: x.name, sub: `ล่าสุด ${thDay(x.last, true)}`, amt: `${x.visits} ครั้ง` }))} />
        )}
      </Card>
    </div>
  );
}
