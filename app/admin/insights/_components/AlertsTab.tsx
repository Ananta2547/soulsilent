'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { AdminAlert, AdminAnalytics, AlertGroup, AlertTone } from '@/lib/admin-analytics';
import { Card, Empty, Seg, thDay } from '@/components/dashboard/kit';
import { LineNudge } from '@/components/pwa/NotifyPrefs';
import { FOCUS_KEY, type FocusNote } from '@/components/admin/AlertFocus';

const GROUPS: [AlertGroup, string, string][] = [
  ['money', 'เงินและบัญชี', 'คืนเงิน · ค้างโอน · เงินเข้าผิดปกติ · บัญชีไม่ครบ'],
  ['rounds', 'รอบกิจกรรม', 'รอบที่ยกเลิก · ยังไม่เช็คชื่อ · ที่ว่างกับคนรอสำรอง'],
  ['users', 'บัญชีผู้ใช้', 'แก้ชื่อ / วันเกิดบ่อย · ขอลบบัญชี · ยังไม่ยืนยันอีเมล'],
  ['quality', 'คุณภาพและผู้จัด', 'คะแนนต่ำ · ผู้จัดยกเลิกบ่อย · ใบสมัครค้าง'],
];
const TONE_LABEL: Record<AlertTone, string> = { bad: 'ด่วน', warn: 'ควรดู', info: 'ข้อมูล' };
type Filter = 'all' | AlertTone;

/** The alert's page, with ?focus= so the row it is about gets highlighted. */
function hrefOf(x: AdminAlert) {
  if (!x.focus) return x.href;
  return `${x.href}${x.href.includes('?') ? '&' : '?'}focus=${encodeURIComponent(x.focus)}`;
}
/** Hand the alert's words to the banner on the next page (AlertFocus). */
function remember(x: AdminAlert) {
  if (!x.focus) return;
  const note: FocusNote = { focus: x.focus, title: x.title, detail: x.detail, todo: x.todo };
  try {
    sessionStorage.setItem(FOCUS_KEY, JSON.stringify(note));
  } catch {}
}

/** Every open alert, by group, each with where to deal with it and a
 *  "รับทราบ" that hides it for every admin until its state moves on. */
export function AlertsTab({ a, onChanged, say }: { a: AdminAnalytics; onChanged: () => void; say: (m: string) => void }) {
  const al = a.alerts;
  const [filter, setFilter] = useState<Filter>('all');
  const [showAcked, setShowAcked] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const shown = al.open.filter((x) => filter === 'all' || x.tone === filter);

  async function ack(x: AdminAlert) {
    setBusy(x.key);
    const r = await fetch('/api/admin/alerts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: x.key }) });
    setBusy(null);
    if (!r.ok) return say('บันทึกไม่สำเร็จ');
    say('รับทราบแล้ว');
    onChanged();
  }
  async function checkCards() {
    setBusy('line-check');
    try {
      const r = await fetch('/api/admin/line-samples');
      const d = (await r.json()) as { error?: string; total?: number; bad?: number; results?: { name: string; ok: boolean; detail: string | null }[] };
      if (!r.ok) return say(d.error || 'ตรวจไม่สำเร็จ');
      const bad = (d.results || []).filter((x) => !x.ok);
      if (bad.length) console.warn('[line cards]', bad);
      say(bad.length ? `การ์ดผิด ${bad.length} แบบ: ${bad.map((x) => x.name).join(', ')}` : `การ์ดทั้ง ${d.total} แบบผ่านการตรวจของ LINE`);
    } finally {
      setBusy(null);
    }
  }
  async function sendCards() {
    setBusy('line-send');
    try {
      const r = await fetch('/api/admin/line-samples', { method: 'POST' });
      const d = (await r.json()) as { error?: string; sent?: number };
      say(r.ok ? `ส่ง ${d.sent} แบบแล้ว — เปิด LINE ดูได้เลย` : d.error || 'ส่งไม่สำเร็จ');
    } finally {
      setBusy(null);
    }
  }
  async function unack(key: string) {
    setBusy(key);
    const r = await fetch(`/api/admin/alerts?key=${encodeURIComponent(key)}`, { method: 'DELETE' });
    setBusy(null);
    if (!r.ok) return say('บันทึกไม่สำเร็จ');
    say('นำกลับมาแสดงแล้ว');
    onChanged();
  }

  return (
    <div className="hx-stack">
      <div className="hx-alert-top">
        <Seg<Filter>
          options={[
            ['all', `ทั้งหมด ${al.counts.total}`],
            ['bad', `ด่วน ${al.counts.bad}`],
            ['warn', `ควรดู ${al.counts.warn}`],
            ['info', `ข้อมูล ${al.counts.info}`],
          ]}
          value={filter}
          onChange={setFilter}
        />
        <span className="hx-note">ไม่ขึ้นกับช่วงเวลาที่เลือก — เป็นสถานะ ณ ตอนนี้</span>
      </div>

      {GROUPS.map(([g, title, sub], gi) => {
        const list = shown.filter((x) => x.group === g);
        return (
          <Card key={g} title={`${title}${list.length ? ` · ${list.length}` : ''}`} sub={sub} delay={gi * 70}>
            {list.length === 0 ? (
              <Empty>ไม่มีเรื่องค้าง</Empty>
            ) : (
              <div className="hx-alist">
                {list.map((x) => (
                  <div key={x.key} className={`hx-arow ${x.tone}`}>
                    <span className="pill">{TONE_LABEL[x.tone]}</span>
                    <div className="body">
                      <div className="t">{x.title}</div>
                      <div className="d">
                        {x.detail}
                        {x.day ? ` · ${thDay(x.day, true)}` : ''}
                      </div>
                    </div>
                    <div className="acts">
                      <Link href={hrefOf(x)} onClick={() => remember(x)} className="hx-btn white">
                        ไปจัดการ ›
                      </Link>
                      <button type="button" className="hx-btn" disabled={busy === x.key} onClick={() => ack(x)}>
                        รับทราบ
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        );
      })}

      <Card title="แจ้งเตือนเรื่องด่วนทาง LINE" sub="เรื่องด่วนใหม่ส่งเข้า LINE ที่เชื่อมไว้ (ตรวจทุก 3 นาที รวมเป็นข้อความเดียว) · ปิดได้ที่สวิตช์ “แจ้งเตือนผู้ดูแล” ในหน้าตั้งค่า" delay={280}>
        <LineNudge dismissible={false} />
        <a href="/me/settings?tab=notify" style={{ fontSize: 14, fontWeight: 600, color: 'var(--teal-deep)' }}>ตั้งค่าการแจ้งเตือน →</a>
        {/* The card designs (lib/line-flex): LINE checks them, or they all come to this admin's own LINE. */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
          <button type="button" className="hx-btn white" disabled={busy === 'line-check'} onClick={checkCards}>
            {busy === 'line-check' ? 'กำลังตรวจ…' : 'ตรวจการ์ด LINE ทุกแบบ'}
          </button>
          <button type="button" className="hx-btn" disabled={busy === 'line-send'} onClick={sendCards}>
            {busy === 'line-send' ? 'กำลังส่ง…' : 'ส่งตัวอย่างทุกแบบมาที่ LINE ฉัน'}
          </button>
        </div>
      </Card>

      <Card
        title={`รับทราบแล้ว · ${al.acked.length}`}
        sub="ซ่อนไว้สำหรับ admin ทุกคน — จะกลับมาเองถ้าสถานะเปลี่ยน (เช่น แก้ชื่อเพิ่มอีกครั้ง)"
        delay={300}
        right={
          al.acked.length > 0 && (
            <button type="button" className="hx-btn white" onClick={() => setShowAcked(!showAcked)}>
              {showAcked ? 'ซ่อน' : 'ดูรายการ'}
            </button>
          )
        }
      >
        {showAcked &&
          (al.acked.length === 0 ? (
            <Empty>—</Empty>
          ) : (
            <div className="hx-alist">
              {al.acked.map((x) => (
                <div key={x.key} className="hx-arow done">
                  <span className="pill">{TONE_LABEL[x.tone]}</span>
                  <div className="body">
                    <div className="t">{x.title}</div>
                    <div className="d">
                      {x.detail} · รับทราบโดย {x.ack.by_name || '—'} {thDay(x.ack.acked_at.slice(0, 10), true)}
                      {x.ack.note ? ` · ${x.ack.note}` : ''}
                    </div>
                  </div>
                  <div className="acts">
                    <button type="button" className="hx-btn white" disabled={busy === x.key} onClick={() => unack(x.key)}>
                      ยกเลิกรับทราบ
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ))}
      </Card>
    </div>
  );
}
