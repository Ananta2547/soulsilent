'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

/* ============================================================
   About — port of Design Composer "About.dc.html".
   Navbar stays as-is (SiteHeader from app/(main)/layout.tsx). Live D1
   data via /api/stats + /api/team, Thai-only.
   ============================================================ */

/** Whole years since founding (15 Nov 2022 / พ.ศ. 2565). */
function yearsSince(year: number, month1: number, day: number): number {
  const now = new Date();
  let y = now.getFullYear() - year;
  const m = now.getMonth() + 1 - month1;
  if (m < 0 || (m === 0 && now.getDate() < day)) y--;
  return Math.max(0, y);
}

const BELIEFS = [
  { icon: '—', title: 'Safe & Fair', blurb: 'ทุกคนมีเสรีภาพในการเป็นตัวเองอย่างเต็มที่\nแต่ต้องไม่เบียดเบียนสิทธิของคนอื่น\nรักษาพื้นที่ปลอดภัยสำหรับทุกคน' },
  { icon: '+', title: 'People First', blurb: 'เมื่อเกิดข้อผิดพลาด สิ่งแรกที่เราทำ\nไม่ใช่การชี้นิ้วหาคนผิดแต่คือการรับฟัง\nและดูแลความรู้สึกของมนุษย์ก่อน' },
  { icon: '✺', title: 'It’s Okay', blurb: 'ไม่เป็นไรเลย ถ้าวันนี้ยังไม่พร้อม\nไม่เป็นไรเลย ถ้าวันนี้ยังทำไม่ได้\nไม่เป็นไรเลยที่จะยืนยันในเสียงของตัวเอง' },
];

const SWATCHES = ['ph-teal', 'ph-cream', 'ph-ink', 'ph-accent'];

export default function AboutPage() {
  const [stats, setStats] = useState({ workshops: 11, participants: 125, locations: 0 });
  const [admins, setAdmins] = useState<{ name: string; avatar_url: string | null }[] | null>(null);
  const years = yearsSince(2022, 11, 15);

  useEffect(() => {
    fetch('/api/stats')
      .then((r) => r.json() as Promise<{ workshops: number; participants: number; locations: number }>)
      .then((d) => setStats({ workshops: d.workshops ?? 11, participants: d.participants ?? 125, locations: d.locations ?? 0 }))
      .catch(() => {});
    fetch('/api/team')
      .then((r) => r.json() as Promise<{ team?: { name: string; avatar_url: string | null }[] }>)
      .then((d) => setAdmins(d.team || []))
      .catch(() => setAdmins([]));
  }, []);

  const members = admins && admins.length > 0 ? admins : [];

  const numbers = [
    { n: String(years), label: 'ปี', accent: false },
    { n: stats.workshops.toLocaleString(), label: 'กิจกรรม', accent: true },
    { n: stats.participants.toLocaleString(), label: 'ผู้เข้าร่วม', accent: false },
    { n: String(stats.locations), label: 'สถานที่', accent: true },
  ];

  return (
    <>
      {/* ---- Hero ---- */}
      <section className="container" style={{ paddingTop: 56, paddingBottom: 56, position: 'relative', overflow: 'hidden' }}>
        <svg viewBox="0 0 260 90" style={{ position: 'absolute', right: '2%', top: 36, width: 220, opacity: 0.5, pointerEvents: 'none' }} aria-hidden="true">
          <path d="M4 44 Q 40 6 76 44 T 148 44 T 220 44 T 256 20" fill="none" stroke="var(--teal-100)" strokeWidth="8" strokeLinecap="round" />
        </svg>
        <div className="mono" style={{ color: 'var(--muted)', letterSpacing: '.14em', fontSize: 11, textTransform: 'uppercase', marginBottom: 16 }}>— เกี่ยวกับเรา</div>
        <h1 className="display-th reveal-up" style={{ fontSize: 'clamp(38px,6.2vw,68px)', margin: 0, lineHeight: 1.32, color: 'var(--ink)' }}>
          เก็บรักษาทุกเดินทาง<br />ไว้กับ <span style={{ color: 'var(--teal)' }}>All Soul Learn</span><span style={{ color: 'var(--teal)' }}>.</span>
        </h1>
        <p style={{ maxWidth: 640, margin: '26px 0 0', fontSize: 16, lineHeight: 1.75, color: 'var(--muted)' }}>
          All Soul Learn ตั้งต้นว่าเราจะต้องเป็นมากกว่าเว็บไซต์จองกิจกรรมที่พาผู้คนมาพบและจากกันไป เพราะในวันที่โลกหมุนไวและเต็มไปด้วยเสียงรอบตัว ในวันวันหนึ่งเราใช้ชีวิตผ่านเรื่องราว ผู้คน และข้อมูลมากมาย จนหลายครั้งเรื่องราวดี ๆ ก็หล่นหายไปตามกาลเวลา เพียงเพราะแค่จำไม่ได้ ไม่ได้แปลว่าเรื่องราวเหล่านั้นไม่เคยเกิดขึ้น เราจึงขออาสาเป็นพื้นที่บันทึกเรื่องราวดี ๆ เหล่านั้นไว้ผ่านเว็บไซต์ All Soul Learn เพื่อให้มั่นใจว่าทุกการพบเจอแม้เพียงแป๊บเดียว ก็จะถูกรักษาไว้อย่างดี เราเชื่อว่าการเรียนรู้ไม่จำเป็นต้องมาจากตำราเล่มหนา หรือการศึกษาที่ยาวนานเสมอไป ในพื้นที่แห่งนี้ แม้แต่การนั่งจิบกาแฟและแลกเปลี่ยนเรื่องราวกับคนแปลกหน้า ก็อาจทำให้เราค้นพบมุมมองอันมีค่า ที่หนังสือเล่มไหนก็ไม่เคยเขียนบอกไว้
        </p>
      </section>

      {/* ---- Beliefs ---- */}
      <section className="bg-cream section">
        <div className="container">
          <h2 className="display-en reveal-up" style={{ fontSize: 'clamp(26px,3.6vw,36px)', margin: '0 0 28px' }}>
            Our Beliefs<span style={{ color: 'var(--teal)' }}>.</span>
          </h2>
          <div className="beliefs-grid">
            {BELIEFS.map((b) => (
              <div key={b.title} className="card" style={{ padding: 26 }}>
                <div style={{ color: 'var(--teal)', marginBottom: 16, fontSize: 20, lineHeight: 1 }}>{b.icon}</div>
                <h3 style={{ fontFamily: 'Mitr', fontWeight: 600, fontSize: 17, margin: '0 0 8px' }}>{b.title}</h3>
                <p style={{ fontSize: 13.5, color: 'var(--muted)', lineHeight: 1.6, margin: 0, whiteSpace: 'pre-line' }}>{b.blurb}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---- Numbers ---- */}
      <section className="section" style={{ textAlign: 'center' }}>
        <div className="container">
          <div className="mono" style={{ color: 'var(--muted)', letterSpacing: '.14em', fontSize: 11, textTransform: 'uppercase', marginBottom: 10 }}>— 02 · ตัวเลข</div>
          <h2 className="display-th reveal-up" style={{ fontSize: 'clamp(24px,3.2vw,32px)', margin: '0 0 32px' }}>{years} ปีที่ผ่านมา</h2>
          <div className="card card-cream stats-grid" style={{ padding: '36px 24px' }}>
            {numbers.map((s) => (
              <div key={s.label}>
                <div style={{ fontFamily: 'Archivo Black', fontSize: 'clamp(34px,4.5vw,52px)', color: s.accent ? 'var(--teal)' : 'var(--ink)' }}>
                  {s.n}
                  <span style={{ color: 'var(--accent)' }}>.</span>
                </div>
                <div className="mono" style={{ fontSize: 11, color: 'var(--muted)', letterSpacing: '.1em' }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---- Team ---- */}
      <section className="bg-cream section">
        <div className="container">
          <div className="mono" style={{ color: 'var(--muted)', letterSpacing: '.14em', fontSize: 11, textTransform: 'uppercase', marginBottom: 10 }}>— 03 · ทีมงาน</div>
          <h2 className="display-th reveal-up" style={{ fontSize: 'clamp(26px,3.6vw,36px)', margin: '0 0 28px' }}>คนที่อยู่เบื้องหลัง</h2>
          {members.length > 0 ? (
            <div className="team-grid">
              {members.map((m, i) => (
                <div key={`${m.name}-${i}`}>
                  <div
                    className={`ph ${SWATCHES[i % SWATCHES.length]}`}
                    style={{ aspectRatio: '1', borderRadius: 18, marginBottom: 12, position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    {m.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={m.avatar_url} alt={m.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <span style={{ fontFamily: 'Archivo Black', fontSize: 22, color: SWATCHES[i % SWATCHES.length] === 'ph-ink' ? '#fff' : 'var(--teal-deep)', textTransform: 'uppercase', letterSpacing: '.02em' }}>
                        {(m.name || '?').slice(0, 2)}
                      </span>
                    )}
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 14.5 }}>{m.name}</div>
                  <div className="mono" style={{ fontSize: 10.5, color: 'var(--muted)', letterSpacing: '.08em' }}>ทีม SOULSILENT</div>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ color: 'var(--muted)', fontSize: 14 }}>กำลังโหลดทีมงาน…</p>
          )}
        </div>
      </section>

      {/* ---- CTA ---- */}
      <section className="section bg-ink-section" style={{ textAlign: 'center' }}>
        <div className="container">
          <h2 className="display-en reveal-up" style={{ fontSize: 'clamp(40px,7.5vw,84px)', margin: 0, lineHeight: 0.9, color: '#fff' }}>
            FIND YOUR<br /><span style={{ color: 'var(--accent)' }}>ORDINARY</span> ZONE
          </h2>
          <p style={{ fontFamily: 'Mitr', fontSize: 16, color: 'rgba(255,255,255,.7)', margin: '20px 0 32px' }}>วางความคาดหวังที่แบกมานาน แล้วลองมาหาจุดนั่งพักสบาย ๆ ในโซนนี้</p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}>
            <Link href="/journeys" className="btn btn-teal">ดูกิจกรรมทั้งหมด <span className="mono">→</span></Link>
          </div>
        </div>
      </section>
    </>
  );
}
