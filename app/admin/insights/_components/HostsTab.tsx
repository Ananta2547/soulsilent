'use client';

import { useState } from 'react';
import type { AdminAnalytics } from '@/lib/admin-analytics';
import { Card, Dropdown, Empty, HBars, I, Kpis, Rows, baht, downloadCsv, num, thDay } from '@/components/dashboard/kit';
import { RecordTransferSheet } from '@/components/admin/ledger/RecordTransferSheet';

type Host = AdminAnalytics['hosts']['rows'][number];
const SORTS: [keyof Host, string][] = [
  ['sales', 'ยอดขาย'],
  ['platformNet', 'แพลตฟอร์มได้สุทธิ'],
  ['owed', 'ค้างจ่าย'],
  ['rounds', 'รอบที่จัด'],
  ['fill', 'อัตราเต็ม'],
  ['name', 'ชื่อ'],
];

/** Every host side by side: who sells, who is owed, who is drifting away,
 *  and how the GP tiers are spread. */
export function HostsTab({ a, say, onChanged }: { a: AdminAnalytics; say: (m: string) => void; onChanged: () => void }) {
  const h = a.hosts;
  // A host paying back what was overpaid, recorded in the money ledger.
  const [returning, setReturning] = useState<{ id: string; name: string; amount: number } | null>(null);
  const [sort, setSort] = useState<keyof Host>('sales');
  const [open, setOpen] = useState(false);
  const rows = [...h.rows].sort((x, y) =>
    sort === 'name' ? x.name.localeCompare(y.name, 'th') : ((y[sort] as number | null) ?? -1) - ((x[sort] as number | null) ?? -1),
  );
  const csv = () => {
    downloadCsv(
      `ผู้จัด-${a.range.from}-${a.range.to}.csv`,
      ['ผู้จัด', 'ยอดขาย', 'ค่าธรรมเนียม', 'แพลตฟอร์มได้สุทธิ', 'ที่นั่ง', 'รอบที่จัด', 'อัตราเต็ม %', 'ความพอใจ', 'ค้างจ่าย', 'รอบที่จะถึง', 'รอบล่าสุด', 'GP เดี่ยว %', 'GP แบบรอบ %'],
      rows.map((x) => [x.name, x.sales, x.fee, x.platformNet, x.seats, x.rounds, x.fill, x.csat, x.owed, x.upcoming, x.lastRound, x.rate.single, x.rate.round]),
    );
    say('ดาวน์โหลดแล้ว');
  };
  const tier = (xs: { rate: number; n: number }[]) => xs.map((t) => ({ label: `${num(t.rate)}%`, value: t.n }));

  return (
    <div className="hx-stack">
      <Kpis
        items={[
          { label: 'ผู้จัดทั้งหมด', value: num(h.total, 0), title: 'ผู้ใช้ที่เป็นผู้จัดของรอบอย่างน้อย 1 รอบ' },
          { label: 'ผู้จัดที่มีความเคลื่อนไหว', value: num(h.active, 0), title: 'มีรอบที่จัดหรือมีการจองในช่วงนี้' },
          { label: 'ผู้จัดใหม่', value: num(h.newHosts, 0), title: 'สร้างรอบแรกในช่วงนี้' },
          { label: 'เสี่ยงหาย', value: num(h.atRisk.length, 0), title: 'เคยขายได้ แต่ไม่มีรอบใหม่และไม่ได้จัดมา 60 วัน' },
          { label: 'ยอดขายเฉลี่ย / ผู้จัด', value: h.salesPerActive == null ? '—' : baht(h.salesPerActive), title: 'ยอดขายในช่วงนี้ ÷ ผู้จัดที่มีความเคลื่อนไหว' },
          { label: '3 อันดับแรกขายได้', value: h.top3Share == null ? '—' : `${num(h.top3Share, 0)}%`, delta: 'ของยอดขายทั้งหมด', title: 'ยิ่งสูง ยิ่งพึ่งผู้จัดไม่กี่คน' },
        ]}
      />

      <Card
        title="ผู้จัดทุกคน"
        sub="ตัวเลขของช่วงนี้ · ค้างจ่าย = รอบที่จบแล้วแต่ยังไม่โอน"
        className={`raised${open ? ' menu-open' : ''}`}
        right={
          <>
            <Dropdown
              small
              label={SORTS.find((s) => s[0] === sort)![1]}
              options={SORTS.map(([k, l]) => ({ key: k, label: l }))}
              value={sort}
              onPick={(k) => setSort(k as keyof Host)}
              onOpen={setOpen}
              ariaLabel="เรียงตาม"
            />
            <button type="button" className="hx-btn white" onClick={csv}>
              {I.down()}CSV
            </button>
          </>
        }
      >
        {rows.length === 0 ? (
          <Empty>ยังไม่มีผู้จัด</Empty>
        ) : (
          <div className="hx-acts">
            {rows.map((x) => (
              <div key={x.id} className="hx-act" data-focus={`host:${x.id}`}>
                <div style={{ minWidth: 0 }}>
                  <div className="t">
                    {x.name}
                    {x.atRisk && <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 600, color: '#a3261a' }}>เสี่ยงหาย</span>}
                    {x.isNew && <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 600, color: 'var(--teal)' }}>ใหม่</span>}
                  </div>
                  <div className="m">
                    จัด {x.rounds} รอบ · ขาย {x.seats} ที่ · จะถึง {x.upcoming} รอบ · ล่าสุด {x.lastRound ? thDay(x.lastRound, true) : '—'} · GP {num(x.rate.single)}% / {num(x.rate.round)}%
                    {x.owed > 0 ? ` · ค้างจ่าย ${baht(x.owed)}` : ''}
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
                  <div>ASL สุทธิ {baht(x.platformNet)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <div className="hx-g g11">
        <Card title="ยอดคงเหลือผู้จัด" sub="รายได้ของรอบที่จัดเสร็จ − ที่โอนไปแล้ว + ที่ผู้จัดคืนมา · บวก = เราค้างจ่าย · ลบ = ผู้จัดต้องคืนเรา" delay={40}>
          {h.balances.length === 0 ? (
            <Empty>ไม่มียอดค้างระหว่างกัน</Empty>
          ) : (
            <div className="hx-rows">
              {h.balances.map((b) => (
                <div key={b.id} className="hx-row" style={{ flexWrap: 'wrap' }}>
                  <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                    <div className="main">{b.name}</div>
                    <div className="sub">
                      รายได้ {baht(b.earned)} · โอนแล้ว {baht(b.paid)}
                      {b.returned ? ` · คืนมา ${baht(b.returned)}` : ''}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <b style={{ color: b.balance < 0 ? '#a3261a' : undefined }}>{b.balance < 0 ? `ผู้จัดต้องคืน ${baht(-b.balance)}` : `ค้างจ่าย ${baht(b.balance)}`}</b>
                    {b.balance < 0 && (
                      <button type="button" className="hx-btn white" onClick={() => setReturning({ id: b.id, name: b.name, amount: -b.balance })}>
                        บันทึกผู้จัดคืนเงิน
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
        <Card title="ยอดเปลี่ยนหลังโอน" sub="รอบที่โอนให้ผู้จัดไปแล้ว แต่ยอดตอนนี้ไม่ตรงกับที่โอน (มีคืนเงิน / จองเพิ่มหลังโอน)" delay={80}>
          {h.drift.length === 0 ? (
            <Empty>ทุกรอบที่โอนแล้วยอดตรงกัน</Empty>
          ) : (
            <Rows
              rows={h.drift.map((x) => ({
                key: x.id,
                focus: `drift:${x.id}`,
                main: x.title,
                sub: `${x.host} · ${x.doc} โอน ${thDay(x.paidAt, true)} ${baht(x.paid)} · ตอนนี้ ${baht(x.now)}`,
                amt: <span style={{ color: x.diff > 0 ? '#a3261a' : undefined }}>{x.diff > 0 ? `ต้องคืน ${baht(x.diff)}` : `ต้องโอนเพิ่ม ${baht(-x.diff)}`}</span>,
              }))}
            />
          )}
        </Card>
      </div>

      {returning && (
        <RecordTransferSheet
          lockKind
          preset={{ kind: 'host_return', host_id: returning.id, gross: returning.amount, payee_name: returning.name, description: `ผู้จัดคืนเงินส่วนที่โอนเกิน · ${returning.name}` }}
          onClose={() => setReturning(null)}
          onSaved={(tx) => {
            setReturning(null);
            say(`บันทึก ${tx.doc_no} แล้ว`);
            onChanged();
          }}
        />
      )}

      <div className="hx-g g11">
        <Card title="ผู้จัดที่เสี่ยงหาย" sub="เคยขายได้ ไม่มีรอบใหม่ และไม่ได้จัดมาเกิน 60 วัน — ลองติดต่อ" delay={70}>
          {h.atRisk.length === 0 ? (
            <Empty>ไม่มี</Empty>
          ) : (
            <Rows rows={h.atRisk.map((x) => ({ key: x.id, focus: `host:${x.id}`, main: x.name, sub: `จัดล่าสุด ${x.lastRound ? thDay(x.lastRound, true) : '—'}`, amt: x.owed > 0 ? `ค้างจ่าย ${baht(x.owed)}` : '' }))} />
          )}
        </Card>
        <Card title="ขั้น GP ของผู้จัดที่เคลื่อนไหว" sub="อัตราเดือนนี้ · จำนวนผู้จัดในแต่ละขั้น" delay={140}>
          <span className="hx-label">กิจกรรมเดี่ยว</span>
          <HBars rows={tier(h.tiers.single)} noneText="—" />
          <span className="hx-label" style={{ marginTop: 8 }}>
            กิจกรรมแบบรอบ
          </span>
          <HBars rows={tier(h.tiers.round)} noneText="—" />
        </Card>
      </div>
    </div>
  );
}
