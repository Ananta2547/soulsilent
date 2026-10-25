'use client';

import { useState } from 'react';
import type { Analytics } from '@/lib/host-analytics';
import { Bars, Card, Dropdown, Empty, I, Rows, Seg, baht, downloadCsv, num, thDay, thMonth } from './kit';

const DEDUCT = (t: string, v: number) => (t === 'percent' ? `${num(v)}%` : t === 'fixed' ? baht(v) : 'ไม่หัก');

/** Money by month, what is still to be transferred, and every transfer made. */
export function MoneyTab({ a, say }: { a: Analytics; say: (m: string) => void }) {
  const m = a.money;
  const [view, setView] = useState<'chart' | 'table'>('chart');
  const [exportOpen, setExportOpen] = useState(false);
  const csv = (k: string) => {
    if (k === 'monthly')
      downloadCsv(
        `รายได้รายเดือน-${a.range.to}.csv`,
        ['เดือน', 'ยอดขาย', 'ค่าธรรมเนียม', 'คืนเงิน', 'รายได้สุทธิ', 'ที่นั่ง'],
        m.monthly.map((x) => [x.month, x.sales, x.fee, x.refunds, x.net, x.seats]),
      );
    else
      downloadCsv(
        `ประวัติการโอน-${a.range.to}.csv`,
        ['วันที่โอน', 'เลขที่เอกสาร', 'รอบ', 'วันจัด', 'ยอด', 'สถานะ'],
        m.history.map((h) => [h.occurred_at.replace('T', ' '), h.doc_no, h.title, h.date, h.net, h.status === 'done' ? 'โอนแล้ว' : 'ยกเลิก']),
      );
    say('ดาวน์โหลดแล้ว');
  };
  const showVat = m.vat.last12 > 1000000;

  return (
    <div className="hx-stack">
      <div className="hx-g auto240">
        <Card className="mint" title="รอโอน" sub="รอบที่จบแล้ว ทีมงานยังไม่ได้บันทึกการโอน">
          <div className="hx-big">{baht(m.payout.owed)}</div>
          {m.payout.owedRounds.length > 0 && <Rows rows={m.payout.owedRounds.map((x) => ({ key: x.id, main: x.title, sub: thDay(x.date, true), amt: baht(x.net) }))} />}
        </Card>
        <Card title="ยังไม่ถึงกำหนดโอน" sub="รอบที่ยังไม่จัด — ยอดอาจเปลี่ยนถ้ามีการจองหรือคืนเงินเพิ่ม" delay={70}>
          <div className="hx-big">{baht(m.payout.notYet)}</div>
          {m.payout.notYetRounds.length > 0 && <Rows rows={m.payout.notYetRounds.slice(0, 6).map((x) => ({ key: x.id, main: x.title, sub: thDay(x.date, true), amt: baht(x.net) }))} />}
        </Card>
        {showVat && (
          <Card title="เกณฑ์ภาษีมูลค่าเพิ่ม (VAT)" sub="ยอดขายผ่าน AllSoulLearn ย้อนหลัง 12 เดือน เทียบเกณฑ์ 1.8 ล้านบาท" delay={140}>
            <div className="hx-big">{baht(m.vat.last12)}</div>
            <span className="hx-track gold">
              <span style={{ width: `${Math.min(100, (m.vat.last12 / m.vat.threshold) * 100)}%`, background: m.vat.last12 >= m.vat.threshold ? '#c86b5a' : undefined }} />
            </span>
            <p className="hx-note">นับเฉพาะยอดผ่าน AllSoulLearn — ถ้ามีรายได้ช่องทางอื่นให้รวมเองด้วย</p>
          </Card>
        )}
      </div>

      <Card
        title="รายได้รายเดือน"
        sub="ยอดขายนับตามวันที่ชำระ · คืนเงินหักในเดือนที่คืน · ค่าธรรมเนียม GP ตามตาราง (หรือยอดหักที่ทีมงานตั้งเป็นกรณีพิเศษ)"
        className={`raised${exportOpen ? ' menu-open' : ''}`}
        delay={140}
        right={
          <>
            <Seg<'chart' | 'table'>
              options={[
                ['chart', 'กราฟ'],
                ['table', 'ตาราง'],
              ]}
              value={view}
              onChange={setView}
            />
            <Dropdown
              small
              label="ส่งออก"
              icon={I.down()}
              options={[
                { key: 'monthly', label: 'CSV รายได้รายเดือน' },
                ...(m.history.length ? [{ key: 'history', label: 'CSV ประวัติการโอน' }] : []),
              ]}
              onPick={csv}
              onOpen={setExportOpen}
              ariaLabel="ส่งออก"
            />
          </>
        }
      >
        {view === 'chart' ? (
          <Bars
            labels={m.monthly.map((x) => thMonth(x.month))}
            series={[
              { name: 'รายได้สุทธิ', color: '#0d8a7e', values: m.monthly.map((x) => x.net) },
              { name: 'ค่าธรรมเนียม', color: '#e3b23c', values: m.monthly.map((x) => x.fee) },
              { name: 'คืนเงิน', color: '#c86b5a', values: m.monthly.map((x) => x.refunds) },
            ]}
            fmt={baht}
            every={1}
          />
        ) : (
          <Rows
            rows={[...m.monthly].reverse().map((x) => ({
              key: x.month,
              main: thMonth(x.month),
              sub: `ขาย ${baht(x.sales)} · ค่าธรรมเนียม ${baht(x.fee)} · คืน ${baht(x.refunds)}`,
              amt: baht(x.net),
              faded: !x.sales && !x.refunds,
            }))}
          />
        )}
      </Card>

      <div className="hx-g g75">
        <Card title="ประวัติการโอน" sub="ใบสำคัญจ่ายของแต่ละรายการส่งถึงอีเมลของคุณตอนโอน" delay={210}>
          {m.history.length === 0 ? (
            <Empty>ยังไม่มีการโอน</Empty>
          ) : (
            <Rows
              rows={m.history.map((h) => ({
                key: h.id,
                main: h.title,
                sub: `${h.doc_no} · ${h.status === 'done' ? 'โอน' : 'ยกเลิก'} ${thDay(h.occurred_at.slice(0, 10), true)}`,
                mono: true,
                amt: baht(h.net),
                faded: h.status !== 'done',
              }))}
            />
          )}
        </Card>
        <Card title="ค่าธรรมเนียมของแต่ละรอบ" sub="4 เดือนล่าสุดและรอบที่จะถึง" delay={280}>
          {m.deductions.length === 0 ? (
            <Empty>ยังไม่มีรอบ</Empty>
          ) : (
            <Rows
              rows={m.deductions.map((x) => ({
                key: x.id,
                main: x.title,
                sub: thDay(x.date, true),
                amt: x.mode === 'manual' ? `หักเอง ${DEDUCT(x.type, x.value)}` : `GP ${baht(x.fee)}`,
              }))}
            />
          )}
        </Card>
      </div>
    </div>
  );
}
