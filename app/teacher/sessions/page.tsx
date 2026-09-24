'use client';

/* Session manager, first screen: one card per activity the admin handed this
 * teacher that runs in rounds ("เลือกรอบ"). A card shows its prices and how
 * many rounds are open; tapping it opens that activity's calendar, where
 * rounds are added, edited and checked in. */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useLang, T, tr } from '@/lib/i18n';
import { todayYmd } from '@/components/calendar/MonthPicker';
import { fmtDate } from '@/lib/datetime';
import type { WorkshopMaster } from '@/lib/types';
import { bookableTiers } from '@/lib/pricing';

type Round = { id: string; master_id: string; date: string; status: string };
type Data = { masters: WorkshopMaster[]; rounds: Round[] };

const baht = (n: number | null | undefined) => (n == null ? '—' : '฿' + Math.round(n).toLocaleString());

export default function TeacherSessionsPage() {
  const { lang } = useLang();
  const [data, setData] = useState<Data | null>(null);

  useEffect(() => {
    let alive = true;
    fetch('/api/teacher/sessions')
      .then((res) => (res.ok ? (res.json() as Promise<Data>) : { masters: [], rounds: [] }))
      .catch(() => ({ masters: [], rounds: [] }))
      .then((d) => {
        if (alive) setData(d);
      });
    return () => {
      alive = false;
    };
  }, []);

  const today = todayYmd();

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
        <div className="tsm-cards">
          {data.masters.map((m) => {
            const live = data.rounds.filter((r) => r.master_id === m.id && r.status !== 'cancelled' && r.date >= today);
            const days = new Set(live.map((r) => r.date)).size;
            const tiers = bookableTiers(m);
            return (
              <Link key={m.id} href={`/teacher/sessions/${m.id}`} className="tsm-card tsm-card-link">
                {m.cover_image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.cover_image_url} alt="" className="tsm-card-img" />
                ) : (
                  <span className="tsm-card-img ph ph-teal" />
                )}
                <div className="tsm-card-body">
                  <h3 className="display-th tsm-card-title">{m.title}</h3>
                  <div className="tsm-card-meta">
                    {tiers.length ? (
                      tiers.slice(0, 3).map((t) => (
                        <span key={t.id}>
                          {t.label} <b>{baht(t.price)}</b>
                        </span>
                      ))
                    ) : (
                      <span style={{ color: '#a04a14' }}>⚠ {tr(lang, 'ยังไม่ตั้งราคา', 'No price yet')}</span>
                    )}
                  </div>
                  <div className="tsm-card-meta">
                    {live.length
                      ? tr(lang, `เปิดอยู่ ${live.length} รอบ · ${days} วัน · ถัดไป ${fmtDate(live[0].date, lang)}`, `${live.length} open · ${days} days · next ${fmtDate(live[0].date, lang)}`)
                      : tr(lang, 'ยังไม่มีรอบที่เปิด', 'No rounds open')}
                  </div>
                  <span className="btn btn-teal btn-sm" style={{ marginTop: 'auto', alignSelf: 'flex-start' }}>
                    {tr(lang, 'จัดรอบ', 'Manage rounds')} →
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
