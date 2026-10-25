'use client';

import { useCallback, useEffect, useState } from 'react';
import type { AdminAnalytics } from '@/lib/admin-analytics';
import { Dropdown, I, Sheet, thDay, useToast } from '@/components/dashboard/kit';
import { OverviewTab } from './_components/OverviewTab';
import { MoneyTab } from './_components/MoneyTab';
import { HostsTab } from './_components/HostsTab';
import { PeopleTab } from './_components/PeopleTab';
import { ActivitiesTab } from './_components/ActivitiesTab';
import { QualityTab } from './_components/QualityTab';
import '@/components/dashboard/dash.css';

const TABS = [
  { key: 'overview', label: 'ภาพรวม' },
  { key: 'money', label: 'การเงิน' },
  { key: 'hosts', label: 'ผู้จัด' },
  { key: 'people', label: 'ผู้เข้าร่วม' },
  { key: 'activities', label: 'กิจกรรม' },
  { key: 'quality', label: 'คุณภาพและระบบ' },
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
 * Admin Insights: the whole platform in six tabs — business overview, money
 * (P&L, payables, ledger), hosts, participants, activities, quality and
 * system health — over one set of figures from /api/admin/insights. Built
 * from the Host Dashboard v3 pieces (components/dashboard).
 */
export default function AdminInsightsPage() {
  const [tab, setTab] = useState<Tab>('overview');
  const [rangeKey, setRangeKey] = useState<RangeKey>('30d');
  const [custom, setCustom] = useState({ from: thaiToday(29), to: thaiToday() });
  const [data, setData] = useState<AdminAnalytics | null>(null);
  const [error, setError] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toast, say] = useToast();

  // ?tab= and ?settings=1 deep links (alerts link here). Read after mount.
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const t = sp.get('tab');
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (t && TABS.some((x) => x.key === t)) setTab(t as Tab);
    if (sp.get('settings') === '1') setSettingsOpen(true);
  }, []);

  const range = RANGES.find((r) => r.key === rangeKey)!;
  const from = range.key === 'custom' ? custom.from : thaiToday(range.days - 1);
  const to = range.key === 'custom' ? custom.to : thaiToday();
  const periodLabel = range.key === 'custom' ? `${thDay(custom.from)} – ${thDay(custom.to, true)}` : range.label;

  const load = useCallback(() => {
    fetch(`/api/admin/insights?${new URLSearchParams({ from, to })}`)
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json() as Promise<AdminAnalytics>;
      })
      .then((d) => {
        setData(d);
        setError(false);
      })
      .catch(() => setError(true));
  }, [from, to]);
  useEffect(() => {
    load();
  }, [load]);

  const go = (t: string) => {
    setTab(t as Tab);
    try {
      const u = new URL(window.location.href);
      u.searchParams.set('tab', t);
      u.searchParams.delete('settings');
      window.history.replaceState(null, '', u);
    } catch {}
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="hx hx-admin">
      <div className="hx-bg" aria-hidden>
        <i />
        <i />
      </div>

      <div className={`hx-head${menuOpen ? ' menu-open' : ''}`}>
        <div style={{ minWidth: 0 }}>
          <span className="hx-eyebrow">Admin Insights</span>
          <h1 className="hx-h1">ข้อมูลเชิงลึก</h1>
          <p className="hx-lead">ทั้งแพลตฟอร์ม เทียบกับช่วงก่อนหน้าที่ยาวเท่ากัน · ค่า Beam เป็นค่าประมาณจากอัตราที่ตั้งไว้</p>
        </div>
        <div className="hx-filters">
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
          <button type="button" className="hx-btn white" onClick={() => setSettingsOpen(true)}>
            ตั้งค่า Beam
          </button>
        </div>
      </div>

      <div className="hx-tabs">
        <nav aria-label="แท็บข้อมูลเชิงลึก">
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
        <div className="hx-stack" aria-hidden>
          <div className="hx-g g84">
            <div className="skel" style={{ height: 300, borderRadius: 26 }} />
            <div className="skel" style={{ height: 300, borderRadius: 26 }} />
          </div>
        </div>
      ) : tab === 'overview' ? (
        <OverviewTab a={data} periodLabel={periodLabel} onTab={go} onSettings={() => setSettingsOpen(true)} />
      ) : tab === 'money' ? (
        <MoneyTab a={data} say={say} />
      ) : tab === 'hosts' ? (
        <HostsTab a={data} say={say} />
      ) : tab === 'people' ? (
        <PeopleTab a={data} />
      ) : tab === 'activities' ? (
        <ActivitiesTab a={data} />
      ) : (
        <QualityTab a={data} />
      )}

      {settingsOpen && (
        <BeamSettings
          onClose={() => setSettingsOpen(false)}
          onSaved={() => {
            setSettingsOpen(false);
            say('บันทึกอัตราค่า Beam แล้ว');
            load();
          }}
        />
      )}
      {toast}
    </div>
  );
}

/** Beam's fee rates, used to estimate what the gateway took. */
function BeamSettings({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [v, setV] = useState<{ beam_fee_qr: string; beam_fee_card: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    fetch('/api/admin/settings')
      .then((r) => r.json() as Promise<{ beam_fee_qr: string; beam_fee_card: string }>)
      .then(setV)
      .catch(() => setV({ beam_fee_qr: '', beam_fee_card: '' }));
  }, []);
  async function save() {
    if (!v) return;
    setBusy(true);
    setMsg(null);
    const r = await fetch('/api/admin/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(v) });
    const d = (await r.json()) as { error?: string };
    setBusy(false);
    if (!r.ok) return setMsg(d.error || 'บันทึกไม่สำเร็จ');
    onSaved();
  }
  return (
    <Sheet
      title="ค่าธรรมเนียม Beam"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="hx-btn" onClick={onClose}>
            ยกเลิก
          </button>
          <button type="button" className="hx-btn ink" disabled={busy || !v} onClick={save}>
            บันทึก
          </button>
        </>
      }
    >
      <p className="hx-note">Beam ไม่ส่งค่าธรรมเนียมรายรายการมาให้ ระบบจึงประมาณจาก % ที่ตั้งไว้ × ยอดที่ผู้จองจ่าย ใช้กับทุกช่วงเวลาย้อนหลัง · เว้นว่าง = ยังไม่หักค่า Beam</p>
      <label className="hx-field">
        PromptPay QR (%)
        <input inputMode="decimal" value={v?.beam_fee_qr ?? ''} onChange={(e) => v && setV({ ...v, beam_fee_qr: e.target.value })} placeholder="เช่น 1" disabled={!v} />
      </label>
      <label className="hx-field">
        บัตร / ช่องทางอื่นของ Beam (%)
        <input inputMode="decimal" value={v?.beam_fee_card ?? ''} onChange={(e) => v && setV({ ...v, beam_fee_card: e.target.value })} placeholder="เช่น 3.65" disabled={!v} />
      </label>
      {msg && <p className="hx-err">{msg}</p>}
    </Sheet>
  );
}
