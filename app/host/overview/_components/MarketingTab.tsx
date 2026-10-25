'use client';

import { useCallback, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import type { Analytics } from '@/lib/host-analytics';
import { SOURCE_LABEL, type Source } from '@/lib/attribution';
import { HBars, Panel, baht, num, thDay } from './kit';

type Link = Analytics['marketing']['links'][number];
type Report = { id: string; period_from: string; period_to: string; activity_title: string | null; created_at: string; expires_at: string; live: number; revoked: number };

const REPORT_FIGURES: { key: string; label: string }[] = [
  { key: 'views', label: 'ยอดเข้าชมหน้ากิจกรรม' },
  { key: 'participants', label: 'ผู้เข้าร่วมทั้งหมด' },
  { key: 'repeat90', label: 'กลับมาซ้ำใน 90 วัน' },
  { key: 'fill', label: 'อัตราเต็มรอบเฉลี่ย' },
  { key: 'soldOutDaysBefore', label: 'เต็มก่อนวันจัดเฉลี่ย' },
  { key: 'csat', label: 'ความพอใจ (AAR)' },
  { key: 'responseRate', label: 'อัตราตอบแบบสอบถาม' },
  { key: 'rounds', label: 'จำนวนรอบที่จัด' },
  { key: 'ageBand', label: 'กลุ่มอายุหลัก' },
];

/** Where bookings come from, the host's own links (with QR), and the
 *  one-page report for sponsors. */
export function MarketingTab({ a, hostId, activity, onChanged }: { a: Analytics; hostId: string; activity: string; onChanged: () => void }) {
  const mk = a.marketing;
  const origin = typeof window === 'undefined' ? '' : window.location.origin;
  const urlOf = (l: Pick<Link, 'id' | 'target' | 'utm_source' | 'utm_medium' | 'utm_campaign'>) => {
    const path = !l.target ? `/hosts/${hostId}` : l.target.startsWith('w:') ? `/journeys/${l.target.slice(2)}` : `/journey-info/${l.target.slice(2)}`;
    const q = new URLSearchParams({ ref: l.id });
    if (l.utm_source) q.set('utm_source', l.utm_source);
    if (l.utm_medium) q.set('utm_medium', l.utm_medium);
    if (l.utm_campaign) q.set('utm_campaign', l.utm_campaign);
    return `${origin}${path}?${q}`;
  };

  // New link form
  const [label, setLabel] = useState('');
  const [target, setTarget] = useState('');
  const [utm, setUtm] = useState({ utm_source: '', utm_medium: '', utm_campaign: '' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [qr, setQr] = useState<{ id: string; src: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  async function createLink() {
    setBusy(true);
    setMsg(null);
    const r = await fetch('/api/teacher/links', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label, target: target ? (target.startsWith('w:') ? target : `m:${target}`) : null, ...utm }),
    });
    const d = (await r.json()) as { error?: string };
    setBusy(false);
    if (!r.ok) return setMsg(d.error || 'สร้างลิงก์ไม่สำเร็จ');
    setLabel('');
    setUtm({ utm_source: '', utm_medium: '', utm_campaign: '' });
    onChanged();
  }
  async function toggle(l: Link) {
    await fetch('/api/teacher/links', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: l.id, active: !l.active }) });
    onChanged();
  }
  async function copy(l: Link) {
    try {
      await navigator.clipboard.writeText(urlOf(l));
      setCopied(l.id);
      setTimeout(() => setCopied(null), 1600);
    } catch {}
  }
  async function showQr(l: Link) {
    if (qr?.id === l.id) return setQr(null);
    setQr({ id: l.id, src: await QRCode.toDataURL(urlOf(l), { width: 360, margin: 1 }) });
  }

  // Sponsor report
  const [reports, setReports] = useState<Report[] | null>(null);
  const [pick, setPick] = useState<string[]>(['participants', 'repeat90', 'fill', 'csat', 'rounds']);
  const [intro, setIntro] = useState('');
  const [rmsg, setRmsg] = useState<string | null>(null);
  const loadReports = useCallback(() => {
    fetch('/api/teacher/reports')
      .then(async (r) => ((await r.json()) as { items?: Report[] }).items || [])
      .then(setReports)
      .catch(() => setReports([]));
  }, []);
  useEffect(() => {
    loadReports();
  }, [loadReports]);
  async function makeReport() {
    setRmsg(null);
    const r = await fetch('/api/teacher/reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: a.range.from, to: a.range.to, activity: activity || null, show: pick, intro }),
    });
    const d = (await r.json()) as { id?: string; error?: string };
    if (!r.ok || !d.id) return setRmsg(d.error || 'สร้างรายงานไม่สำเร็จ');
    loadReports();
    window.open(`/r/${d.id}`, '_blank', 'noopener');
  }
  async function revoke(id: string) {
    await fetch('/api/teacher/reports', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
    loadReports();
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="hd-grid2 even">
        <Panel title="การจองมาจากไหน" sub="การจองที่ชำระในช่วงนี้ แยกตามแหล่งที่มา">
          <HBars
            rows={mk.sources.map((s) => ({
              label: s.source === 'unknown' ? 'ก่อนเริ่มเก็บข้อมูล' : SOURCE_LABEL[s.source as Source] || s.source,
              value: s.n,
              note: s.share == null ? undefined : `${num(s.share, 0)}%`,
            }))}
          />
        </Panel>
        <Panel title="แคมเปญ (utm_campaign)" sub="จากลิงก์ที่ติดแท็ก UTM">
          {mk.campaigns.length === 0 ? <p className="hd-few">ยังไม่มีการจองจากลิงก์ที่ติดแท็กแคมเปญ</p> : <HBars rows={mk.campaigns.map((c) => ({ label: c.campaign, value: c.n }))} />}
        </Panel>
      </div>

      <Panel title="ลิงก์จองของคุณ" sub="แชร์ลิงก์นี้ในโพสต์ ไลน์ หรือพิมพ์ QR — การจองที่มาจากลิงก์จะนับเป็น 'ลิงก์ของคุณ' (จำไว้ 30 วัน)">
        <div className="hd-form">
          <label>
            ชื่อลิงก์
            <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="เช่น โพสต์เฟซบุ๊ก ต.ค." />
          </label>
          <label>
            เปิดไปที่
            <select value={target} onChange={(e) => setTarget(e.target.value)}>
              <option value="">หน้าโปรไฟล์ของฉัน</option>
              {a.activityOptions.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            utm_source (ไม่บังคับ)
            <input value={utm.utm_source} onChange={(e) => setUtm({ ...utm, utm_source: e.target.value })} placeholder="facebook" />
          </label>
          <label>
            utm_campaign (ไม่บังคับ)
            <input value={utm.utm_campaign} onChange={(e) => setUtm({ ...utm, utm_campaign: e.target.value })} placeholder="oct-promo" />
          </label>
          <button type="button" className="hd-btn teal" style={{ height: 38 }} disabled={busy || !label.trim()} onClick={createLink}>
            + สร้างลิงก์
          </button>
        </div>
        {msg && <p style={{ color: '#a3261a', fontSize: 13 }}>{msg}</p>}
        <div style={{ marginTop: 14 }}>
          {mk.links.length === 0 && <p className="hd-few">ยังไม่มีลิงก์</p>}
          {mk.links.map((l) => (
            <div key={l.id} style={{ opacity: l.active ? 1 : 0.5 }}>
              <div className="hd-row" style={{ flexWrap: 'wrap' }}>
                <div className="grow" style={{ minWidth: 200 }}>
                  <div>
                    <b>{l.label}</b>
                    {!l.active && <span className="hd-few"> · ปิดอยู่</span>}
                  </div>
                  <div className="dim" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {urlOf(l).replace(/^https?:\/\//, '')}
                  </div>
                </div>
                <span className="dim">
                  เข้า {l.clicks} · จอง {l.bookings} · {baht(l.sales)}
                </span>
                <button type="button" className="hd-btn" onClick={() => copy(l)}>
                  {copied === l.id ? 'คัดลอกแล้ว ✓' : 'คัดลอก'}
                </button>
                <button type="button" className="hd-btn" onClick={() => showQr(l)}>
                  QR
                </button>
                <button type="button" className="hd-btn" onClick={() => toggle(l)}>
                  {l.active ? 'ปิด' : 'เปิด'}
                </button>
              </div>
              {qr?.id === l.id && (
                <div style={{ display: 'flex', gap: 14, alignItems: 'center', padding: '6px 0 12px' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={qr.src} alt={`QR ${l.label}`} className="hd-qr" />
                  <a className="hd-btn" href={qr.src} download={`qr-${l.label}.png`}>
                    ดาวน์โหลด QR
                  </a>
                </div>
              )}
            </div>
          ))}
        </div>
      </Panel>

      <Panel
        title="รายงานสำหรับสปอนเซอร์และพาร์ตเนอร์"
        sub={`Organizer Impact Summary หน้าเดียว จากช่วง ${thDay(a.range.from, true)} – ${thDay(a.range.to, true)}${activity ? ' · เฉพาะกิจกรรมที่เลือก' : ''} · ตัวเลขดึงจากระบบ แก้ไม่ได้ · มี QR ให้ตรวจฉบับจริง`}
      >
        <div className="hd-checks">
          {REPORT_FIGURES.map((f) => (
            <label key={f.key}>
              <input type="checkbox" checked={pick.includes(f.key)} onChange={(e) => setPick(e.target.checked ? [...pick, f.key] : pick.filter((k) => k !== f.key))} />
              {f.label}
            </label>
          ))}
        </div>
        <div className="hd-form" style={{ gridTemplateColumns: '1fr auto' }}>
          <label>
            ข้อความแนะนำตัว (ไม่บังคับ)
            <textarea value={intro} onChange={(e) => setIntro(e.target.value)} maxLength={400} placeholder="เช่น สตูดิโอเซรามิกในย่านอารีย์ เปิดสอนมาแล้ว 3 ปี" />
          </label>
          <button type="button" className="hd-btn teal" style={{ height: 38 }} onClick={makeReport} disabled={!pick.length}>
            สร้างรายงาน
          </button>
        </div>
        {rmsg && <p style={{ color: '#a3261a', fontSize: 13 }}>{rmsg}</p>}
        <p className="hd-few">ตัวเลขที่มาจากคนน้อยกว่า 5 คนจะไม่ถูกใส่ในรายงาน · รายงานหมดอายุใน 180 วัน หรือกดยกเลิกได้</p>
        {reports && reports.length > 0 && (
          <div style={{ marginTop: 8 }}>
            {reports.map((r) => (
              <div key={r.id} className="hd-row" style={{ opacity: r.live ? 1 : 0.5 }}>
                <span className="grow">
                  {thDay(r.period_from, true)} – {thDay(r.period_to, true)}
                  {r.activity_title ? ` · ${r.activity_title}` : ''}
                </span>
                <span className="dim">{r.live ? `ใช้ได้ถึง ${thDay(r.expires_at.slice(0, 10), true)}` : r.revoked ? 'ยกเลิกแล้ว' : 'หมดอายุ'}</span>
                <a className="hd-btn" href={`/r/${r.id}`} target="_blank" rel="noopener noreferrer">
                  เปิด
                </a>
                {r.live ? (
                  <button type="button" className="hd-btn" onClick={() => revoke(r.id)}>
                    ยกเลิก
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
