'use client';

import { useState } from 'react';
import type { Analytics } from '@/lib/host-analytics';
import { FEW, HBars, Panel, StackBars, StatCard, num, pctOrFew, thDay, thMonth } from './kit';

const WINDOWS = [
  { key: 'd30', label: '30 วัน' },
  { key: 'd90', label: '90 วัน' },
  { key: 'd180', label: '180 วัน' },
  { key: 'all', label: 'ทั้งหมด' },
] as const;

/** Who comes, who comes back, and how old they are — totals only beyond
 *  your own regulars. */
export function PeopleTab({ a }: { a: Analytics }) {
  const p = a.people;
  const [win, setWin] = useState<(typeof WINDOWS)[number]['key']>('d90');
  const rep = p.repeat[win];
  const cell = (v: number | null, people: number) =>
    v == null ? <span className="hd-few">{people < 5 ? (people ? FEW : '—') : 'รอครบ'}</span> : `${num(v, 0)}%`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="hd-cards" style={{ marginBottom: 0 }}>
        <StatCard label="ผู้เข้าร่วมในช่วงนี้" value={`${p.total} คน`} title="นับคนไม่ซ้ำที่เช็คอิน" />
        <StatCard label="ใหม่" value={`${p.new} คน`} />
        <StatCard label="กลับมาซ้ำ" value={`${p.returning} คน`} />
        <StatCard
          label="กลับมาเรียนต่อบน ASL"
          value={p.aslReturn.rate == null ? null : `${num(p.aslReturn.rate, 0)}%`}
          title="% ของผู้เข้าร่วมของคุณที่ไปเข้ากิจกรรมอื่นบน AllSoulLearn ภายใน 90 วัน (ตัวเลขรวม ไม่แสดงว่าไปกับใคร)"
        />
        <StatCard label="มาครั้งแรกบน ASL กับคุณ" value={`${p.platformFirst} คน`} title="คนที่กิจกรรมของคุณเป็นกิจกรรมแรกบน AllSoulLearn" />
        <StatCard label="อายุเฉลี่ย" value={p.ages.avg == null ? null : `${p.ages.avg} ปี`} delta={<span className="hd-few">จาก {p.ages.people} คนที่มีข้อมูล</span>} />
      </div>

      <div className="hd-grid2 even">
        <Panel title="ใหม่ / กลับมาซ้ำ รายเดือน" sub="นับคนไม่ซ้ำที่เช็คอินในแต่ละเดือน">
          <StackBars
            labels={p.monthly.map((m) => thMonth(m.month))}
            series={[
              { name: 'ใหม่', color: 'var(--teal)', values: p.monthly.map((m) => m.new) },
              { name: 'กลับมาซ้ำ', color: '#e3b23c', values: p.monthly.map((m) => m.returning) },
            ]}
          />
        </Panel>
        <Panel
          title="อัตรากลับมาซ้ำ"
          sub="% ของผู้เข้าร่วมครั้งแรกที่กลับมาจองกับคุณอีก ภายในช่วงที่เลือก"
          right={
            <div className="tdb-seg" role="group" aria-label="ช่วงเวลา">
              {WINDOWS.map((w) => (
                <button key={w.key} type="button" className={win === w.key ? 'on' : ''} onClick={() => setWin(w.key)}>
                  {w.label}
                </button>
              ))}
            </div>
          }
        >
          <div className="hd-big">{rep.rate == null ? <span className="hd-few">{FEW}</span> : `${num(rep.rate, 0)}%`}</div>
          <p className="hd-few">
            {rep.back} จาก {rep.people} คน{win !== 'all' && ' (นับเฉพาะคนที่มาครั้งแรกนานพอจนครบช่วงแล้ว)'}
          </p>
        </Panel>
      </div>

      <Panel title="ตารางรุ่น (cohort)" sub="ผู้เข้าร่วมครั้งแรกของแต่ละเดือน กลับมาจองกับคุณภายใน 30 / 60 / 90 วันกี่ % · สีเข้ม = กลับมามาก">
        <div className="hd-table-wrap">
          <table className="hd-table">
            <thead>
              <tr>
                <th>เดือนที่มาครั้งแรก</th>
                <th className="r">ผู้เข้าร่วมใหม่</th>
                <th className="r">ใน 30 วัน</th>
                <th className="r">ใน 60 วัน</th>
                <th className="r">ใน 90 วัน</th>
              </tr>
            </thead>
            <tbody>
              {[...p.cohorts].reverse().map((c) => (
                <tr key={c.month}>
                  <td>{thMonth(c.month)}</td>
                  <td className="r">{c.people}</td>
                  {([c.r30, c.r60, c.r90] as (number | null)[]).map((v, i) => (
                    <td key={i} className="r" style={{ background: v == null ? undefined : `rgba(12,133,119,${0.06 + (v / 100) * 0.6})` }}>
                      {cell(v, c.people)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="hd-grid2 even">
        <Panel title="ลูกค้าประจำ" sub="มากับคุณ 3 ครั้งขึ้นไป · เห็นเฉพาะคนที่จองกับคุณ">
          {p.regulars.length === 0 ? (
            <p className="hd-few">ยังไม่มีผู้เข้าร่วมที่มา 3 ครั้งขึ้นไป</p>
          ) : (
            p.regulars.slice(0, 30).map((r, i) => (
              <div key={i} className="hd-row">
                <span className="grow">{r.name}</span>
                <span className="dim">ล่าสุด {thDay(r.last, true)}</span>
                <b>{r.visits} ครั้ง</b>
              </div>
            ))
          )}
        </Panel>
        <Panel title="ช่วงอายุ" sub="ช่วงที่มีน้อยกว่า 5 คนจะไม่แสดง">
          {p.ages.people < 5 ? (
            <p className="hd-few">{FEW}</p>
          ) : (
            <HBars rows={p.ages.bands.filter((b) => b.n != null).map((b) => ({ label: b.label, value: b.n as number, note: pctOrFew(b.share) }))} />
          )}
        </Panel>
      </div>
    </div>
  );
}
