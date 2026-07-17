'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useLang, T, tr } from '@/lib/i18n';
import { Reveal } from '@/components/design/Reveal';
import { Btn } from '@/components/design/RippleButton';
import { getEffectivePrice, safeParseArray } from '@/lib/workshop-utils';
import type { WorkshopMaster, Workshop } from '@/lib/types';

type Session = Workshop & { booked: number };

export default function WorkshopInfoPage() {
  const { id } = useParams<{ id: string }>();
  const { lang } = useLang();
  const [master, setMaster] = useState<WorkshopMaster | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/workshop-masters/${id}`)
      .then((r) => (r.ok ? (r.json() as Promise<{ master: WorkshopMaster; sessions: Session[] }>) : null))
      .then((d) => {
        if (d) {
          setMaster(d.master);
          setSessions(d.sessions || []);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <section className="section" style={{ padding: '100px 0', textAlign: 'center' }}>
        <div style={{ width: 32, height: 32, border: '2px solid var(--teal)', borderTopColor: 'transparent', borderRadius: '50%', margin: '0 auto', animation: 'float 1s linear infinite' }} />
      </section>
    );
  }

  if (!master) {
    return (
      <section className="section" style={{ padding: '120px 0', textAlign: 'center' }}>
        <p style={{ color: 'var(--muted)', marginBottom: 16 }}>{tr(lang, 'ไม่พบข้อมูลกิจกรรมนี้', 'Activity not found')}</p>
        <Btn kind="teal" href="/workshops">{tr(lang, 'ดูกิจกรรมทั้งหมด', 'Browse workshops')}</Btn>
      </section>
    );
  }

  const target = safeParseArray<string>(master.target_json, []);
  const takeaways = safeParseArray<string>(master.takeaways_json, []);

  return (
    <section className="section" style={{ paddingTop: 40, paddingBottom: 72 }}>
      <div className="container" style={{ maxWidth: 960 }}>
        {/* Cover */}
        {master.cover_image_url && (
          <Reveal>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={master.cover_image_url} alt={master.title} style={{ width: '100%', aspectRatio: '16 / 9', objectFit: 'cover', borderRadius: 22, marginBottom: 28 }} />
          </Reveal>
        )}

        <Reveal>
          <span className="eyebrow"><T th="ข้อมูลกิจกรรม" en="Activity info" /></span>
          <h1 className="display-th" style={{ fontSize: 'clamp(34px, 5vw, 60px)', margin: '14px 0 8px' }}>{master.title}</h1>
          {master.organizer_name && (
            <p style={{ color: 'var(--muted)', fontSize: 14 }}>{tr(lang, 'จัดโดย', 'Organized by')} <strong style={{ color: 'var(--ink)' }}>{master.organizer_name}</strong></p>
          )}
        </Reveal>

        {master.description && (
          <Reveal style={{ marginTop: 24 }}>
            <p style={{ fontSize: 16, lineHeight: 1.8, color: 'var(--ink)', whiteSpace: 'pre-line' }}>{master.description}</p>
          </Reveal>
        )}

        {(target.length > 0 || takeaways.length > 0) && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 20, marginTop: 36 }}>
            {target.length > 0 && (
              <Reveal as="div" className="card" style={{ padding: 24, background: 'var(--cream)' }}>
                <h2 className="display-th" style={{ fontSize: 20, margin: '0 0 14px' }}>👥 {tr(lang, 'เหมาะกับใคร', 'Who it\'s for')}</h2>
                <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {target.map((t, i) => <li key={i} style={{ fontSize: 15, lineHeight: 1.5 }}>{t}</li>)}
                </ul>
              </Reveal>
            )}
            {takeaways.length > 0 && (
              <Reveal as="div" className="card" style={{ padding: 24, background: 'var(--cream)' }}>
                <h2 className="display-th" style={{ fontSize: 20, margin: '0 0 14px' }}>✨ {tr(lang, 'ได้อะไรจากกิจกรรม', 'What you\'ll get')}</h2>
                <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {takeaways.map((t, i) => <li key={i} style={{ fontSize: 15, lineHeight: 1.5 }}>{t}</li>)}
                </ul>
              </Reveal>
            )}
          </div>
        )}

        {/* Upcoming sessions */}
        <div style={{ marginTop: 56 }}>
          <Reveal>
            <span className="eyebrow" style={{ color: 'var(--teal)' }}><T th="สมัครเข้าร่วม" en="Join a session" /></span>
            <h2 className="display-th" style={{ fontSize: 'clamp(26px, 3.5vw, 40px)', margin: '12px 0 24px' }}>
              <T th="รอบที่กำลังจะมาถึง" en="Upcoming sessions" />
            </h2>
          </Reveal>

          {sessions.length === 0 ? (
            <div style={{ padding: 40, borderRadius: 20, background: 'var(--cream)', textAlign: 'center', color: 'var(--muted)' }}>
              {tr(lang, 'ยังไม่มีรอบที่เปิดรับสมัครในขณะนี้', 'No open sessions right now.')}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {sessions.map((s) => (
                <SessionCard key={s.id} s={s} lang={lang} />
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function SessionCard({ s, lang }: { s: Session; lang: 'th' | 'en' }) {
  const eff = getEffectivePrice(s);
  const paymentType = s.payment_type || 'paid';
  const free = paymentType === 'free' || eff.price <= 0;
  const spotsLeft = Math.max(0, s.max_participants - (s.booked || 0));
  const soldOut = s.admission_type !== 'selection' && spotsLeft <= 0;
  const dateLabel = new Date(s.date + 'T00:00:00').toLocaleDateString(lang === 'th' ? 'th-TH' : 'en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  return (
    <div className="card" style={{ padding: 20, display: 'flex', alignItems: 'center', gap: 18, background: 'var(--paper)', flexWrap: 'wrap' }}>
      <div style={{ flex: 1, minWidth: 220 }}>
        <div className="mono" style={{ fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--teal-deep)', marginBottom: 4 }}>
          {dateLabel} · {s.time_start}–{s.time_end}
        </div>
        <h3 className="display-th" style={{ fontSize: 18, margin: '0 0 4px' }}>{s.title}</h3>
        <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>
          {s.location ? `📍 ${s.location} · ` : ''}
          {s.admission_type === 'selection'
            ? tr(lang, 'รับสมัครแบบคัดเลือก', 'By selection')
            : soldOut
              ? tr(lang, 'เต็มแล้ว', 'Sold out')
              : tr(lang, `เหลือ ${spotsLeft} ที่นั่ง`, `${spotsLeft} seats left`)}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ fontFamily: 'Archivo Black, Mitr, sans-serif', fontSize: 18, color: free ? 'var(--teal)' : 'var(--ink)' }}>
          {free ? tr(lang, 'ฟรี', 'Free') : `฿${eff.price.toLocaleString()}`}
        </div>
        <Btn kind="teal" href={`/workshops/${s.id}`} style={{ justifyContent: 'center' }}>
          {s.admission_type === 'selection' ? tr(lang, 'ดูรายละเอียด', 'View') : tr(lang, 'สมัคร', 'Book')} <span className="mono">→</span>
        </Btn>
      </div>
    </div>
  );
}
