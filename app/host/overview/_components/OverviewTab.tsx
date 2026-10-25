'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Analytics } from '@/lib/host-analytics';
import { Delta, Panel, StackBars, StatCard, baht, num, thDay } from './kit';

const HIDDEN = 'hd_hidden_insights';

/** The front page: what to do today, money coming in, and whether it's growing.
 *  On a phone it reads top to bottom: to-dos → rounds ahead → payout → figure
 *  cards (swipe) → chart → insights (layout in teacher.css, .hd-ov). */
export function OverviewTab({ a, onTab }: { a: Analytics; onTab: (t: string) => void }) {
  const o = a.overview;
  const c = o.cards;
  const [hidden, setHidden] = useState<string[]>([]);
  const [basis, setBasis] = useState<string | null>(null);
  useEffect(() => {
    try {
      // Read once after mount; the server render has no browser storage.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setHidden(JSON.parse(localStorage.getItem(HIDDEN) || '[]'));
    } catch {}
  }, []);
  const hide = (id: string) => {
    const next = [...hidden, id];
    setHidden(next);
    try {
      localStorage.setItem(HIDDEN, JSON.stringify(next));
    } catch {}
  };
  const insights = o.insights.filter((i) => !hidden.includes(i.id));

  return (
    <div className="hd-ov">
      {o.todo.length > 0 && (
        <div className="hd-todo a-todo" role="status">
          <b>⚠ {o.todo.length} เรื่องต้องทำ</b>
          {o.todo.map((t, i) => (
            <Link key={i} href={t.href} onClick={t.href.includes('tab=') ? (e) => (e.preventDefault(), onTab('marketing')) : undefined}>
              <span aria-hidden>›</span>
              {t.text}
            </Link>
          ))}
        </div>
      )}

      <div className="hd-cards a-cards">
        <StatCard label="ยอดขาย" value={baht(c.sales.cur)} delta={<Delta cur={c.sales.cur} prev={c.sales.prev} kind="pct" />} onClick={() => onTab('money')} title="ยอดชำระสำเร็จตามวันที่ชำระ หักคืนเงินในช่วงที่คืน" />
        <StatCard label="รายได้สุทธิ" value={baht(c.net.cur)} delta={<Delta cur={c.net.cur} prev={c.net.prev} kind="pct" />} onClick={() => onTab('money')} title="ยอดขาย − ค่าธรรมเนียม GP" />
        <StatCard label="ที่นั่งที่ขาย" value={num(c.seats.cur, 0)} delta={<Delta cur={c.seats.cur} prev={c.seats.prev} kind="abs" />} onClick={() => onTab('rounds')} />
        <StatCard
          label="อัตราเต็มรอบ"
          value={c.fill.cur == null ? '—' : `${num(c.fill.cur, 0)}%`}
          delta={<Delta cur={c.fill.cur} prev={c.fill.prev} kind="pt" />}
          onClick={() => onTab('rounds')}
          title="ที่นั่งขาย ÷ ความจุ ของรอบที่จัดในช่วงนี้"
        />
        <StatCard label="ผู้เข้าร่วมใหม่" value={num(c.newPeople.cur, 0)} delta={<Delta cur={c.newPeople.cur} prev={c.newPeople.prev} kind="abs" />} onClick={() => onTab('people')} title="คนที่เช็คอินกับคุณครั้งแรกในช่วงนี้" />
        <StatCard
          label="กลับมาซ้ำ 90 วัน"
          value={c.repeat90.cur == null ? null : `${num(c.repeat90.cur, 0)}%`}
          delta={c.repeat90.cur == null ? <span className="hd-few">จาก {c.repeat90.people} คน</span> : <Delta cur={c.repeat90.cur} prev={c.repeat90.prev} kind="pt" />}
          onClick={() => onTab('people')}
          title="ผู้เข้าร่วมครั้งแรกที่กลับมาจองกับคุณอีกภายใน 90 วัน (รุ่นที่ครบ 90 วันแล้วใน 3 เดือนล่าสุด)"
        />
      </div>

      <Panel title="ยอดขายรายสัปดาห์" sub="12 สัปดาห์ล่าสุด นับตามวันที่ชำระ · แยกกิจกรรมแบบรอบ / เดี่ยว" className="a-chart">
        <StackBars
          labels={o.weekly.map((w) => thDay(w.week))}
          series={[
            { name: 'แบบรอบ', color: 'var(--teal)', values: o.weekly.map((w) => w.rounds) },
            { name: 'เดี่ยว', color: '#e3b23c', values: o.weekly.map((w) => w.single) },
          ]}
          format={baht}
        />
      </Panel>

      <Panel title="ยอดรอโอน" sub="ทีมงานโอนรายได้ให้หลังรอบจบ" className="a-pay">
        <div className="hd-big">{baht(o.payout.owed)}</div>
        <p className="hd-few" style={{ margin: '4px 0 12px' }}>
          จาก {o.payout.owedRounds.length} รอบที่จบแล้ว · ยังไม่ถึงกำหนด {baht(o.payout.notYet)} ({o.payout.notYetRounds.length} รอบที่ยังไม่จัด)
        </p>
        {o.payout.last && (
          <p className="hd-few" style={{ margin: '0 0 12px' }}>
            โอนล่าสุด {baht(o.payout.last.net)} · {thDay(o.payout.last.occurred_at.slice(0, 10), true)} · {o.payout.last.doc_no}
          </p>
        )}
        <button type="button" className="hd-btn" onClick={() => onTab('money')}>
          ดูรายละเอียด ›
        </button>
      </Panel>

      <FeeCard fee={o.fee} />

      <Panel title="รอบที่จะถึง 7 วัน" sub={o.upcoming.length ? undefined : 'ไม่มีรอบใน 7 วันข้างหน้า'} className="a-up">
        {o.upcoming.map((u) => (
          <div key={u.id} className="hd-row">
            <div className="grow">
              <div style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.title}</div>
              <div className="dim">
                {thDay(u.date)} · {u.time} น. · {u.sold}/{u.cap} ที่
              </div>
              <div className="hd-meter" style={{ marginTop: 6 }}>
                <span style={{ width: `${Math.min(100, (u.sold / Math.max(1, u.cap)) * 100)}%` }} />
              </div>
            </div>
            {u.action === 'checkin' ? (
              <Link className="hd-btn teal" href={`/host/journeys/${u.id}`}>
                เช็คชื่อ
              </Link>
            ) : u.action === 'full' ? (
              <span className="hd-btn">เต็มแล้ว</span>
            ) : (
              <button type="button" className="hd-btn" onClick={() => onTab('marketing')}>
                {u.action === 'promote' ? 'โปรโมต' : 'แชร์ลิงก์'}
              </button>
            )}
          </div>
        ))}
      </Panel>

      <Panel title="ข้อสังเกตจากข้อมูลของคุณ" sub="สร้างจากกฎที่เขียนไว้ล่วงหน้า แสดงเมื่อข้อมูลถึงเกณฑ์เท่านั้น" className="a-ins">
        {insights.length === 0 ? (
          <p className="hd-few">ยังไม่มีข้อสังเกต — จะขึ้นเมื่อมีรอบและการจองมากพอ</p>
        ) : (
          insights.map((i) => (
            <div key={i.id} className="hd-insight">
              {i.text}
              {basis === i.id && <div style={{ fontSize: 12, marginTop: 6, opacity: 0.85 }}>ข้อมูลที่ใช้: {i.basis}</div>}
              <div className="acts">
                <button type="button" onClick={() => setBasis(basis === i.id ? null : i.id)}>
                  {basis === i.id ? 'ซ่อนข้อมูล' : 'ดูข้อมูลที่ใช้'}
                </button>
                <button type="button" onClick={() => hide(i.id)}>
                  ไม่มีประโยชน์
                </button>
              </div>
            </div>
          ))
        )}
      </Panel>
    </div>
  );
}

/** The host's platform fee (GP): this month's rate per activity type, and how
 *  much more this month would bring next month's rate down (lib/gp). */
function FeeCard({ fee }: { fee: Analytics['overview']['fee'] }) {
  return (
    <Panel
      title="ค่าธรรมเนียม GP"
      sub={fee.started ? 'ขั้นตามยอดขายเดือนก่อน แยกเดี่ยว / แบบรอบ · รวมค่าชำระเงินแล้ว' : `เริ่มคิด ${thDay(fee.startsOn, true)} — การจองที่ชำระก่อนหน้านั้นไม่มี GP`}
      className="a-fee"
    >
      {fee.kinds.map((k) => (
        <div key={k.kind} style={{ padding: '10px 0', borderTop: '1px solid rgba(13,30,29,.07)', fontSize: 13.5 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
            <span style={{ fontWeight: 600 }}>{k.kind === 'single' ? 'กิจกรรมเดี่ยว' : 'กิจกรรมแบบรอบ'}</span>
            <span className="hd-big" style={{ fontSize: 22 }}>{fee.started ? k.rate : k.nextMonthRate}%</span>
          </div>
          <div className="hd-few">
            {fee.started ? `เดือนนี้ · เดือนหน้า ${k.nextMonthRate}%` : 'ม.ค. 70 ถ้ายอดเท่าเดือนนี้'} · ยอดเดือนนี้ {baht(k.salesThisMonth)}
          </div>
          <div className="hd-few">
            {k.step
              ? fee.started
                ? `ขายอีก ${baht(k.step.need)} เดือนหน้าได้ ${k.step.rate}%`
                : `ถ้ายอด ธ.ค. 69 ถึง ${baht(k.salesThisMonth + k.step.need)} ม.ค. 70 ได้ ${k.step.rate}%`
              : 'ขั้นต่ำสุดแล้ว'}
          </div>
          {fee.started && k.why && <div className="hd-few">{k.why}</div>}
        </div>
      ))}
      {fee.roundZeroUntil && <p className="hd-few" style={{ marginTop: 8 }}>กิจกรรมแบบรอบ 0% ถึง {thDay(fee.roundZeroUntil, true)}</p>}
      <p className="hd-few" style={{ marginTop: 8 }}>ส่วนของราคาต่อที่นั่งที่เกิน 3,000 บาท คิด 3% · กิจกรรมฟรี 0%</p>
    </Panel>
  );
}
