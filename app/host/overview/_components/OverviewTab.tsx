'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Analytics } from '@/lib/host-analytics';
import { Bars, Card, I, Kpis, baht, deltaOf, num, thDay } from '@/components/dashboard/kit';

const HIDDEN = 'hd_hidden_insights';

/** The front page: a dark hero with net revenue and 12 weeks of sales, the
 *  payout card beside it, five figure tiles, rounds ahead + the GP card, and
 *  the insights strip. Things to do sit on top when there are any. */
export function OverviewTab({ a, periodLabel, onTab }: { a: Analytics; periodLabel: string; onTab: (t: string) => void }) {
  const o = a.overview;
  const c = o.cards;
  const fee = Math.max(0, c.sales.cur - c.net.cur);
  const netDelta = deltaOf(c.net.cur, c.net.prev, 'pct');
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
    <div className="hx-stack">
      {o.todo.length > 0 && (
        <div className="hx-todo" role="status">
          <b>⚠ {o.todo.length} เรื่องต้องทำ</b>
          {o.todo.map((t, i) => (
            <Link key={i} href={t.href} onClick={t.href.includes('tab=') ? (e) => (e.preventDefault(), onTab('marketing')) : undefined}>
              <span aria-hidden>›</span>
              {t.text}
            </Link>
          ))}
        </div>
      )}

      <div className="hx-g g84">
        <section className="hx-dark">
          <div className="glow" aria-hidden style={{ right: -80, top: -110, width: 300, height: 300, background: 'radial-gradient(circle, rgba(13,138,126,.55), transparent 70%)' }} />
          <div className="hx-hero-top">
            <div>
              <span className="hx-label">รายได้สุทธิ · {periodLabel}</span>
              <div className="hx-hero-num">{baht(c.net.cur)}</div>
              <div className="hx-hero-meta">
                <span className={`hx-chip-d ${netDelta.tone}`}>{netDelta.tone === 'ne' ? netDelta.text : `${netDelta.text} จากช่วงก่อน`}</span>
                <span>
                  ยอดขาย {baht(c.sales.cur)} · GP {baht(fee)}
                </span>
              </div>
            </div>
            <button type="button" className="hx-btn ghost-light" onClick={() => onTab('money')}>
              ดูรายเดือน ›
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <span style={{ fontSize: 12.5, color: '#9aaba8' }}>ยอดขายรายสัปดาห์ · 12 สัปดาห์ล่าสุด</span>
            <Bars
              labels={o.weekly.map((w) => thDay(w.week))}
              series={[
                { name: 'แบบรอบ', color: '#3fb8a9', values: o.weekly.map((w) => w.rounds) },
                { name: 'เดี่ยว', color: '#f5c243', values: o.weekly.map((w) => w.single) },
              ]}
              fmt={baht}
              every={2}
            />
          </div>
        </section>

        <Card delay={70} style={{ height: '100%' }}>
          <div>
            <span className="hx-label">ยอดรอโอน</span>
            <div className="hx-big" style={{ fontSize: 40, lineHeight: 1.1, marginTop: 8 }}>
              {baht(o.payout.owed)}
            </div>
            <p className="hx-note" style={{ marginTop: 4 }}>
              จาก {o.payout.owedRounds.length} รอบที่จบแล้ว · ทีมงานโอนให้หลังรอบจบ
            </p>
          </div>
          <div className="hx-pay-rows">
            <div>
              <span className="k">ยังไม่ถึงกำหนด</span>
              <b>
                {baht(o.payout.notYet)} <small>· {o.payout.notYetRounds.length} รอบ</small>
              </b>
            </div>
            <div>
              <span className="k">โอนล่าสุด</span>
              {o.payout.last ? (
                <span style={{ textAlign: 'right' }}>
                  <b>{baht(o.payout.last.net)}</b>
                  <br />
                  <span className="hx-mono">
                    {thDay(o.payout.last.occurred_at.slice(0, 10), true)} · {o.payout.last.doc_no}
                  </span>
                </span>
              ) : (
                <span className="k">—</span>
              )}
            </div>
          </div>
          <button type="button" className="hx-btn ink wide" style={{ marginTop: 'auto' }} onClick={() => onTab('money')}>
            รายได้และการโอน ›
          </button>
        </Card>
      </div>

      <Kpis
        items={[
          { label: 'ยอดขาย', value: baht(c.sales.cur), delta: deltaOf(c.sales.cur, c.sales.prev, 'pct'), onClick: () => onTab('money'), title: 'ยอดชำระสำเร็จตามวันที่ชำระ หักคืนเงินในช่วงที่คืน' },
          { label: 'ที่นั่งที่ขาย', value: num(c.seats.cur, 0), delta: deltaOf(c.seats.cur, c.seats.prev, 'abs'), onClick: () => onTab('rounds') },
          { label: 'อัตราเต็มรอบ', value: c.fill.cur == null ? '—' : `${num(c.fill.cur, 0)}%`, delta: deltaOf(c.fill.cur, c.fill.prev, 'pt'), onClick: () => onTab('rounds'), title: 'ที่นั่งขาย ÷ ความจุ ของรอบที่จัดในช่วงนี้' },
          { label: 'ผู้เข้าร่วมใหม่', value: num(c.newPeople.cur, 0), delta: deltaOf(c.newPeople.cur, c.newPeople.prev, 'abs'), onClick: () => onTab('people') },
          {
            label: 'กลับมาซ้ำ 90 วัน',
            value: c.repeat90.cur == null ? null : `${num(c.repeat90.cur, 0)}%`,
            delta: c.repeat90.cur == null ? `จาก ${c.repeat90.people} คน` : deltaOf(c.repeat90.cur, c.repeat90.prev, 'pt'),
            onClick: () => onTab('people'),
            title: 'ผู้เข้าร่วมครั้งแรกที่กลับมาจองกับคุณอีกภายใน 90 วัน',
          },
        ]}
      />

      <div className="hx-g g75">
        <Card title="รอบที่จะถึง 7 วัน" delay={140}>
          {o.upcoming.length === 0 ? (
            <div className="hx-zero">
              <span className="ic">{I.cal(24)}</span>
              <p className="t">ไม่มีรอบใน 7 วันข้างหน้า</p>
              <p>เปิดรอบใหม่เพื่อให้ผู้เข้าร่วมจองล่วงหน้าได้</p>
              <Link href="/host/sessions" className="hx-btn" style={{ marginTop: 4 }}>
                {I.plus()}จัดรอบกิจกรรม
              </Link>
            </div>
          ) : (
            <div className="hx-up">
              {o.upcoming.map((u) => (
                <div key={u.id} className="hx-up-row">
                  <div className="main">
                    <div className="t">{u.title}</div>
                    <div className="m">
                      {thDay(u.date)} · {u.time} น. · {u.sold}/{u.cap} ที่
                    </div>
                    <span className="hx-track">
                      <span style={{ width: `${Math.min(100, (u.sold / Math.max(1, u.cap)) * 100)}%` }} />
                    </span>
                  </div>
                  {u.action === 'checkin' ? (
                    <Link className="hx-btn ink" href={`/host/journeys/${u.id}`} style={{ height: 36 }}>
                      เช็คชื่อ
                    </Link>
                  ) : u.action === 'full' ? (
                    <span className="hx-btn white">เต็มแล้ว</span>
                  ) : (
                    <button type="button" className="hx-btn white" onClick={() => onTab('marketing')}>
                      {u.action === 'promote' ? 'โปรโมต' : 'แชร์ลิงก์'}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title="ค่าธรรมเนียม GP" sub={o.fee.started ? 'ขั้นตามยอดขายเดือนก่อน แยกเดี่ยว / แบบรอบ' : 'เริ่มคิด 1 ม.ค. 70 — การจองที่ชำระก่อนหน้านั้นไม่มี GP'} delay={210}>
          {o.fee.kinds.map((k) => {
            const target = k.step ? k.salesThisMonth + k.step.need : null;
            const rate = o.fee.started ? k.rate : k.nextMonthRate;
            return (
              <div key={k.kind} className="hx-gp">
                <div className="hx-gp-top">
                  <span>{k.kind === 'single' ? 'กิจกรรมเดี่ยว' : 'กิจกรรมแบบรอบ'}</span>
                  <b>{rate}%</b>
                </div>
                <span className="hx-track gold">
                  <span style={{ width: target ? `${Math.min(100, (k.salesThisMonth / target) * 100)}%` : '100%', animationDelay: '300ms' }} />
                </span>
                <div className="hx-gp-meta">
                  <span>เดือนนี้ {baht(k.salesThisMonth)}</span>
                  <span>{target ? `เป้า ${baht(target)}` : 'ขั้นต่ำสุดแล้ว'}</span>
                </div>
                <span className="hx-note">
                  {k.step
                    ? o.fee.started
                      ? `ขายอีก ${baht(k.step.need)} → เดือนหน้าได้ ${k.step.rate}%`
                      : `ถ้ายอด ธ.ค. 69 ถึง ${baht(target!)} → ม.ค. 70 ได้ ${k.step.rate}%`
                    : o.fee.started
                      ? `เดือนหน้า ${k.nextMonthRate}%`
                      : 'ม.ค. 70 ถ้ายอดเท่าเดือนนี้'}
                  {o.fee.started && k.why ? ` · ${k.why}` : ''}
                </span>
              </div>
            );
          })}
          {o.fee.roundZeroUntil && <p className="hx-note">กิจกรรมแบบรอบ 0% ถึง {thDay(o.fee.roundZeroUntil, true)}</p>}
          <p className="hx-note" style={{ fontSize: 12, paddingTop: 12, borderTop: '1px solid rgba(13,30,29,.06)' }}>
            ส่วนของราคาต่อที่นั่งที่เกิน 3,000 บาท คิด 3% · กิจกรรมฟรี 0%
          </p>
        </Card>
      </div>

      <section className="hx-strip" style={{ animationDelay: '280ms' }}>
        <span className="ic">{I.spark()}</span>
        <div className="body">
          <div className="t">ข้อสังเกตจากข้อมูลของคุณ</div>
          {insights.length === 0 ? (
            <div className="s">ยังไม่มีข้อสังเกต — จะขึ้นเมื่อมีรอบและการจองมากพอ</div>
          ) : (
            insights.map((i) => (
              <div key={i.id} className="hx-insight">
                {i.text}
                {basis === i.id && <div className="basis">ข้อมูลที่ใช้: {i.basis}</div>}
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
        </div>
      </section>
    </div>
  );
}
