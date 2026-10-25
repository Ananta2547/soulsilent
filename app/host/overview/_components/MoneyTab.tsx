'use client';

import type { Analytics } from '@/lib/host-analytics';
import { Panel, StackBars, baht, downloadCsv, num, thDay, thMonth } from './kit';

const DEDUCT = (t: string, v: number) => (t === 'percent' ? `${num(v)}%` : t === 'fixed' ? baht(v) : 'ไม่หัก');

/** Money by month, what is still to be transferred, and every transfer made. */
export function MoneyTab({ a }: { a: Analytics }) {
  const m = a.money;
  const csvMonthly = () =>
    downloadCsv(
      `รายได้รายเดือน-${a.range.to}.csv`,
      ['เดือน', 'ยอดขาย', 'ค่าธรรมเนียม', 'คืนเงิน', 'รายได้สุทธิ', 'ที่นั่ง'],
      m.monthly.map((x) => [x.month, x.sales, x.fee, x.refunds, x.net, x.seats]),
    );
  const csvHistory = () =>
    downloadCsv(
      `ประวัติการโอน-${a.range.to}.csv`,
      ['วันที่โอน', 'เลขที่เอกสาร', 'รอบ', 'วันจัด', 'ยอด', 'สถานะ'],
      m.history.map((h) => [h.occurred_at.replace('T', ' '), h.doc_no, h.title, h.date, h.net, h.status === 'done' ? 'โอนแล้ว' : 'ยกเลิก']),
    );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Panel
        title="รายเดือน"
        sub="ยอดขายนับตามวันที่ชำระ · คืนเงินหักในเดือนที่คืน · ค่าธรรมเนียม GP ตามตาราง (หรือยอดหักที่ทีมงานตั้งเป็นกรณีพิเศษ)"
        right={
          <button type="button" className="hd-btn" onClick={csvMonthly}>
            ดาวน์โหลด CSV
          </button>
        }
      >
        <StackBars
          labels={m.monthly.map((x) => thMonth(x.month))}
          series={[
            { name: 'รายได้สุทธิ', color: 'var(--teal)', values: m.monthly.map((x) => x.net) },
            { name: 'ค่าธรรมเนียม', color: '#e3b23c', values: m.monthly.map((x) => x.fee) },
            { name: 'คืนเงิน', color: '#c86b5a', values: m.monthly.map((x) => x.refunds) },
          ]}
          format={baht}
        />
        <div className="hd-table-wrap" style={{ marginTop: 14 }}>
          <table className="hd-table">
            <thead>
              <tr>
                <th>เดือน</th>
                <th className="r">ยอดขาย</th>
                <th className="r">ค่าธรรมเนียม</th>
                <th className="r">คืนเงิน</th>
                <th className="r">รายได้สุทธิ</th>
              </tr>
            </thead>
            <tbody>
              {[...m.monthly].reverse().map((x) => (
                <tr key={x.month}>
                  <td>{thMonth(x.month)}</td>
                  <td className="r">{baht(x.sales)}</td>
                  <td className="r">{baht(x.fee)}</td>
                  <td className="r">{baht(x.refunds)}</td>
                  <td className="r">
                    <b>{baht(x.net)}</b>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="hd-grid2 even">
        <Panel title="รอโอน" sub="รอบที่จบแล้วแต่ทีมงานยังไม่ได้บันทึกการโอน">
          <div className="hd-big">{baht(m.payout.owed)}</div>
          {m.payout.owedRounds.map((x) => (
            <div key={x.id} className="hd-row">
              <span className="grow">{x.title}</span>
              <span className="dim">{thDay(x.date, true)}</span>
              <b>{baht(x.net)}</b>
            </div>
          ))}
        </Panel>
        <Panel title="ยังไม่ถึงกำหนดโอน" sub="รอบที่ยังไม่จัด — ยอดอาจเปลี่ยนถ้ามีการจองหรือคืนเงินเพิ่ม">
          <div className="hd-big">{baht(m.payout.notYet)}</div>
          {m.payout.notYetRounds.slice(0, 12).map((x) => (
            <div key={x.id} className="hd-row">
              <span className="grow">{x.title}</span>
              <span className="dim">{thDay(x.date, true)}</span>
              <b>{baht(x.net)}</b>
            </div>
          ))}
        </Panel>
      </div>

      <Panel
        title="ประวัติการโอน"
        sub="ใบสำคัญจ่ายของแต่ละรายการส่งถึงอีเมลของคุณตอนโอน"
        right={
          m.history.length > 0 && (
            <button type="button" className="hd-btn" onClick={csvHistory}>
              ดาวน์โหลด CSV
            </button>
          )
        }
      >
        {m.history.length === 0 ? (
          <p className="hd-few">ยังไม่มีการโอน</p>
        ) : (
          <div className="hd-table-wrap">
            <table className="hd-table">
              <thead>
                <tr>
                  <th>วันที่โอน</th>
                  <th>เลขที่เอกสาร</th>
                  <th>รอบ</th>
                  <th className="r">ยอด</th>
                  <th>สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {m.history.map((h) => (
                  <tr key={h.id} style={{ opacity: h.status === 'done' ? 1 : 0.5 }}>
                    <td>{thDay(h.occurred_at.slice(0, 10), true)}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{h.doc_no}</td>
                    <td className="wrap">{h.title}</td>
                    <td className="r">
                      <b>{baht(h.net)}</b>
                    </td>
                    <td>{h.status === 'done' ? 'โอนแล้ว' : 'ยกเลิก'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <div className="hd-grid2 even">
        <Panel title="ค่าธรรมเนียมของแต่ละรอบ" sub="GP ตามตาราง หรือยอดหักที่ทีมงานตั้งเป็นกรณีพิเศษ (4 เดือนล่าสุดและรอบที่จะถึง)">
          {m.deductions.length === 0 ? (
            <p className="hd-few">ยังไม่มีรอบ</p>
          ) : (
            m.deductions.map((x) => (
              <div key={x.id} className="hd-row">
                <span className="grow">{x.title}</span>
                <span className="dim">{thDay(x.date, true)}</span>
                <b>{x.mode === 'manual' ? `หักเอง ${DEDUCT(x.type, x.value)}` : `GP ${baht(x.fee)}`}</b>
              </div>
            ))
          )}
        </Panel>
        {m.vat.last12 > 1000000 && (
          <Panel title="เกณฑ์ภาษีมูลค่าเพิ่ม (VAT)" sub="ยอดขายผ่าน AllSoulLearn ย้อนหลัง 12 เดือน เทียบเกณฑ์ 1.8 ล้านบาท">
            <div className="hd-big">{baht(m.vat.last12)}</div>
            <div className="hd-meter" style={{ height: 10, marginTop: 10 }}>
              <span style={{ width: `${Math.min(100, (m.vat.last12 / m.vat.threshold) * 100)}%`, background: m.vat.last12 >= m.vat.threshold ? '#c86b5a' : undefined }} />
            </div>
            <p className="hd-few">นับเฉพาะยอดผ่าน AllSoulLearn — ถ้ามีรายได้ช่องทางอื่นให้รวมเองด้วย</p>
          </Panel>
        )}
      </div>
    </div>
  );
}
