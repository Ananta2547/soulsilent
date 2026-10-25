'use client';

import type { Analytics } from '@/lib/host-analytics';
import { FEW, HBars, Panel, StatCard, num, thDay } from './kit';

const stars = (n: number) => '★'.repeat(n) + '☆'.repeat(5 - n);

/** After-activity surveys (AAR) and reviews. Seen only by you — never used to
 *  rank hosts. */
export function FeedbackTab({ a }: { a: Analytics }) {
  const f = a.feedback;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="hd-cards" style={{ marginBottom: 0 }}>
        <StatCard label="รอบที่มีแบบสอบถาม" value={`${f.rounds} รอบ`} />
        <StatCard label="คำตอบ" value={`${f.responses} คำตอบ`} />
        <StatCard label="อัตราตอบ" value={f.responseRate == null ? null : `${num(f.responseRate, 0)}%`} title="ผู้ตอบ ÷ ผู้เช็คอินของรอบที่มีแบบสอบถาม" />
        <StatCard label="ความพอใจเฉลี่ย (CSAT)" value={f.csat == null ? null : `${num(f.csat)} / 5`} title="แสดงเมื่อมีคำตอบตั้งแต่ 5 คำตอบ" />
        <StatCard label="รีวิวในช่วงนี้" value={`${f.reviews.count} รีวิว`} />
        <StatCard label="คะแนนรีวิวเฉลี่ย" value={f.reviews.avg == null ? '—' : `${num(f.reviews.avg)} / 5`} />
      </div>

      <div className="hd-grid2 even">
        <Panel title="คะแนนจากแบบสอบถาม" sub="จำนวนคำตอบในแต่ละระดับ">
          {f.dist == null ? <p className="hd-few">{FEW}</p> : <HBars rows={[5, 4, 3, 2, 1].map((s) => ({ label: `${s} ดาว`, value: f.dist![s - 1] }))} />}
        </Panel>
        <Panel title="ความเห็นล่าสุดจากแบบสอบถาม" sub="ไม่แสดงชื่อผู้ตอบ">
          {f.comments.length === 0 ? (
            <p className="hd-few">ยังไม่มีความเห็น</p>
          ) : (
            f.comments.map((c, i) => (
              <div key={i} className="hd-row" style={{ alignItems: 'flex-start' }}>
                <div className="grow" style={{ whiteSpace: 'normal' }}>
                  <div>{c.comment}</div>
                  <div className="dim">
                    <span style={{ color: '#e3a600' }}>{stars(c.rating)}</span> · {c.title} · {thDay(c.at, true)}
                  </div>
                </div>
              </div>
            ))
          )}
        </Panel>
      </div>

      <Panel title="รีวิวล่าสุด" sub="รีวิวที่ผู้เข้าร่วมเขียนในหน้ากิจกรรม">
        {f.reviews.latest.length === 0 ? (
          <p className="hd-few">ยังไม่มีรีวิวในช่วงนี้</p>
        ) : (
          f.reviews.latest.map((rv, i) => (
            <div key={i} className="hd-row" style={{ alignItems: 'flex-start' }}>
              <div className="grow" style={{ whiteSpace: 'normal' }}>
                <div>{rv.comment || <span className="hd-few">(ให้แค่คะแนน)</span>}</div>
                <div className="dim">
                  <span style={{ color: '#e3a600' }}>{stars(rv.rating)}</span> · {rv.title} · {thDay(rv.at, true)}
                </div>
              </div>
            </div>
          ))
        )}
      </Panel>
    </div>
  );
}
