'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Analytics } from '@/lib/host-analytics';
import { Dropdown, I, thDay, useToast } from './_components/kit';
import { OverviewTab } from './_components/OverviewTab';
import { RoundsTab } from './_components/RoundsTab';
import { PeopleTab } from './_components/PeopleTab';
import { MoneyTab } from './_components/MoneyTab';
import { FeedbackTab } from './_components/FeedbackTab';
import { MarketingTab } from './_components/MarketingTab';
import './dash.css';

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
  { key: '7d', label: '7 วันล่าสุด', days: 7 },
  { key: '30d', label: '30 วันล่าสุด', days: 30 },
  { key: '90d', label: '3 เดือนล่าสุด', days: 90 },
  { key: '365d', label: '1 ปีล่าสุด', days: 365 },
  { key: 'custom', label: 'กำหนดเอง…', days: 0 },
] as const;
type RangeKey = (typeof RANGES)[number]['key'];

const thaiToday = (offsetDays = 0) => new Date(Date.now() + 7 * 3600000 - offsetDays * 86400000).toISOString().slice(0, 10);

/**
 * Host Dashboard v3 (Claude Design "Host Dashboard Desktop + Mobile"): a
 * greeting with two pill filters (activity, period), sticky underline tabs,
 * six tabs over one set of figures from /api/teacher/analytics. Every figure
 * compares with the window just before, never with other hosts.
 */
export default function HostDashboardPage() {
  const [tab, setTab] = useState<Tab>('overview');
  const [rangeKey, setRangeKey] = useState<RangeKey>('30d');
  const [custom, setCustom] = useState({ from: thaiToday(29), to: thaiToday() });
  const [activity, setActivity] = useState('');
  const [data, setData] = useState<Analytics | null>(null);
  const [error, setError] = useState(false);
  const [me, setMe] = useState<{ id: string; name: string } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [toast, say] = useToast();

  // ?tab= deep links (e.g. from the to-do list). Read after mount.
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
  const periodLabel = range.key === 'custom' ? `${thDay(custom.from)} – ${thDay(custom.to, true)}` : range.label;

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
    document.querySelector('.tdb-main')?.scrollTo({ top: 0, behavior: 'smooth' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const actOpts = [{ key: '', label: 'ทุกกิจกรรม' }, ...(data?.activityOptions || []).map((o) => ({ key: o.key, label: o.title }))];

  return (
    <div className="hx">
      <div className="hx-bg" aria-hidden>
        <i />
        <i />
      </div>

      <div className={`hx-head${menuOpen ? ' menu-open' : ''}`}>
        <div style={{ minWidth: 0 }}>
          <span className="hx-eyebrow">Host Dashboard</span>
          <h1 className="hx-h1">{me?.name ? `สวัสดี คุณ${me.name}` : 'แดชบอร์ด'}</h1>
          <p className="hx-lead">ตัวเลขนับเฉพาะกิจกรรมที่คุณเป็นผู้จัด และเทียบกับช่วงก่อนหน้าของคุณเอง</p>
        </div>
        <div className="hx-filters">
          <Dropdown
            label={actOpts.find((o) => o.key === activity)?.label || 'ทุกกิจกรรม'}
            icon={I.grid()}
            options={actOpts}
            value={activity}
            onPick={setActivity}
            onOpen={setMenuOpen}
            ariaLabel="กิจกรรม"
          />
          <Dropdown
            label={periodLabel}
            icon={I.cal()}
            options={RANGES.map((r) => ({ key: r.key, label: r.label }))}
            value={rangeKey}
            onPick={(k) => setRangeKey(k as RangeKey)}
            keepOpenOn="custom"
            onOpen={setMenuOpen}
            ariaLabel="ช่วงเวลา"
            extra={
              rangeKey === 'custom' && (
                <div className="hx-dd-dates">
                  <label>
                    ตั้งแต่
                    <input type="date" value={custom.from} max={custom.to} onChange={(e) => e.target.value && setCustom({ ...custom, from: e.target.value })} />
                  </label>
                  <label>
                    ถึง
                    <input type="date" value={custom.to} min={custom.from} max={thaiToday()} onChange={(e) => e.target.value && setCustom({ ...custom, to: e.target.value })} />
                  </label>
                </div>
              )
            }
          />
        </div>
      </div>

      <div className="hx-tabs">
        <nav aria-label="แท็บแดชบอร์ด">
          {TABS.map((t) => (
            <button key={t.key} type="button" className={`hx-tab${tab === t.key ? ' on' : ''}`} aria-current={tab === t.key ? 'page' : undefined} onClick={() => go(t.key)}>
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {error ? (
        <div className="hx-stack">
          <div className="hx-empty">
            โหลดข้อมูลไม่สำเร็จ ·{' '}
            <button type="button" className="hx-btn" onClick={load}>
              ลองใหม่
            </button>
          </div>
        </div>
      ) : !data ? (
        <DashSkeleton />
      ) : tab === 'overview' ? (
        <OverviewTab a={data} periodLabel={periodLabel} onTab={go} />
      ) : tab === 'rounds' ? (
        <RoundsTab a={data} />
      ) : tab === 'people' ? (
        <PeopleTab a={data} />
      ) : tab === 'money' ? (
        <MoneyTab a={data} say={say} />
      ) : tab === 'feedback' ? (
        <FeedbackTab a={data} />
      ) : (
        <MarketingTab a={data} hostId={me?.id || ''} activity={activity} onChanged={load} say={say} />
      )}
      {toast}
    </div>
  );
}

/** The page's shape while its numbers load, so nothing jumps on arrival. */
function DashSkeleton() {
  return (
    <div className="hx-stack" aria-hidden>
      <div className="hx-g g84">
        <div className="skel" style={{ height: 300, borderRadius: 26 }} />
        <div className="skel" style={{ height: 300, borderRadius: 26 }} />
      </div>
      <div className="hx-kpis">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="skel" style={{ height: 96, borderRadius: 18 }} />
        ))}
      </div>
    </div>
  );
}
