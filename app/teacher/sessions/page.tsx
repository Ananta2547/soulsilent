'use client';

/* Session manager, first screen: one card per activity the admin handed this
 * teacher that runs in rounds ("เลือกรอบ"), drawn like the one-day workshop
 * cards — A3 poster, open / ended and payout badges, the date with how many
 * days and rounds, seats and venue. The nearest upcoming round (or the latest
 * past one) stands for the activity. Tapping a card opens that activity's
 * calendar, where rounds are added, edited and checked in. */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useLang, T, tr } from '@/lib/i18n';
import { Icon } from '@/components/design/Icon';
import { todayYmd } from '@/components/calendar/MonthPicker';
import type { Workshop, WorkshopMaster } from '@/lib/types';
import { hasWorkshopEnded } from '@/lib/workshop-utils';

type Round = Workshop & { booked: number };
type Data = { masters: WorkshopMaster[]; rounds: Round[] };

export default function TeacherSessionsPage() {
  const { lang } = useLang();
  const [data, setData] = useState<Data | null>(null);

  useEffect(() => {
    let alive = true;
    // Masters come from the session manager (what this teacher runs); the
    // rounds with their payout state and venue come from the workshop list.
    Promise.all([
      fetch('/api/teacher/sessions').then((r) => (r.ok ? (r.json() as Promise<{ masters: WorkshopMaster[] }>) : { masters: [] })),
      fetch('/api/teacher/workshops').then((r) => (r.ok ? (r.json() as Promise<{ workshops: Round[] }>) : { workshops: [] })),
    ])
      .then(([s, w]) => ({ masters: s.masters || [], rounds: (w.workshops || []).filter((x) => x.status !== 'cancelled') }))
      .catch(() => ({ masters: [], rounds: [] }))
      .then((d) => {
        if (alive) setData(d);
      });
    return () => {
      alive = false;
    };
  }, []);

  const today = todayYmd();
  const fmt = (ymd: string) => new Date(ymd + 'T00:00:00').toLocaleDateString(lang === 'th' ? 'th-TH' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <div>
      <span className="eyebrow">
        <T th="จัดรอบสอน" en="session manager" />
      </span>
      <h1 className="display-th" style={{ fontSize: 'clamp(24px,3vw,32px)', margin: '8px 0 4px' }}>
        <T th="เปิดรอบสอน" en="Open rounds" />
      </h1>
      <p style={{ fontSize: 14, color: 'var(--muted)', margin: '0 0 22px' }}>
        {tr(lang, 'เลือก Workshop แบบเลือกรอบ เพื่อดูปฏิทินรอบที่เปิดอยู่ เพิ่มรอบใหม่ และเช็คชื่อ', 'Pick a workshop that runs in rounds to see its calendar, add rounds and check people in.')}
      </p>

      {data === null ? null : data.masters.length === 0 ? (
        <div className="card card-static" style={{ textAlign: 'center', padding: '48px 24px' }}>
          <p style={{ color: 'var(--muted)', margin: 0 }}>
            <T th="ยังไม่มี Workshop แบบเลือกรอบที่ Admin ผูกชื่อคุณไว้" en="No round-based activity has been assigned to you yet." />
          </p>
        </div>
      ) : (
        <div className="tch-wgrid">
          {data.masters.map((m) => {
            const group = data.rounds.filter((r) => r.master_id === m.id).sort((a, b) => a.date.localeCompare(b.date) || a.time_start.localeCompare(b.time_start));
            const rep = group.find((r) => r.date >= today) || group[group.length - 1] || null;
            const days = new Set(group.map((r) => r.date)).size;
            const ended = !rep || rep.status === 'completed' || hasWorkshopEnded(rep);
            const st = !rep
              ? { th: 'ยังไม่มีรอบ', en: 'No rounds', tone: 'var(--muted)', bg: 'var(--cream)' }
              : ended
                ? { th: 'จบแล้ว', en: 'Ended', tone: 'var(--muted)', bg: 'var(--cream)' }
                : { th: 'เปิดรับ', en: 'Open', tone: 'var(--teal-deep)', bg: 'var(--teal-50)' };
            const image = rep?.image_url || m.cover_image_url;
            const venue = rep?.location || null;
            return (
              <Link key={m.id} href={`/teacher/sessions/${m.id}`} className="card card-static" style={{ padding: 0, overflow: 'hidden', textDecoration: 'none', display: 'block' }}>
                {/* A3 poster frame, like the one-day workshop cards. */}
                <div style={{ aspectRatio: '297 / 420', background: 'var(--cream)', position: 'relative' }}>
                  {image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={image} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                  ) : null}
                  <span className="tch-wbadge" style={{ position: 'absolute', top: 10, right: 10, fontSize: 11, fontWeight: 600, color: st.tone, background: st.bg, borderRadius: 999, padding: '4px 10px' }}>
                    {tr(lang, st.th, st.en)}
                  </span>
                  {rep && (
                    <span
                      className="tch-wbadge"
                      style={{
                        position: 'absolute',
                        top: 10,
                        left: 10,
                        fontSize: 11,
                        fontWeight: 600,
                        borderRadius: 999,
                        padding: '4px 10px',
                        color: rep.payout_status === 'paid' ? 'var(--teal-deep)' : '#8a5a00',
                        background: rep.payout_status === 'paid' ? 'var(--teal-50)' : '#fcefcf',
                      }}
                    >
                      {rep.payout_status === 'paid' ? tr(lang, 'โอนแล้ว', 'Paid out') : tr(lang, 'รอโอน', 'Awaiting payout')}
                    </span>
                  )}
                </div>
                <div className="tch-wcard-body" style={{ padding: 16 }}>
                  <h3 className="display-th tch-wcard-title" style={{ fontSize: 17, margin: '0 0 8px', lineHeight: 1.3, color: 'var(--ink)' }}>
                    {m.title}
                  </h3>
                  <div className="tch-wmeta" style={{ fontSize: 13, color: 'var(--muted)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {rep ? (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <span>
                          <Icon name="date" size={13} /> {fmt(rep.date)}
                          {tr(lang, ` · ${days} วัน · ${group.length} รอบ`, ` · ${days} days · ${group.length} rounds`)}
                        </span>
                        <span style={{ whiteSpace: 'nowrap' }}>
                          <Icon name="participants" size={13} /> {rep.booked}/{rep.max_participants} {tr(lang, 'ที่นั่ง', 'seats')}
                        </span>
                      </span>
                    ) : (
                      <span>
                        <Icon name="date" size={13} /> {tr(lang, 'ยังไม่มีรอบ — กดเพื่อเพิ่มรอบ', 'No rounds yet — tap to add')}
                      </span>
                    )}
                    {venue && (
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        <Icon name="location" size={13} /> {venue}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
