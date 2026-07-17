'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { Course } from '@/lib/types';
import { useLang, T, tr } from '@/lib/i18n';
import { Reveal } from '@/components/design/Reveal';
import { Cloud, ZigZag, UnderlineMark } from '@/components/design/Doodles';

const LEVEL_LABEL: Record<string, { th: string; en: string }> = {
  beginner: { th: 'เริ่มต้น', en: 'Beginner' },
  intermediate: { th: 'กลาง', en: 'Intermediate' },
  advanced: { th: 'ขั้นสูง', en: 'Advanced' },
};

export default function CoursesPage() {
  const { lang } = useLang();
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'beginner' | 'intermediate' | 'advanced'>('all');
  const [query, setQuery] = useState('');

  useEffect(() => {
    fetch('/api/courses')
      .then((r) => r.json() as Promise<{ courses: Course[] }>)
      .then((d) => setCourses(d.courses || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    let out = courses;
    if (filter !== 'all') out = out.filter((c) => c.level === filter);
    const q = query.trim().toLowerCase();
    if (q)
      out = out.filter(
        (c) =>
          c.title.toLowerCase().includes(q) ||
          (c.short_description || '').toLowerCase().includes(q) ||
          (c.category || '').toLowerCase().includes(q),
      );
    return out;
  }, [courses, filter, query]);

  const filters = [
    { k: 'all' as const, th: 'ทั้งหมด', en: 'All' },
    { k: 'beginner' as const, th: 'เริ่มต้น', en: 'Beginner' },
    { k: 'intermediate' as const, th: 'กลาง', en: 'Intermediate' },
    { k: 'advanced' as const, th: 'ขั้นสูง', en: 'Advanced' },
  ];

  return (
    <section className="section" style={{ paddingTop: 48 }}>
      <div className="container">
        <Reveal style={{ marginBottom: 32 }}>
          <Link
            href="/allsoullearn"
            className="mono"
            style={{
              fontSize: 11,
              letterSpacing: '.2em',
              textTransform: 'uppercase',
              color: 'var(--muted)',
              textDecoration: 'none',
            }}
          >
            ← allsoullearn
          </Link>
          <h1
            className="display-th"
            style={{
              fontSize: 'clamp(34px, 5vw, 64px)',
              margin: '14px 0 8px',
              position: 'relative',
              display: 'inline-block',
            }}
          >
            <T th="คอร์สทั้งหมด" en="All courses" />
            <Reveal
              draw
              delay={400}
              style={{
                position: 'absolute',
                left: 0,
                bottom: -14,
                width: '72%',
                height: 18,
                pointerEvents: 'none',
              }}
            >
              <UnderlineMark color="var(--teal)" stroke={6} />
            </Reveal>
          </h1>
          <p style={{ fontSize: 15, color: 'var(--muted)', margin: '12px 0 0' }}>
            <T th="เลือกคอร์สที่ใช่ เริ่มเรียนได้ทันที" en="Pick a course and start anytime" />
          </p>
        </Reveal>

        <Reveal
          style={{
            display: 'flex',
            gap: 12,
            flexWrap: 'wrap',
            alignItems: 'center',
            marginBottom: 32,
          }}
        >
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {filters.map((f) => (
              <button
                key={f.k}
                onClick={() => setFilter(f.k)}
                style={{
                  padding: '10px 18px',
                  borderRadius: 999,
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  border: 0,
                  background: filter === f.k ? 'var(--ink)' : 'var(--cream)',
                  color: filter === f.k ? '#fff' : 'var(--ink)',
                  transition: 'all .2s ease',
                }}
              >
                {tr(lang, f.th, f.en)}
              </button>
            ))}
          </div>
          <input
            className="field"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={tr(lang, 'ค้นหาคอร์ส…', 'Search courses…')}
            style={{ maxWidth: 320, flex: 1 }}
          />
        </Reveal>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 64 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                border: '2px solid var(--teal)',
                borderTopColor: 'transparent',
                margin: '0 auto',
                animation: 'spin 1s linear infinite',
              }}
            />
          </div>
        ) : filtered.length === 0 ? (
          <Reveal style={{ textAlign: 'center', padding: 80 }}>
            <p className="display-th" style={{ fontSize: 22, marginBottom: 8 }}>
              <T th="ไม่พบคอร์สที่ตรงกับเงื่อนไข" en="No courses match" />
            </p>
            <p style={{ color: 'var(--muted)' }}>
              <T th="ลองปรับตัวกรองดูใหม่" en="Try adjusting your filters" />
            </p>
          </Reveal>
        ) : (
          <div className="grid-x g-cards">
            {filtered.map((c, i) => (
              <Reveal key={c.id} variant="reveal-zoom" delay={(i % 8) * 60}>
                <CourseCardLg c={c} />
              </Reveal>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function CourseCardLg({ c }: { c: Course }) {
  const { lang } = useLang();
  return (
    <Link
      href={`/allsoullearn/courses/${c.id}`}
      className="card"
      style={{
        padding: 16,
        background: 'var(--paper)',
        display: 'flex',
        flexDirection: 'column',
        textDecoration: 'none',
        color: 'var(--ink)',
      }}
    >
      <div
        className="ph ph-teal card-media"
        style={{ height: 160, borderRadius: 14, marginBottom: 16, position: 'relative', overflow: 'hidden' }}
      >
        {c.thumbnail_url ? (
          <img
            src={c.thumbnail_url}
            alt={c.title}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <>
            <ZigZag
              color="var(--teal)"
              stroke={3}
              style={{
                position: 'absolute',
                bottom: 14,
                left: 14,
                right: 14,
                width: 'calc(100% - 28px)',
                height: 24,
              }}
            />
            <Cloud
              color="var(--teal-200)"
              stroke={3}
              style={{ position: 'absolute', top: 14, left: 14, width: 64, height: 40 }}
            />
            <span
              style={{
                position: 'absolute',
                bottom: 10,
                right: 14,
                fontFamily: 'JetBrains Mono',
                fontSize: 9,
                letterSpacing: '.1em',
                opacity: 0.5,
                textTransform: 'uppercase',
              }}
            >
              video · 16:9
            </span>
          </>
        )}
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
        {c.category && <span className="tag">{c.category}</span>}
        <span className="tag tag-accent">{LEVEL_LABEL[c.level]?.[lang] || c.level}</span>
      </div>
      <h3 className="display-th" style={{ fontSize: 20, margin: '0 0 6px', lineHeight: 1.2 }}>
        {c.title}
      </h3>
      <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 14, lineHeight: 1.55, flex: 1 }}>
        {c.short_description || (lang === 'th' ? 'คอร์สวิดีโอออนไลน์' : 'Online video course')}
      </div>
      <div
        style={{
          marginTop: 'auto',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingTop: 14,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 10,
              fontFamily: 'JetBrains Mono',
              color: 'var(--muted)',
              letterSpacing: '.1em',
              textTransform: 'uppercase',
            }}
          >
            {tr(lang, 'ราคา', 'Price')}
          </div>
          <div style={{ fontFamily: 'Archivo Black', fontSize: 22 }}>฿{c.price.toLocaleString()}</div>
        </div>
        <span className="btn btn-teal btn-sm" aria-hidden="true">
          {tr(lang, 'ดูคอร์ส', 'View')} <span className="mono">→</span>
        </span>
      </div>
    </Link>
  );
}
