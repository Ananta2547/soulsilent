'use client';

/* Everyone who teaches here, each a door into their profile and calendar. */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useLang, T, tr } from '@/lib/i18n';
import { useLoadingTracker } from '@/components/design/DataLoading';

type Teacher = { id: string; name: string; nickname: string | null; avatar_url: string | null; bio: string | null; upcoming: number };

export default function TeachersPage() {
  const { lang } = useLang();
  const [teachers, setTeachers] = useState<Teacher[] | null>(null);
  const track = useLoadingTracker();

  useEffect(() => {
    track(
      fetch('/api/teachers')
        .then((r) => (r.ok ? (r.json() as Promise<{ teachers: Teacher[] }>) : { teachers: [] }))
        .then((d) => setTeachers(d.teachers || []))
        .catch(() => setTeachers([])),
    );
  }, [track]);

  if (teachers === null) return null;

  return (
    <section className="section" style={{ paddingTop: 40, paddingBottom: 72 }}>
      <div className="container" style={{ maxWidth: 1040 }}>
        <span className="eyebrow" style={{ color: 'var(--teal)' }}><T th="ผู้สอน" en="Teachers" /></span>
        <h1 className="display-th" style={{ fontSize: 'clamp(30px,4.4vw,46px)', margin: '8px 0 6px' }}>
          <T th="คนที่จะพาคุณไป" en="The people who take you there" />
        </h1>
        <p style={{ fontSize: 15, color: 'var(--muted)', margin: '0 0 32px', maxWidth: 520, lineHeight: 1.6 }}>
          <T th="กดที่ผู้สอนเพื่อดูประวัติ และปฏิทินรอบที่เปิดสอน" en="Open a teacher to read about them and see the days they teach." />
        </p>

        {teachers.length === 0 ? (
          <div className="card card-static" style={{ color: 'var(--muted)', textAlign: 'center', padding: 40 }}>
            <T th="ยังไม่มีผู้สอนในระบบ" en="No teachers yet." />
          </div>
        ) : (
          <div className="tl-grid">
            {teachers.map((t) => {
              const display = t.nickname || t.name;
              return (
                <Link key={t.id} href={`/teachers/${t.id}`} className="card tl-card">
                  <span className="tl-avatar">
                    {t.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={t.avatar_url} alt={display} />
                    ) : (
                      display[0]
                    )}
                  </span>
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span style={{ display: 'block', fontWeight: 700, fontSize: 17 }} className="display-th">{display}</span>
                    {t.nickname && t.nickname !== t.name && <span style={{ display: 'block', fontSize: 12.5, color: 'var(--muted)' }}>{t.name}</span>}
                    {t.bio && (
                      <span className="u-clamp-2" style={{ display: 'block', fontSize: 13.5, color: 'var(--muted)', marginTop: 6, lineHeight: 1.5 }}>
                        {t.bio}
                      </span>
                    )}
                    <span style={{ display: 'inline-block', marginTop: 10 }} className="tag">
                      {t.upcoming > 0 ? tr(lang, `${t.upcoming} รอบที่เปิดรับ`, `${t.upcoming} open rounds`) : tr(lang, 'ยังไม่มีรอบ', 'No open rounds')}
                    </span>
                  </span>
                  <span aria-hidden className="mono" style={{ color: 'var(--teal)' }}>→</span>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
