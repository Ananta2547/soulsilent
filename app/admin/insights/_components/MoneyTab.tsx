'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { AdminAnalytics } from '@/lib/admin-analytics';
import { Bars, Card, Dropdown, Empty, HBars, I, Rows, Seg, baht, downloadCsv, num, thDay, thMonth } from '@/components/dashboard/kit';

/** The platform's P&L for the window, the ledger's cash, what is owed to
 *  hosts and for how long, expenses, payment methods and coupons. */
export function MoneyTab({ a, say }: { a: AdminAnalytics; say: (m: string) => void }) {
  const m = a.money;
  const c = m.cur;
  const [view, setView] = useState<'chart' | 'table'>('chart');
  const [exportOpen, setExportOpen] = useState(false);
  const beamSet = a.beam.qr != null && a.beam.card != null;
  const csv = (k: string) => {
    if (k === 'pl')
      downloadCsv(
        `งบกำไรขาดทุนรายเดือน-${a.range.to}.csv`,
        ['เดือน', 'ยอดขาย (GMV)', 'ส่วนของผู้จัด', 'ค่าธรรมเนียม', 'ค่า Beam (ประมาณ)', 'ASL ออกให้', 'รายได้สุทธิแพลตฟอร์ม', 'รายจ่ายธุรกิจ', 'กำไร/ขาดทุน', 'คืนเงิน', 'การจอง'],
        m.monthly.map((x) => [x.month, x.sales, x.hostShare, x.fee, x.beam, x.subsidy, x.platformNet, x.expenses, x.profit, x.refunds, x.bookings]),
      );
    else
      downloadCsv(
        `ค้างจ่ายผู้จัด-${a.range.to}.csv`,
        ['รอบ', 'ผู้จัด', 'วันจัด', 'ค้างมา (วัน)', 'ยอดสุทธิ'],
        m.payable.owedRounds.map((x) => [x.title, x.host, x.date, x.days, x.net]),
      );
    say('ดาวน์โหลดแล้ว');
  };
  /** One line of the statement; `sign` marks a deduction. */
  const line = (label: string, v: number, cls = '', sign = '') => (
    <div className={cls}>
      <span>{label}</span>
      <b className={v < 0 ? 'neg' : ''}>
        {sign}
        {v < 0 && !sign ? '−' : ''}
        {baht(Math.abs(v))}
      </b>
    </div>
  );

  return (
    <div className="hx-stack">
      <div className="hx-g g75">
        <Card title="งบกำไรขาดทุน" sub={`${thDay(a.range.from, true)} – ${thDay(a.range.to, true)} · ตามวันที่ชำระ / วันที่จ่ายจริง`}>
          <div className="hx-pl">
            {line('ยอดขาย (GMV)', c.sales)}
            {line('ส่วนของผู้จัด', c.hostShare, 'sub', '− ')}
            {line('ค่าธรรมเนียมที่เก็บ (GP / หักเอง)', c.fee)}
            {line(`ค่า Beam${beamSet ? ' (ประมาณ)' : ' — ยังไม่ได้ตั้งอัตรา'}`, c.beam, 'sub', '− ')}
            {line('ASL ออกให้ (คูปอง / บัตรเชิญ)', c.subsidy, 'sub', '− ')}
            {line('รายได้สุทธิแพลตฟอร์ม', c.platformNet)}
            {line('รายจ่ายธุรกิจ + เงินเดือน', m.expenses, 'sub', '− ')}
            {line('กำไร / ขาดทุน', m.profit, 'total')}
          </div>
          <p className="hx-note">
            Take rate {c.takeRate == null ? '—' : `${num(c.takeRate)}%`} · คืนเงินในช่วงนี้ {baht(c.refunds)} (หักออกจากยอดขายแล้ว) · เงินที่ผู้จองจ่ายจริง {baht(c.cash)}
          </p>
        </Card>
        <Card title="เงินตามบัญชีการเงิน" sub="จากรายการใน ledger (ไม่รวมค่า Beam ที่หักก่อนเงินเข้าบัญชี)" delay={70}>
          <div>
            <span className="hx-label">คงเหลือสะสมทั้งหมด</span>
            <div className="hx-big" style={{ marginTop: 6 }}>
              {baht(m.ledger.all.balance)}
            </div>
          </div>
          <div className="hx-pl">
            <div>
              <span>รับชำระ (ช่วงนี้)</span>
              <b>{baht(m.ledger.cur.in)}</b>
            </div>
            <div className="sub">
              <span>คืนเงินผู้จอง</span>
              <b>− {baht(m.ledger.cur.refund)}</b>
            </div>
            <div className="sub">
              <span>จ่ายผู้จัด</span>
              <b>− {baht(m.ledger.cur.payout)}</b>
            </div>
            <div className="sub">
              <span>ค่าใช้จ่ายธุรกิจ</span>
              <b>− {baht(m.ledger.cur.expense)}</b>
            </div>
            <div className="sub">
              <span>เงินเดือน</span>
              <b>− {baht(m.ledger.cur.payroll)}</b>
            </div>
          </div>
          <Link href="/admin/ledger" className="hx-btn white" style={{ marginTop: 'auto' }}>
            เปิดบัญชีการเงิน ›
          </Link>
        </Card>
      </div>

      <Card
        title="รายเดือน 12 เดือน"
        sub="ยอดขายแยกส่วนของผู้จัด / ค่าธรรมเนียม · ตารางมีกำไรขาดทุนทุกเดือน"
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
              options={[{ key: 'pl', label: 'CSV งบกำไรขาดทุนรายเดือน' }, ...(m.payable.owedRounds.length ? [{ key: 'owed', label: 'CSV ค้างจ่ายผู้จัด' }] : [])]}
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
              { name: 'ส่วนของผู้จัด', color: '#a5d9d1', values: m.monthly.map((x) => x.hostShare) },
              { name: 'ค่าธรรมเนียม ASL', color: '#0d8a7e', values: m.monthly.map((x) => x.fee) },
            ]}
            fmt={baht}
            every={1}
          />
        ) : (
          <Rows
            rows={[...m.monthly].reverse().map((x) => ({
              key: x.month,
              main: thMonth(x.month),
              sub: `ขาย ${baht(x.sales)} · ค่าธรรมเนียม ${baht(x.fee)} · Beam ${baht(x.beam)} · ASL ออก ${baht(x.subsidy)} · รายจ่าย ${baht(x.expenses)}`,
              amt: <span style={{ color: x.profit < 0 ? '#a3261a' : undefined }}>{baht(x.profit)}</span>,
              faded: !x.sales && !x.expenses,
            }))}
          />
        )}
      </Card>

      <div className="hx-g g75">
        <Card title="ค้างจ่ายผู้จัด" sub="รอบที่จบแล้วแต่ยังไม่มีการโอนในบัญชีการเงิน · เรียงจากค้างนานสุด" delay={210}>
          {m.payable.owedRounds.length === 0 ? (
            <Empty>ไม่มียอดค้างจ่าย</Empty>
          ) : (
            <Rows
              rows={m.payable.owedRounds.map((x) => ({
                key: x.id,
                main: x.title,
                sub: `${x.host} · จัด ${thDay(x.date, true)} · ค้าง ${x.days} วัน`,
                amt: <span style={{ color: x.days > 7 ? '#a3261a' : undefined }}>{baht(x.net)}</span>,
              }))}
            />
          )}
        </Card>
        <Card title="รายจ่ายตามหมวด" sub="ค่าใช้จ่ายธุรกิจและเงินเดือนที่จ่ายในช่วงนี้" delay={280}>
          <HBars rows={m.expByCat.map((x) => ({ label: x.label, value: x.value }))} fmt={baht} noneText="ยังไม่มีรายจ่ายในช่วงนี้" />
        </Card>
      </div>

      <div className="hx-g g11">
        <Card title="ช่องทางชำระเงิน" sub="ยอดที่ผู้จองจ่ายในช่วงนี้" delay={350}>
          <HBars rows={m.methods.filter((x) => x.n > 0).map((x) => ({ label: x.label, value: x.amount, note: `${x.n} รายการ` }))} fmt={baht} noneText="ยังไม่มีการชำระในช่วงนี้" />
          {beamSet && (
            <p className="hx-note">
              อัตราที่ใช้: QR {num(a.beam.qr!, 2)}% · บัตร {num(a.beam.card!, 2)}%
            </p>
          )}
        </Card>
        <Card title="คูปอง" sub="การจองที่ใช้คูปองในช่วงนี้ · ส่วนลดที่ ASL / ผู้จัดรับ" delay={420}>
          {m.coupons.length === 0 ? (
            <Empty>ยังไม่มีการใช้คูปองในช่วงนี้</Empty>
          ) : (
            <Rows rows={m.coupons.map((x) => ({ key: x.id, main: x.name, sub: `${x.n} ครั้ง · ASL ${baht(x.asl)} · ผู้จัด ${baht(x.host)}`, amt: baht(x.discount) }))} />
          )}
        </Card>
      </div>

      <div className="hx-g auto240">
        <Card title="ยกเลิกแล้วแต่ยังไม่คืนเงิน" sub="การจองที่ยกเลิก ยังไม่มีรายการคืนเงินในบัญชี" delay={490}>
          <div className="hx-big">{baht(m.pendingRefunds.amount)}</div>
          {m.pendingRefunds.rows.length > 0 && <Rows rows={m.pendingRefunds.rows.slice(0, 6).map((x) => ({ key: x.id, main: x.title, sub: `ชำระ ${thDay(x.since, true)}`, amt: baht(x.amount) }))} />}
        </Card>
        <Card title="ตรวจบัญชี" sub="การชำระผ่าน Beam ที่ยังไม่มีรายการรับเงินใน ledger" delay={560}>
          <div className="hx-big">{num(m.ledgerGaps, 0)} รายการ</div>
          <p className="hx-note">{m.ledgerGaps ? 'ตรวจและนำเข้าที่หน้าบัญชีการเงิน' : 'ครบแล้ว'}</p>
        </Card>
        {m.vat.last12 > 1000000 && (
          <Card title="เกณฑ์ VAT ของแพลตฟอร์ม" sub="ค่าธรรมเนียมที่เก็บย้อนหลัง 12 เดือน เทียบเกณฑ์ 1.8 ล้านบาท" delay={630}>
            <div className="hx-big">{baht(m.vat.last12)}</div>
            <span className="hx-track gold">
              <span style={{ width: `${Math.min(100, (m.vat.last12 / m.vat.threshold) * 100)}%` }} />
            </span>
          </Card>
        )}
      </div>
    </div>
  );
}
