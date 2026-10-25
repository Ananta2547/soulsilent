'use client';

import { useCallback, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import type { Analytics } from '@/lib/host-analytics';
import { SOURCE_LABEL, type Source } from '@/lib/attribution';
import { Card, Dropdown, Empty, HBars, I, PAL, Sheet, Stack100, baht, thDay } from './kit';

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
const NO_UTM = { utm_source: '', utm_medium: '', utm_campaign: '' };

/** Where bookings come from, the host's own links (with QR), and the
 *  one-page report for sponsors. Creating either opens a sheet. */
export function MarketingTab({ a, hostId, activity, onChanged, say }: { a: Analytics; hostId: string; activity: string; onChanged: () => void; say: (m: string) => void }) {
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
  const targetOf = (k: string) => (k ? (k.startsWith('w:') ? k : `m:${k}`) : null);

  // New link sheet
  const [linkOpen, setLinkOpen] = useState(false);
  const [label, setLabel] = useState('');
  const [target, setTarget] = useState('');
  const [withUtm, setWithUtm] = useState(false);
  const [utm, setUtm] = useState(NO_UTM);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [qr, setQr] = useState<{ id: string; src: string } | null>(null);
  const closeLink = useCallback(() => setLinkOpen(false), []);
  const openLink = () => {
    setLabel('');
    setTarget('');
    setWithUtm(false);
    setUtm(NO_UTM);
    setMsg(null);
    setLinkOpen(true);
  };

  async function createLink() {
    setBusy(true);
    setMsg(null);
    const r = await fetch('/api/teacher/links', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label, target: targetOf(target), ...(withUtm ? utm : NO_UTM) }),
    });
    const d = (await r.json()) as { error?: string };
    setBusy(false);
    if (!r.ok) return setMsg(d.error || 'สร้างลิงก์ไม่สำเร็จ');
    setLinkOpen(false);
    onChanged();
    say('สร้างลิงก์แล้ว');
  }
  async function toggle(l: Link) {
    await fetch('/api/teacher/links', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: l.id, active: !l.active }) });
    onChanged();
    say(l.active ? 'ปิดลิงก์แล้ว' : 'เปิดลิงก์แล้ว');
  }
  async function copy(l: Link) {
    try {
      await navigator.clipboard.writeText(urlOf(l));
      say('คัดลอกลิงก์แล้ว');
    } catch {}
  }
  async function showQr(l: Link) {
    if (qr?.id === l.id) return setQr(null);
    setQr({ id: l.id, src: await QRCode.toDataURL(urlOf(l), { width: 360, margin: 1 }) });
  }

  // Sponsor report sheet
  const [reports, setReports] = useState<Report[] | null>(null);
  const [repOpen, setRepOpen] = useState(false);
  const [pick, setPick] = useState<string[]>(['participants', 'repeat90', 'fill', 'csat', 'rounds']);
  const [intro, setIntro] = useState('');
  const [rmsg, setRmsg] = useState<string | null>(null);
  const closeRep = useCallback(() => setRepOpen(false), []);
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
    setBusy(true);
    const r = await fetch('/api/teacher/reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: a.range.from, to: a.range.to, activity: activity || null, show: pick, intro }),
    });
    const d = (await r.json()) as { id?: string; error?: string };
    setBusy(false);
    if (!r.ok || !d.id) return setRmsg(d.error || 'สร้างรายงานไม่สำเร็จ');
    setRepOpen(false);
    loadReports();
    say('สร้างรายงานแล้ว');
    window.open(`/r/${d.id}`, '_blank', 'noopener');
  }
  async function revoke(id: string) {
    await fetch('/api/teacher/reports', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
    loadReports();
    say('ยกเลิกรายงานแล้ว');
  }

  const targetOpts = [{ key: '', label: 'หน้าโปรไฟล์ของฉัน' }, ...a.activityOptions.map((o) => ({ key: o.key, label: o.title }))];
  const preview = decodeURIComponent(urlOf({ id: '…', target: targetOf(target), ...(withUtm ? utm : NO_UTM) }));

  return (
    <div className="hx-stack">
      <div className="hx-g g11">
        <Card title="การจองมาจากไหน" sub="การจองที่ชำระในช่วงนี้ แยกตามแหล่งที่มา">
          <Stack100
            items={mk.sources.map((s, i) => ({
              label: s.source === 'unknown' ? 'ก่อนเริ่มเก็บข้อมูล' : SOURCE_LABEL[s.source as Source] || s.source,
              value: s.n,
              color: PAL[i % PAL.length],
            }))}
            noneText="ยังไม่มีการจองในช่วงนี้"
          />
        </Card>
        <Card title="แคมเปญ (utm_campaign)" sub="จากลิงก์ที่ติดแท็ก UTM" delay={70}>
          {mk.campaigns.length === 0 ? <Empty>ยังไม่มีการจองจากลิงก์ที่ติดแท็กแคมเปญ</Empty> : <HBars rows={mk.campaigns.map((c) => ({ label: c.campaign, value: c.n }))} />}
        </Card>
      </div>

      <Card
        title="ลิงก์จองของคุณ"
        sub="แชร์ในโพสต์ ไลน์ หรือพิมพ์ QR — การจองจากลิงก์นับเป็น 'ลิงก์ของคุณ' (จำไว้ 30 วัน)"
        delay={140}
        right={
          <button type="button" className="hx-btn ink" onClick={openLink}>
            {I.plus()}สร้างลิงก์
          </button>
        }
      >
        {mk.links.length === 0 ? (
          <Empty>ยังไม่มีลิงก์</Empty>
        ) : (
          <div className="hx-links">
            {mk.links.map((l) => (
              <div key={l.id} className={`hx-link${l.active ? '' : ' off'}`}>
                <div className="hx-link-top">
                  <div className="main">
                    <div>
                      <b>{l.label}</b>
                      <span className={`st ${l.active ? 'on' : 'off'}`}>{l.active ? 'เปิดอยู่' : 'ปิดอยู่'}</span>
                    </div>
                    <div className="url">{urlOf(l).replace(/^https?:\/\//, '')}</div>
                    <div className="stats">
                      เข้า {l.clicks} · จอง {l.bookings} · {baht(l.sales)}
                    </div>
                  </div>
                  <div className="hx-link-acts">
                    <button type="button" className="hx-btn icon white" onClick={() => copy(l)} aria-label="คัดลอกลิงก์" title="คัดลอกลิงก์">
                      {I.copy()}
                    </button>
                    <button type="button" className="hx-btn icon white" onClick={() => showQr(l)} aria-label="QR" title="QR">
                      {I.qr()}
                    </button>
                    <button type="button" className="hx-btn icon white" onClick={() => toggle(l)} aria-label={l.active ? 'ปิดลิงก์' : 'เปิดลิงก์'} title={l.active ? 'ปิดลิงก์' : 'เปิดลิงก์'}>
                      {I.power()}
                    </button>
                  </div>
                </div>
                {qr?.id === l.id && (
                  <div className="hx-link-qr">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={qr.src} alt={`QR ${l.label}`} />
                    <a className="hx-btn white" href={qr.src} download={`qr-${l.label}.png`}>
                      {I.down()}ดาวน์โหลด QR
                    </a>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card
        title="รายงานสำหรับสปอนเซอร์และพาร์ตเนอร์"
        sub="Organizer Impact Summary หน้าเดียว · ตัวเลขดึงจากระบบ แก้ไม่ได้ · มี QR ให้ตรวจฉบับจริง"
        delay={210}
        right={
          <button type="button" className="hx-btn ink" onClick={() => (setRmsg(null), setRepOpen(true))}>
            {I.plus()}สร้างรายงาน
          </button>
        }
      >
        {!reports || reports.length === 0 ? (
          <Empty>ยังไม่มีรายงาน</Empty>
        ) : (
          <div className="hx-rows">
            {reports.map((r) => (
              <div key={r.id} className="hx-row" style={{ opacity: r.live ? 1 : 0.5, flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                  <div className="main">
                    {thDay(r.period_from, true)} – {thDay(r.period_to, true)}
                    {r.activity_title ? ` · ${r.activity_title}` : ''}
                  </div>
                  <div className="sub">{r.live ? `ใช้ได้ถึง ${thDay(r.expires_at.slice(0, 10), true)}` : r.revoked ? 'ยกเลิกแล้ว' : 'หมดอายุ'}</div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <a className="hx-btn white" href={`/r/${r.id}`} target="_blank" rel="noopener noreferrer">
                    เปิด
                  </a>
                  {r.live ? (
                    <button type="button" className="hx-btn danger" onClick={() => revoke(r.id)}>
                      ยกเลิก
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {linkOpen && (
        <Sheet
          title="สร้างลิงก์จอง"
          onClose={closeLink}
          footer={
            <>
              <button type="button" className="hx-btn" onClick={closeLink}>
                ยกเลิก
              </button>
              <button type="button" className="hx-btn ink" disabled={busy || !label.trim()} onClick={createLink}>
                สร้างลิงก์
              </button>
            </>
          }
        >
          <label className="hx-field">
            ชื่อลิงก์
            <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="เช่น โพสต์เฟซบุ๊ก ต.ค." autoFocus />
          </label>
          <div className="hx-field">
            เปิดไปที่
            <Dropdown label={targetOpts.find((o) => o.key === target)?.label || 'หน้าโปรไฟล์ของฉัน'} options={targetOpts} value={target} onPick={setTarget} ariaLabel="เปิดไปที่" />
          </div>
          <button type="button" className="hx-link-btn" onClick={() => setWithUtm(!withUtm)} aria-expanded={withUtm}>
            {withUtm ? '− ' : '+ '}ติดแท็ก UTM (ไม่บังคับ)
          </button>
          {withUtm && (
            <>
              <label className="hx-field">
                utm_source
                <input value={utm.utm_source} onChange={(e) => setUtm({ ...utm, utm_source: e.target.value })} placeholder="facebook" />
              </label>
              <label className="hx-field">
                utm_campaign
                <input value={utm.utm_campaign} onChange={(e) => setUtm({ ...utm, utm_campaign: e.target.value })} placeholder="oct-promo" />
              </label>
            </>
          )}
          <div className="hx-preview">
            <span className="hx-label">ตัวอย่างลิงก์</span>
            <div>{preview.replace(/^https?:\/\//, '')}</div>
          </div>
          {msg && <p className="hx-err">{msg}</p>}
        </Sheet>
      )}

      {repOpen && (
        <Sheet
          title="สร้างรายงาน"
          onClose={closeRep}
          footer={
            <>
              <button type="button" className="hx-btn" onClick={closeRep}>
                ยกเลิก
              </button>
              <button type="button" className="hx-btn ink" disabled={busy || !pick.length} onClick={makeReport}>
                สร้างและเปิดรายงาน
              </button>
            </>
          }
        >
          <div className="hx-preview">
            <span className="hx-label">ช่วงข้อมูล</span>
            <div>
              {thDay(a.range.from, true)} – {thDay(a.range.to, true)}
              {activity ? ` · ${a.activityOptions.find((o) => o.key === activity)?.title || 'กิจกรรมที่เลือก'}` : ' · ทุกกิจกรรม'}
            </div>
          </div>
          <div className="hx-field">
            ตัวเลขที่จะแสดง
            <div className="hx-figs">
              {REPORT_FIGURES.map((f) => {
                const on = pick.includes(f.key);
                return (
                  <button key={f.key} type="button" className={`hx-fig${on ? ' on' : ''}`} aria-pressed={on} onClick={() => setPick(on ? pick.filter((k) => k !== f.key) : [...pick, f.key])}>
                    {on && I.check(13)}
                    {f.label}
                  </button>
                );
              })}
            </div>
          </div>
          <label className="hx-field">
            ข้อความแนะนำตัว (ไม่บังคับ)
            <textarea value={intro} onChange={(e) => setIntro(e.target.value)} maxLength={400} placeholder="เช่น สตูดิโอเซรามิกในย่านอารีย์ เปิดสอนมาแล้ว 3 ปี" />
          </label>
          <p className="hx-note">ตัวเลขที่มาจากคนน้อยกว่า 5 คนจะไม่ถูกใส่ในรายงาน · รายงานหมดอายุใน 180 วัน หรือกดยกเลิกได้</p>
          {rmsg && <p className="hx-err">{rmsg}</p>}
        </Sheet>
      )}
    </div>
  );
}
