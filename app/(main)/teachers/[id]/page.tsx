'use client';

/* A teacher's public page: who they are, then a calendar of the days they
 * teach. Tap a day and the rounds that day list underneath; tap a round and
 * you land on the activity page with that day already chosen, so the booking
 * popup opens on it. */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useLang, T, tr } from '@/lib/i18n';
import { Btn } from '@/components/design/RippleButton';
import { Icon } from '@/components/design/Icon';
import { MonthPicker } from '@/components/calendar/MonthPicker';
import { fmtDate } from '@/lib/datetime';
import { useLoadingTracker } from '@/components/design/DataLoading';

type Teacher = { id: string; name: string; nickname: string | null; avatar_url: string | null; cover_image_url: string | null; bio: string | null };
type Round = {
  id: string;
  master_id: string | null;
  title: string;
  date: string;
  time_start: string;
  time_end: string;
  image_url: string | null;
  price: number;
  max_participants: number;
  is_online: number;
  loc_name: string | null;
  loc_province: string | null;
  booked: number;
  private_taken: number;
};

export default function TeacherProfilePage() {
  const { id } = useParams<{ id: string }>();
  const { lang } = useLang();
  const [teacher, setTeacher] = useState<Teacher | null>(null);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [loading, setLoading] = useState(true);
  const [day, setDay] = useState<string | null>(null);
  const track = useLoadingTracker();

  useEffect(() => {
    track(
      fetch(`/api/teachers/${id}`)
        .then((r) => (r.ok ? (r.json() as Promise<{ teacher: Teacher; rounds: Round[] }>) : null))
        .then((d) => {
          if (d) {
            setTeacher(d.teacher);
            setRounds(d.rounds || []);
            // Open on the first day they teach, so the page never starts blank.
            if (d.rounds?.length) setDay(d.rounds[0].date);
          }
        })
        .catch(() => {})
        .finally(() => setLoading(false)),
    );
  }, [id, track]);

  const days = useMemo(() => new Set(rounds.map((r) => r.date)), [rounds]);
  const marks = useMemo(() => {
    const m: Record<string, number> = {};
    rounds.forEach((r) => {
      m[r.date] = (m[r.date] || 0) + 1;
    });
    return m;
  }, [rounds]);
  const onDay = useMemo(() => (day ? rounds.filter((r) => r.date === day) : []), [rounds, day]);

  if (loading) return null;
  if (!teacher) {
    return (
      <section className="section" style={{ padding: '120px 0', textAlign: 'center' }}>
        <p style={{ color: 'var(--muted)', marginBottom: 16 }}>{tr(lang, 'ไม่พบผู้สอนคนนี้', 'Teacher not found')}</p>
        <Btn kind="teal" href="/workshops">{tr(lang, 'ดูกิจกรรมทั้งหมด', 'Browse workshops')}</Btn>
      </section>
    );
  }

  const display = teacher.nickname || teacher.name;

  return (
    <section className="section" style={{ paddingTop: 32, paddingBottom: 72 }}>
      <div className="container" style={{ maxWidth: 960 }}>
        {/* Who */}
        <div className="tp-hero">
          {teacher.cover_image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={teacher.cover_image_url} alt="" className="tp-cover" />
          ) : (
            <div className="tp-cover tp-cover-blank" />
          )}
          <div className="tp-id">
            <span className="tp-avatar">
              {teacher.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={teacher.avatar_url} alt={display} />
              ) : (
                display[0]
              )}
            </span>
            <div style={{ minWidth: 0 }}>
              <span className="eyebrow" style={{ color: 'var(--teal)' }}><T th="ผู้สอน" en="Teacher" /></span>
              <h1 className="display-th" style={{ fontSize: 'clamp(26px,4vw,40px)', margin: '4px 0 0' }}>{display}</h1>
              {teacher.nickname && teacher.name !== teacher.nickname && (
                <div style={{ fontSize: 13.5, color: 'var(--muted)' }}>{teacher.name}</div>
              )}
            </div>
          </div>
        </div>

        {teacher.bio && (
          <div className="card card-static" style={{ marginTop: 18 }}>
            <span className="eyebrow" style={{ color: 'var(--muted)' }}><T th="เกี่ยวกับผู้สอน" en="About" /></span>
            <p style={{ fontSize: 15, lineHeight: 1.75, margin: '8px 0 0', whiteSpace: 'pre-line' }}>{teacher.bio}</p>
          </div>
        )}

        {/* When */}
        <div style={{ marginTop: 36 }}>
          <span className="eyebrow" style={{ color: 'var(--teal)' }}><T th="ปฏิทินกิจกรรมของผู้สอน" en="Teaching calendar" /></span>
          <h2 className="display-th" style={{ fontSize: 'clamp(22px,3vw,30px)', margin: '4px 0 16px' }}>
            <T th="เลือกวันที่ต้องการ" en="Pick a day" />
          </h2>

          {rounds.length === 0 ? (
            <div className="card card-static" style={{ color: 'var(--muted)', textAlign: 'center', padding: 36 }}>
              <T th="ยังไม่มีรอบที่เปิดรับสมัครในขณะนี้" en="No open rounds right now." />
            </div>
          ) : (
            <div className="tp-cal">
              <div className="card card-static">
                <MonthPicker value={day} onChange={setDay} enabled={days} marks={marks} />
                <p style={{ fontSize: 12, color: 'var(--muted)', margin: '12px 0 0' }}>
                  <T th="วันที่มีสี = มีรอบสอน · วันอื่นกดไม่ได้" en="Tinted days have a round · other days cannot be picked" />
                </p>
              </div>

              <div>
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 10 }}>
                  {day ? fmtDate(day, lang) : tr(lang, 'เลือกวันจากปฏิทิน', 'Choose a day')}
                  {day && <span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: 13 }}> · {onDay.length} {tr(lang, 'รอบ', onDay.length === 1 ? 'round' : 'rounds')}</span>}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {onDay.map((r) => {
                    const full = r.private_taken > 0 || r.booked >= r.max_participants;
                    // Straight to the workshop page; the day rides along so the
                    // round's booking popup opens on it.
                    const href = `/workshops/${r.id}?date=${r.date}`;
                    return (
                      <Link key={r.id} href={href} className="card tp-round">
                        {r.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={r.image_url} alt="" className="tp-round-img" />
                        ) : (
                          <span className="tp-round-img tp-round-blank" />
                        )}
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ display: 'block', fontWeight: 700, fontSize: 15 }} className="u-clamp-2">{r.title}</span>
                          <span className="mono" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                            <span><Icon name="time" size={12} /> {r.time_start}–{r.time_end}</span>
                            <span><Icon name="location" size={12} /> {r.is_online ? 'ONLINE' : r.loc_name || '—'}</span>
                          </span>
                          <span style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6 }}>
                            <b style={{ color: 'var(--teal-deep)' }}>฿{Math.round(r.price).toLocaleString()}</b>
                            {full && <span className="tag" style={{ fontSize: 10.5, background: '#e6e3da', color: 'var(--muted)' }}>{tr(lang, 'เต็มแล้ว', 'Full')}</span>}
                          </span>
                        </span>
                        <span aria-hidden className="mono" style={{ color: 'var(--teal)' }}>→</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
