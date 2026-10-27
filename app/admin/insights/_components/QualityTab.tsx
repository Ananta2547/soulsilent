'use client';

import Link from 'next/link';
import type { AdminAnalytics } from '@/lib/admin-analytics';
import { Bars, Card, Empty, FEW, HBars, baht, num, stars, thDay } from '@/components/dashboard/kit';

/** How participants rate what they get, what went wrong, and whether the
 *  money pipes and the app are healthy. */
export function QualityTab({ a }: { a: AdminAnalytics }) {
  const q = a.quality;
  const s = q.system;

  return (
    <div className="hx-stack">
      <div className="hx-g g57">
        <section className="hx-dark">
          <div className="glow" aria-hidden style={{ right: -90, top: -90, width: 260, height: 260, background: 'radial-gradient(circle, rgba(245,194,67,.35), transparent 70%)' }} />
          <div>
            <span className="hx-label">ความพอใจทั้งเว็บ (CSAT)</span>
            <div className="hx-csat-num" style={{ fontSize: q.csat == null ? 30 : 64, marginTop: 10 }}>
              {q.csat == null ? (
                FEW
              ) : (
                <>
                  {num(q.csat)}
                  <span style={{ fontSize: 22, color: '#9aaba8' }}> / 5</span>
                </>
              )}
            </div>
            {q.csat != null && <div className="hx-stars">{stars(Math.round(q.csat))}</div>}
          </div>
          <div className="hx-fbstats">
            <div>
              <b>{q.responses}</b>
              <span>คำตอบแบบสอบถาม</span>
            </div>
            <div>
              <b>{q.reviews.n}</b>
              <span>รีวิว</span>
            </div>
            <div>
              <b>{q.reviews.avg == null ? '—' : num(q.reviews.avg)}</b>
              <span>คะแนนรีวิวเฉลี่ย</span>
            </div>
          </div>
        </section>
        <Card title="คะแนนรีวิว" sub="จำนวนรีวิวในแต่ละระดับ ในช่วงนี้" delay={70}>
          <HBars rows={[5, 4, 3, 2, 1].map((n) => ({ label: `${n} ดาว`, value: q.reviews.dist[n - 1] }))} />
        </Card>
      </div>

      <Card title="คะแนนต่ำล่าสุด (3 ดาวลงมา)" sub="จากแบบสอบถามและรีวิว — ไว้ติดตามกับผู้จัด" delay={140}>
        {q.low.length === 0 ? (
          <Empty>ไม่มีคะแนนต่ำในช่วงนี้</Empty>
        ) : (
          <div className="hx-quotes">
            {q.low.map((x, i) => (
              <div key={i} className="hx-quote">
                <span className="st">{stars(x.rating)}</span>
                <p>{x.comment || <span style={{ color: 'var(--mu)' }}>(ให้แค่คะแนน)</span>}</p>
                <div className="by">
                  {x.from} · {x.title} · {x.host} · {thDay(x.at, true)}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <div className="hx-g auto240">
        <Card title="คำขอคืนเงิน" sub="การจองที่ชำระในช่วงนี้ แล้วผู้จองขอคืนเงิน" delay={210}>
          <div className="hx-big">{num(q.refundRequests.n, 0)} รายการ</div>
          <p className="hx-note">
            รวม {baht(q.refundRequests.amount)} · ยังไม่บันทึกการคืนเงิน {q.pendingRefunds} รายการ (ทุกช่วงเวลา)
          </p>
        </Card>
        <Card title="เงินเข้าที่ต้องตรวจ" sub="ชำระซ้ำ / ชำระหลังยกเลิก ที่ยังไม่จัดการ" delay={280}>
          <div className="hx-big">{num(s.orphans.n, 0)} รายการ</div>
          <p className="hx-note">
            รวม {baht(s.orphans.amount)} ·{' '}
            <Link href="/admin/ledger" style={{ color: 'var(--teal)' }}>
              ไปตรวจ ›
            </Link>
          </p>
        </Card>
        <Card title="บัญชีการเงิน" sub="สิ่งที่ยังไม่ครบในบัญชี" delay={350}>
          <div className="hx-pl">
            <div>
              <span>การชำระ Beam ที่ไม่มีใน ledger</span>
              <b>{s.ledgerGaps}</b>
            </div>
            <div>
              <span>ใบสำคัญจ่ายที่ยังไม่ได้ส่งอีเมล</span>
              <b>{s.unsentVouchers}</b>
            </div>
          </div>
        </Card>
        <Card title="แอป (PWA)" sub="ในช่วงนี้" delay={420}>
          <div className="hx-pl">
            <div>
              <span>ติดตั้งใหม่</span>
              <b>{num(s.installs, 0)}</b>
            </div>
            <div>
              <span>เปิดแอป</span>
              <b>{num(s.opens, 0)}</b>
            </div>
            <div>
              <span>อุปกรณ์ที่รับแจ้งเตือน (ทั้งหมด)</span>
              <b>{num(s.pushSubs, 0)}</b>
            </div>
          </div>
        </Card>
      </div>

      <Card title="การใช้แอป 30 วันล่าสุด" sub="ติดตั้ง / เปิดแอปรายวัน" delay={490}>
        <Bars
          labels={s.appDaily.map((d) => thDay(d.day))}
          series={[
            { name: 'เปิดแอป', color: '#a5d9d1', values: s.appDaily.map((d) => d.open) },
            { name: 'ติดตั้ง', color: '#0d8a7e', values: s.appDaily.map((d) => d.install) },
          ]}
          every={5}
        />
      </Card>
    </div>
  );
}
