'use client';

/* ============================================================
   My Journey — port of Design Composer
   "AllSoulLearn Journey + Diary.dc.html" (journey view only; the
   diary half of that file is deliberately not brought over).

   Every attended workshop is a stop on one dashed path: alternating
   sides of a centre line on desktop, a single left-hand rail on a
   phone. The path ends at the start of the story, and begins with an
   invitation to add the next stop.
   ============================================================ */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useLang, T, tr } from '@/lib/i18n';
import { Btn } from '@/components/design/RippleButton';
import { Icon } from '@/components/design/Icon';
import { useLoadingTracker } from '@/components/design/DataLoading';
import { JourneyModal } from '@/components/journey/JourneyModal';
import { getWorkshopDays } from '@/lib/workshop-utils';
import { type JourneyItem, fmtJourneyDate } from '@/lib/journey';

/** Whole hours spent in one workshop — per-day length × number of days. */
function itemHours(it: JourneyItem): number {
  const toMin = (t: string | null) => {
    const [h, m] = (t || '').split(':').map(Number);
    return Number.isFinite(h) ? h * 60 + (Number.isFinite(m) ? m : 0) : null;
  };
  const start = toMin(it.time_start);
  const end = toMin(it.time_end);
  if (start == null || end == null || end <= start) return 0;
  const days = getWorkshopDays({
    workshop_type: it.workshop_type as 'one_day',
    date: it.date,
    end_date: it.end_date,
    dates_json: it.dates_json,
    time_end: it.time_end,
  }).length;
  return ((end - start) / 60) * Math.max(1, days);
}

export default function MyJourneyPage() {
  const { lang } = useLang();
  const [items, setItems] = useState<JourneyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [unauthorized, setUnauthorized] = useState(false);
  /** booking_id of the stop opened in the popup, or null. */
  const [openId, setOpenId] = useState<string | null>(null);

  const track = useLoadingTracker();

  useEffect(() => {
    track(
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
        .finally(() => setLoading(false)),
    );
  }, [track]);

  const stats = useMemo(() => {
    const hours = items.reduce((sum, it) => sum + itemHours(it), 0);
    const notes = items.filter((it) => (it.journey_note || '').trim()).length;
    // The path is drawn newest-first, so the oldest stop is where it started.
    const firstYear = items.length ? (items[items.length - 1].date || '').slice(0, 4) : '';
    return { hours: Math.round(hours), notes, firstYear };
  }, [items]);

  /* The stop shown in the popup. Items arrive newest-first, so the stop number
     the design prints ("จุดที่ 03") counts up from the oldest. */
  const openIdx = items.findIndex((x) => x.booking_id === openId);
  const openStop = openIdx >= 0 ? { item: items[openIdx], index: items.length - openIdx } : null;

  // Nothing to draw while this page's requests are open — the loading screen is
  // over it already (components/design/DataLoading.tsx).
  if (loading) return null;

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
    <section className="section jn-page" style={{ paddingTop: 44, paddingBottom: 72 }}>
      <div className="container">
        <div className="jn-head">
          <div style={{ maxWidth: 520 }}>
            <h1 className="jn-title">MY JOURNEY</h1>
            <p style={{ fontSize: 15, lineHeight: 1.6, color: 'var(--muted)', margin: 0 }}>
              {tr(
                lang,
                'เก็บบันทึกทุกความทรงจำ จากทุกประสบการณ์',
                'Every memory kept, from every experience.',
              )}
            </p>
          </div>
          <div className="jn-stats">
            <Stat n={String(items.length).padStart(2, '0')} icon="date" label="WORKSHOPS" teal />
            <Stat n={String(stats.hours)} icon="time" label={tr(lang, 'ชั่วโมงเรียนรู้', 'hours')} />
            <Stat n={String(stats.notes)} icon="notes" label={tr(lang, 'บันทึกความทรงจำ', 'memory notes')} />
          </div>
        </div>

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
          <div className="jn-path">
            {/* The invitation sits at the head of the path — the next stop is
                the one that hasn't happened yet. */}
            <div className="jn-node jn-node-next">
              <div className="jn-dot jn-dot-open" aria-hidden />
              <div className="jn-next">
                <div style={{ fontFamily: 'Mitr, sans-serif', fontWeight: 500, fontSize: 20, lineHeight: 1.35, margin: '0 0 18px' }}>
                  <T
                    th={<>เส้นทางยังไม่จบ<br />หา workshop ถัดไปกันไหม</>}
                    en={<>The path isn&apos;t over<br />shall we find the next one?</>}
                  />
                </div>
                <Link href="/workshops" className="btn btn-teal">
                  {tr(lang, 'ดูกิจกรรมทั้งหมด', 'Browse workshops')} <span className="mono">→</span>
                </Link>
              </div>
            </div>

            {items.map((it) => (
              <div className="jn-node" key={it.booking_id}>
                <div className="jn-dot" aria-hidden />
                <button
                  type="button"
                  onClick={() => setOpenId(it.booking_id)}
                  className="card jn-card"
                  aria-haspopup="dialog"
                >
                  <div className="jn-poster">
                    {it.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={it.image_url} alt={it.title} />
                    ) : (
                      <span className="mono" style={{ fontSize: 10, letterSpacing: '.1em', color: 'var(--muted)' }}>
                        {tr(lang, 'ไม่มีรูป', 'No image')}
                      </span>
                    )}
                  </div>
                  <div className="jn-card-body">
                    <div className="jn-card-title">{it.title}</div>
                    <div className="jn-card-foot">
                      <span className="mono jn-card-date">
                        <Icon name="date" size={13} /> {fmtJourneyDate(it.date)}
                      </span>
                      <span className="jn-card-note">
                        <Icon name="notes" size={13} />
                        {(it.journey_note || '').trim()
                          ? tr(lang, 'อ่านบันทึก', 'Read note')
                          : tr(lang, 'จดบันทึกความทรงจำ', 'Add a memory')}
                      </span>
                    </div>
                  </div>
                </button>
              </div>
            ))}

            <div className="jn-start">
              <span className="jn-start-dot" aria-hidden />
              <span className="eyebrow" style={{ color: 'var(--muted)' }}>
                {tr(lang, 'จุดเริ่มต้น', 'the beginning')}
                {stats.firstYear ? ` · ${stats.firstYear}` : ''}
              </span>
            </div>
          </div>
        )}
      </div>

      {openStop && (
        <JourneyModal
          item={openStop.item}
          index={openStop.index}
          onClose={() => setOpenId(null)}
          onChange={(next) =>
            setItems((prev) => prev.map((x) => (x.booking_id === next.booking_id ? next : x)))
          }
        />
      )}
    </section>
  );
}

/** One figure in the header strip: the number, its icon, and what it counts. */
function Stat({
  n,
  label,
  icon,
  teal = false,
}: {
  n: string;
  label: string;
  icon: 'date' | 'time' | 'notes';
  teal?: boolean;
}) {
  return (
    <div>
      <div className="jn-stat-row">
        <span className="jn-stat-n" style={teal ? { color: 'var(--teal)' } : undefined}>{n}</span>
        <Icon name={icon} size={26} style={{ color: teal ? 'var(--teal)' : 'var(--ink)' }} />
      </div>
      <div style={{ marginTop: 8 }}>
        <span className="eyebrow" style={{ color: 'var(--muted)' }}>{label}</span>
      </div>
    </div>
  );
}
