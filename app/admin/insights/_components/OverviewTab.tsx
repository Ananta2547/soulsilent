'use client';

import Link from 'next/link';
import type { AdminAnalytics } from '@/lib/admin-analytics';
import { Bars, Card, Empty, Kpis, Rows, baht, deltaOf, num, thDay } from '@/components/dashboard/kit';

const URGENT_LABEL: Record<string, string> = {
  refund_request: 'ผู้จองขอคืนเงิน รอดำเนินการ',
  refund_round: 'ค้างคืนเงินจากรอบที่ยกเลิก',
  payout: 'ค้างโอนให้ผู้จัดเกิน 7 วัน',
  orphan: 'เงินเข้าผิดปกติ (ชำระซ้ำ / หลังยกเลิก)',
  round_cancelled: 'รอบที่ยกเลิกแล้วยังคืนเงินไม่ครบ',
  identity: 'ผู้ใช้แก้ชื่อ / วันเกิดเกิน 3 ครั้งใน 12 เดือน',
  beam: 'ยังไม่ได้ตั้งอัตราค่าธรรมเนียม Beam — รายได้สุทธิยังไม่หักค่า Beam',
};

/** The front page: what needs doing, the platform's own money beside what it
 *  owes hosts, the headline figures, and who and what sells most. */
export function OverviewTab({ a, periodLabel, onTab, onSettings }: { a: AdminAnalytics; periodLabel: string; onTab: (t: string) => void; onSettings: () => void }) {
  const o = a.overview;
  const c = o.cards;
  const netDelta = deltaOf(c.platformNet.cur, c.platformNet.prev, 'pct');
  // Urgent alerts, one line per kind; the full list is on the alerts tab.
  const byType = new Map<string, [string, number, string]>();
  for (const x of a.alerts.open) {
    if (x.tone !== 'bad' && x.type !== 'beam') continue;
    const cur = byType.get(x.type);
    byType.set(x.type, [x.type, (cur?.[1] || 0) + 1, x.tone]);
  }
  const urgent = [...byType.values()];

  return (
    <div className="hx-stack">
      {urgent.length > 0 && (
        <div className="hx-alerts" role="status">
          {urgent.map(([type, n, tone]) => (
            <button
              key={type}
              type="button"
              className={`hx-alert ${tone}`}
              style={{ border: 0, width: '100%', textAlign: 'left', font: 'inherit', cursor: 'pointer' }}
              onClick={() => (type === 'beam' ? onSettings() : onTab('alerts'))}
            >
              <span aria-hidden>{tone === 'bad' ? '⚠' : '•'}</span>
              <span>
                {URGENT_LABEL[type] || type} {type === 'beam' ? '' : `${n} รายการ`}
              </span>
              <span aria-hidden>›</span>
            </button>
          ))}
          {a.alerts.counts.total > urgent.reduce((s, [, n]) => s + n, 0) && (
            <button type="button" className="hx-link-btn" onClick={() => onTab('alerts')}>
              ดูแจ้งเตือนทั้งหมด {a.alerts.counts.total} รายการ ›
            </button>
          )}
        </div>
      )}

      <div className="hx-g g84">
        <section className="hx-dark">
          <div className="glow" aria-hidden style={{ right: -80, top: -110, width: 300, height: 300, background: 'radial-gradient(circle, rgba(13,138,126,.55), transparent 70%)' }} />
          <div className="hx-hero-top">
            <div>
              <span className="hx-label">รายได้สุทธิแพลตฟอร์ม · {periodLabel}</span>
              <div className="hx-hero-num">{baht(c.platformNet.cur)}</div>
              <div className="hx-hero-meta">
                <span className={`hx-chip-d ${netDelta.tone}`}>{netDelta.tone === 'ne' ? netDelta.text : `${netDelta.text} จากช่วงก่อน`}</span>
                <span>
                  ค่าธรรมเนียม {baht(o.cur.fee)} − ค่า Beam {baht(o.cur.beam)} − ASL ออกให้ {baht(o.cur.subsidy)}
                </span>
              </div>
            </div>
            <button type="button" className="hx-btn ghost-light" onClick={() => onTab('money')}>
              ดูงบกำไรขาดทุน ›
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <span style={{ fontSize: 12.5, color: '#9aaba8' }}>ยอดขายรายสัปดาห์ (GMV) · 12 สัปดาห์ล่าสุด</span>
            <Bars
              labels={o.weekly.map((w) => thDay(w.week))}
              series={[
                { name: 'ส่วนของผู้จัด', color: '#3fb8a9', values: o.weekly.map((w) => w.hostShare) },
                { name: 'ค่าธรรมเนียม ASL', color: '#f5c243', values: o.weekly.map((w) => w.fee) },
              ]}
              fmt={baht}
              every={2}
            />
          </div>
        </section>

        <Card delay={70} style={{ height: '100%' }}>
          <div>
            <span className="hx-label">ค้างจ่ายผู้จัด</span>
            <div className="hx-big" style={{ fontSize: 40, lineHeight: 1.1, marginTop: 8 }}>
              {baht(a.money.payable.owed)}
            </div>
            <p className="hx-note" style={{ marginTop: 4 }}>
              {a.money.payable.owedRounds.length} รอบที่จบแล้วแต่ยังไม่บันทึกการโอน
            </p>
          </div>
          <div className="hx-pay-rows">
            {a.money.payable.aging.map((g) => (
              <div key={g.label}>
                <span className="k">{g.label}</span>
                <b>
                  {baht(g.amount)} <small>· {g.n} รอบ</small>
                </b>
              </div>
            ))}
            <div>
              <span className="k">รอบที่ยังไม่จัด</span>
              <b>
                {baht(a.money.payable.notYet)} <small>· {a.money.payable.notYetRounds} รอบ</small>
              </b>
            </div>
          </div>
          <Link href="/admin/ledger" className="hx-btn ink wide" style={{ marginTop: 'auto' }}>
            ไปบัญชีการเงิน ›
          </Link>
        </Card>
      </div>

      <Kpis
        items={[
          { label: 'ยอดขาย (GMV)', value: baht(c.sales.cur), delta: deltaOf(c.sales.cur, c.sales.prev, 'pct'), onClick: () => onTab('money'), title: 'ยอดชำระ + ส่วนที่ ASL ออกให้ ตามวันที่ชำระ หักคืนเงินในช่วงที่คืน' },
          { label: 'ค่าธรรมเนียมที่เก็บ', value: baht(c.fee.cur), delta: deltaOf(c.fee.cur, c.fee.prev, 'pct'), onClick: () => onTab('money') },
          { label: 'Take rate', value: c.takeRate.cur == null ? '—' : `${num(c.takeRate.cur)}%`, delta: deltaOf(c.takeRate.cur, c.takeRate.prev, 'pt'), title: 'ค่าธรรมเนียม ÷ ยอดขาย' },
          { label: 'กำไร / ขาดทุน', value: baht(c.profit.cur), delta: deltaOf(c.profit.cur, c.profit.prev, 'abs'), onClick: () => onTab('money'), title: 'รายได้สุทธิแพลตฟอร์ม − รายจ่ายธุรกิจในบัญชีการเงิน' },
          { label: 'การจอง', value: num(c.bookings.cur, 0), delta: deltaOf(c.bookings.cur, c.bookings.prev, 'abs'), onClick: () => onTab('activities') },
          { label: 'ผู้จอง', value: num(c.buyers.cur, 0), delta: deltaOf(c.buyers.cur, c.buyers.prev, 'abs'), onClick: () => onTab('people') },
          { label: 'สมาชิกใหม่', value: num(c.signups.cur, 0), delta: deltaOf(c.signups.cur, c.signups.prev, 'abs'), onClick: () => onTab('people') },
        ]}
      />

      <div className="hx-g g11">
        <Card title="ผู้จัดที่ขายได้มากที่สุด" sub="ยอดขายในช่วงนี้" delay={140} right={<button type="button" className="hx-btn white" onClick={() => onTab('hosts')}>ทั้งหมด ›</button>}>
          {o.topHosts.length === 0 ? <Empty>ยังไม่มียอดขายในช่วงนี้</Empty> : <Rows rows={o.topHosts.map((h) => ({ key: h.id, main: h.name, sub: `แพลตฟอร์มได้สุทธิ ${baht(h.platformNet)}`, amt: baht(h.sales) }))} />}
        </Card>
        <Card title="กิจกรรมที่ขายได้มากที่สุด" sub="ยอดขายในช่วงนี้" delay={210} right={<button type="button" className="hx-btn white" onClick={() => onTab('activities')}>ทั้งหมด ›</button>}>
          {o.topActivities.length === 0 ? (
            <Empty>ยังไม่มียอดขายในช่วงนี้</Empty>
          ) : (
            <Rows rows={o.topActivities.map((x) => ({ key: x.key, main: x.title, sub: `${x.host} · ${x.seats} ที่${x.fill == null ? '' : ` · เต็ม ${num(x.fill, 0)}%`}`, amt: baht(x.sales) }))} />
          )}
        </Card>
      </div>
    </div>
  );
}
