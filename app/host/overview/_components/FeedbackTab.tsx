'use client';

import type { Analytics } from '@/lib/host-analytics';
import { Card, Empty, FEW, HBars, num, stars, thDay } from '@/components/dashboard/kit';

/** After-activity surveys (AAR) and reviews. Seen only by you — never used to
 *  rank hosts. */
export function FeedbackTab({ a }: { a: Analytics }) {
  const f = a.feedback;
  return (
    <div className="hx-stack">
      <div className="hx-g g57">
        <section className="hx-dark">
          <div className="glow" aria-hidden style={{ right: -90, top: -90, width: 260, height: 260, background: 'radial-gradient(circle, rgba(245,194,67,.35), transparent 70%)' }} />
          <div>
            <span className="hx-label">ความพอใจเฉลี่ย (CSAT)</span>
            <div className="hx-csat-num" style={{ fontSize: f.csat == null ? 30 : 64, marginTop: 10 }}>
              {f.csat == null ? FEW : (
                <>
                  {num(f.csat)}
                  <span style={{ fontSize: 22, color: '#9aaba8' }}> / 5</span>
                </>
              )}
            </div>
            {f.csat != null && <div className="hx-stars">{stars(Math.round(f.csat))}</div>}
            {f.csat == null && <p style={{ fontSize: 13, color: '#9aaba8', margin: '8px 0 0' }}>แสดงเมื่อมีคำตอบตั้งแต่ 5 คำตอบ</p>}
          </div>
          <div className="hx-fbstats">
            <div>
              <b>{f.rounds}</b>
              <span>รอบที่มีแบบสอบถาม</span>
            </div>
            <div>
              <b>{f.responses}</b>
              <span>คำตอบ</span>
            </div>
            <div title="ผู้ตอบ ÷ ผู้เช็คอินของรอบที่มีแบบสอบถาม">
              <b>{f.responseRate == null ? '—' : `${num(f.responseRate, 0)}%`}</b>
              <span>อัตราตอบ</span>
            </div>
          </div>
        </section>
        <Card title="คะแนนจากแบบสอบถาม" sub="จำนวนคำตอบในแต่ละระดับ" delay={70}>
          {f.dist == null ? <Empty>{FEW}</Empty> : <HBars rows={[5, 4, 3, 2, 1].map((s) => ({ label: `${s} ดาว`, value: f.dist![s - 1] }))} />}
        </Card>
      </div>

      <div className="hx-g g11">
        <Card title="ความเห็นจากแบบสอบถาม" sub="ไม่แสดงชื่อผู้ตอบ" delay={140}>
          {f.comments.length === 0 ? (
            <Empty>ยังไม่มีความเห็น</Empty>
          ) : (
            <div className="hx-quotes">
              {f.comments.map((c, i) => (
                <div key={i} className="hx-quote">
                  <span className="st">{stars(c.rating)}</span>
                  <p>{c.comment}</p>
                  <div className="by">
                    {c.title} · {thDay(c.at, true)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
        <Card
          title="รีวิวล่าสุด"
          sub={`${f.reviews.count} รีวิวในช่วงนี้${f.reviews.avg == null ? '' : ` · เฉลี่ย ${num(f.reviews.avg)} / 5`}`}
          delay={210}
        >
          {f.reviews.latest.length === 0 ? (
            <Empty>ยังไม่มีรีวิวในช่วงนี้</Empty>
          ) : (
            <div className="hx-quotes">
              {f.reviews.latest.map((rv, i) => (
                <div key={i} className="hx-quote">
                  <span className="st">{stars(rv.rating)}</span>
                  <p>{rv.comment || <span style={{ color: 'var(--mu)' }}>(ให้แค่คะแนน)</span>}</p>
                  <div className="by">
                    {rv.title} · {thDay(rv.at, true)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
