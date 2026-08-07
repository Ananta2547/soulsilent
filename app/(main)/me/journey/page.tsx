'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useLang, T, tr } from '@/lib/i18n';
import { Reveal } from '@/components/design/Reveal';
import { Btn } from '@/components/design/RippleButton';
import { type JourneyItem, journeyStatus, fmtJourneyDate } from '@/lib/journey';

export default function MyJourneyPage() {
  const { lang } = useLang();
  const [items, setItems] = useState<JourneyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [unauthorized, setUnauthorized] = useState(false);

  useEffect(() => {
    fetch('/api/me/journey')
      .then((r) => {
        if (r.status === 401) {
          setUnauthorized(true);
          return null;
        }
        return r.json() as Promise<{ items: JourneyItem[] }>;
      })
      .then((d) => {
        if (d) setItems(d.items || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <section className="section" style={{ padding: '80px 0', textAlign: 'center' }}>
        <div style={{ width: 32, height: 32, border: '2px solid var(--teal)', borderTopColor: 'transparent', borderRadius: '50%', margin: '0 auto', animation: 'float 1s linear infinite' }} />
      </section>
    );
  }

  if (unauthorized) {
    return (
      <section className="section" style={{ padding: '80px 0', textAlign: 'center' }}>
        <p style={{ color: 'var(--muted)', marginBottom: 16 }}>
          {tr(lang, 'กรุณาเข้าสู่ระบบเพื่อดู My Journey', 'Please sign in to view My Journey')}
        </p>
        <Btn kind="teal" href="/auth/login?redirect=/me/journey">
          {tr(lang, 'เข้าสู่ระบบ', 'Sign in')}
        </Btn>
      </section>
    );
  }

  return (
    <section className="section" style={{ paddingTop: 48, paddingBottom: 64 }}>
      <div className="container">
        <Reveal>
          <span className="eyebrow">
            <T th="เส้นทางของฉัน" en="my journey" />
          </span>
          <h1 className="display-th" style={{ fontSize: 'clamp(34px, 5vw, 60px)', margin: '18px 0 8px' }}>
            My Journey
          </h1>
          <p style={{ color: 'var(--muted)', fontSize: 15, marginBottom: 28 }}>
            {tr(lang, 'รวมทุก workshop ที่คุณเคยสมัครและเข้าร่วม', 'Every workshop you have applied to and attended')}
            {items.length > 0 && ` · ${items.length}`}
          </p>
        </Reveal>

        {items.length === 0 ? (
          <div style={{ padding: 48, borderRadius: 22, background: 'var(--cream)', textAlign: 'center', color: 'var(--muted)' }}>
            <p style={{ marginBottom: 14 }}>
              {tr(lang, 'ยังไม่มีกิจกรรมในเส้นทางของคุณ — เริ่มจากลองดู workshop ดูสิ', 'No workshops in your journey yet — explore upcoming ones')}
            </p>
            <Btn kind="teal" href="/workshops">
              {tr(lang, 'ดูกิจกรรมทั้งหมด', 'Browse workshops')} →
            </Btn>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 18 }}>
            {items.map((it) => {
              const st = journeyStatus(it);
              return (
                <Link
                  key={it.booking_id}
                  href={`/me/journey/${it.workshop_id}`}
                  className="card"
                  style={{ padding: 0, overflow: 'hidden', textDecoration: 'none', color: 'var(--ink)', display: 'flex', flexDirection: 'column' }}
                >
                  <div style={{ aspectRatio: '297 / 210', background: 'var(--cream-deep)', overflow: 'hidden' }}>
                    {it.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={it.image_url} alt={it.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', fontSize: 13 }}>
                        {tr(lang, 'ไม่มีรูป', 'No image')}
                      </div>
                    )}
                  </div>
                  <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
                    <h3 className="display-th" style={{ fontSize: 17, margin: 0, lineHeight: 1.3 }}>{it.title}</h3>
                    <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      {st.done ? (
                        <span className="tag" style={{ background: 'var(--cream-deep)', color: 'var(--muted)' }}>
                          ✓ {tr(lang, 'เสร็จสิ้นกิจกรรม', 'Completed')}
                        </span>
                      ) : (
                        <span className="tag" style={{ background: '#e6f4f1', color: 'var(--teal-deep)' }}>
                          ⏳ {tr(lang, `นับถอยหลัง ${st.daysLeft} วัน`, `${st.daysLeft} days left`)}
                        </span>
                      )}
                      {it.attended === 1 && (
                        <span className="tag" style={{ background: 'var(--teal)', color: '#fff' }}>★ {tr(lang, 'เข้าร่วมแล้ว', 'Attended')}</span>
                      )}
                    </div>
                    <div className="mono" style={{ fontSize: 11, color: 'var(--muted)', letterSpacing: '.06em' }}>
                      {fmtJourneyDate(it.date)}
                    </div>
                    {it.journey_note ? (
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 12, color: 'var(--ink)', background: 'var(--cream)', borderRadius: 10, padding: '8px 10px', lineHeight: 1.5 }}>
                        <span aria-hidden>📝</span>
                        <span style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{it.journey_note}</span>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--teal)' }}>
                        <span aria-hidden>📝</span>
                        {tr(lang, 'จดบันทึกความทรงจำ', 'Add a memory note')}
                      </div>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
