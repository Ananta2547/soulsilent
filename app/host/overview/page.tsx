'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Analytics } from '@/lib/host-analytics';
import { OverviewTab } from './_components/OverviewTab';
import { RoundsTab } from './_components/RoundsTab';
import { PeopleTab } from './_components/PeopleTab';
import { MoneyTab } from './_components/MoneyTab';
import { FeedbackTab } from './_components/FeedbackTab';
import { MarketingTab } from './_components/MarketingTab';

const TABS = [
  { key: 'overview', label: 'ภาพรวม' },
  { key: 'rounds', label: 'กิจกรรมและรอบ' },
  { key: 'people', label: 'ผู้เข้าร่วม' },
  { key: 'money', label: 'รายได้และการโอน' },
  { key: 'feedback', label: 'เสียงตอบรับ' },
  { key: 'marketing', label: 'การตลาด' },
] as const;
type Tab = (typeof TABS)[number]['key'];

const RANGES = [
  { key: '7d', label: '7 วัน', days: 7 },
  { key: '30d', label: '30 วัน', days: 30 },
  { key: '90d', label: '3 เดือน', days: 90 },
  { key: '365d', label: '1 ปี', days: 365 },
  { key: 'custom', label: 'กำหนดเอง', days: 0 },
] as const;

const thaiToday = (offsetDays = 0) => new Date(Date.now() + 7 * 3600000 - offsetDays * 86400000).toISOString().slice(0, 10);

/**
 * Host Dashboard (slide deck 10): six tabs over one set of figures from
 * /api/teacher/analytics. A time window and an activity filter sit above
 * every tab; every figure compares with the window just before, never with
 * other hosts.
 */
export default function HostDashboardPage() {
  const [tab, setTab] = useState<Tab>('overview');
  const [rangeKey, setRangeKey] = useState<(typeof RANGES)[number]['key']>('30d');
  const [custom, setCustom] = useState({ from: thaiToday(29), to: thaiToday() });
  const [activity, setActivity] = useState('');
  const [data, setData] = useState<Analytics | null>(null);
  const [error, setError] = useState(false);
  const [me, setMe] = useState<{ id: string; name: string } | null>(null);

  // ?tab= deep links (e.g. from the to-do bar). Read after mount.
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('tab');
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (t && TABS.some((x) => x.key === t)) setTab(t as Tab);
    fetch('/api/auth/me')
      .then((r) => r.json() as Promise<{ user?: { id: string; name?: string; nickname?: string } | null }>)
      .then((d) => d.user && setMe({ id: d.user.id, name: d.user.nickname || d.user.name || '' }))
      .catch(() => {});
  }, []);

  const range = RANGES.find((r) => r.key === rangeKey)!;
  const from = range.key === 'custom' ? custom.from : thaiToday(range.days - 1);
  const to = range.key === 'custom' ? custom.to : thaiToday();

  const load = useCallback(() => {
    const q = new URLSearchParams({ from, to });
    if (activity) q.set('activity', activity);
    fetch(`/api/teacher/analytics?${q}`)
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json() as Promise<Analytics>;
      })
      .then((d) => {
        setData(d);
        setError(false);
      })
      .catch(() => setError(true));
  }, [from, to, activity]);
  useEffect(() => {
    load();
  }, [load]);

  const go = (t: string) => {
    setTab(t as Tab);
    try {
      const u = new URL(window.location.href);
      u.searchParams.set('tab', t);
      window.history.replaceState(null, '', u);
    } catch {}
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div>
      <div className="tdb-head" style={{ marginBottom: 18 }}>
        <div>
          <span className="tdb-eyebrow">Host Dashboard</span>
          <h1 className="tdb-h1">{me?.name ? `สวัสดี คุณ${me.name}` : 'ภาพรวม.'}</h1>
          <p className="tdb-lead">ตัวเลขทั้งหมดนับเฉพาะกิจกรรมที่คุณเป็นผู้จัด และเทียบกับช่วงก่อนหน้าของคุณเอง ไม่เทียบกับผู้จัดรายอื่น</p>
        </div>
      </div>

      <div className="hd-filters">
        <div className="tdb-seg tdb-range" role="group" aria-label="ช่วงเวลา">
          {RANGES.map((r) => (
            <button key={r.key} type="button" className={rangeKey === r.key ? 'on' : ''} aria-pressed={rangeKey === r.key} onClick={() => setRangeKey(r.key)}>
              {r.label}
            </button>
          ))}
        </div>
        {rangeKey === 'custom' && (
          <>
            <input type="date" value={custom.from} max={custom.to} onChange={(e) => e.target.value && setCustom({ ...custom, from: e.target.value })} aria-label="ตั้งแต่" />
            <span aria-hidden>–</span>
            <input type="date" value={custom.to} min={custom.from} max={thaiToday()} onChange={(e) => e.target.value && setCustom({ ...custom, to: e.target.value })} aria-label="ถึง" />
          </>
        )}
        <select value={activity} onChange={(e) => setActivity(e.target.value)} aria-label="กิจกรรม">
          <option value="">ทุกกิจกรรม</option>
          {(data?.activityOptions || []).map((o) => (
            <option key={o.key} value={o.key}>
              {o.title}
            </option>
          ))}
        </select>
      </div>

      <nav className="hd-tabs" aria-label="แท็บแดชบอร์ด">
        {TABS.map((t) => (
          <button key={t.key} type="button" className={tab === t.key ? 'on' : ''} aria-current={tab === t.key ? 'page' : undefined} onClick={() => go(t.key)}>
            {t.label}
          </button>
        ))}
      </nav>

      {error ? (
        <div className="tdb-dashed">
          โหลดข้อมูลไม่สำเร็จ ·{' '}
          <button type="button" className="hd-btn" onClick={load}>
            ลองใหม่
          </button>
        </div>
      ) : !data ? (
        <DashSkeleton />
      ) : tab === 'overview' ? (
        <OverviewTab a={data} onTab={go} />
      ) : tab === 'rounds' ? (
        <RoundsTab a={data} />
      ) : tab === 'people' ? (
        <PeopleTab a={data} />
      ) : tab === 'money' ? (
        <MoneyTab a={data} />
      ) : tab === 'feedback' ? (
        <FeedbackTab a={data} />
      ) : (
        <MarketingTab a={data} hostId={me?.id || ''} activity={activity} onChanged={load} />
      )}
    </div>
  );
}

/** The page's shape while its numbers load, so nothing jumps on arrival. */
function DashSkeleton() {
  return (
    <div aria-hidden>
      <div className="hd-cards">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="hd-card">
            <div className="skel" style={{ height: 11, width: '60%', marginBottom: 8 }} />
            <div className="skel" style={{ height: 24, width: '70%', marginBottom: 6 }} />
            <div className="skel" style={{ height: 11, width: '40%' }} />
          </div>
        ))}
      </div>
      <div className="hd-panel">
        <div className="skel" style={{ height: 17, width: 180, marginBottom: 16 }} />
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 150 }}>
          {[38, 62, 30, 84, 46, 70, 26, 58, 92, 44, 66, 34].map((h, i) => (
            <div key={i} className="skel" style={{ flex: 1, height: `${h}%` }} />
          ))}
        </div>
      </div>
    </div>
  );
}
